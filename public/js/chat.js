/**
 * chat.js — Renderizado de mensajes, canales, DMs, búsqueda y notificaciones
 * No se acopla directamente a Socket.io — solo maneja la UI.
 */
'use strict';

/* ════════════════════════════════════════════════════════════════
   COLORES DE AVATAR
   ════════════════════════════════════════════════════════════════ */
const AVATAR_COLORS = [
  '#E01E5A', '#2EB67D', '#ECB22E', '#36C5F0',
  '#4A154B', '#1264A3', '#FF6B35', '#7B5EA7',
  '#D0021B', '#00BCD4', '#8BC34A', '#FF5722',
];
const _colorMap = {};
let _colorIdx = 0;

function colorDeAutor(autor) {
  if (!_colorMap[autor]) {
    _colorMap[autor] = AVATAR_COLORS[_colorIdx % AVATAR_COLORS.length];
    _colorIdx++;
  }
  return _colorMap[autor];
}

/* ════════════════════════════════════════════════════════════════
   ESTADO GLOBAL
   ════════════════════════════════════════════════════════════════ */
let _lastAutor      = null;
let _lastTime       = 0;
const AGRUP_MS      = 5 * 60 * 1000;

let currentChannelId   = null;
let currentChannelType = 'channel'; // 'channel' | 'dm'

// Badges de no-leídos: { channelId → count }
const _unreadCounts = {};
let _onlineUsers = new Set();

/* ════════════════════════════════════════════════════════════════
   DOM
   ════════════════════════════════════════════════════════════════ */
const feedEl       = document.getElementById('messagesFeed');
const typingAreaEl = document.getElementById('typingArea');
const typingTextEl = document.getElementById('typingText');
let _typingTimer   = null;

