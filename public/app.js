(() => {
  'use strict';

  const ADMIN_TOKEN_KEY = 'cartinhas_do_breno_admin_token';

  function storageGet(key) {
    try {
      return sessionStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function storageSet(key, val) {
    try {
      sessionStorage.setItem(key, val);
    } catch {
      // ignora quando o iframe restringe storage
    }
  }

  function storageRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch {
      // ignora
    }
  }

  const state = {
    activeTab: 'public', // 'public' | 'admin'
    publicLetters: [],
    adminLetters: [],
    search: '',
    sort: 'recentes',
    adminSearch: '',
    adminToken: storageGet(ADMIN_TOKEN_KEY),
    adminAuthenticated: false,
    selectedSummary: null,
    editingLetter: null,
    editorMode: 'create', // 'create' | 'edit'
    selectedSeal: 'vinho',
    confirmDeleteId: null,
    toastTimer: null
  };

  // Tabs & Views
  const tabPublic = document.getElementById('tab-public');
  const tabAdmin = document.getElementById('tab-admin');
  const adminStatusDot = document.getElementById('admin-status-dot');
  const siteSubtitle = document.getElementById('site-subtitle');
  const viewPublic = document.getElementById('view-public');
  const viewAdmin = document.getElementById('view-admin');

  // Public DOM
  const gridEl = document.getElementById('envelopes-grid');
  const loadingEl = document.getElementById('loading-state');
  const emptyEl = document.getElementById('empty-state');
  const emptyTitleEl = document.getElementById('empty-title');
  const emptyDescEl = document.getElementById('empty-desc');
  const searchInput = document.getElementById('search-input');
  const sortSelect = document.getElementById('sort-select');
  const countPill = document.getElementById('letter-count');

  // Admin DOM
  const adminLoginBox = document.getElementById('admin-login-box');
  const adminLoginForm = document.getElementById('admin-login-form');
  const adminLoginPassword = document.getElementById('admin-login-password');
  const adminLoginError = document.getElementById('admin-login-error');
  const adminLoginSubmit = document.getElementById('admin-login-submit');

  const adminPanel = document.getElementById('admin-panel');
  const btnAdminNew = document.getElementById('btn-admin-new');
  const btnAdminEmptyNew = document.getElementById('btn-admin-empty-new');
  const btnAdminChangePass = document.getElementById('btn-admin-change-pass');
  const btnAdminLogout = document.getElementById('btn-admin-logout');
  const adminSearchInput = document.getElementById('admin-search-input');
  const adminCountPill = document.getElementById('admin-count');
  const adminLoading = document.getElementById('admin-loading');
  const adminEmpty = document.getElementById('admin-empty');
  const adminEmptyTitle = document.getElementById('admin-empty-title');
  const adminEmptyDesc = document.getElementById('admin-empty-desc');
  const adminListEl = document.getElementById('admin-list');

  // Unlock modal
  const unlockModal = document.getElementById('unlock-modal');
  const unlockSeal = document.getElementById('unlock-seal');
  const unlockInitials = document.getElementById('unlock-initials');
  const unlockTitle = document.getElementById('unlock-title');
  const unlockHint = document.getElementById('unlock-hint');
  const unlockForm = document.getElementById('unlock-form');
  const unlockPasswordInput = document.getElementById('unlock-password');
  const unlockError = document.getElementById('unlock-error');
  const unlockSubmit = document.getElementById('unlock-submit');

  // Read modal
  const readModal = document.getElementById('read-modal');
  const readSeal = document.getElementById('read-seal');
  const readInitials = document.getElementById('read-initials');
  const readDate = document.getElementById('read-date');
  const readRecipient = document.getElementById('read-recipient');
  const readBody = document.getElementById('read-body');
  const readSignature = document.getElementById('read-signature');
  const btnCloseRead = document.getElementById('btn-close-read');
  const btnCloseReadX = document.getElementById('btn-close-read-x');

  // Editor modal (Admin)
  const editorModal = document.getElementById('editor-modal');
  const editorEyebrow = document.getElementById('editor-eyebrow');
  const editorTitle = document.getElementById('editor-title');
  const editorForm = document.getElementById('editor-form');
  const inputNome = document.getElementById('input-nome');
  const inputSenha = document.getElementById('input-senha');
  const labelSenha = document.getElementById('label-senha');
  const senhaHelper = document.getElementById('senha-helper');
  const inputDica = document.getElementById('input-dica');
  const inputAssinatura = document.getElementById('input-assinatura');
  const inputMensagem = document.getElementById('input-mensagem');
  const charCounter = document.getElementById('char-counter');
  const editorError = document.getElementById('editor-error');
  const editorSubmit = document.getElementById('editor-submit');
  const sealOptions = Array.from(document.querySelectorAll('.seal-option'));

  // Change admin password modal
  const adminPassModal = document.getElementById('admin-pass-modal');
  const adminPassForm = document.getElementById('admin-pass-form');
  const adminPassCurrent = document.getElementById('admin-pass-current');
  const adminPassNew = document.getElementById('admin-pass-new');
  const adminPassError = document.getElementById('admin-pass-error');
  const adminPassSubmit = document.getElementById('admin-pass-submit');

  const toastEl = document.getElementById('toast');

  // Utilities
  function normalizeForSearch(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  function getInitials(name) {
    const cleaned = (name || '')
      .replace(/^Exemplo\s*[—–-]\s*/i, '')
      .trim();
    if (!cleaned) return 'B';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatShortDate(iso) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
      }).format(new Date(iso));
    } catch {
      return '';
    }
  }

  function formatLongDate(iso) {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      }).format(new Date(iso));
    } catch {
      return '';
    }
  }

  function showToast(message) {
    if (state.toastTimer) clearTimeout(state.toastTimer);
    toastEl.textContent = message;
    toastEl.hidden = false;
    state.toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, 3400);
  }

  function showInlineError(el, message) {
    el.textContent = message;
    el.hidden = false;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function updateBodyScrollLock() {
    const anyOpen =
      !unlockModal.hidden ||
      !readModal.hidden ||
      !editorModal.hidden ||
      !adminPassModal.hidden;
    document.body.style.overflow = anyOpen ? 'hidden' : '';
  }

  function openModal(modal) {
    modal.hidden = false;
    updateBodyScrollLock();
  }

  function closeModal(modal) {
    modal.hidden = true;
    updateBodyScrollLock();
  }

  function resetPasswordFieldType(input) {
    if (input) input.type = 'password';
  }

  function updateWordCounter() {
    const text = inputMensagem.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    charCounter.textContent = words === 1 ? '1 palavra' : `${words} palavras`;
  }

  function setSelectedSeal(seal) {
    state.selectedSeal = seal || 'vinho';
    sealOptions.forEach((btn) => {
      const isMatch = btn.dataset.sealChoice === state.selectedSeal;
      btn.classList.toggle('is-selected', isMatch);
      btn.setAttribute('aria-checked', String(isMatch));
    });
  }

  function setAdminToken(token) {
    state.adminToken = token || '';
    state.adminAuthenticated = Boolean(token);
    if (token) {
      storageSet(ADMIN_TOKEN_KEY, token);
    } else {
      storageRemove(ADMIN_TOKEN_KEY);
    }
    adminStatusDot.hidden = !state.adminAuthenticated;
  }

  // API
  async function apiRequest(url, options = {}) {
    const { useAdminAuth = false, headers = {}, body, method = 'GET', ...rest } = options;
    const reqHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    let finalBody = body;

    if (useAdminAuth && state.adminToken) {
      reqHeaders['X-Admin-Token'] = state.adminToken;
      reqHeaders.Authorization = `Bearer ${state.adminToken}`;

      if (method.toUpperCase() !== 'GET') {
        let parsed = {};
        if (typeof body === 'string' && body.trim()) {
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = {};
          }
        }
        finalBody = JSON.stringify({ ...parsed, adminToken: state.adminToken });
      }
    }

    const response = await fetch(url, {
      method,
      headers: reqHeaders,
      credentials: 'same-origin',
      ...(finalBody !== undefined ? { body: finalBody } : {}),
      ...rest
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const err = new Error(data.erro || 'Ocorreu um erro inesperado.');
      err.status = response.status;
      throw err;
    }
    return data;
  }

  function handleExpiredAdminSession() {
    setAdminToken('');
    state.adminLetters = [];
    closeModal(editorModal);
    closeModal(adminPassModal);
    renderAdminAuthView();
    showInlineError(
      adminLoginError,
      'Sua sessão de administrador expirou. Faça login novamente.'
    );
  }

  // Tabs
  function switchTab(tab) {
    state.activeTab = tab;
    const isAdmin = tab === 'admin';

    tabPublic.classList.toggle('is-active', !isAdmin);
    tabPublic.setAttribute('aria-selected', String(!isAdmin));
    tabAdmin.classList.toggle('is-active', isAdmin);
    tabAdmin.setAttribute('aria-selected', String(isAdmin));

    viewPublic.hidden = isAdmin;
    viewAdmin.hidden = !isAdmin;

    siteSubtitle.textContent = isAdmin
      ? 'Área exclusiva do Breno para adicionar, escolher, editar ou excluir cartinhas.'
      : 'Um cantinho reservado para palavras guardadas com carinho. Escolha seu nome abaixo e digite sua senha para abrir sua carta.';

    if (isAdmin) {
      renderAdminAuthView();
      if (state.adminAuthenticated) {
        loadAdminLetters();
      } else {
        setTimeout(() => adminLoginPassword.focus(), 40);
      }
    } else {
      loadPublicLetters();
    }
  }

  // ========================
  // PUBLIC VIEW
  // ========================

  async function loadPublicLetters() {
    loadingEl.hidden = false;
    emptyEl.hidden = true;
    gridEl.innerHTML = '';

    try {
      const data = await apiRequest('/api/cartas');
      state.publicLetters = Array.isArray(data.cartas) ? data.cartas : [];
      renderPublicList();
    } catch (err) {
      showToast(err.message || 'Erro ao carregar cartinhas.');
      emptyTitleEl.textContent = 'Não foi possível carregar as cartinhas';
      emptyDescEl.textContent = 'Verifique a conexão e tente recarregar a página.';
      emptyEl.hidden = false;
    } finally {
      loadingEl.hidden = true;
    }
  }

  function getFilteredPublicLetters() {
    const query = normalizeForSearch(state.search.trim());
    let list = state.publicLetters.slice();

    if (query) {
      list = list.filter((item) => normalizeForSearch(item.nome).includes(query));
    }

    if (state.sort === 'alfabetica') {
      list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }));
    } else {
      list.sort((a, b) => new Date(b.criadaEm) - new Date(a.criadaEm));
    }
    return list;
  }

  function createEnvelopeCard(letter) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'envelope-card';
    button.dataset.seal = letter.selo || 'vinho';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `Abrir cartinha de ${letter.nome}`);

    const flap = document.createElement('div');
    flap.className = 'envelope-flap';
    flap.setAttribute('aria-hidden', 'true');
    flap.innerHTML = `
      <svg viewBox="0 0 320 82" preserveAspectRatio="none" fill="none">
        <path class="flap-fill" d="M0 0H320L170 68C163.5 71 156.5 71 150 68L0 0Z" />
        <path class="flap-stroke" d="M0 0L150 68C156.5 71 163.5 71 170 68L320 0" stroke-width="1.6" />
      </svg>
    `;

    const seal = document.createElement('div');
    seal.className = 'wax-seal';
    seal.dataset.seal = letter.selo || 'vinho';
    seal.setAttribute('aria-hidden', 'true');
    seal.textContent = getInitials(letter.nome);

    const label = document.createElement('span');
    label.className = 'envelope-label';
    label.textContent = 'Para';

    const nameEl = document.createElement('h3');
    nameEl.className = 'envelope-name';
    nameEl.textContent = letter.nome;

    button.append(flap, seal, label, nameEl);

    if (letter.dica) {
      const hintEl = document.createElement('div');
      hintEl.className = 'envelope-hint-badge';
      hintEl.textContent = `Dica: ${letter.dica}`;
      button.appendChild(hintEl);
    }

    const meta = document.createElement('div');
    meta.className = 'envelope-meta';

    const lockPill = document.createElement('span');
    lockPill.className = 'lock-pill';
    lockPill.innerHTML = `
      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.1" aria-hidden="true">
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </svg>
      <span>Protegida por senha</span>
    `;

    const dateEl = document.createElement('span');
    dateEl.className = 'envelope-date';
    dateEl.textContent = formatShortDate(letter.criadaEm);

    meta.append(lockPill, dateEl);
    button.appendChild(meta);

    button.addEventListener('click', () => openUnlockModal(letter));
    return button;
  }

  function renderPublicList() {
    const filtered = getFilteredPublicLetters();
    const total = state.publicLetters.length;
    countPill.textContent = total === 1 ? '1 cartinha' : `${total} cartinhas`;

    gridEl.innerHTML = '';

    if (filtered.length === 0) {
      if (state.search.trim()) {
        emptyTitleEl.textContent = 'Nenhum nome encontrado';
        emptyDescEl.textContent = `Não encontramos nenhuma cartinha para "${state.search.trim()}".`;
      } else {
        emptyTitleEl.textContent = 'Nenhuma cartinha por aqui ainda';
        emptyDescEl.textContent = 'Em breve o Breno vai publicar novas cartinhas por aqui.';
      }
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    const fragment = document.createDocumentFragment();
    filtered.forEach((letter) => fragment.appendChild(createEnvelopeCard(letter)));
    gridEl.appendChild(fragment);
  }

  // Unlock modal (recipient)
  function openUnlockModal(summary) {
    state.selectedSummary = summary;
    unlockSeal.dataset.seal = summary.selo || 'vinho';
    unlockInitials.textContent = getInitials(summary.nome);
    unlockTitle.textContent = summary.nome;

    if (summary.dica) {
      unlockHint.textContent = `Dica da senha: ${summary.dica}`;
      unlockHint.hidden = false;
    } else {
      unlockHint.hidden = true;
    }

    unlockPasswordInput.value = '';
    resetPasswordFieldType(unlockPasswordInput);
    unlockError.hidden = true;
    unlockError.textContent = '';

    openModal(unlockModal);
    setTimeout(() => unlockPasswordInput.focus(), 40);
  }

  async function handleUnlockSubmit(event) {
    event.preventDefault();
    if (!state.selectedSummary) return;

    const senha = unlockPasswordInput.value.trim();
    if (!senha) {
      showInlineError(unlockError, 'Digite a senha para abrir esta cartinha.');
      return;
    }

    unlockSubmit.disabled = true;
    unlockSubmit.textContent = 'Abrindo...';
    unlockError.hidden = true;

    try {
      const id = encodeURIComponent(state.selectedSummary.id);
      const data = await apiRequest(`/api/cartas/${id}/abrir`, {
        method: 'POST',
        body: JSON.stringify({ senha })
      });

      closeModal(unlockModal);
      openReadModal(data.carta);
    } catch (err) {
      showInlineError(unlockError, err.message || 'Senha incorreta. Tente novamente.');
      unlockPasswordInput.select();
    } finally {
      unlockSubmit.disabled = false;
      unlockSubmit.textContent = 'Abrir Cartinha';
    }
  }

  // Reading modal
  function openReadModal(letter) {
    readSeal.dataset.seal = letter.selo || 'vinho';
    readInitials.textContent = getInitials(letter.nome);
    readDate.textContent = formatLongDate(letter.criadaEm);
    readRecipient.textContent = `Para ${letter.nome},`;
    readSignature.textContent = letter.assinatura || 'Com carinho, Breno';

    readBody.innerHTML = '';
    const paragraphs = (letter.mensagem || '').split(/\n{2,}/);
    paragraphs.forEach((para) => {
      const p = document.createElement('p');
      p.textContent = para;
      readBody.appendChild(p);
    });

    openModal(readModal);
  }

  function closeReadAndClear() {
    closeModal(readModal);
    readBody.innerHTML = '';
  }

  // ========================
  // ADMIN VIEW
  // ========================

  function renderAdminAuthView() {
    adminLoginBox.hidden = state.adminAuthenticated;
    adminPanel.hidden = !state.adminAuthenticated;
    if (!state.adminAuthenticated) {
      adminLoginPassword.value = '';
      resetPasswordFieldType(adminLoginPassword);
    }
  }

  async function checkExistingAdminSession() {
    if (!state.adminToken) {
      setAdminToken('');
      return;
    }
    try {
      const data = await apiRequest('/api/admin/sessao', {
        method: 'POST',
        useAdminAuth: true
      });
      if (data.autenticado) {
        setAdminToken(state.adminToken);
      } else {
        setAdminToken('');
      }
    } catch {
      setAdminToken('');
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    const senha = adminLoginPassword.value.trim();
    if (!senha) {
      showInlineError(adminLoginError, 'Informe a senha de administrador.');
      return;
    }

    adminLoginSubmit.disabled = true;
    adminLoginSubmit.textContent = 'Verificando...';
    adminLoginError.hidden = true;

    try {
      const data = await apiRequest('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ senha })
      });
      setAdminToken(data.token);
      adminLoginPassword.value = '';
      renderAdminAuthView();
      showToast('Bem-vindo ao painel admin, Breno!');
      if (Array.isArray(data.cartas)) {
        state.adminLetters = data.cartas;
        renderAdminList();
      } else {
        await loadAdminLetters();
      }
    } catch (err) {
      showInlineError(adminLoginError, err.message || 'Senha de administrador incorreta.');
      adminLoginPassword.select();
    } finally {
      adminLoginSubmit.disabled = false;
      adminLoginSubmit.textContent = 'Entrar no Painel Admin';
    }
  }

  async function handleAdminLogout() {
    try {
      await apiRequest('/api/admin/logout', { method: 'POST', useAdminAuth: true });
    } catch {
      // ignora erro de rede ao sair
    }
    setAdminToken('');
    state.adminLetters = [];
    state.confirmDeleteId = null;
    renderAdminAuthView();
    showToast('Você saiu da área administrativa.');
  }

  async function loadAdminLetters() {
    if (!state.adminAuthenticated) return;
    adminLoading.hidden = false;
    adminEmpty.hidden = true;
    adminListEl.innerHTML = '';

    try {
      const data = await apiRequest('/api/admin/cartas/listar', {
        method: 'POST',
        useAdminAuth: true
      });
      state.adminLetters = Array.isArray(data.cartas) ? data.cartas : [];
      renderAdminList();
    } catch (err) {
      if (err.status === 401) {
        handleExpiredAdminSession();
        return;
      }
      showToast(err.message || 'Erro ao carregar o painel.');
    } finally {
      adminLoading.hidden = true;
    }
  }

  function renderAdminList() {
    const query = normalizeForSearch(state.adminSearch.trim());
    const filtered = query
      ? state.adminLetters.filter(
          (item) =>
            normalizeForSearch(item.nome).includes(query) ||
            normalizeForSearch(item.dica).includes(query) ||
            normalizeForSearch(item.mensagem).includes(query)
        )
      : state.adminLetters.slice();

    const total = state.adminLetters.length;
    adminCountPill.textContent = total === 1 ? '1 cartinha' : `${total} cartinhas`;
    adminListEl.innerHTML = '';

    if (filtered.length === 0) {
      if (query) {
        adminEmptyTitle.textContent = 'Nenhuma cartinha encontrada';
        adminEmptyDesc.textContent = `Nenhum resultado para "${state.adminSearch.trim()}".`;
        btnAdminEmptyNew.hidden = true;
      } else {
        adminEmptyTitle.textContent = 'Nenhuma cartinha cadastrada';
        adminEmptyDesc.textContent = 'Clique em "Nova Cartinha" para adicionar o primeiro nome e carta.';
        btnAdminEmptyNew.hidden = false;
      }
      adminEmpty.hidden = false;
      return;
    }

    adminEmpty.hidden = true;
    const fragment = document.createDocumentFragment();

    filtered.forEach((letter) => {
      const card = document.createElement('div');
      card.className = 'admin-item';
      card.setAttribute('role', 'listitem');

      const main = document.createElement('div');
      main.className = 'admin-item-main';

      const left = document.createElement('div');
      left.className = 'admin-item-left';

      const seal = document.createElement('div');
      seal.className = 'wax-seal wax-seal-sm';
      seal.dataset.seal = letter.selo || 'vinho';
      seal.textContent = getInitials(letter.nome);

      const info = document.createElement('div');
      info.className = 'admin-item-info';

      const top = document.createElement('div');
      top.className = 'admin-item-top';

      const name = document.createElement('h3');
      name.className = 'admin-item-name';
      name.textContent = letter.nome;

      const date = document.createElement('span');
      date.className = 'admin-item-date';
      date.textContent = formatShortDate(letter.criadaEm);

      top.append(name, date);

      const snippet = document.createElement('p');
      snippet.className = 'admin-item-snippet';
      snippet.textContent = letter.mensagem.replace(/\s+/g, ' ');

      const tags = document.createElement('div');
      tags.className = 'admin-item-tags';

      const sigTag = document.createElement('span');
      sigTag.className = 'admin-tag';
      sigTag.textContent = `Assinatura: ${letter.assinatura}`;
      tags.appendChild(sigTag);

      if (letter.dica) {
        const hintTag = document.createElement('span');
        hintTag.className = 'admin-tag';
        hintTag.textContent = `Dica: ${letter.dica}`;
        tags.appendChild(hintTag);
      }

      info.append(top, snippet, tags);
      left.append(seal, info);

      const actions = document.createElement('div');
      actions.className = 'admin-item-actions';

      const btnView = document.createElement('button');
      btnView.type = 'button';
      btnView.className = 'btn btn-ghost btn-sm';
      btnView.textContent = 'Visualizar';
      btnView.addEventListener('click', () => openReadModal(letter));

      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn btn-outline btn-sm';
      btnEdit.textContent = 'Editar';
      btnEdit.addEventListener('click', () => openEditModal(letter));

      const btnDel = document.createElement('button');
      btnDel.type = 'button';
      btnDel.className = 'btn btn-ghost-danger btn-sm';
      btnDel.textContent = 'Excluir';
      btnDel.addEventListener('click', () => {
        state.confirmDeleteId = letter.id;
        renderAdminList();
      });

      actions.append(btnView, btnEdit, btnDel);
      main.append(left, actions);
      card.appendChild(main);

      if (state.confirmDeleteId === letter.id) {
        const confirmBar = document.createElement('div');
        confirmBar.className = 'delete-confirm-bar';

        const msg = document.createElement('span');
        msg.textContent = `Tem certeza que deseja excluir a cartinha de "${letter.nome}"?`;

        const barActions = document.createElement('div');
        barActions.className = 'delete-confirm-actions';

        const btnCancel = document.createElement('button');
        btnCancel.type = 'button';
        btnCancel.className = 'btn btn-ghost btn-sm';
        btnCancel.textContent = 'Cancelar';
        btnCancel.addEventListener('click', () => {
          state.confirmDeleteId = null;
          renderAdminList();
        });

        const btnConfirm = document.createElement('button');
        btnConfirm.type = 'button';
        btnConfirm.className = 'btn btn-danger btn-sm';
        btnConfirm.textContent = 'Sim, excluir';
        btnConfirm.addEventListener('click', () => handleAdminDelete(letter, btnConfirm));

        barActions.append(btnCancel, btnConfirm);
        confirmBar.append(msg, barActions);
        card.appendChild(confirmBar);
      }

      fragment.appendChild(card);
    });

    adminListEl.appendChild(fragment);
  }

  async function handleAdminDelete(letter, buttonEl) {
    buttonEl.disabled = true;
    buttonEl.textContent = 'Excluindo...';

    try {
      const id = encodeURIComponent(letter.id);
      await apiRequest(`/api/admin/cartas/${id}`, {
        method: 'DELETE',
        useAdminAuth: true
      });
      state.confirmDeleteId = null;
      state.adminLetters = state.adminLetters.filter((item) => item.id !== letter.id);
      state.publicLetters = state.publicLetters.filter((item) => item.id !== letter.id);
      renderAdminList();
      renderPublicList();
      showToast(`Cartinha de ${letter.nome} excluída.`);
    } catch (err) {
      if (err.status === 401) {
        handleExpiredAdminSession();
        return;
      }
      showToast(err.message || 'Erro ao excluir a cartinha.');
      buttonEl.disabled = false;
      buttonEl.textContent = 'Sim, excluir';
    }
  }

  // Create / Edit modal (Admin only)
  function openCreateModal() {
    state.editorMode = 'create';
    state.editingLetter = null;
    editorEyebrow.textContent = 'Escrever nova mensagem';
    editorTitle.textContent = 'Nova Cartinha';
    labelSenha.innerHTML = 'Senha desta carta <span class="req">*</span>';
    inputSenha.placeholder = 'Mínimo 3 caracteres';
    inputSenha.required = true;
    senhaHelper.textContent = 'A pessoa vai usar esta senha para abrir a própria carta.';
    editorSubmit.textContent = 'Salvar e Lacrar Cartinha';

    editorForm.reset();
    resetPasswordFieldType(inputSenha);
    setSelectedSeal('vinho');
    editorError.hidden = true;
    updateWordCounter();

    openModal(editorModal);
    setTimeout(() => inputNome.focus(), 40);
  }

  function openEditModal(letter) {
    state.editorMode = 'edit';
    state.editingLetter = letter;
    editorEyebrow.textContent = 'Editar cartinha';
    editorTitle.textContent = `Editando: ${letter.nome}`;
    labelSenha.innerHTML = 'Nova senha da carta <span class="opt">(opcional)</span>';
    inputSenha.placeholder = 'Deixe em branco para manter a senha atual';
    inputSenha.required = false;
    senhaHelper.textContent = 'Preencha apenas se quiser definir uma nova senha para esta pessoa.';
    editorSubmit.textContent = 'Salvar Alterações';

    inputNome.value = letter.nome;
    inputSenha.value = '';
    resetPasswordFieldType(inputSenha);
    inputDica.value = letter.dica || '';
    inputAssinatura.value = letter.assinatura || '';
    inputMensagem.value = letter.mensagem || '';
    setSelectedSeal(letter.selo || 'vinho');
    editorError.hidden = true;
    updateWordCounter();

    openModal(editorModal);
    setTimeout(() => inputNome.focus(), 40);
  }

  async function handleEditorSubmit(event) {
    event.preventDefault();
    editorError.hidden = true;

    const nome = inputNome.value.trim();
    const senha = inputSenha.value.trim();
    const dica = inputDica.value.trim();
    const assinatura = inputAssinatura.value.trim();
    const mensagem = inputMensagem.value.trim();
    const selo = state.selectedSeal;

    if (!nome) {
      showInlineError(editorError, 'Informe o nome da pessoa que vai receber a cartinha.');
      inputNome.focus();
      return;
    }

    if (state.editorMode === 'create' && senha.length < 3) {
      showInlineError(editorError, 'Defina uma senha com pelo menos 3 caracteres para esta carta.');
      inputSenha.focus();
      return;
    }

    if (state.editorMode === 'edit' && senha && senha.length < 3) {
      showInlineError(editorError, 'A nova senha da cartinha precisa ter pelo menos 3 caracteres.');
      inputSenha.focus();
      return;
    }

    if (!mensagem) {
      showInlineError(editorError, 'Escreva o conteúdo da cartinha antes de salvar.');
      inputMensagem.focus();
      return;
    }

    editorSubmit.disabled = true;
    editorSubmit.textContent = 'Salvando...';

    try {
      if (state.editorMode === 'create') {
        const data = await apiRequest('/api/admin/cartas', {
          method: 'POST',
          useAdminAuth: true,
          body: JSON.stringify({ nome, senha, dica, assinatura, mensagem, selo })
        });
        state.adminLetters.unshift(data.carta);
        state.publicLetters.unshift({
          id: data.carta.id,
          nome: data.carta.nome,
          dica: data.carta.dica,
          selo: data.carta.selo,
          criadaEm: data.carta.criadaEm,
          atualizadaEm: data.carta.atualizadaEm
        });
        renderAdminList();
        renderPublicList();
        closeModal(editorModal);
        showToast(`Cartinha para ${data.carta.nome} adicionada!`);
      } else if (state.editingLetter) {
        const id = encodeURIComponent(state.editingLetter.id);
        const data = await apiRequest(`/api/admin/cartas/${id}`, {
          method: 'PUT',
          useAdminAuth: true,
          body: JSON.stringify({
            nome,
            dica,
            assinatura,
            mensagem,
            selo,
            novaSenha: senha || undefined
          })
        });

        const adminIdx = state.adminLetters.findIndex((item) => item.id === data.carta.id);
        if (adminIdx !== -1) state.adminLetters[adminIdx] = data.carta;

        const pubIdx = state.publicLetters.findIndex((item) => item.id === data.carta.id);
        if (pubIdx !== -1) {
          state.publicLetters[pubIdx] = {
            id: data.carta.id,
            nome: data.carta.nome,
            dica: data.carta.dica,
            selo: data.carta.selo,
            criadaEm: data.carta.criadaEm,
            atualizadaEm: data.carta.atualizadaEm
          };
        }

        renderAdminList();
        renderPublicList();
        closeModal(editorModal);
        showToast(`Cartinha de ${data.carta.nome} atualizada!`);
      }
    } catch (err) {
      if (err.status === 401) {
        handleExpiredAdminSession();
        return;
      }
      showInlineError(editorError, err.message || 'Não foi possível salvar a cartinha.');
    } finally {
      editorSubmit.disabled = false;
      editorSubmit.textContent =
        state.editorMode === 'create' ? 'Salvar e Lacrar Cartinha' : 'Salvar Alterações';
    }
  }

  // Change admin password modal
  function openAdminPassModal() {
    adminPassForm.reset();
    resetPasswordFieldType(adminPassCurrent);
    resetPasswordFieldType(adminPassNew);
    adminPassError.hidden = true;
    openModal(adminPassModal);
    setTimeout(() => adminPassCurrent.focus(), 40);
  }

  async function handleAdminPassSubmit(event) {
    event.preventDefault();
    adminPassError.hidden = true;

    const senhaAtual = adminPassCurrent.value.trim();
    const novaSenha = adminPassNew.value.trim();

    if (!senhaAtual) {
      showInlineError(adminPassError, 'Informe a senha atual do administrador.');
      return;
    }
    if (novaSenha.length < 6) {
      showInlineError(adminPassError, 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }

    adminPassSubmit.disabled = true;
    adminPassSubmit.textContent = 'Atualizando...';

    try {
      await apiRequest('/api/admin/senha', {
        method: 'POST',
        useAdminAuth: true,
        body: JSON.stringify({ senhaAtual, novaSenha })
      });
      closeModal(adminPassModal);
      showToast('Senha do administrador atualizada com sucesso!');
    } catch (err) {
      if (err.status === 401 && !err.message.includes('atual')) {
        handleExpiredAdminSession();
        return;
      }
      showInlineError(adminPassError, err.message || 'Não foi possível alterar a senha.');
    } finally {
      adminPassSubmit.disabled = false;
      adminPassSubmit.textContent = 'Atualizar Senha';
    }
  }

  // Event listeners
  tabPublic.addEventListener('click', () => switchTab('public'));
  tabAdmin.addEventListener('click', () => switchTab('admin'));

  searchInput.addEventListener('input', (e) => {
    state.search = e.target.value;
    renderPublicList();
  });

  sortSelect.addEventListener('change', (e) => {
    state.sort = e.target.value;
    renderPublicList();
  });

  adminSearchInput.addEventListener('input', (e) => {
    state.adminSearch = e.target.value;
    renderAdminList();
  });

  adminLoginForm.addEventListener('submit', handleAdminLogin);
  btnAdminLogout.addEventListener('click', handleAdminLogout);
  btnAdminNew.addEventListener('click', openCreateModal);
  btnAdminEmptyNew.addEventListener('click', openCreateModal);
  btnAdminChangePass.addEventListener('click', openAdminPassModal);

  unlockForm.addEventListener('submit', handleUnlockSubmit);
  editorForm.addEventListener('submit', handleEditorSubmit);
  adminPassForm.addEventListener('submit', handleAdminPassSubmit);
  inputMensagem.addEventListener('input', updateWordCounter);

  btnCloseRead.addEventListener('click', closeReadAndClear);
  btnCloseReadX.addEventListener('click', closeReadAndClear);

  sealOptions.forEach((btn) => {
    btn.addEventListener('click', () => setSelectedSeal(btn.dataset.sealChoice));
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const modal = document.getElementById(btn.dataset.closeModal);
      if (modal) closeModal(modal);
    });
  });

  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.togglePassword);
      if (!target) return;
      target.type = target.type === 'password' ? 'text' : 'password';
      target.focus();
    });
  });

  [unlockModal, readModal, editorModal, adminPassModal].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target !== modal) return;
      if (modal === readModal) {
        closeReadAndClear();
      } else {
        closeModal(modal);
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!adminPassModal.hidden) {
      closeModal(adminPassModal);
    } else if (!editorModal.hidden) {
      closeModal(editorModal);
    } else if (!readModal.hidden) {
      closeReadAndClear();
    } else if (!unlockModal.hidden) {
      closeModal(unlockModal);
    }
  });

  // Init
  async function init() {
    await checkExistingAdminSession();
    await loadPublicLetters();
  }

  init();
})();
