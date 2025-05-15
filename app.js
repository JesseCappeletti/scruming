// ==== CONSTANTES ====
const SPRINTS = ["SPRINT I", "SPRINT II", "SPRINT III", "SPRINT IV", "SPRINT V", "SPRINT VI"];
const ROLES = ["Product Owner", "Scrum Master", "Desenvolvedor"];
const supabase = window.supabase;

// ==== ESTADO GLOBAL ====
window.state = {
  user: null,
  profiles: [],
  artefacts: [],
  sprintIndex: 0,
  showModal: false,
  modalArtefact: null,
  search: "",
  showFavBar: false,
  favorites: (JSON.parse(localStorage.getItem("s_fav_v1")) || []),
  editingArtefact: null,
  showNewArtefact: false,
  dropdownResponsaveis: false,
  tempResponsaveis: [],
  tempArtefactForm: null, // <- NOVO: Estado temporário do form
  _shouldFocusSearch: false,
  loading: false,
  showLogin: true,
  errorRegister: ""
};

// ==== UTILITÁRIOS ====
function getAvatar(name) {
  return `<span style="background:#2563eb33;border-radius:50%;display:inline-block;width:27px;height:27px;line-height:27px;font-weight:bold;color:#2563eb;text-align:center;margin-right:3px">${(name || "?")[0].toUpperCase()}</span>`;
}
function escapeHtml(str) {
  if (!str) return "";
  return (str + "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function formatDate(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
}
function formatRich(txt) {
  if (!txt) return "";
  return escapeHtml(txt)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((https?:\/\/[^\s]+)\)/g, `<a href="$2" target="_blank">$1</a>`)
    .replace(/(https?:\/\/[^\s]+)/g, `<a href="$1" target="_blank">$1</a>`)
    .replace(/\/code[\s:]*\n?([\s\S]+)/ig, `<pre>$1</pre>`);
}

// ==== HEADER ====
function renderHeader() {
  return `
    <header class="header" style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:18px">
        <div class="logo-title" style="font-weight:bold;font-size:1.55em;">
          <i class="fa fa-cube" style="color:#2563eb;margin-right:8px"></i> SCRUMING
        </div>
        <div class="search-box" style="min-width:400px;">
          <input type="text" placeholder="Buscar por artefato ou usuário..." value="${escapeHtml(state.search)}" 
            oninput="appSearch(this.value)" />
          <i class="fa fa-search"></i>
          ${state.search ? `<button class="search-clear" onclick="clearSearch()">&times;</button>` : ""}
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:15px;">
        <div class="sprint-dropdown">
          <select onchange="appChangeSprint(this.value)">
            ${SPRINTS.map((s, i) => `<option value="${i}"${state.sprintIndex === i ? ' selected' : ''}>${escapeHtml(s)}</option>`).join("")}
          </select>
        </div>
        <button class="header-btn${state.showFavBar ? ' fav-active' : ''}" title="Barra de Favoritos" onclick="toggleFavBar()">
          <i class="fa${state.showFavBar ? 's' : 'r'} fa-star"></i>
        </button>
        <div class="user-info">
          <select onchange="if(this.value==='logout'){logout()}">
            <option>${escapeHtml(state.user.profile?.name || state.user.email)}</option>
            <option value="logout">Sair</option>
          </select>
        </div>
      </div>
    </header>
  `;
}

// ==== PERFIS (PROFILES) ====
async function loadMeAndProfiles() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { state.user = null; renderApp(); return; }
  let { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) profile = {};
  state.user = { ...user, profile };
  let { data: list } = await supabase.from('profiles').select('*');
  state.profiles = list || [];
  renderApp();
}

// ==== ARTEFATOS CRUD ====

