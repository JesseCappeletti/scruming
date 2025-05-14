// ==== CONSTANTES & UTILITÁRIOS ====
const SPRINTS = ["SPRINT I", "SPRINT II", "SPRINT III", "SPRINT IV", "SPRINT V", "SPRINT VI"];
const ROLES = ["Product Owner", "Scrum Master", "Desenvolvedor"];

function getTechLeadExists(users) {
  return users.some(u => u.role === "Desenvolvedor" && u.isTechLead);
}
function getAvatar(name) {
  return `<span style="background:#2563eb33;border-radius:50%;display:inline-block;width:27px;height:27px;line-height:27px;font-weight:bold;color:#2563eb;text-align:center;margin-right:3px">${(name || "?")[0].toUpperCase()}</span>`;
}
function formatDate(dt, short = true) {
  if (!dt) return "";
  if (typeof dt === "string" || typeof dt === "number") dt = new Date(dt);
  if (short) return dt.toLocaleDateString("pt-BR");
  return dt.toLocaleDateString("pt-BR") + " " + dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function escapeHtml(str) {
  if (!str) return "";
  return (str + "")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function formatRich(str) {
  if (!str) return "";
  return (str + "")
    // bold
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    // code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // links
    .replace(/\b((https?:\/\/[^\s'"]+))/g, '<a href="$1" target="_blank">$1</a>')
    .replace(/\n/g, "<br>");
}

// ==== ESTADO GLOBAL (react-like)  ====
const state = {
  user: null,
  users: [],
  artefacts: [],
  sprintIndex: 0,
  showModal: false,
  modalArtefact: null,
  search: "",
  showFavBar: false,
  favorites: [],
  editingArtefact: null,
  showLogin: true,
  dropdownResponsaveis: false,
  tempResponsaveis: [],
  showNewArtefact: false
};

// Sincronização com localStorage
if (localStorage.getItem("s_apptemp2")) {
  Object.assign(state, JSON.parse(localStorage.getItem("s_apptemp2")));
}
function saveState() {
  localStorage.setItem("s_apptemp2", JSON.stringify({
    user: state.user,
    users: state.users,
    artefacts: state.artefacts,
    sprintIndex: state.sprintIndex,
    favorites: state.favorites,
  }));
}

// ==== RENDER ROOT ====
function renderApp() {
  document.getElementById("app").innerHTML = `
    ${state.user ? renderHeader() : ""}
    ${state.user && state.showFavBar ? renderFavoritesBarUnderHeader() : ""}
    <main>
      ${state.user ? renderBoard() : renderLoginOrRegister()}
    </main>
    ${state.showModal && state.modalArtefact ? renderModal(state.modalArtefact) : ""}
  `;
  setTimeout(fixSearchFocus, 20);
}

// ==== HEADER ====
function renderHeader() {
  return `<div class="header">
    <span class="logo-title">Scrum Info Hub</span>
    <div style="display:flex;align-items:center;flex:1;margin-left:22px;position:relative;">
      <div class="search-box" style="margin-right:0;">
        <input
          placeholder="Pesquisar (usuários, artefatos, sprint, data)..."
          value="${escapeHtml(state.search || "")}"
          oninput="appSearch(this.value)" autocomplete="off"/>
        <i class="fas fa-search"></i>
        ${state.search ? `<button class="search-clear" onclick="clearSearch()" title="Limpar"><i class="fa fa-times"></i></button>` : ""}
      </div>
      <div class="sprint-dropdown">
        <select onchange="appChangeSprint(this.value)">
        ${SPRINTS.map((s, i) => `<option value="${i}" ${i === state.sprintIndex ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </div>
      <button class="header-btn ${state.showFavBar ? "fav-active" : ""}" onclick="toggleFavBar()" title="Favoritos"><i class="fa fa-star"></i></button>
    </div>
    <div class="user-info">
      <span title="${state.user.role}${state.user.isTechLead ? " (Tech Lead)" : ""}">${getAvatar(state.user.username)}${escapeHtml(state.user.username)}</span>
      <button class="header-btn" onclick="logout()" title="Sair"><i class="fas fa-sign-out-alt"></i></button>
    </div>
  </div>`;
}

// ==== FAVORITOS =====
function renderFavoritesBarUnderHeader() {
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

// ==== SEARCH/SPRINT HANDLERS ====
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
window.toggleFavBar = function () {
  state.showFavBar = !state.showFavBar;
  renderApp();
};
window.favOpenArtefact = function (id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
function appChangeSprint(idxStr) {
  state.sprintIndex = parseInt(idxStr, 10);
  state.search = "";
  state.showNewArtefact = false;
  renderApp();
}
window.appChangeSprint = appChangeSprint;

// ==== BOARD & COLUNAS ====
function renderBoard() {
  if (state.search && state.search.trim().length) {
    return renderSearchResults();
  }
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
  </div>
  ${state.showNewArtefact ? renderNewArtefactForm() : ""}
  `;
}

function renderCard(task) {
  return `<div class="card" draggable="true" ondragstart="dragTask(event,'${task.id}')" id="card-${task.id}">
    <div class="card-title" onclick="openArtefactModal('${task.id}')" style="cursor:pointer">${escapeHtml(task.title)}</div>
    <div class="card-resp">Por: ${escapeHtml(task.responsibles.map(r => r.username).join(", "))}</div>
    <div class="card-date">${escapeHtml(formatDate(task.createdAt))}</div>
    ${task.status === "progress" ? `
      <div class="card-pct">
        <label>Concluído: <input type="number" min="0" max="100" value="${task.pct || 0}" style="width:40px" onchange="updatePct('${task.id}',this.value)" />%</label>
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

function renderSearchResults() {
  const query = state.search.trim().toLowerCase();
  const artefacts = state.artefacts.filter(a =>
    a.title?.toLowerCase().includes(query) ||
    a.sprint?.toLowerCase().includes(query) ||
    a.tool?.toLowerCase().includes(query) ||
    a.responsibles?.some(r => r.username?.toLowerCase().includes(query)) ||
    formatDate(a.createdAt).includes(query)
  );
  const users = state.users.filter(u =>
    u.username.toLowerCase().includes(query) ||
    (u.role && u.role.toLowerCase().includes(query))
  );
  return `<div style="padding:40px 20px;">
    <h3>Resultados da busca:</h3>
    ${users.length ? `<div class="result-users">
      <h4>Usuários</h4>
      ${users.map(u => `<div class="user-result">${getAvatar(u.username)} <b>${escapeHtml(u.username)}</b> <span style="color:#257">${escapeHtml(u.role || "")}${u.isTechLead ? " (Tech Lead)" : ""}</span></div>`).join("")}
    </div>` : ""}
    ${artefacts.length ? `<div class="result-artefacts">
      <h4>Artefatos / Tarefas</h4>
      ${artefacts.map(a =>
        `<div class="art-result" onclick="openArtefactModal('${a.id}')">
            <div class="res-title">${escapeHtml(a.title)}</div>
            <div class="res-meta">
              <span>${escapeHtml(a.sprint)}</span> |
              <span>${escapeHtml(formatDate(a.createdAt, false))}</span> |
              <span>${escapeHtml(a.responsibles.map(r => r.username).join(", "))}</span>
            </div>
        </div>`
      ).join("")}
    </div>` : ""}
    ${!users.length && !artefacts.length ? `<div>Nenhum resultado encontrado.</div>` : ""}
  </div>`;
}

/* ========== NOVA/EDITAR ARTEFATO (MODAL) ========== */
function renderNewArtefactForm() {
  const data = state.editingArtefact || {};
  if (!state.tempResponsaveis || !Array.isArray(state.tempResponsaveis)) state.tempResponsaveis = [];
  if (state.editingArtefact && state.tempResponsaveis.length === 0 && data.responsibles) {
    state.tempResponsaveis = data.responsibles.map(x => x.username);
  }
  let dt = data.createdAt ? new Date(data.createdAt) : new Date();
  let dataVal = dt.toISOString().slice(0, 10);
  return `<div class="modal-bg" onclick="closeNewArtefactForm(event)">
    <div class="modal-content" tabindex="0" onclick="event.stopPropagation();" style="width:80%;max-width:900px;margin:0 auto;">
      <button class="modal-close" onclick="closeNewArtefactForm()">&times;</button>
      <div class="modal-header"><b>${state.editingArtefact ? "Editar Artefato / Tarefa" : "Novo Artefato / Tarefa"}</b></div>
      <form onsubmit="createArtefact(event)">
        <label>Título:</label>
        <input required type="text" name="title" placeholder="Título (ex: Design UI da HomePage)" value="${escapeHtml(data.title || "")}" />
        <label>Responsáveis:</label>
        <div class="selector-box">
          <button type="button" class="selector-btn${state.dropdownResponsaveis ? ' active' : ''}"
            onclick="toggleDropdownResp()">${state.tempResponsaveis.length ? '<span class="selector-tags">' + state.tempResponsaveis.map(u =>
              `<span class="selector-tag">${escapeHtml(u)}</span>`
            ).join('') + '</span>' : 'Selecione responsáveis'} <i class="fa fa-caret-down" style="margin-left:auto"></i>
          </button>
          ${state.dropdownResponsaveis ? `<div class="selector-list">${state.users.map(u => {
            const checked = state.tempResponsaveis.includes(u.username) ? 'checked' : '';
            return `<label><input type="checkbox" value="${u.username}" onchange="toggleRespOption(this)" ${checked}/> ${escapeHtml(u.username)} (${u.role}${u.isTechLead ? " - Tech Lead" : ""}) </label>`;
          }).join('')}</div>` : ''}
        </div>
        <label>Justificativa (responsável):</label>
        <textarea required name="responsibleJustif" placeholder="Por que estes responsáveis?">${escapeHtml(data.responsibleJustif || "")}</textarea>
        <label>Sprint:</label>
        <select name="sprint" required>
          ${SPRINTS.map((s, i) => `<option value="${s}" ${((data.sprint && data.sprint === s) || (!data.sprint && i === state.sprintIndex)) ? "selected" : ""}>${s}</option>`).join("")}
        </select>
        <label>Ferramenta:</label>
        <input name="tool" type="text" placeholder="Ferramenta (Ex: Figma, Word,...)" required value="${escapeHtml(data.tool || "")}" />
        <label>Justificativa (ferramenta):</label>
        <textarea name="toolJustif" placeholder="Por que esta ferramenta?" required>${escapeHtml(data.toolJustif || "")}</textarea>
        <label>Descrição do Artefato</label>
        <textarea name="description" placeholder="Descrição detalhada do artefato (suporta /código, negrito, links, etc)">${escapeHtml(data.description || "")}</textarea>
        <label style="margin-top:21px;">Data:</label>
        <input name="datareg" type="date" value="${dataVal}" required style="max-width:200px;display:inline-block;" />
        <div style="margin-bottom:16px; margin-top:17px;">
          <label><i class="fa fa-link"></i> Link do Arquivo:</label>
          <input type="url" name="fileLink" placeholder="Cole o link para o arquivo" value="${escapeHtml(data.fileLink||'')}" />
        </div>
        <button class="btn" type="submit" style="margin-top:25px">${state.editingArtefact ? "Salvar" : "Criar"}</button>
        ${state.editingArtefact ? `<button class="btn" type="button" style="background:#ea4444;" onclick="deleteArtefact('${data.id}')">Excluir</button>` : ""}
      </form>
    </div>
  </div>`;
}
window.toggleDropdownResp = function () {
  state.dropdownResponsaveis = !state.dropdownResponsaveis;
  renderApp();
};
window.toggleRespOption = function (input) {
  const val = input.value;
  if (input.checked) {
    if (!state.tempResponsaveis.includes(val))
      state.tempResponsaveis.push(val);
  } else {
    state.tempResponsaveis = state.tempResponsaveis.filter(x => x !== val);
  }
  renderApp();
};
// Fecha dropdown se clicar fora
document.body.addEventListener("mousedown", function (e) {
  if (state.dropdownResponsaveis && !e.target.closest('.selector-btn,.selector-list'))
    { state.dropdownResponsaveis = false; renderApp(); }
});
window.showNewArtefactForm = function () {
  state.showNewArtefact = true;
  state.editingArtefact = null;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  state.search = ""; // LIMPA busca ao criar novo
  renderApp();
};
window.closeNewArtefactForm = function (e) {
  if (e) e.stopPropagation();
  state.showNewArtefact = false;
  state.editingArtefact = null;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  renderApp();
};
window.createArtefact = function (ev) {
  ev.preventDefault();
  const form = ev.target;
  const title = form.title.value.trim();
  const responsibles = state.users.filter(u => state.tempResponsaveis.includes(u.username));
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
    Object.assign(state.editingArtefact, {
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      createdAt: dtFinal,
      fileLink
    });
    artefact = state.editingArtefact;
    state.editingArtefact = null;
  } else {
    artefact = {
      id: "art-" + Math.random().toString(16).slice(2),
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      createdAt: dtFinal,
      status: "todo",
      pct: 0,
      fileLink
    };
    state.artefacts.push(artefact);
  }
  state.showNewArtefact = false;
  state.tempResponsaveis = [];
  state.dropdownResponsaveis = false;
  state.sprintIndex = SPRINTS.indexOf(artefact.sprint);
  saveState();
  renderApp();
};
window.editArtefact = function (id) {
  const art = state.artefacts.find(a => a.id === id);
  if (!art) return;
  state.editingArtefact = art;
  state.showNewArtefact = true;
  state.tempResponsaveis = art.responsibles.map(r => r.username);
  state.sprintIndex = SPRINTS.indexOf(art.sprint);
  state.search = ""; // LIMPA busca ao editar
  renderApp();
};
window.deleteArtefact = function (id) {
  if (!confirm("Tem certeza que deseja excluir este artefato?")) return;
  state.artefacts = state.artefacts.filter(a => a.id !== id);
  state.showModal = false;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  saveState();
  renderApp();
};

/* ========== MODAL DE DETALHES DO ARTEFATO ========== */
function renderModal(task) {
  return `<div class="modal-bg" onclick="closeModal(event)">
    <div class="modal-content document-modal" tabindex="0" onclick="event.stopPropagation();" style="width:80%;max-width:900px;margin:0 auto;">
      <button class="modal-close" onclick="closeModal()" title="Fechar">&times;</button>
      <div class="document-header">
        <h2>${escapeHtml(task.title)}</h2>
      </div>
      <div class="document-section">
        <strong>Responsável:</strong>
        <span>${escapeHtml(task.responsibles.map(r => r.username).join(", "))}</span>
      </div>
      <div class="document-section">
        <strong>Justificativa (responsável):</strong><br>
        <span>${escapeHtml(task.responsibleJustif || "")}</span>
      </div>
      <div class="document-section">
        <strong>Sprint:</strong> <span>${escapeHtml(task.sprint)}</span>
        <span style="margin-left:32px"><strong>Data:</strong> ${escapeHtml(formatDate(task.createdAt, false))}</span>
      </div>
      <div class="document-section">
        <strong>Ferramenta:</strong> <span>${escapeHtml(task.tool || "")}</span><br>
        <strong>Justificativa (ferramenta):</strong> <span>${escapeHtml(task.toolJustif || "")}</span>
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
          <i class="fa${(state.favorites || []).includes(task.id) ? 's' : 'r'} fa-star"></i> Favoritar
        </button>
        <button class="btn" onclick="editArtefactFromModal('${task.id}')" style="background:#f9ba33;">Editar</button>
        <button class="btn" onclick="deleteArtefact('${task.id}')" style="background:#ea4444;">Excluir</button>
      </div>
    </div>
  </div>`;
}
window.openArtefactModal = function (id) {
  state.showModal = true;
  state.modalArtefact = state.artefacts.find(a => a.id === id);
  renderApp();
};
window.closeModal = function (e) {
  state.showModal = false;
  state.modalArtefact = null;
  renderApp();
};
window.editArtefactFromModal = function (id) {
  state.showModal = false;
  setTimeout(function () {
    state.editingArtefact = state.artefacts.find(a => a.id === id);
    state.showNewArtefact = true;
    state.tempResponsaveis = state.editingArtefact.responsibles.map(r => r.username);
    state.sprintIndex = SPRINTS.indexOf(state.editingArtefact.sprint);
    state.search = ""; // LIMPA busca ao editar
    renderApp();
  }, 40);
};

/* ======= DRAG & DROP ======= */
window.dragTask = function (e, id) {
  e.dataTransfer.setData("text", id);
  setTimeout(() => e.target.classList.add("dragging"), 1);
};
window.allowDrop = function (e) {
  e.preventDefault();
};
window.dropTask = function (e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text");
  const task = state.artefacts.find(a => a.id === id);
  if (task && ["todo", "progress", "done"].includes(status)) {
    task.status = status;
    if (status !== "progress") task.pct = 0;
    saveState();
    renderApp();
  }
};
window.updatePct = function (id, val) {
  const artefact = state.artefacts.find(a => a.id === id);
  if (!artefact) return;
  artefact.pct = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
  saveState();
  renderApp();
};
window.toggleFavorite = function (id) {
  if (!state.favorites) state.favorites = [];
  if (state.favorites.includes(id)) state.favorites = state.favorites.filter(f => f !== id);
  else state.favorites.push(id);
  saveState();
  renderApp();
};

/* ======= LOGIN | REGISTRO ======= */
function renderLoginOrRegister() {
  return state.showLogin ? renderLoginForm() : renderRegisterForm();
}
function renderLoginForm() {
  return `
  <div style="max-width:390px;margin:70px auto 0 auto;background:#f1f6fa;border-radius:13px;box-shadow:0 8px 40px #0049b122;padding:33px 26px;">
    <h2 style="text-align:center;">Entrar</h2>
    <form onsubmit="login(event)">
      <input name="username" required placeholder="Seu email" style="width:100%;margin-bottom:13px"/>
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
      <input name="username" required placeholder="Seu email" style="width:100%;margin-bottom:13px"/>
      <input name="password" type="password" required placeholder="Senha" style="width:100%;margin-bottom:13px"/>
      <input name="key" placeholder="Chave de acesso" required minlength="8" maxlength="8" style="width:100%;margin-bottom:13px"/>
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
    </form>
  </div>
  `;
}
window.gotoRegister = function () {
  state.showLogin = false;
  renderApp();
};
window.gotoLogin = function () {
  state.showLogin = true;
  renderApp();
};
window.register = async function (ev) {
  ev.preventDefault();
  const f = ev.target;
  const email = f.username.value.trim().toLowerCase();
  const password = f.password.value;
  const key = f.key.value.trim();
  const role = f.role.value;
  let isTechLead = !!f.querySelector('#techLeadBox')?.checked;

  if (key !== "97990191") return alert("Chave de acesso inválida!");
  if (!email || !role) return alert("Preencha todos os campos! Cargo é obrigatório.");
  if (!/\S+@\S+\.\S+/.test(email)) return alert("Digite um e-mail válido!");
  if (role === "Desenvolvedor") {
    if (getTechLeadExists(state.users) && isTechLead) {
      alert("Só pode haver um Tech Lead.");
      isTechLead = false;
    }
  }

  let { error } = await window.supabase.auth.signUp({
    email: email,
    password: password,
  });
  if (error) {
    alert('Erro ao registrar: ' + error.message);
    return;
  }

  state.users.push({ username: email, password, role, isTechLead, email });
  saveState();
  alert("Registrado com sucesso! Verifique seu email faça o login.");
  state.showLogin = true;
  renderApp();
};

window.login = async function (ev) {
  ev.preventDefault();
  const f = ev.target;
  const email = f.username.value.trim().toLowerCase();
  const password = f.password.value;

  let { error, data } = await window.supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert("Usuário ou senha incorretos! (" + error.message + ")");
    return;
  }

  // Busca dados locais extras por email
  const u = state.users.find(u => u.email === email && u.password === password);
  if (!u) {
    alert("Usuário autenticado mas não encontrado nos dados locais. Faça um novo cadastro.");
    return;
  }
  state.user = { ...u };
  saveState();
  renderApp();
};

window.logout = async function () {
  await window.supabase.auth.signOut();
  state.user = null;
  state.search = "";
  saveState();
  renderApp();
};

// Após todas as funções
renderApp();
