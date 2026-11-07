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
let _lastDateStr    = null;
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
    .replace(/@(\S+)/g, '<span class="mention-highlight">@$1</span>')
    .replace(/\n/g, '<br>');
}
function formatHour(iso) {
  return new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}
function iniciales(nombre = '') {
  return nombre.split(' ').slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';
}
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDateDivider(dateObj) {
  const today = new Date();
  const msgDate = new Date(dateObj);
  today.setHours(0, 0, 0, 0);
  msgDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((today.getTime() - msgDate.getTime()) / (1000 * 3600 * 24));
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return msgDate.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZAR MENSAJE
   ════════════════════════════════════════════════════════════════ */
function renderizarMensaje(msg, animado = true) {
  const domId = `msg-${msg.id}`;
  if (document.getElementById(domId)) return;

  const msgDateObj = new Date(msg.createdAt);
  const ts = msgDateObj.getTime();
  const dateStr = msgDateObj.toDateString();

  if (dateStr !== _lastDateStr) {
    const dividerText = formatDateDivider(msgDateObj);
    const divider = document.createElement('div');
    divider.className = 'day-divider';
    if (animado) divider.classList.add('anim-fade-up');
    divider.innerHTML = `
      <span class="day-divider-line"></span>
      <span class="day-divider-text">${dividerText}</span>
      <span class="day-divider-line"></span>
    `;
    feedEl.appendChild(divider);
    _lastDateStr = dateStr;
    _lastAutor = null; // force header for new day
  }

  const grouped = msg.autor === _lastAutor && (ts - _lastTime) < AGRUP_MS;
  _lastAutor    = msg.autor;
  _lastTime     = ts;

  const color   = msg.isOwn ? '#1264A3' : colorDeAutor(msg.autor);
  const horaStr = formatHour(msg.createdAt);

  const textoHTML = msg.isDeleted ? `<em style="color:#999;">Mensaje eliminado</em>` : (msg.texto ? parseMarkdown(escapeHtml(msg.texto)) : '');

  let archivoHTML = '';
  if (msg.archivo && msg.archivo.url) {
    const url = msg.archivo.url;
    const nombre = msg.archivo.nombre || 'Archivo';
    const mimetype = msg.archivo.mimetype || '';
    const tamanoStr = formatBytes(msg.archivo.tamano);

    if (mimetype.startsWith('image/')) {
      archivoHTML = `
        <div class="msg-attachment msg-attachment-image">
          <a href="${url}" target="_blank" rel="noopener noreferrer" title="Ver imagen completa: ${escapeHtml(nombre)}">
            <img src="${url}" alt="${escapeHtml(nombre)}" class="msg-image-preview" loading="lazy" />
          </a>
        </div>
      `;
    } else if (mimetype.startsWith('video/')) {
      archivoHTML = `
        <div class="msg-attachment msg-attachment-video">
          <video src="${url}" controls class="msg-video-preview" style="max-width: 360px; max-height: 240px; border-radius: 8px; margin-top: 6px;"></video>
        </div>
      `;
    } else if (mimetype.startsWith('audio/')) {
      archivoHTML = `
        <div class="msg-attachment msg-attachment-audio" style="margin-top: 6px;">
          <audio src="${url}" controls style="max-width: 300px; display: block;"></audio>
          <div style="font-size: 11px; color: var(--text-light); margin-top: 3px;">${escapeHtml(nombre)} (${tamanoStr})</div>
        </div>
      `;
    } else {
      let icon = '📄';
      if (mimetype.includes('pdf')) icon = '📕';
      else if (mimetype.includes('zip') || mimetype.includes('tar') || mimetype.includes('rar') || mimetype.includes('compressed')) icon = '📦';
      else if (mimetype.includes('word') || mimetype.includes('officedocument.word')) icon = '📝';
      else if (mimetype.includes('sheet') || mimetype.includes('excel')) icon = '📊';
      else if (mimetype.includes('text') || mimetype.includes('javascript') || mimetype.includes('json')) icon = '📜';

      archivoHTML = `
        <div class="msg-attachment msg-attachment-file">
          <a href="${url}" download="${escapeHtml(nombre)}" class="file-attachment-card" target="_blank" rel="noopener noreferrer">
            <span class="file-icon">${icon}</span>
            <div class="file-info">
              <span class="file-name" title="${escapeHtml(nombre)}">${escapeHtml(nombre)}</span>
              <span class="file-size">${tamanoStr}</span>
            </div>
            <span class="file-download-btn" title="Descargar">⬇️</span>
          </a>
        </div>
      `;
    }
  }

  let reactionsHTML = '';
  if (msg.reactions && msg.reactions.length > 0) {
    reactionsHTML = '<div class="msg-reactions">';
    msg.reactions.forEach(r => {
      reactionsHTML += `<button class="msg-reaction-btn" data-emoji="${r.emoji}" title="${r.users.join(', ')}">${r.emoji} <span class="reaction-count">${r.users.length}</span></button>`;
    });
    reactionsHTML += '</div>';
  }

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
      ${textoHTML ? `<div class="msg-text">${textoHTML}</div>` : ''}
      ${archivoHTML}
      ${reactionsHTML}
    </div>
    <div class="msg-actions">
      <button class="msg-action-btn btn-react" data-id="${msg.id}" title="Reaccionar">😀</button>
      <button class="msg-action-btn btn-reply" data-autor="${escapeHtml(msg.autor)}" title="Responder">💬</button>
      ${msg.isOwn && !msg.isDeleted ? `<button class="msg-action-btn btn-delete" data-id="${msg.id}" title="Eliminar">🗑️</button>` : ''}
    </div>
  `;

  feedEl.appendChild(wrapper);
  if (animado) feedEl.scrollTop = feedEl.scrollHeight;
}

/* ════════════════════════════════════════════════════════════════
   ACTUALIZAR MENSAJE (Reacciones, Eliminado)
   ════════════════════════════════════════════════════════════════ */
function actualizarMensaje(msg) {
  const el = document.getElementById(`msg-${msg._id}`);
  if (!el) return;

  const textEl = el.querySelector('.msg-text');
  if (textEl) {
    textEl.innerHTML = msg.isDeleted ? `<em style="color:#999;">Mensaje eliminado</em>` : parseMarkdown(escapeHtml(msg.texto));
  }

  // Update reactions
  let reactionsContainer = el.querySelector('.msg-reactions');
  if (msg.reactions && msg.reactions.length > 0) {
    if (!reactionsContainer) {
      reactionsContainer = document.createElement('div');
      reactionsContainer.className = 'msg-reactions';
      textEl.parentNode.appendChild(reactionsContainer);
    }
    let html = '';
    msg.reactions.forEach(r => {
      html += `<button class="msg-reaction-btn" data-emoji="${r.emoji}" title="${r.users.join(', ')}">${r.emoji} <span class="reaction-count">${r.users.length}</span></button>`;
    });
    reactionsContainer.innerHTML = html;
  } else if (reactionsContainer) {
    reactionsContainer.remove();
  }

  // Remove delete button if deleted
  if (msg.isDeleted) {
    const delBtn = el.querySelector('.btn-delete');
    if (delBtn) delBtn.remove();
  }
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
      <span class="unread-badge" id="badge-user-${escapeHtml(u)}" style="display:none">0</span>
    `;
    listEl.appendChild(li);
  });
}