// Sempre transformar responsaveis em array de objetos [{id, name, role}]
function parseResponsaveis(val) {
  if (!val) return [];
  if (typeof val === "string") {
    try { val = JSON.parse(val); } catch { return []; }
  }
  if (Array.isArray(val)) {
    // Caso antigo só array de uuid (migração), preenche usando perfis
    if (val.length && typeof val[0] === "string") {
      return val.map(uid => {
        const p = state.profiles.find(u => u.id === uid);
        return p ? { id: p.id, name: p.name, role: p.role } : { id: uid, name: "(Inválido)", role: "?" };
      });
    }
    // Já é certo (objetos)
    return val;
  }
  if (typeof val === "object" && val.id) return [val];
  return [];
}

// FETCH artefatos e converte responsaveis corretamente
async function fetchArtefactsFromSupabase() {
  const { data, error } = await supabase
    .from('artefacts').select('*').order('created_at', { ascending: true });
  if (!error) {
    state.artefacts = (data || []).map(item => ({
      ...item,
      responsaveis: parseResponsaveis(item.responsaveis), // campo original banco
      responsibles: parseResponsaveis(item.responsaveis),  // uso interno UI
      createdAt: item.created_at || item.createdAt
    }));
    renderApp();
  } else {
    alert("Erro ao ler artefatos do Supabase: " + error.message);
  }
}

let artefactsRealtimeSub = null;
async function setupArtefactsRealtime() {
  if (artefactsRealtimeSub) artefactsRealtimeSub.unsubscribe();
  artefactsRealtimeSub = supabase
    .channel('public:artefacts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'artefacts' }, payload => {
      fetchArtefactsFromSupabase();
    }).subscribe();
}

// Salvar artefato com responsáveis (array de objeto)
async function createArtefactOnSupabase(obj) {
  const user = state.user;
  const artefact = {
    title: obj.title,
    responsaveis: obj.responsibles,   // Se erro, troque por JSON.stringify(...)
    responsibleJustif: obj.responsibleJustif,
    sprint: obj.sprint,
    tool: obj.tool,
    toolJustif: obj.toolJustif,
    description: obj.description,
    created_at: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    status: obj.status || "todo",
    pct: obj.pct || 0,
    fileLink: obj.fileLink || "",
    created_by: user.id,              // <-- AJUSTE CRÍTICO AQUI!
    creator_id: user.id               // <-- Já estava certo
  };
  console.log("Artefato que será enviado para o Supabase:", artefact);
  const { error } = await supabase.from('artefacts').insert([artefact]);
  if (error) alert("Erro ao criar artefato: " + JSON.stringify(error));
}
async function updateArtefactOnSupabase(id, updateFields) {
  if (updateFields.responsibles) {
    updateFields.responsaveis = updateFields.responsibles;
    delete updateFields.responsibles; // EVITA ERRO de coluna não existente
  }
  const { error } = await supabase.from('artefacts').update(updateFields).eq('id', id);
  if (error) alert("Erro ao atualizar artefato: " + error.message);
}
async function deleteArtefactOnSupabase(id) {
  const { error } = await supabase.from('artefacts').delete().eq('id', id);
  if (error) alert("Erro ao apagar artefato: " + error.message);
}

// ==== FAVORITOS LOCAL ====
function saveFavs() { localStorage.setItem("s_fav_v1", JSON.stringify(state.favorites || [])); }

// ==== APP: RENDER HTML ====
function renderApp() {
  document.getElementById("app").innerHTML =
    `${state.user ? renderHeader() : ""}
    ${state.user && state.showFavBar ? renderFavoritesBar() : ""}
    <main>
     ${state.user ? renderBoardOrSearch() : renderAuthForms()}
    </main>
    ${state.showModal && state.modalArtefact ? renderArtefactModal(state.modalArtefact) : ""}
    ${state.showNewArtefact ? renderArtefactForm() : ""}
    `;
  setTimeout(fixSearchFocus, 15);
}

