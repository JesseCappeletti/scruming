// ==== CONSTANTES & UTILITÁRIOS ====
const SPRINTS = ["SPRINT I", "SPRINT II", "SPRINT III", "SPRINT IV", "SPRINT V", "SPRINT VI"];
const ROLES = ["Product Owner", "Scrum Master", "Desenvolvedor"];

// Usa a instância global criada no index.html!
const supabase = window.supabase;

// ==== UTILITÁRIOS ====
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
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\b((https?:\/\/[^\s'"]+))/g, '<a href="$1" target="_blank">$1</a>')
    .replace(/\n/g, "<br>");
}

// ==== ESTADO GLOBAL ====
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

// ==== LOCALSTORAGE (sem artefacts) ====
if (localStorage.getItem("s_apptemp2")) {
  try {
    const parsed = JSON.parse(localStorage.getItem("s_apptemp2"));
    Object.assign(state,
      (({user, users, sprintIndex, favorites}) => ({user, users, sprintIndex, favorites}))(parsed)
    );
  } catch (e) {}
}
function saveState() {
  localStorage.setItem("s_apptemp2", JSON.stringify({
    user: state.user,
    users: state.users,
    sprintIndex: state.sprintIndex,
    favorites: state.favorites,
  }));
}

// ==== SUPABASE ARTEFACTS: TEMPO REAL ====
let artefactsRealtimeSub = null;
async function setupArtefactsRealtime() {
  if (artefactsRealtimeSub) artefactsRealtimeSub.unsubscribe();
  artefactsRealtimeSub = supabase
    .channel('public:artefacts')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'artefacts' }, payload => {
      fetchArtefactsFromSupabase();
    })
    .subscribe();
}
async function fetchArtefactsFromSupabase() {
  const { data, error } = await supabase
    .from('artefacts')
    .select('*')
    .order('created_at', { ascending: true });
  if (!error) {
    state.artefacts = (data || []).map(item => ({
      ...item,
      createdAt: item.created_at || item.createdAt,
      responsibles: typeof item.responsaveis === "string"
        ? JSON.parse(item.responsaveis || "[]")
        : (item.responsaveis || []),
    }));
    renderApp();
  } else {
    alert("Erro ao ler artefatos do Supabase: " + error.message);
  }
}

// ==== CRUD NO SUPABASE ====
// Criar
async function createArtefactOnSupabase(obj) {
  const user = state.user;
  const body = {
    title: obj.title,
    responsaveis: obj.responsibles,
    responsibleJustif: obj.responsibleJustif,
    sprint: obj.sprint,
    tool: obj.tool,
    toolJustif: obj.toolJustif,
    description: obj.description,
    created_at: obj.createdAt instanceof Date ? obj.createdAt.toISOString() : obj.createdAt,
    status: obj.status || "todo",
    pct: obj.pct || 0,
    fileLink: obj.fileLink || "",
    created_by: user ? user.email : null,
  };
  const { error } = await supabase.from('artefacts').insert([body]);
  if (error) alert("Erro ao criar artefato: " + error.message);
}
// Atualizar
async function updateArtefactOnSupabase(id, updateFields) {
  if (updateFields.responsibles)
    updateFields['responsaveis'] = updateFields.responsibles;
  const { error } = await supabase
    .from('artefacts')
    .update(updateFields)
    .eq('id', id);
  if (error) alert("Erro ao atualizar artefato: " + error.message);
}
// Apagar
async function deleteArtefactOnSupabase(id) {
  const { error } = await supabase
    .from('artefacts')
    .delete()
    .eq('id', id);
  if (error) alert("Erro ao apagar artefato: " + error.message);
}

// ==== UI PRINCIPAL ====
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