/* ════════════════════════════════════════════════════════════════
   RENDERIZADO DINÁMICO DE CONVERSACIONES DM
   ════════════════════════════════════════════════════════════════ */
function renderizarConversacionesDM(dms, myName) {
  const listEl = document.getElementById('dmList');
  if (!listEl) return;
  listEl.innerHTML = '';

  dms.forEach(dm => {
    const otherUser = dm.users.find(u => u !== myName);
    if (!otherUser) return;

    const isOnline = _onlineUsers.has(otherUser);
    const color = colorDeAutor(otherUser);
    const li = document.createElement('li');
    li.className = 'dm-item';
    li.style.cursor = 'pointer';
    
    const isCurrentlyActive = currentChannelType === 'dm' && currentChannelId === dm._id;
    if (isCurrentlyActive) {
      li.classList.add('active');
    }

    li.onclick = () => { if (typeof iniciarDM === 'function') iniciarDM(otherUser); };
    li.innerHTML = `
      <span class="dm-avatar" style="background:${color}">${iniciales(otherUser)}</span>
      <span class="dm-name">${escapeHtml(otherUser)}</span>
      <span class="presence ${isOnline ? 'online' : 'offline'}"></span>
      <span class="unread-badge" id="badge-${dm._id}" style="display:none">0</span>
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

  if (tipo === 'dm' && nombre) {
    const userBadge = document.getElementById(`badge-user-${nombre}`);
    if (userBadge) {
      userBadge.style.display = 'none';
      userBadge.textContent = '0';
    }
  }

  // Actualizar cabecera
  const prefix = tipo === 'dm' ? '@' : '#';
  document.getElementById('chatChannelName').textContent = nombre;
  document.getElementById('chatChannelIcon').textContent = prefix;
  document.getElementById('chatInput').placeholder       = `Mensaje en ${prefix}${nombre}`;
  document.getElementById('chatTopic').textContent       = descripcion;
  const btnMembers = document.getElementById('btnChannelMembers');
  if (btnMembers) btnMembers.style.display = tipo === 'dm' ? 'none' : 'inline-flex';

  // Actualizar Welcome Banner
  const wHeading = document.getElementById('welcomeHeading');
  const wIcon  = document.getElementById('welcomeIcon');
  const wDesc  = document.getElementById('welcomeDesc');
  
  if (wIcon)  wIcon.textContent  = prefix;
  if (wHeading) {
    if (tipo === 'dm') {
      wHeading.innerHTML = `Chat directo con <strong>${escapeHtml(nombre)}</strong>`;
    } else {
      wHeading.innerHTML = `Bienvenido a <strong>${prefix}${escapeHtml(nombre)}</strong>`;
    }
  }
  if (wDesc) {
    if (tipo === 'dm') {
      wDesc.innerHTML = `Este es el comienzo de tus mensajes directos con <strong>${escapeHtml(nombre)}</strong>.`;
    } else {
      wDesc.innerHTML = `Este es el punto de inicio del canal <strong>${prefix}${escapeHtml(nombre)}</strong>. ${escapeHtml(descripcion)}`;
    }
  }

  // Limpiar feed
  feedEl.querySelectorAll('.slack-message, .system-message, .day-divider').forEach(n => n.remove());
  _lastAutor = null;
  _lastDateStr = null;

  // Notificar a app.js que cambió el canal (vía evento custom)
  document.dispatchEvent(new CustomEvent('canal_cambiado', { detail: { channelId: id } }));

  // Cargar historial — offline-first
  try {
    // 1. Mostrar mensajes cacheados de IndexedDB de forma inmediata
    if (window.OfflineDB) {
      const cached = await OfflineDB.getMessages(id);
      if (cached.length > 0) {
        window.ChatModule.cargarHistorial(cached);
      }
    }

    // 2. Si hay red, refrescar desde servidor y re-guardar en local
    if (!window.SyncManager || SyncManager.isOnline()) {
      const r = await fetch(`/api/messages?channelId=${id}`);
      const d = await r.json();
      if (d.ok) {
        // Limpiar feed y re-renderizar con datos frescos
        feedEl.querySelectorAll('.slack-message, .system-message, .day-divider').forEach(n => n.remove());
        _lastAutor = null;
        _lastDateStr = null;
        window.ChatModule.cargarHistorial(d.data);
        // Persistir en IndexedDB para la próxima visita offline
        if (window.OfflineDB) {
          OfflineDB.saveMessages(id, d.data).catch(e =>
            console.warn('[Chat] Error guardando mensajes en local:', e)
          );
        }
      }
    }
  } catch (e) {
    console.error('[Chat] Error cargando historial:', e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   NO-LEÍDOS (badge)
   ════════════════════════════════════════════════════════════════ */
function incrementarNoLeido(channelId, autor, isDM) {
  if (channelId === currentChannelId) return; // ya está visible
  _unreadCounts[channelId] = (_unreadCounts[channelId] || 0) + 1;
  const badge = document.getElementById(`badge-${channelId}`);
  if (badge) {
    badge.textContent    = _unreadCounts[channelId] > 9 ? '9+' : _unreadCounts[channelId];
    badge.style.display  = 'inline-flex';
  } else if (isDM && autor) {
    const userBadge = document.getElementById(`badge-user-${autor}`);
    if (userBadge) {
      userBadge.textContent = _unreadCounts[channelId] > 9 ? '9+' : _unreadCounts[channelId];
      userBadge.style.display = 'inline-flex';
    }
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

document.querySelectorAll('.add-section-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Evitar que colapse la lista
    document.getElementById('newChannelModal').style.display = 'flex';
    setTimeout(() => document.getElementById('newChannelInput')?.focus(), 100);
  });
});

document.getElementById('newChannelClose')?.addEventListener('click', () => {
  document.getElementById('newChannelModal').style.display = 'none';
});

document.getElementById('newChannelSubmit')?.addEventListener('click', async () => {
  const name = document.getElementById('newChannelInput')?.value.trim();
  const desc = document.getElementById('newChannelDesc')?.value.trim();
  if (!name) return;

  try {
    const myName = localStorage.getItem('slacia_name') || localStorage.getItem('slacia_user') || 'Usuario';
    const r = await fetch('/api/channels', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, description: desc, owner: myName }),
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
  renderizarConversacionesDM,
  incrementarNoLeido,
  setOnlineUsers(nombres = []) {
    _onlineUsers = new Set(nombres);
  },

  getCurrentChannelId:   () => currentChannelId,
  getCurrentChannelType: () => currentChannelType,

  seleccionarCanal,

  cargarHistorial(mensajes = []) {
    const myName = localStorage.getItem('slacia_name');
    mensajes.forEach(m => renderizarMensaje({
      id:        m._id || m.id,
      autor:     m.autor || 'Anónimo',
      texto:     m.texto,
      archivo:   m.archivo,
      createdAt: m.createdAt,
      isOwn:     m.autor === myName,
      isDeleted: m.isDeleted,
      reactions: m.reactions,
    }, false));
    feedEl.scrollTop = feedEl.scrollHeight;
  },

  /** Persistir un mensaje recibido por socket en IndexedDB */
  persistirMensaje(msg) {
    if (!window.OfflineDB || !currentChannelId) return;
    const id = (msg._id || msg.id || '').toString();
    if (!id) return;
    OfflineDB.upsertMessage(
      { ...msg, _id: id },
      currentChannelId
    ).catch(e => console.warn('[Chat] Error persistiendo mensaje en local:', e));
  },
  actualizarMensaje,
};

// ════════════════════════════════════════════════════════════════
//  GESTIÓN DE MIEMBROS DE CANAL (Ver, Añadir, Expulsar)
// ════════════════════════════════════════════════════════════════

async function abrirModalMiembros() {
  if (typeof ChatModule === 'undefined') return;
  if (ChatModule.getCurrentChannelType() === 'dm') return;

  const channelId = ChatModule.getCurrentChannelId();
  if (!channelId) return;

  const myName = localStorage.getItem('slacia_name') || localStorage.getItem('slacia_user') || 'Usuario';
  const modal = document.getElementById('membersModal');
  const list = document.getElementById('membersList');
  const addSection = document.getElementById('addMemberSection');
  const feedback = document.getElementById('addMemberFeedback');

  if (feedback) feedback.style.display = 'none';
  if (list) list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 12px 0;">Cargando miembros...</p>';
  if (modal) modal.style.display = 'flex';

  try {
    const res = await fetch(`/api/channels/${channelId}/members`);
    const data = await res.json();
    if (!data.ok) {
      if (list) list.innerHTML = '<p style="color: #E01E5A; font-size: 13px; text-align: center;">Error al cargar miembros.</p>';
      return;
    }

    // Es dueño si es el owner registrado, o si el owner es 'Anónimo' / no tiene owner (canal público para gestionar)
    const isOwner = !data.owner || data.owner === 'Anónimo' || data.owner === myName;

    if (list) list.innerHTML = '';

    const users = (data.users && data.users.length > 0)
      ? data.users
      : (data.owner && data.owner !== 'Anónimo' ? [data.owner] : []);

    if (users.length > 0 && list) {
      users.forEach(u => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-color); color: var(--text-main); font-size: 14px;';

        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const color = colorDeAutor(u);
        nameSpan.innerHTML = `
          <span style="width: 26px; height: 26px; border-radius: 4px; background: ${color}; color: white; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0;">${iniciales(u)}</span>
          <span style="font-weight: 500;">${escapeHtml(u)}</span>
        `;

        if (u === data.owner && data.owner !== 'Anónimo') {
          nameSpan.innerHTML += ' <span style="background: rgba(18,100,163,0.1); color: var(--slack-primary); font-size: 11px; padding: 1px 6px; border-radius: 3px; font-weight: 600;">Creador</span>';
        }
        div.appendChild(nameSpan);

        // Botón Expulsar: permitido si el usuario actual es owner y no se expulsa a sí mismo
        if (isOwner && u !== data.owner) {
          const btn = document.createElement('button');
          btn.textContent = 'Expulsar';
          btn.style.cssText = 'background: rgba(224,30,90,0.1); color: #E01E5A; border: 1px solid #E01E5A; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold; transition: background 0.2s;';
          btn.onmouseover = () => btn.style.background = 'rgba(224,30,90,0.2)';
          btn.onmouseout = () => btn.style.background = 'rgba(224,30,90,0.1)';
          btn.onclick = async () => {
            if (!confirm(`¿Deseas expulsar a "${u}" de este canal?`)) return;
            btn.disabled = true;
            try {
              const rmRes = await fetch(`/api/channels/${channelId}/members/${encodeURIComponent(u)}`, { method: 'DELETE' });
              const rmData = await rmRes.json();
              if (rmData.ok) {
                div.remove();
                abrirModalMiembros(); // Recargar lista actualizada
              } else {
                alert(rmData.error || 'Error al expulsar miembro');
                btn.disabled = false;
              }
            } catch (e) {
              alert('Error de conexión');
              btn.disabled = false;
            }
          };
          div.appendChild(btn);
        }
        list.appendChild(div);
      });
    } else if (list) {
      list.innerHTML = '<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 8px 0;">Este canal no tiene miembros asignados aún (accesible por todos).</p>';
    }

    // Sección de Añadir Miembro
    if (addSection) {
      if (isOwner) {
        addSection.style.display = 'block';
        const addBtn = document.getElementById('addMemberBtn');
        const input = document.getElementById('addMemberInput');
        if (input) input.value = '';

        const ejecutarAgregar = async () => {
          const username = input?.value.trim();
          if (!username) return;

          if (addBtn) addBtn.disabled = true;
          try {
            const r = await fetch(`/api/channels/${channelId}/members`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username })
            });
            const d = await r.json();
            if (r.ok && d.ok) {
              if (input) input.value = '';
              if (feedback) {
                feedback.textContent = `✅ "${username}" añadido exitosamente`;
                feedback.style.color = '#2bac76';
                feedback.style.display = 'block';
                setTimeout(() => { if (feedback) feedback.style.display = 'none'; }, 3000);
              }
              abrirModalMiembros(); // Recargar vista de miembros
            } else {
              alert(d.error || 'Error al añadir miembro');
            }
          } catch (e) {
            alert('Error de conexión al añadir miembro');
          } finally {
            if (addBtn) addBtn.disabled = false;
          }
        };

        if (addBtn) {
          const newBtn = addBtn.cloneNode(true);
          addBtn.parentNode.replaceChild(newBtn, addBtn);
          newBtn.addEventListener('click', ejecutarAgregar);
        }

        if (input) {
          input.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              ejecutarAgregar();
            }
          };
        }
      } else {
        addSection.style.display = 'none';
      }
    }

  } catch (err) {
    console.error(err);
    if (list) list.innerHTML = '<p style="color: #E01E5A; font-size: 13px; text-align: center;">No se pudo conectar al servidor.</p>';
  }
}

function cerrarModalMiembros() {
  const modal = document.getElementById('membersModal');
  if (modal) modal.style.display = 'none';
}

// Listeners de apertura y cierre del modal de miembros
document.getElementById('memberCount')?.addEventListener('click', abrirModalMiembros);
document.getElementById('btnChannelMembers')?.addEventListener('click', abrirModalMiembros);
document.getElementById('closeMembersModal')?.addEventListener('click', cerrarModalMiembros);
document.getElementById('closeMembersModalX')?.addEventListener('click', cerrarModalMiembros);
document.getElementById('membersModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'membersModal') cerrarModalMiembros();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModalMiembros();
});