function renderFavoritesBar() {
  if (!state.favorites.length)
    return `<div class="fav-bar-under"><span class="fav-title"><i class="fa fa-star"></i> Favoritos</span><i>Nenhum favorito ainda</i> <button class="close-fav-bar" onclick="toggleFavBar()">&times;</button></div>`;
  return `<div class="fav-bar-under">
      <span class="fav-title"><i class="fa fa-star"></i> Favoritos</span>
      ${state.favorites.map(id => {
    const art = state.artefacts.find(a => a.id === id);
    if (!art) return "";
    return `<button class="fav-item-btn" onclick="favOpenArtefact('${id}')">${escapeHtml(art.title)}</button>`;
  }).join("")}
      <button class="close-fav-bar" onclick="toggleFavBar()" title="Fechar favoritos">&times;</button>
    </div>`;
}

function renderBoardOrSearch() {
  if (state.loading) {
    return `<div style="text-align:center; margin:40px;font-size:1.3em;">Carregando...</div>`;
  }
  if (state.search && state.search.trim()) return renderSearchResults();
  const sprint = SPRINTS[state.sprintIndex];
  const tasks = state.artefacts.filter(a => a.sprint === sprint);
  const columns = [
    { key: "todo", label: "A FAZER", filter: t => t.status === "todo" },
    { key: "progress", label: "EM ANDAMENTO", filter: t => t.status === "progress" },
    { key: "done", label: "CONCLUÍDO", filter: t => t.status === "done" },
  ];
  return `<div class="board">
    ${columns.map(col =>
    `<div class="column" ondragover="allowDrop(event)" ondrop="dropTask(event,'${col.key}')">
        <div class="column-title">${col.label}</div>
        <div class="cards-list">
        ${tasks.filter(col.filter).map(task => renderCard(task)).join("")}
        </div>
        ${col.key === "todo" ? `<button class="btn" onclick="showNewArtefactForm()">+ Novo Artefato/Tarefa</button>` : ""}
      </div>`
  ).join("")}
  </div>`;
}

function renderCard(task) {
  return `<div class="card" draggable="true" ondragstart="dragTask(event,'${task.id}')" id="card-${task.id}">
    <div class="card-title" onclick="openArtefactModal('${task.id}')" style="cursor:pointer">${escapeHtml(task.title)}</div>
    <div class="card-resp">Por: ${escapeHtml((task.responsibles || []).map(r => r.name).join(", "))}</div>
    <div class="card-date">${escapeHtml(formatDate(task.createdAt))}</div>
    ${task.status === "progress" ? `
      <div class="card-pct">
        <label>Concluído: <input type="number" min="0" max="100" value="${task.pct || 0}" style="width:60px" onchange="updatePct('${task.id}',this.value)" />%</label>
      </div>
    ` : ""}
    ${task.status === "done" ? `
      <button class="card-link-btn" onclick="openArtefactModal('${task.id}')">Ver Artefato</button>
    ` : ""}
    <div style="margin-top:7px">
      <button class="card-link-btn" onclick="toggleFavorite('${task.id}')"><i class="fa${(state.favorites || []).includes(task.id) ? 's' : 'r'} fa-star"></i> Favorito</button>
      <button class="card-link-btn" style="background:#f9ba3399" onclick="editArtefact('${task.id}')"><i class="fa fa-edit"></i> Editar</button>
      <button class="card-link-btn" style="background:#ffacb199" onclick="deleteArtefact('${task.id}')"><i class="fa fa-trash"></i> Excluir</button>
    </div>
  </div>`;
}