/* ════════════════════════════════════════════════════════════════
   HELPERS
   ════════════════════════════════════════════════════════════════ */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function parseMarkdown(str = '') {
  return str
    .replace(/\*([^\*]+)\*/g, '<strong>$1</strong>')
    .replace(/_([^_]+)_/g, '<em>$1</em>')
    .replace(/\`\`\`([\s\S]*?)\`\`\`/g, '<pre style="background:var(--bg-secondary); padding:8px; border-radius:4px; font-family:monospace; margin:4px 0;">$1</pre>')
    .replace(/\n/g, '<br>');
}
function formatHour(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function iniciales(nombre = '') {
  return nombre.split(' ').slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZAR MENSAJE
   ════════════════════════════════════════════════════════════════ */
function renderizarMensaje(msg, animado = true) {
  const domId = `msg-${msg.id}`;
  if (document.getElementById(domId)) return;

  const ts      = new Date(msg.createdAt).getTime();
  const grouped = msg.autor === _lastAutor && (ts - _lastTime) < AGRUP_MS;
  _lastAutor    = msg.autor;
  _lastTime     = ts;

  const color   = msg.isOwn ? '#1264A3' : colorDeAutor(msg.autor);
  const horaStr = formatHour(msg.createdAt);

  const wrapper = document.createElement('div');
  wrapper.id    = domId;
  wrapper.className = [
    'slack-message',
    grouped   ? 'grouped'  : '',
    msg.isOwn ? 'own-msg'  : '',
    animado   ? 'anim-fade-up' : '',
  ].filter(Boolean).join(' ');

  wrapper.innerHTML = `
    <div class="msg-avatar" style="background:${color}">
      ${iniciales(msg.autor)}
    </div>
    <div class="msg-body">
      ${!grouped ? `
        <div class="msg-header">
          <span class="msg-author" style="color:${color}">${escapeHtml(msg.autor)}</span>
          ${msg.isOwn ? '<span class="own-badge">Tú</span>' : ''}
          <span class="msg-time">${horaStr}</span>
        </div>` : `<span class="msg-time grouped-time">${horaStr}</span>`}
      <div class="msg-text">${parseMarkdown(escapeHtml(msg.texto))}</div>
    </div>
    <div class="msg-actions">
      <button class="msg-action-btn" title="Reaccionar">😀</button>
      <button class="msg-action-btn" title="Responder">💬</button>
    </div>
  `;

  feedEl.appendChild(wrapper);
  if (animado) feedEl.scrollTop = feedEl.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════
   MENSAJE DE SISTEMA
   ════════════════════════════════════════════════════════════════ */
function renderizarMensajeSistema(texto) {
  const el = document.createElement('div');
  el.className   = 'system-message anim-fade-up';
  el.textContent = texto;
  feedEl.appendChild(el);
  feedEl.scrollTop = feedEl.scrollHeight;
  _lastAutor = null;
}

/* ════════════════════════════════════════════════════════════════
   TYPING INDICATOR
   ════════════════════════════════════════════════════════════════ */
function mostrarTyping(quien) {
  typingAreaEl.style.display = 'flex';
  typingTextEl.textContent   = quien ? `${quien} está escribiendo…` : 'Alguien está escribiendo…';
  clearTimeout(_typingTimer);
  _typingTimer = setTimeout(ocultarTyping, 3000);
}
function ocultarTyping() {
  clearTimeout(_typingTimer);
  typingAreaEl.style.display = 'none';
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZADO DINÁMICO DE CANALES (desde MongoDB)
   ════════════════════════════════════════════════════════════════ */
function renderizarCanales(canales) {
  const listEl = document.getElementById('channelList');
  const addBtn = document.getElementById('btnAgregarCanal');
  if (!listEl) return;
  listEl.innerHTML = '';

  canales.forEach(c => {
    if (!c.isDirectMessage) {
      const li = document.createElement('li');
      li.className          = 'channel-item';
      li.dataset.channelId  = c._id;
      li.dataset.channelName = c.name;
      li.dataset.channelDesc = c.description || '';
      li.innerHTML = `
        <span class="channel-hash">#</span>
        <span class="ch-name">${escapeHtml(c.name)}</span>
        <span class="unread-badge" id="badge-${c._id}" style="display:none">0</span>
      `;
      listEl.appendChild(li);
    }
  });

  if (addBtn) listEl.appendChild(addBtn);

  if (canales.length > 0 && !currentChannelId) {
    seleccionarCanal(canales[0]._id, canales[0].name, canales[0].description || '', 'channel');
  }
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZADO DINÁMICO DE DMs (Obsoleto, pero se mantiene la firma)
   ════════════════════════════════════════════════════════════════ */
function renderizarDMs(dms, myName) {
  // Obsoleto, los DMs ahora se manejan a través del Directorio
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZADO DINÁMICO DE USUARIOS
   ════════════════════════════════════════════════════════════════ */
function renderizarUsuarios(usuarios, myName) {
  const listEl = document.getElementById('usersList');
  if (!listEl) return;
  listEl.innerHTML = '';

  // Sort: online users first, then alphabetically
  const ordenados = [...usuarios].sort((a, b) => {
    const aOnline = _onlineUsers.has(a);
    const bOnline = _onlineUsers.has(b);
    if (aOnline && !bOnline) return -1;
    if (!aOnline && bOnline) return 1;
    return a.localeCompare(b);
  });

  ordenados.forEach(u => {
    if (u === myName) return; // No mostrarte a ti mismo en el directorio
    const isOnline = _onlineUsers.has(u);
    const color = colorDeAutor(u);
    const li = document.createElement('li');
    li.className = 'dm-item';
    li.style.cursor = 'pointer';
    
    // Highlight if active
    const isCurrentlyActive = currentChannelType === 'dm' && document.getElementById('chatChannelName').textContent === u;
    if (isCurrentlyActive) {
      li.classList.add('active');
    }

    // Cuando hacen clic, invocan iniciarDM en app.js
    li.onclick = () => { if (typeof iniciarDM === 'function') iniciarDM(u); };
    li.innerHTML = `
      <span class="dm-avatar" style="background:${color}">${iniciales(u)}</span>
      <span class="dm-name">${escapeHtml(u)}</span>
      <span class="presence ${isOnline ? 'online' : 'offline'}"></span>
    `;
    listEl.appendChild(li);
  });
}

/* ════════════════════════════════════════════════════════════════
   SELECCIONAR CANAL / DM
   ════════════════════════════════════════════════════════════════ */
async function seleccionarCanal(id, nombre, descripcion = '', tipo = 'channel') {
  currentChannelId   = id;
  currentChannelType = tipo;

  if (tipo === 'dm') {
    descripcion = `Mensaje directo con ${nombre}`;
  }

  // Marcar activo en sidebar
  document.querySelectorAll('.channel-item, .dm-item').forEach(i => {
    const isChannelActive = i.dataset.channelId === id;
    const isUserActive = tipo === 'dm' && i.querySelector('.dm-name')?.textContent === nombre;
    i.classList.toggle('active', isChannelActive || isUserActive);
  });

  // Limpiar badge de no-leídos
  _unreadCounts[id] = 0;
  const badge = document.getElementById(`badge-${id}`);
  if (badge) badge.style.display = 'none';

  // Actualizar cabecera
  const prefix = tipo === 'dm' ? '@' : '#';
  document.getElementById('chatChannelName').textContent = nombre;
  document.getElementById('chatChannelIcon').textContent = prefix;
  document.getElementById('chatInput').placeholder       = `Mensaje en ${prefix}${nombre}`;
  document.getElementById('chatTopic').textContent       = descripcion;

  // Actualizar Welcome Banner
  const wTitle = document.getElementById('welcomeTitle');
  const wIcon  = document.getElementById('welcomeIcon');
  const wDesc  = document.getElementById('welcomeDesc');
  if (wTitle) wTitle.textContent = `${prefix}${nombre}`;
  if (wIcon)  wIcon.textContent  = prefix;
  if (wDesc) {
    if (tipo === 'dm') {
      wDesc.innerHTML = `Este es el comienzo de tus mensajes directos con <strong>${escapeHtml(nombre)}</strong>.`;
    } else {
      wDesc.innerHTML = `Este es el punto de inicio del canal <strong>${prefix}${escapeHtml(nombre)}</strong>. ${escapeHtml(descripcion)}`;
    }
  }

  // Limpiar feed
  feedEl.querySelectorAll('.slack-message, .system-message').forEach(n => n.remove());
  _lastAutor = null;

  // Notificar a app.js que cambió el canal (vía evento custom)
  document.dispatchEvent(new CustomEvent('canal_cambiado', { detail: { channelId: id } }));

  // Cargar historial del canal
  try {
    const r = await fetch(`/api/messages?channelId=${id}`);
    const d = await r.json();
    if (d.ok) window.ChatModule.cargarHistorial(d.data);
  } catch (e) {
    console.error('[Chat] Error cargando historial:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   NO-LEÍDOS (badge)
   ════════════════════════════════════════════════════════════════ */
function incrementarNoLeido(channelId) {
  if (channelId === currentChannelId) return; // ya está visible
  _unreadCounts[channelId] = (_unreadCounts[channelId] || 0) + 1;
  const badge = document.getElementById(`badge-${channelId}`);
  if (badge) {
    badge.textContent    = _unreadCounts[channelId] > 9 ? '9+' : _unreadCounts[channelId];
    badge.style.display  = 'inline-flex';
  }
}

/* ════════════════════════════════════════════════════════════════
   BÚSQUEDA GLOBAL
   ════════════════════════════════════════════════════════════════ */
const searchBtnEl   = document.getElementById('searchBtn');
const searchOverlay = document.getElementById('searchOverlay');
const searchInputEl = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

let _searchTimer = null;

if (searchBtnEl) {
  searchBtnEl.addEventListener('click', () => {
    searchOverlay.style.display = 'flex';
    setTimeout(() => searchInputEl?.focus(), 100);
  });
}

document.getElementById('searchClose')?.addEventListener('click', () => {
  searchOverlay.style.display = 'none';
  searchInputEl.value = '';
  searchResults.innerHTML = '';
});

searchInputEl?.addEventListener('input', () => {
  clearTimeout(_searchTimer);
  const q = searchInputEl.value.trim();
  if (!q) { searchResults.innerHTML = ''; return; }
  _searchTimer = setTimeout(() => buscar(q), 300);
});

async function buscar(q) {
  searchResults.innerHTML = '<p class="search-loading">Buscando…</p>';
  try {
    const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error);

    const { mensajes, canales } = d.data;
    let html = '';

    if (canales.length) {
      html += `<div class="search-section-title">Canales</div>`;
      canales.forEach(c => {
        html += `<div class="search-result-item" data-type="channel"
          data-id="${c._id}" data-name="${escapeHtml(c.name)}" data-desc="${escapeHtml(c.description)}">
          <span class="sr-icon">#</span>
          <div><strong>${escapeHtml(c.name)}</strong><br><small>${escapeHtml(c.description)}</small></div>
        </div>`;
      });
    }

    if (mensajes.length) {
      html += `<div class="search-section-title">Mensajes</div>`;
      mensajes.forEach(m => {
        html += `<div class="search-result-item" data-type="msg"
          data-channel-id="${m.channelId}">
          <span class="sr-icon" style="background:${colorDeAutor(m.autor || '?')}">${iniciales(m.autor)}</span>
          <div>
            <strong>${escapeHtml(m.autor || 'Anónimo')}</strong>
            <small class="sr-time">${formatHour(m.createdAt)}</small>
            <br><span class="sr-text">${escapeHtml(m.texto.slice(0, 80))}</span>
          </div>
        </div>`;
      });
    }

    if (!html) html = '<p class="search-empty">No se encontraron resultados.</p>';
    searchResults.innerHTML = html;

    // Click en resultado
    searchResults.querySelectorAll('.search-result-item').forEach(el => {
      el.addEventListener('click', () => {
        if (el.dataset.type === 'channel') {
          seleccionarCanal(el.dataset.id, el.dataset.name, el.dataset.desc, 'channel');
        } else if (el.dataset.type === 'msg') {
          seleccionarCanal(el.dataset.channelId, '', '', 'channel');
        }
        searchOverlay.style.display = 'none';
        searchInputEl.value = '';
      });
    });

  } catch (e) {
    searchResults.innerHTML = `<p class="search-empty">Error: ${e.message}</p>`;
  }
}

/* ════════════════════════════════════════════════════════════════
   DELEGACIÓN DE CLICKS — Sidebar
   ════════════════════════════════════════════════════════════════ */
document.getElementById('channelList')?.addEventListener('click', e => {
  const item = e.target.closest('.channel-item[data-channel-id]');
  if (!item) return;
  seleccionarCanal(item.dataset.channelId, item.dataset.channelName, item.dataset.channelDesc, 'channel');
});

/* ════════════════════════════════════════════════════════════════
   BOTÓN "AGREGAR CANAL"
   ════════════════════════════════════════════════════════════════ */
document.getElementById('btnAgregarCanal')?.addEventListener('click', () => {
  document.getElementById('newChannelModal').style.display = 'flex';
  setTimeout(() => document.getElementById('newChannelInput')?.focus(), 100);
});

document.getElementById('newChannelClose')?.addEventListener('click', () => {
  document.getElementById('newChannelModal').style.display = 'none';
});

document.getElementById('newChannelSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('newChannelInput')?.value.trim();
  const desc = document.getElementById('newChannelDesc')?.value.trim();
  if (!name) return;

  try {
    const r = await fetch('/api/channels', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description: desc }),
    });
    const d = await r.json();
    if (!d.ok) { alert(d.error); return; }

    document.getElementById('newChannelModal').style.display = 'none';
    document.getElementById('newChannelInput').value = '';
    document.getElementById('newChannelDesc').value  = '';

    // Re-renderizar canal recién creado
    const canal = d.data;
    const listEl = document.getElementById('channelList');
    const addBtn = document.getElementById('btnAgregarCanal');

    const li = document.createElement('li');
    li.className = 'channel-item anim-fade-up';
    li.dataset.channelId   = canal._id;
    li.dataset.channelName = canal.name;
    li.dataset.channelDesc = canal.description || '';
    li.innerHTML = `
      <span class="channel-hash">#</span>
      <span class="ch-name">${escapeHtml(canal.name)}</span>
      <span class="unread-badge" id="badge-${canal._id}" style="display:none">0</span>
    `;
    listEl.insertBefore(li, addBtn);
    seleccionarCanal(canal._id, canal.name, canal.description || '', 'channel');

  } catch (e) {
    alert('Error creando canal: ' + e.message);
  }
});

/* ════════════════════════════════════════════════════════════════
   API PÚBLICA DEL MÓDULO
   ════════════════════════════════════════════════════════════════ */
window.ChatModule = {
  renderizarMensaje,
  renderizarMensajeSistema,
  mostrarTyping,
  ocultarTyping,
  renderizarCanales,
  renderizarDMs,
  renderizarUsuarios,
  incrementarNoLeido,
  setOnlineUsers(nombres = []) {
    _onlineUsers = new Set(nombres);
  },

  getCurrentChannelId:   () => currentChannelId,
  getCurrentChannelType: () => currentChannelType,

  seleccionarCanal,

  cargarHistorial(mensajes = []) {
    mensajes.forEach(m => renderizarMensaje({
      id:        m._id || m.id,
      autor:     m.autor || 'Anónimo',
      texto:     m.texto,
      createdAt: m.createdAt,
      isOwn:     false,
    }, false));
    feedEl.scrollTop = feedEl.scrollHeight;
  },
};