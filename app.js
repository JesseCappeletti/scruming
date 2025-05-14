// ==== CONSTANTES ====
const SPRINTS = ["SPRINT I", "SPRINT II", "SPRINT III", "SPRINT IV", "SPRINT V", "SPRINT VI"];
const ROLES = ["Product Owner", "Scrum Master", "Desenvolvedor"];
const supabase = window.supabase;

// ==== ESTADO GLOBAL ====
const state = {
  user: null,           // SESSÃO atual (supabase user + profile)
  profiles: [],         // lista de usuários ('profiles' table)
  artefacts: [],        // artefatos supabase
  sprintIndex: 0,
  showModal: false,     // mostra artefato
  modalArtefact: null,
  search: "",
  showFavBar: false,
  favorites: (JSON.parse(localStorage.getItem("s_fav_v1"))||[]),
  editingArtefact: null,
  showNewArtefact: false,
  dropdownResponsaveis: false,
  tempResponsaveis: [],
  _shouldFocusSearch: false,
  loading: false,
  showLogin: true,
  errorRegister: ""
};

// ==== UTILITARIOS ====
function getAvatar(name) {
  return `<span style="background:#2563eb33;border-radius:50%;display:inline-block;width:27px;height:27px;line-height:27px;font-weight:bold;color:#2563eb;text-align:center;margin-right:3px">${(name || "?")[0].toUpperCase()}</span>`;
}
function escapeHtml(str) {
  if (!str) return "";
  return (str + "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function formatDate(dt) {
  if (!dt) return "";
  const d = new Date(dt);
  return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
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

// ==== SUPABASE: PERFIL (PROFILES) ====
async function loadMeAndProfiles() {
  // Autenticação e profile do usuário
  const { data: { user }, error: e1 } = await supabase.auth.getUser();
  if (!user) { state.user = null; renderApp(); return; }
  // Busca profile
  let { data: profile, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  if (!profile) profile = {};
  state.user = { ...user, profile };
  // Todos os profiles
  let { data: list, error: e2 } = await supabase.from('profiles').select('*');
  state.profiles = list||[];
  renderApp();
}

// ==== SUPABASE: CRUD ARTEFATOS ====
// Uso: todos artefatos são públicos (board colaborativo!)
async function fetchArtefactsFromSupabase() {
  const { data, error } = await supabase
    .from('artefacts')
    .select('*')
    .order('created_at', { ascending: true });
  if (!error) {
    state.artefacts = (data || []).map(item => ({
      ...item,
      responsibles: typeof item.responsaveis === "string"
        ? JSON.parse(item.responsaveis||"[]") : (item.responsaveis||[]),
      createdAt: item.created_at || item.createdAt,
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
async function createArtefactOnSupabase(obj) {
  const user = state.user;
  const responsaveis = JSON.stringify(obj.responsibles || []);
  const body = {
    title: obj.title,
    responsaveis,
    responsibleJustif: obj.responsibleJustif,
    sprint: obj.sprint,
    tool: obj.tool,
    toolJustif: obj.toolJustif,
    description: obj.description,
    created_at: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    status: obj.status || "todo",
    pct: obj.pct || 0,
    fileLink: obj.fileLink || "",
    created_by: user.profile?.name || user.email,
    creator_id: user.id
  };
  const { error } = await supabase.from('artefacts').insert([body]);
  if (error) alert("Erro ao criar artefato: " + error.message);
}
async function updateArtefactOnSupabase(id, updateFields) {
  if (updateFields.responsibles)
    updateFields['responsaveis'] = JSON.stringify(updateFields.responsibles);
  const { error } = await supabase.from('artefacts').update(updateFields).eq('id', id);
  if (error) alert("Erro ao atualizar artefato: " + error.message);
}
async function deleteArtefactOnSupabase(id) {
  const { error } = await supabase.from('artefacts').delete().eq('id', id);
  if (error) alert("Erro ao apagar artefato: " + error.message);
}

// ==== FAVORITOS LOCAL ====
function saveFavs() { localStorage.setItem("s_fav_v1", JSON.stringify(state.favorites||[])); }

// ==== APP: RENDER HTML ====
function renderApp() {
  document.getElementById("app").innerHTML =
    `${state.user?renderHeader():""}
    ${state.user && state.showFavBar ? renderFavoritesBar() : ""}
    <main>
     ${ state.user ? renderBoardOrSearch() : renderAuthForms() }
    </main>
    ${state.showModal && state.modalArtefact ? renderArtefactModal(state.modalArtefact) : ""}
    ${state.showNewArtefact ? renderArtefactForm() : ""}
    `;

  setTimeout(fixSearchFocus,15);
}
// HEADER
function renderHeader() {
  const name = escapeHtml(state.user.profile?.name || state.user.email);
  const role = escapeHtml(state.user.profile?.role || "");
  return `<div class="header">
    <span class="logo-title">Scrum Info Hub</span>
      <div style="display:flex;align-items:center;flex:1;margin-left:22px;position:relative;">
        <div class="search-box" style="margin-right:0;">
          <input id="searchinput" placeholder="Pesquisar..." value="${escapeHtml(state.search||"")}"
            oninput="appSearch(this.value)" autocomplete="off"/>
          <i class="fas fa-search"></i>
          ${state.search ? `<button class="search-clear" onclick="clearSearch()" title="Limpar"><i class="fa fa-times"></i></button>` : ""}
        </div>
        <div class="sprint-dropdown">
          <select onchange="appChangeSprint(this.value)">
          ${SPRINTS.map((s, i) => `<option value="${i}" ${i===state.sprintIndex?"selected":""}>${s}</option>`).join("")}
          </select>
        </div>
        <button class="header-btn ${state.showFavBar ? "fav-active" : ""}" onclick="toggleFavBar()" title="Favoritos"><i class="fa fa-star"></i></button>
      </div>
      <div class="user-info">
        <span title="${role}">${getAvatar(name)}${name}</span>
        <button class="header-btn" onclick="logout()" title="Sair"><i class="fas fa-sign-out-alt"></i></button>
      </div>
    </div>`;
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
// BOARD PRINCIPAL OU RESULTADO DA BUSCA
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
    <div class="card-resp">Por: ${escapeHtml((task.responsibles||[]).map(r => r.name).join(", "))}</div>
    <div class="card-date">${escapeHtml(formatDate(task.createdAt))}</div>
    ${task.status === "progress" ? `
      <div class="card-pct">
        <label>Concluído: <input type="number" min="0" max="100" value="${task.pct||0}" style="width:40px" onchange="updatePct('${task.id}',this.value)" />%</label>
      </div>
    ` : ""}
    ${task.status === "done" ? `
      <button class="card-link-btn" onclick="openArtefactModal('${task.id}')">Ver Artefato</button>
    ` : ""}
    <div style="margin-top:7px">
      <button class="card-link-btn" onclick="toggleFavorite('${task.id}')"><i class="fa${(state.favorites||[]).includes(task.id)?'s':'r'} fa-star"></i> Favorito</button>
      <button class="card-link-btn" style="background:#f9ba3399" onclick="editArtefact('${task.id}')"><i class="fa fa-edit"></i> Editar</button>
      <button class="card-link-btn" style="background:#ffacb199" onclick="deleteArtefact('${task.id}')"><i class="fa fa-trash"></i> Excluir</button>
    </div>
  </div>`;
}

// RESPONSÁVEIS (PERFIS DE USUÁRIOS SUPABASE)
function renderResponsaveisSelector() {
  // Multiseleção de usuários no perfil
  return `<div class="selector-box">
      <button type="button" class="selector-btn${state.dropdownResponsaveis ? ' active' : ''}"
        onclick="toggleDropdownResp()">${state.tempResponsaveis.length ? '<span class="selector-tags">' + state.tempResponsaveis.map(uid => {
          const p = state.profiles.find(u => u.id === uid);
          if (!p) return '';
          return `<span class="selector-tag">${escapeHtml(p.name)}</span>`;
        }).join('') + '</span>' : 'Selecione responsáveis'} <i class="fa fa-caret-down" style="margin-left:auto"></i>
      </button>
      ${state.dropdownResponsaveis ? `<div class="selector-list">${state.profiles.map(u => {
        const checked = state.tempResponsaveis.includes(u.id) ? 'checked' : '';
        return `<label><input type="checkbox" value="${u.id}" onchange="toggleRespOption(this)" ${checked}/> ${escapeHtml(u.name)} (${escapeHtml(u.role)}${u.is_tech_lead ? " - Tech Lead" : ""}) </label>`;
      }).join('')}</div>` : ""}
    </div>`;
}

// NOVA / EDIÇÃO DE ARTEFATO
function renderArtefactForm() {
  const editing = !!state.editingArtefact;
  const data = editing ? state.editingArtefact : {};
  let dt = data.createdAt ? new Date(data.createdAt) : new Date();
  let dataVal = dt.toISOString().slice(0, 10);
  return `<div class="modal-bg" onclick="closeNewArtefactForm(event)">
    <div class="modal-content" tabindex="0" onclick="event.stopPropagation();" style="width:80%;max-width:900px;margin:0 auto;">
      <button class="modal-close" onclick="closeNewArtefactForm()">&times;</button>
      <div class="modal-header"><b>${editing ? "Editar Artefato / Tarefa" : "Novo Artefato / Tarefa"}</b></div>
      <form onsubmit="createArtefact(event)">
        <label>Título:</label>
        <input required type="text" name="title" placeholder="Título" value="${escapeHtml(data.title||"")}" />
        <label>Responsáveis:</label>
        ${renderResponsaveisSelector()}
        <label>Justificativa (responsável):</label>
        <textarea name="responsibleJustif" required>${escapeHtml(data.responsibleJustif||"")}</textarea>
        <label>Sprint:</label>
        <select name="sprint" required>
          ${SPRINTS.map((s,i)=>
            `<option value="${s}"${(data.sprint||SPRINTS[state.sprintIndex])===s?" selected":""}>${s}</option>`
          ).join("")}
        </select>
        <label>Ferramenta (tecnologia, lib...):</label>
        <input type="text" name="tool" placeholder="Ex: Figma, React..." value="${escapeHtml(data.tool||"")}" />
        <label>Justificativa (ferramenta):</label>
        <textarea name="toolJustif">${escapeHtml(data.toolJustif||"")}</textarea>
        <label>Descrição/Detalhes:</label>
        <textarea name="description">${escapeHtml(data.description||"")}</textarea>
        <label>Data:</label>
        <input type="date" name="datareg" value="${dataVal}"/>
        <label>Link do arquivo (opcional):</label>
        <input type="text" name="fileLink" value="${escapeHtml(data.fileLink||"")}" />
        <br>
        <button class="btn" type="submit">${editing?'Salvar':'Criar'}</button>
      </form>
    </div>
  </div>`;
}

// MODAL: MOSTRAR DETALHE ARTEFATO
function renderArtefactModal(task) {
  return `<div class="modal-bg" onclick="closeModal(event)">
    <div class="modal-content document-modal" tabindex="0" onclick="event.stopPropagation();" style="width:80%;max-width:900px;margin:0 auto;">
      <button class="modal-close" onclick="closeModal()" title="Fechar">&times;</button>
      <div class="document-header">
        <h2>${escapeHtml(task.title)}</h2>
      </div>
      <div class="document-section">
        <strong>Responsável:</strong>
        <span>${escapeHtml((task.responsibles||[]).map(r => r.name).join(", "))}</span>
      </div>
      <div class="document-section">
        <strong>Justificativa (responsável):</strong><br>
        <span>${escapeHtml(task.responsibleJustif||"")}</span>
      </div>
      <div class="document-section">
        <strong>Sprint:</strong> <span>${escapeHtml(task.sprint)}</span>
        <span style="margin-left:32px"><strong>Data:</strong> ${escapeHtml(formatDate(task.createdAt))}</span>
      </div>
      <div class="document-section">
        <strong>Ferramenta:</strong> <span>${escapeHtml(task.tool||"")}</span><br>
        <strong>Justificativa (ferramenta):</strong> <span>${escapeHtml(task.toolJustif||"")}</span>
      </div>
      <div class="document-section">
        <strong>Descrição:</strong><br>
        <span>${formatRich(task.description)}</span>
      </div>
      ${task.fileLink ? `<div class="document-section">
        <strong>Link do Arquivo:</strong><br/>
        <a href="${escapeHtml(task.fileLink)}" target="_blank">${escapeHtml(task.fileLink)}</a>
      </div>` : ""}
      <div class="document-actions">
        <button class="btn" onclick="toggleFavorite('${task.id}')">
          <i class="fa${(state.favorites||[]).includes(task.id)?'s':'r'} fa-star"></i> Favoritar
        </button>
        <button class="btn" onclick="editArtefactFromModal('${task.id}')" style="background:#f9ba33;">Editar</button>
        <button class="btn" onclick="deleteArtefact('${task.id}')" style="background:#ea4444;">Excluir</button>
      </div>
    </div>
  </div>`;
}

// ==== LOGIN & REGISTRO ====
function renderAuthForms() {
  return state.showLogin ? renderLoginForm() : renderRegisterForm();
}
function renderLoginForm() {
  return `
  <div style="max-width:390px;margin:70px auto 0 auto;background:#f1f6fa;border-radius:13px;box-shadow:0 8px 40px #0049b122;padding:33px 26px;">
    <h2 style="text-align:center;">Entrar</h2>
    <form onsubmit="login(event)">
      <input name="email" required placeholder="E-mail de acesso" style="width:100%;margin-bottom:13px"/>
      <input name="password" type="password" required placeholder="Senha" style="width:100%;margin-bottom:13px"/>
      <button class="btn" type="submit" style="width:100%;margin:13px 0 0 0">Entrar</button>
      <div style="margin-top:23px; text-align:center;">
        <span style="font-size:1.01em;">Novo por aqui? <a href="#" onclick="gotoRegister()">Quero me registrar</a></span>
      </div>
    </form>
  </div>
  `;
}
function renderRegisterForm() {
  return `
  <div style="max-width:430px;margin:55px auto 0 auto;background:#f1f6fa;border-radius:13px;box-shadow:0 8px 40px #0049b122;padding:33px 28px;">
    <h2 style="text-align:center;">Registrar</h2>
    <form onsubmit="register(event)">
      <input name="name" required placeholder="Nome completo (visível para todos)" style="width:100%;margin-bottom:13px"/>
      <input name="email" required placeholder="Seu e-mail (será login)" style="width:100%;margin-bottom:13px"/>
      <input name="password" type="password" required placeholder="Senha" style="width:100%;margin-bottom:13px"/>
      <input name="key" placeholder="Chave de acesso (8 dígitos)" required minlength="8" maxlength="8"
        style="width:100%;margin-bottom:13px"/>
      <label>Cargo:<br>
        <select name="role" required onchange="handleRoleChange(this.value)">
          <option value="">Escolha seu cargo</option>
          ${ROLES.map(r => `<option value="${r}">${r}</option>`).join("")}
        </select>
      </label>
      <div id="tech-lead-div" style="display:none;margin-bottom:10px">
        <label>
          <input type="checkbox" id="techLeadBox"/> Sou Tech Lead
        </label>
      </div>
      <button class="btn" type="submit" style="width:100%;margin-top:15px;">Registrar</button>
      <div style="margin-top:19px; text-align:center;">
        <span style="font-size:1.01em;"><a href="#" onclick="gotoLogin()">Já tem conta? Entrar</a></span>
      </div>
      ${state.errorRegister?'<div style="margin:18px 0 0 0; color:#e73333; font-weight:bold;">'+escapeHtml(state.errorRegister)+'</div>':""}
    </form>
  </div>
  `;
}
window.gotoRegister = function () {state.showLogin = false; renderApp();}
window.gotoLogin = function () {state.showLogin = true; renderApp();}
window.handleRoleChange = function(role) {
  const techDiv = document.getElementById("tech-lead-div");
  const anyTL = state.profiles.some(x=>x.role==="Desenvolvedor"&&x.is_tech_lead);
  if (!techDiv) return;
  if (role === "Desenvolvedor" && !anyTL) {
    techDiv.style.display = "block";
  } else techDiv.style.display = "none";
};

// ==== AUTENTICAÇÃO ====
// LOGIN
window.login = async function(ev) {
  ev.preventDefault();
  state.loading=true; renderApp();
  const f = ev.target;
  const email = (f.email.value||"").toLowerCase().trim();
  const password = f.password.value;
  let {data,error} = await supabase.auth.signInWithPassword({email,password});
  if(error) {
    state.loading=false;
    alert("Usuário/senha inválidos!");
    return;
  }
  // carrega perfil
  await loadMeAndProfiles();
  state.loading=false;
  fetchArtefactsFromSupabase();
  setupArtefactsRealtime();
};
window.logout = async function() {
  await supabase.auth.signOut();
  state.user = null;
  renderApp();
  if (artefactsRealtimeSub) artefactsRealtimeSub.unsubscribe();
};
// CADASTRO REAL
window.register = async function(ev){
  ev.preventDefault();
  const f = ev.target;
  const name = f.name.value.trim();
  const email = f.email.value.toLowerCase().trim();
  const password = f.password.value;
  const role = f.role.value;
  const isTechLead = !!f.querySelector('#techLeadBox')?.checked;
  const key = f.key.value.trim();

  // Validações
  if (key!=="97990191") { state.errorRegister="Chave de acesso incorreta"; renderApp(); return; }
  if (!/\S+@\S+\.\S+/.test(email)) { state.errorRegister="Email inválido"; renderApp(); return; }
  if (state.profiles.some(p=>p.role==="Desenvolvedor" && p.is_tech_lead) && isTechLead) {
    state.errorRegister="Só pode ter um Tech Lead";
    renderApp(); return;
  }

  // 1º cadastra no Auth
  state.errorRegister=""; state.loading=true; renderApp();
  let {data,error} = await supabase.auth.signUp({email,password});
  if(error){
    state.errorRegister = "Erro: " + (error.message||"cadastro auth");
    state.loading=false; renderApp(); return;
  }
  // 2º salva na tabela de profile
  let userId = data.user.id;
  await supabase.from('profiles').insert([
      { id: userId, name, role, is_tech_lead: isTechLead }
  ]);
  alert("Registro criado! Confirme seu email e depois faça o login.");
  state.showLogin=true; state.loading=false; renderApp();
};

// ==== CRUD / ARTEFATOS ====
// Novo/editar artefato
window.createArtefact = async function(ev) {
  ev.preventDefault();
  const form = ev.target;
  const title = form.title.value.trim();
  const responsibles = state.tempResponsaveis.map(uid => {
    const p = state.profiles.find(u => u.id === uid);
    return p ? { id: p.id, name: p.name, role: p.role } : null;
  }).filter(Boolean);
  const responsibleJustif = form.responsibleJustif.value.trim();
  const sprint = form.sprint.value;
  const tool = form.tool.value.trim();
  const toolJustif = form.toolJustif.value.trim();
  const description = form.description.value;
  const dateVal = form.datareg.value;
  const fileLink = form.fileLink.value.trim();
  let dtFinal = dateVal ? new Date(`${dateVal}T00:00:00`) : new Date();

  if (!responsibles.length) return alert("Selecione pelo menos um responsável.");

  let artefact;
  if (state.editingArtefact) {
    const id = state.editingArtefact.id;
    artefact = {
      ...state.editingArtefact,
      title,responsibles,responsibleJustif,sprint,tool,toolJustif,description,
      createdAt: dtFinal,
      fileLink
    };
    await updateArtefactOnSupabase(id, {
      title,responsibles,responsibleJustif,sprint,tool,toolJustif,description,
      created_at: dtFinal,fileLink
    });
    state.editingArtefact = null;
  } else {
    artefact = {
      title,responsibles,responsibleJustif,sprint,tool,toolJustif,description,
      createdAt: dtFinal,
      status: "todo",
      pct: 0,
      fileLink
    };
    await createArtefactOnSupabase(artefact);
  }
  state.showNewArtefact = false;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  state.sprintIndex = SPRINTS.indexOf(artefact.sprint);
  renderApp();
};
// Dropdown responsáveis helper
window.toggleDropdownResp=function(){ state.dropdownResponsaveis=!state.dropdownResponsaveis; renderApp();}
window.toggleRespOption = function(cb) {
  const id = cb.value;
  if (cb.checked && !state.tempResponsaveis.includes(id)) state.tempResponsaveis.push(id);
  if (!cb.checked && state.tempResponsaveis.includes(id)) state.tempResponsaveis = state.tempResponsaveis.filter(x=>x!==id);
  renderApp();
};
window.showNewArtefactForm = function() {
  state.showNewArtefact = true;
  state.editingArtefact = null;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  renderApp();
};
window.closeNewArtefactForm = function(e) {
  if (e && e.target!==e.currentTarget) return;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  renderApp();
};
window.editArtefact = function(id) {
  const art = state.artefacts.find(a => a.id === id);
  if (!art) return;
  state.editingArtefact = art;
  state.tempResponsaveis = (art.responsibles||[]).map(r=>r.id);
  state.showNewArtefact = true;
  renderApp();
};
window.editArtefactFromModal = function(id) {
  state.showModal = false;
  setTimeout(function () { window.editArtefact(id); }, 70);
};
window.deleteArtefact = async function(id) {
  if (!confirm("Tem certeza que deseja excluir este artefato?")) return;
  await deleteArtefactOnSupabase(id);
  state.showModal = false;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  renderApp();
};
window.dragTask = function(e, id) {
  e.dataTransfer.setData("text", id);
  setTimeout(() => e.target.classList.add("dragging"), 1);
};
window.allowDrop = function(e) { e.preventDefault(); }
window.dropTask = async function(e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text");
  const task = state.artefacts.find(a => a.id === id);
  if (task && ["todo", "progress", "done"].includes(status)) {
    await updateArtefactOnSupabase(id, { status, pct: status !== "progress" ? 0 : (task.pct || 0) });
  }
};
window.updatePct = async function(id, val) {
  const task = state.artefacts.find(a => a.id === id);
  if (!task) return;
  const pct = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
  await updateArtefactOnSupabase(id, { pct });
};

// ==== MODAL DETALHE ====
window.openArtefactModal = function(id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
window.closeModal = function(e) {
  if (e && e.target!==e.currentTarget) return;
  state.showModal = false;
  state.modalArtefact = null;
  renderApp();
};

// ==== FAVORITOS ====
window.toggleFavorite = function(id) {
  if (!state.favorites) state.favorites = [];
  if (state.favorites.includes(id)) state.favorites = state.favorites.filter(f => f !== id);
  else state.favorites.push(id);
  saveFavs();
  renderApp();
};
window.favOpenArtefact = function(id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
window.toggleFavBar = function () {
  state.showFavBar = !state.showFavBar;
  renderApp();
};

// ==== SEARCH & SPRINT ====
window.appSearch = function(val) {
  state.search = val;
  state._shouldFocusSearch = true;
  renderApp();
};
window.clearSearch = function() {
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
  state.sprintIndex = parseInt(idxStr,10);
  state.search = "";
  state.showNewArtefact = false;
  renderApp();
};

// ==== SEARCH RESULT ====
function renderSearchResults() {
  const q = (state.search||"").trim().toLowerCase();
  if (!q) return "";
  let html = `<div style="max-width:700px;margin:30px auto 0 auto;background:#f4f6fc;border-radius:12px;padding:18px;">
    <b>Pesquisa:</b> <i>${escapeHtml(state.search)}</i>
    <button onclick="clearSearch()" style="float:right;background:none;border:none;color:#f33;font-size:18px;" title="Limpar busca">&times;</button>
    <br><br>`;
  // Perfiles de usuários
  let users = state.profiles.filter(u=>u.name.toLowerCase().includes(q));
  if (users.length){
    html += `<div><b>Usuários encontrados:</b><br>`;
    users.forEach(u=>{
      html += `<div class="card-resp">${getAvatar(u.name)}${escapeHtml(u.name)} — ${escapeHtml(u.role)}${u.is_tech_lead ? " (Tech Lead)":""}
        <br><i>Artefatos:</i> ${state.artefacts.filter(a=>(a.responsibles||[]).some(r=>r.id===u.id)).map(a=>`<a href="#" onclick="openArtefactModal('${a.id}')">${escapeHtml(a.title)}</a>`).join(", ")||"[Nenhum]"}</div><hr>`;
    });
    html += `</div>`;
  }
  let arts = state.artefacts.filter(a=>a.title.toLowerCase().includes(q));
  if (arts.length){
    html += `<div><b>Artefatos encontrados:</b><br>`;
    arts.forEach(a=>{
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

// ==== Inicialização ====
async function boot() {
  let { data: { user } } = await supabase.auth.getUser();
  if (user && !state.user) {
     state.user=null;
     await loadMeAndProfiles();
     fetchArtefactsFromSupabase();
     setupArtefactsRealtime();
  }
  renderApp();
}
boot();