function renderResponsaveisSelector() {
  return `<div class="selector-box">
      <button type="button" class="selector-btn${state.dropdownResponsaveis ? ' active' : ''}"
        onclick="toggleDropdownResp()">${state.tempResponsaveis.length ? '<span class="selector-tags">' + state.tempResponsaveis.map(uid => {
    const p = state.profiles.find(u => u.id === uid);
    if (!p) return '';
    return `<span class="selector-tag">${escapeHtml(p.name)}</span>`;
  }).join('') + '</span>' : 'Selecione responsáveis'} <i class="fa fa-caret-down" style="margin-left:auto"></i>
      </button>
      ${state.dropdownResponsaveis ? `<div class="selector-list">${state.profiles.map(u => {
    const checked = state.tempResponsaveis.includes(u.id);
    return `<label><input type="checkbox" value="${u.id}"${checked ? " checked" : ""} onchange="toggleRespOption(this)" /> ${escapeHtml(u.name)} <span style="color:#888;font-size:0.9em;">(${escapeHtml(u.role)})</span>${u.is_tech_lead ? " <span class='tech-lead-badge'>TL</span>" : ""}</label>`;
  }).join('')}</div>` : ''}
    </div>`;
}

// ==== renderArtefactForm CORRIGIDO ====
function renderArtefactForm() {
  const editing = !!state.editingArtefact;
  const formData = state.tempArtefactForm || {};
  let dt = formData.datareg ? new Date(formData.datareg) : new Date();
  let dataVal = dt.toISOString().slice(0, 10);

  return `<div class="modal-bg" onclick="closeNewArtefactForm(event)">
   <div class="modal-content" tabindex="0" onclick="event.stopPropagation();" style="width:80%;max-width:900px;margin:0 auto;">
      <button class="modal-close" onclick="closeNewArtefactForm()">&times;</button>
      <div class="modal-header"><b>${editing ? "Editar Artefato / Tarefa" : "Novo Artefato / Tarefa"}</b></div>
      <form onsubmit="createArtefact(event)">
        <label>Título:</label>
        <input required type="text" name="title" placeholder="Título" value="${escapeHtml(formData.title || "")}" oninput="handleArtefactFormInput('title', this.value)" />

        <label>Responsáveis:</label>
        ${renderResponsaveisSelector()}

        <label>Justificativa (responsável):</label>
        <textarea name="responsibleJustif" required oninput="handleArtefactFormInput('responsibleJustif', this.value)">${escapeHtml(formData.responsibleJustif || "")}</textarea>

        <label>Sprint:</label>
        <select name="sprint" required onchange="handleArtefactFormInput('sprint', this.value)">
          ${SPRINTS.map((s, i) =>
    `<option value="${s}"${(formData.sprint || SPRINTS[state.sprintIndex]) === s ? " selected" : ""}>${s}</option>`
  ).join("")}
        </select>

        <label>Ferramenta (tecnologia, lib...):</label>
        <input type="text" name="tool" placeholder="Ex: Figma, React..." value="${escapeHtml(formData.tool || "")}" oninput="handleArtefactFormInput('tool', this.value)" />

        <label>Justificativa (ferramenta):</label>
        <textarea name="toolJustif" oninput="handleArtefactFormInput('toolJustif', this.value)">${escapeHtml(formData.toolJustif || "")}</textarea>

        <label>Descrição/Detalhes:</label>
        <textarea name="description" oninput="handleArtefactFormInput('description', this.value)">${escapeHtml(formData.description || "")}</textarea>

        <label>Data:</label>
        <input type="date" name="datareg" value="${dataVal}" onchange="handleArtefactFormInput('datareg', this.value)" />

        <label>Link do arquivo (opcional):</label>
        <input type="text" name="fileLink" value="${escapeHtml(formData.fileLink || "")}" oninput="handleArtefactFormInput('fileLink', this.value)" />

        <br>
        <button class="btn" type="submit">${editing ? 'Salvar' : 'Criar'}</button>
      </form>
    </div>
  </div>`;
}

// ==== NOVO: Handler para atualizar o estado do form ====
window.handleArtefactFormInput = function (field, value) {
  if (!state.tempArtefactForm) state.tempArtefactForm = {};
  state.tempArtefactForm[field] = value;
};