// (Os métodos a seguir são placeholders. Pesque suas implementações reais no seu código.)
function renderHeader() {
  // Aqui entra seu cabeçalho/nav
  // Exemplo:
  return `<header>
    <h1>Scrum Info Hub</h1>
    <button onclick="logout()" style="float:right">Sair</button>
  </header>`;
}
function renderFavoritesBarUnderHeader() {
  // Renderize sua barra de favoritos
  return `<div id="favbar"></div>`;
}
function renderBoard() {
  // Renderize seu quadro (board) de sprints, tarefas, etc.
  return `<section><h2>Board principal</h2></section>`;
}
function renderLoginOrRegister() {
  // Renderize seu formulário de login/registro
  return `<section><h2>Login ou Cadastro</h2></section>`;
}
function renderModal(artefact) {
  // Renderize seu modal de detalhes do artefato
  return `<div id="modal"></div>`;
}
function fixSearchFocus() {
  // Opção: foco no campo de busca, se existe
  const s = document.querySelector("#searchinput");
  if (s) s.focus();
}

// ==== CRIAÇÃO E EDIÇÃO DE ARTEFATOS ====
window.createArtefact = async function (ev) {
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
    const id = state.editingArtefact.id;
    artefact = {
      ...state.editingArtefact,
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      createdAt: dtFinal,
      fileLink
    };
    await updateArtefactOnSupabase(id, {
      title, responsaveis: responsibles, responsibleJustif, sprint, tool, toolJustif, description,
      created_at: dtFinal,
      fileLink
    });
    state.editingArtefact = null;
  } else {
    artefact = {
      title, responsibles, responsibleJustif, sprint, tool, toolJustif, description,
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
window.editArtefact = function (id) {
  const art = state.artefacts.find(a => a.id === id);
  if (!art) return;
  state.editingArtefact = art;
  state.showNewArtefact = true;
  state.tempResponsaveis = art.responsibles.map(r => r.username);
  state.sprintIndex = SPRINTS.indexOf(art.sprint);
  state.search = "";
  renderApp();
};
window.deleteArtefact = async function (id) {
  if (!confirm("Tem certeza que deseja excluir este artefato?")) return;
  await deleteArtefactOnSupabase(id);
  state.showModal = false;
  state.showNewArtefact = false;
  state.editingArtefact = null;
  renderApp();
};
window.dropTask = async function (e, status) {
  e.preventDefault();
  const id = e.dataTransfer.getData("text");
  const task = state.artefacts.find(a => a.id === id);
  if (task && ["todo", "progress", "done"].includes(status)) {
    await updateArtefactOnSupabase(id, { status, pct: status !== "progress" ? 0 : (task.pct || 0) });
  }
};
window.updatePct = async function (id, val) {
  const artefact = state.artefacts.find(a => a.id === id);
  if (!artefact) return;
  const pct = Math.min(100, Math.max(0, parseInt(val, 10) || 0));
  await updateArtefactOnSupabase(id, { pct });
};

// ==== FAVORITOS LOCAL ====
window.toggleFavorite = function (id) {
  if (!state.favorites) state.favorites = [];
  if (state.favorites.includes(id)) state.favorites = state.favorites.filter(f => f !== id);
  else state.favorites.push(id);
  saveState();
  renderApp();
};

// ==== AUTENTICAÇÃO ====
// (Continua usando local para usuários, para login sim usa Supabase auth!)
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

  let { error } = await supabase.auth.signUp({
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

  let { error, data } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    alert("Usuário ou senha incorretos! (" + error.message + ")");
    return;
  }

  const u = state.users.find(u => u.email === email && u.password === password);
  if (!u) {
    alert("Usuário autenticado mas não encontrado nos dados locais. Faça um novo cadastro.");
    return;
  }
  state.user = { ...u };
  saveState();
  renderApp();
  await fetchArtefactsFromSupabase();
  setupArtefactsRealtime();
};

window.logout = async function () {
  await supabase.auth.signOut();
  state.user = null;
  state.search = "";
  saveState();
  renderApp();
  if (artefactsRealtimeSub) artefactsRealtimeSub.unsubscribe();
};

if (state.user) {
  fetchArtefactsFromSupabase();
  setupArtefactsRealtime();
}

// CHAMA o app
renderApp();