// ==== MODAL DETALHE ====
window.openArtefactModal = function (id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
window.closeModal = function (e) {
  if (e && e.target !== e.currentTarget) return;
  state.showModal = false;
  state.modalArtefact = null;
  renderApp();
};

// ==== FAVORITOS ====
window.toggleFavorite = function (id) {
  if (!state.favorites) state.favorites = [];
  if (state.favorites.includes(id)) state.favorites = state.favorites.filter(f => f !== id);
  else state.favorites.push(id);
  saveFavs();
  renderApp();
};
window.favOpenArtefact = function (id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
window.toggleFavBar = function () {
  state.showFavBar = !state.showFavBar;
  renderApp();
};

// ==== SEARCH & SPRINT ====
window.appSearch = function (val) {
  state.search = val;
  state._shouldFocusSearch = true;
  renderApp();
};
window.clearSearch = function () {
  state.search = "";
  renderApp();
};
function fixSearchFocus() {
  const search = document.querySelector(".search-box input");
  if (search) {
    const prev = search.value;
    if (document.activeElement === search) return;
    if (state._shouldFocusSearch) {
      search.focus();
      search.setSelectionRange(prev.length, prev.length);
      state._shouldFocusSearch = false;
    }
  }
}
window.appChangeSprint = (idxStr) => {
  state.sprintIndex = parseInt(idxStr, 10);
  state.search = "";
  state.showNewArtefact = false;
  renderApp();
};

// ==== SEARCH RESULT ====
function renderSearchResults() {
  const q = (state.search || "").trim().toLowerCase();
  if (!q) return "";
  let html = `<div style="max-width:700px;margin:30px auto 0 auto;background:#f4f6fc;border-radius:12px;padding:18px;">
    <b>Pesquisa:</b> <i>${escapeHtml(state.search)}</i>
    <button onclick="clearSearch()" style="float:right;background:none;border:none;color:#f33;font-size:18px;" title="Limpar busca">&times;</button>
    <br><br>`;
  let users = state.profiles.filter(u => u.name.toLowerCase().includes(q));
  if (users.length) {
    html += `<div><b>Usuários encontrados:</b><br>`;
    users.forEach(u => {
      html += `<div class="card-resp">${getAvatar(u.name)}${escapeHtml(u.name)} — ${escapeHtml(u.role)}${u.is_tech_lead ? " (Tech Lead)" : ""
        }<br><i>Artefatos:</i> ${state.artefacts.filter(a => (a.responsibles || []).some(r => r.id === u.id)).map(a => `<a href="#" onclick="openArtefactModal('${a.id}')">${escapeHtml(a.title)}</a>`).join(", ") || "[Nenhum]"}</div><hr>`;
    });
    html += `</div>`;
  }
  let arts = state.artefacts.filter(a => a.title.toLowerCase().includes(q));
  if (arts.length) {
    html += `<div><b>Artefatos encontrados:</b><br>`;
    arts.forEach(a => {
      html += `<div><span class="card-title">${escapeHtml(a.title)}</span> — <b>${escapeHtml(a.sprint)}</b> — <a href="#" onclick="openArtefactModal('${a.id}')">[Detalhes]</a></div>`;
    });
    html += `</div>`;
  }
  let bydate = state.artefacts.filter(a => a.createdAt && formatDate(a.createdAt, false).includes(q));
  if (bydate.length) {
    html += `<div><b>Por data:</b><br>${bydate.map(a => `<div>${formatDate(a.createdAt, false)} <a href="#" onclick="openArtefactModal('${a.id}')">${escapeHtml(a.title)}</a></div>`).join("")}</div>`;
  }
  let bysprint = state.artefacts.filter(a => a.sprint && a.sprint.toLowerCase().includes(q));
  if (bysprint.length) {
    html += `<div><b>Sprint:</b> ${escapeHtml(q.toUpperCase())}<br>${bysprint.map(a => `<span class="card-link-btn" onclick="openArtefactModal('${a.id}')">${escapeHtml(a.title)}</span>`).join(" ")}</div>`;
  }
  if (!users.length && !arts.length && !bydate.length && !bysprint.length)
    html += `<i>Nenhum resultado encontrado.</i>`;
  html += `</div>`;
  return html;
}

// ==== NOVO Artefato/Editar Form: zera ou pré-carrega o estado do form ====

// Novo artefato
window.showNewArtefactForm = async function () {
  state.loading = true;
  renderApp();
  await loadMeAndProfiles();
  state.showNewArtefact = true;
  state.editingArtefact = null;

  state.tempArtefactForm = {
    title: "",
    responsibleJustif: "",
    sprint: SPRINTS[state.sprintIndex],
    tool: "",
    toolJustif: "",
    description: "",
    datareg: new Date().toISOString().slice(0, 10),
    fileLink: ""
  };

  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  state.loading = false;
  renderApp();
};
// Fechar form
window.closeNewArtefactForm = function (e) {
  if (e && e.target !== e.currentTarget) return;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  state.tempArtefactForm = null;
  renderApp();
};
// Editar artefato
window.editArtefact = async function (id) {
  state.loading = true; renderApp();
  await loadMeAndProfiles();
  const art = state.artefacts.find(a => a.id === id);
  if (!art) { state.loading = false; renderApp(); return; }
  state.editingArtefact = { ...art };
  state.tempArtefactForm = {
    title: art.title || "",
    responsibleJustif: art.responsibleJustif || "",
    sprint: art.sprint || SPRINTS[state.sprintIndex],
    tool: art.tool || "",
    toolJustif: art.toolJustif || "",
    description: art.description || "",
    datareg: art.createdAt ? new Date(art.createdAt).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    fileLink: art.fileLink || ""
  };
  state.tempResponsaveis = (art.responsibles || []).map(r => r.id);
  state.showNewArtefact = true;
  state.loading = false;
  renderApp();
};
window.editArtefactFromModal = function (id) {
  state.showModal = false;
  setTimeout(function () { window.editArtefact(id); }, 70);
};
window.deleteArtefact = async function (id) {
  if (!confirm("Tem certeza que deseja excluir este artefato?")) return;
  await deleteArtefactOnSupabase(id);
  state.showModal = false;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  await fetchArtefactsFromSupabase();
  renderApp();
};
window.dragTask = function (e, id) {
  e.dataTransfer.setData("text", id);
  setTimeout(() => e.target.classList.add("dragging"), 1);
};
window.allowDrop = function (e) { e.preventDefault(); }
window.dropTask = async function (e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text");
  const task = state.artefacts.find(a => a.id === id);
  if (task && ["todo", "progress", "done"].includes(status)) {
    await updateArtefactOnSupabase(id, { status, pct: status !== "progress" ? 0 : (task.pct || 0) });
    await fetchArtefactsFromSupabase();
  }
};
window.updatePct = async function (id, val) {
  const task = state.artefacts.find(a => a.id === id);
  if (!task) return;
  const pct = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
  await updateArtefactOnSupabase(id, { pct });
  await fetchArtefactsFromSupabase();
};

// ==== Dropdown responsáveis helper ====
window.toggleDropdownResp = function () { state.dropdownResponsaveis = !state.dropdownResponsaveis; renderApp(); }
window.toggleRespOption = function (cb) {
  const id = cb.value;
  if (cb.checked && !state.tempResponsaveis.includes(id)) state.tempResponsaveis.push(id);
  if (!cb.checked && state.tempResponsaveis.includes(id)) state.tempResponsaveis = state.tempResponsaveis.filter(x => x !== id);
  renderApp();
};

// ==== AUTENTICAÇÃO ====
// LOGIN
window.login = async function (ev) {
  ev.preventDefault();
  state.loading = true; renderApp();
  const f = ev.target;
  const email = (f.email.value || "").toLowerCase().trim();
  const password = f.password.value;
  let { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    state.loading = false;
    alert("Usuário/senha inválidos!");
    return;
  }
  await loadMeAndProfiles();
  state.loading = false;
  await fetchArtefactsFromSupabase();
  setupArtefactsRealtime();
};
// LOGOUT
window.logout = async function () {
  await supabase.auth.signOut();
  state.user = null;
  renderApp();
  if (artefactsRealtimeSub) artefactsRealtimeSub.unsubscribe();
};
// REGISTER
window.register = async function (ev) {
  ev.preventDefault();
  const f = ev.target;
  const name = f.name.value.trim();
  const email = f.email.value.toLowerCase().trim();
  const password = f.password.value;
  const role = f.role.value;
  const isTechLead = !!f.querySelector('#techLeadBox')?.checked;
  const key = f.key.value.trim();
  if (key !== "97990191") { state.errorRegister = "Chave de acesso incorreta"; renderApp(); return; }
  if (!/\S+@\S+\.\S+/.test(email)) { state.errorRegister = "Email inválido"; renderApp(); return; }
  if (state.profiles.some(p => p.role === "Desenvolvedor" && p.is_tech_lead) && isTechLead) {
    state.errorRegister = "Só pode ter um Tech Lead";
    renderApp(); return;
  }
  state.errorRegister = ""; state.loading = true; renderApp();
  let { data, error } = await supabase.auth.signUp({ email, password });
  if (error) {
    state.errorRegister = "Erro: " + (error.message || "cadastro auth");
    state.loading = false; renderApp(); return;
  }
  let userId = data.user.id;
  await supabase.from('profiles').insert([
    { id: userId, name, role, is_tech_lead: isTechLead }
  ]);
  alert("Registro criado! Confirme seu email e depois faça o login.");
  state.showLogin = true; state.loading = false; renderApp();
};

window.gotoRegister = function () { state.showLogin = false; renderApp(); }
window.gotoLogin = function () { state.showLogin = true; renderApp(); }
window.handleRoleChange = function (role) {
  const techDiv = document.getElementById("tech-lead-div");
  const anyTL = state.profiles.some(x => x.role === "Desenvolvedor" && x.is_tech_lead);
  if (!techDiv) return;
  if (role === "Desenvolvedor" && !anyTL) {
    techDiv.style.display = "block";
  } else techDiv.style.display = "none";
};

// ==== CRUD / ARTEFATOS ====
// Novo/editar artefato: Use agora o state.tempArtefactForm!
window.createArtefact = async function (ev) {
  ev.preventDefault();
  const d = state.tempArtefactForm || {};
  const title = (d.title || "").trim();
  const responsibles = state.tempResponsaveis.map(uid => {
    const p = state.profiles.find(u => u.id === uid);
    return p ? { id: p.id, name: p.name, role: p.role } : null;
  }).filter(Boolean);
  const responsibleJustif = (d.responsibleJustif || "").trim();
  const sprint = d.sprint || SPRINTS[state.sprintIndex];
  const tool = (d.tool || "").trim();
  const toolJustif = (d.toolJustif || "").trim();
  const description = d.description || "";
  const dateVal = d.datareg;
  const fileLink = (d.fileLink || "").trim();
  let dtFinal = dateVal ? new Date(`${dateVal}T00:00:00`) : new Date();
  if (!responsibles.length) return alert("Selecione pelo menos um responsável.");
  if (state.editingArtefact) {
    const id = state.editingArtefact.id;
    await updateArtefactOnSupabase(id, {
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      created_at: dtFinal, fileLink
    });
    state.editingArtefact = null;
  } else {
    await createArtefactOnSupabase({
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      createdAt: dtFinal,
      status: "todo",
      pct: 0,
      fileLink
    });
  }
  state.showNewArtefact = false;
  state.tempArtefactForm = null; // Limpa!
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  await fetchArtefactsFromSupabase();
  renderApp();
};

// ==== Inicialização ====
async function boot() {
  let { data: { user } } = await supabase.auth.getUser();
  if (user && !state.user) {
    state.user = null;
    await loadMeAndProfiles();
    await fetchArtefactsFromSupabase();
    setupArtefactsRealtime();
  }
  renderApp();
}
boot();
