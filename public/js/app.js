/**
 * app.js — Orquestador principal
 * Conecta Socket.io, gestiona identidad, DMs y notificaciones.
 */
'use strict';

/* ════════════════════════════════════════════════════════════════
   TEMA VISUAL (Dark/Light)
════════════════════════════════════════════════════════════════ */
let currentTheme = localStorage.getItem('slackc_theme') || 'light';

function applyTheme(theme) {
  document.body.classList.remove('theme-light', 'theme-dark');
  document.body.classList.add(`theme-${theme}`);
  localStorage.setItem('slackc_theme', theme);
  const themeDarkSwitch = document.getElementById('themeDarkSwitch');
  if (themeDarkSwitch) {
    themeDarkSwitch.checked = (theme === 'dark');
  }
}

applyTheme(currentTheme);

/* ════════════════════════════════════════════════════════════════
   IDENTIDAD y PERFIL
════════════════════════════════════════════════════════════════ */
let myName     = localStorage.getItem('slackc_name') || '';
let mySocketId = null;

function resolverNombre() {
  if (myName) {
    updateProfileUI();
    return true;
  }
  showNameModal();
  return false;
}

function updateProfileUI() {
  const initial = myName ? myName.charAt(0).toUpperCase() : 'U';
  const pi = document.getElementById('profileInitials');
  const da = document.getElementById('dropdownAvatar');
  const dn = document.getElementById('dropdownName');
  const pnd = document.getElementById('profileNameDisplay');
  if (pi) pi.textContent = initial;
  if (da) da.textContent = initial;
  if (dn) dn.textContent = myName || 'Usuario';
  if (pnd) pnd.textContent = myName || 'Usuario';
}

function showNameModal() {
  document.getElementById('nameModal').style.display = 'flex';
  setTimeout(() => document.getElementById('nameInput')?.focus(), 100);
}
function ocultarNameModal() {
  document.getElementById('nameModal').style.display = 'none';
}

if (!myName) {
  showNameModal();
} else {
  updateProfileUI();
}

// Dropdown Toggle
const btnProfile = document.getElementById('btnProfile');
const profileDropdown = document.getElementById('profileDropdown');

if (btnProfile && profileDropdown) {
  btnProfile.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = profileDropdown.style.display === 'flex';
    profileDropdown.style.display = isVisible ? 'none' : 'flex';
  });

  document.addEventListener('click', (e) => {
    if (!profileDropdown.contains(e.target) && e.target !== btnProfile) {
      profileDropdown.style.display = 'none';
    }
  });
}

// Dark switch inside dropdown
const themeDarkSwitch = document.getElementById('themeDarkSwitch');
if (themeDarkSwitch) {
  themeDarkSwitch.checked = (currentTheme === 'dark');
  themeDarkSwitch.addEventListener('change', (e) => {
    currentTheme = e.target.checked ? 'dark' : 'light';
    applyTheme(currentTheme);
  });
}

// Edit name inside dropdown
const btnChangeUser = document.getElementById('btnChangeUser');
if (btnChangeUser) {
  btnChangeUser.addEventListener('click', () => {
    if (profileDropdown) profileDropdown.style.display = 'none';
    showNameModal();
  });
}

document.getElementById('nameSubmitBtn').addEventListener('click', async () => {
  const val = document.getElementById('nameInput').value.trim();
  if (!val) return;
  const oldName = myName;
  
  try {
    const res = await fetch('/api/users/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: val.slice(0, 30), oldUsername: oldName })
    });
    const d = await res.json();
    
    if (!d.ok) {
      alert('No se pudo registrar: ' + d.error);
      return; // Do not hide modal or save to localStorage
    }
    
    myName = val.slice(0, 30);
    localStorage.setItem('slackc_name', myName);
    ocultarNameModal();
    updateProfileUI();
    cargarDMs();
    
    // Re-unirse al socket si cambió de nombre
    const chId = window.ChatModule?.getCurrentChannelId();
    if (chId && socket) socket.emit('unirse_canal', { channelId: chId, autor: myName });
    
  } catch (e) {
    console.error('Error al registrar usuario:', e);
    alert('Ocurrió un error al intentar conectarse al servidor.');
  }
});

document.getElementById('nameInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('nameSubmitBtn').click();
});

/* ════════════════════════════════════════════════════════════════
   SOCKET.IO
════════════════════════════════════════════════════════════════ */
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  mySocketId = socket.id;
  actualizarEstadoConexion(true);

  // Re-unirse al canal actual si era una reconexión
  const chId = ChatModule.getCurrentChannelId();
  if (chId && myName) {
    socket.emit('unirse_canal', { channelId: chId, autor: myName });
  }
});

socket.on('disconnect', () => actualizarEstadoConexion(false));

function actualizarEstadoConexion(online) {
  const el = document.getElementById('connectionStatus');
  if (!el) return;
  el.innerHTML = online
    ? `<span class="conn-dot online"></span>En línea`
    : `<span class="conn-dot offline"></span>Desconectado`;
}

/* ════════════════════════════════════════════════════════════════
   INPUT
════════════════════════════════════════════════════════════════ */
const chatInputEl = document.getElementById('chatInput');
const sendBtnEl   = document.getElementById('sendBtn');
const _pendingIds = new Set();

chatInputEl.addEventListener('input', () => {
  sendBtnEl.disabled = chatInputEl.value.trim().length === 0;
  chatInputEl.style.height = 'auto';
  chatInputEl.style.height = Math.min(chatInputEl.scrollHeight, 160) + 'px';

  const chId = ChatModule.getCurrentChannelId();
  if (myName && chId) socket.emit('escribiendo', { autor: myName, channelId: chId });
});

chatInputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviarMensaje(); }
});
sendBtnEl.addEventListener('click', enviarMensaje);

// Toolbar formatting
function applyFormatting(prefix, suffix) {
  const start = chatInputEl.selectionStart;
  const end = chatInputEl.selectionEnd;
  const text = chatInputEl.value;
  const before = text.substring(0, start);
  const selected = text.substring(start, end);
  const after = text.substring(end);
  
  chatInputEl.value = before + prefix + selected + suffix + after;
  chatInputEl.selectionStart = start + prefix.length;
  chatInputEl.selectionEnd = end + prefix.length;
  chatInputEl.focus();
  sendBtnEl.disabled = chatInputEl.value.trim().length === 0;
}

document.getElementById('btnFormatBold')?.addEventListener('click', () => applyFormatting('*', '*'));
document.getElementById('btnFormatItalic')?.addEventListener('click', () => applyFormatting('_', '_'));
document.getElementById('btnFormatCode')?.addEventListener('click', () => applyFormatting('\`\`\`\n', '\n\`\`\`'));
// Toggle Emoji Picker
const btnEmoji = document.getElementById('btnEmoji');
const emojiPicker = document.getElementById('emojiPicker');

btnEmoji?.addEventListener('click', (e) => {
  e.stopPropagation();
  if (emojiPicker) {
    const isHidden = emojiPicker.style.display === 'none' || !emojiPicker.style.display;
    emojiPicker.style.display = isHidden ? 'grid' : 'none';
  }
});

// Click emoji button
emojiPicker?.addEventListener('click', (e) => {
  const btn = e.target.closest('.emoji-picker-btn');
  if (btn) {
    const emoji = btn.getAttribute('data-emoji');
    if (emoji) {
      applyFormatting(emoji, '');
      emojiPicker.style.display = 'none';
    }
  }
});

// Close when clicking outside
document.addEventListener('click', (e) => {
  if (emojiPicker && !emojiPicker.contains(e.target) && e.target !== btnEmoji) {
    emojiPicker.style.display = 'none';
  }
});

/* ════════════════════════════════════════════════════════════════
   ENVIAR MENSAJE
════════════════════════════════════════════════════════════════ */
function enviarMensaje() {
  if (!resolverNombre()) return;

  const texto     = chatInputEl.value.trim();
  const channelId = ChatModule.getCurrentChannelId();

  if (!texto || !channelId) return;

  const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
  _pendingIds.add(tmpId);

  socket.emit('nuevo_mensaje', { texto, autor: myName, tmpId, channelId });

  chatInputEl.value        = '';
  chatInputEl.style.height = 'auto';
  sendBtnEl.disabled       = true;
}

/* ════════════════════════════════════════════════════════════════
   SOCKET EVENTS
════════════════════════════════════════════════════════════════ */

// Mensaje de chat
socket.on('mensaje_recibido', (msg) => {
  const isOwn = msg.socketId === mySocketId;
  if (msg.tmpId) _pendingIds.delete(msg.tmpId);

  // Solo renderizar si el canal coincide con el canal visible
  if (msg.channelId !== ChatModule.getCurrentChannelId()) {
    // Canal diferente → solo incrementar badge
    ChatModule.incrementarNoLeido(msg.channelId);
    return;
  }

  ChatModule.ocultarTyping();
  ChatModule.renderizarMensaje({
    id:        msg._id,
    tmpId:     msg.tmpId,
    autor:     msg.autor || 'Anónimo',
    texto:     msg.texto,
    createdAt: msg.createdAt || new Date().toISOString(),
    isOwn,
  }, true);
});

// Notificación de no-leído (emitida por broadcast para otros canales)
socket.on('mensaje_no_leido', (data) => {
  if (data.channelId !== ChatModule.getCurrentChannelId()) {
    ChatModule.incrementarNoLeido(data.channelId);
  }
});

// Evento de agenda detectado
socket.on('evento_detectado', (ev) => {
  AgendaModule.recibirEventoSocket(ev);
  ChatModule.renderizarMensajeSistema(
    `📅 Agenda: ${ev.dia} a las ${ev.hora} — "${(ev.titulo || '').slice(0, 60)}"`
  );
});

// Typing indicator
socket.on('escribiendo', (data) => {
  if (data.socketId === mySocketId) return;
  if (data.channelId !== ChatModule.getCurrentChannelId()) return;
  ChatModule.mostrarTyping(data.autor);
});

// Miembros en canal
socket.on('canal_miembros', (data) => {
  const countEl = document.getElementById('memberCount');
  if (countEl && data.channelId === ChatModule.getCurrentChannelId()) {
    countEl.textContent = `${data.count} en línea`;
  }
});

// Errores
socket.on('error_servidor', (data) => console.error('[Socket]', data.error));


// Usuarios en línea
socket.on('usuarios_online', (nombres) => {
  ChatModule.setOnlineUsers(nombres);
  cargarDMs();
});

/* ════════════════════════════════════════════════════════════════
   CAMBIO DE CANAL → notificar al servidor (Socket.io rooms)
════════════════════════════════════════════════════════════════ */
document.addEventListener('canal_cambiado', (e) => {
  if (myName) {
    socket.emit('unirse_canal', { channelId: e.detail.channelId, autor: myName });
    socket.emit('marcar_leido',  { channelId: e.detail.channelId });
  }
});

/* ════════════════════════════════════════════════════════════════
   MENSAJES DIRECTOS
════════════════════════════════════════════════════════════════ */
async function cargarDMs() {
  if (!myName) return;
  try {
    const r2 = await fetch('/api/users');
    const d2 = await r2.json();
    if (d2.ok) ChatModule.renderizarUsuarios(d2.data, myName);
  } catch { /* silencioso */ }
}

async function iniciarDM(otroUsuario) {
  if (!myName) { showNameModal(); return; }
  try {
    const r = await fetch(`/api/dm?userA=${encodeURIComponent(myName)}&userB=${encodeURIComponent(otroUsuario)}`);
    const d = await r.json();
    if (!d.ok) { alert(d.error); return; }
    const dm = d.data;
    await cargarDMs();
    ChatModule.seleccionarCanal(dm._id, otroUsuario, `Mensaje directo con ${otroUsuario}`, 'dm');
  } catch (e) {
    alert('Error iniciando DM: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   CARGA INICIAL
════════════════════════════════════════════════════════════════ */
async function cargarInicial() {
  try {
    if (myName) {
      fetch('/api/users/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: myName })
      }).catch(e => console.error(e));
    }

    const [rChannels, rEvs] = await Promise.allSettled([
      fetch('/api/channels').then(r => r.json()),
      fetch('/api/events').then(r => r.json()),
    ]);

    if (rChannels.status === 'fulfilled' && rChannels.value.ok) {
      ChatModule.renderizarCanales(rChannels.value.data);
    }

    if (rEvs.status === 'fulfilled' && rEvs.value.ok) {
      AgendaModule.cargarDesdeServidor(rEvs.value.data);
    }

    // DMs solo si ya tenemos nombre
    if (myName) cargarDMs();

  } catch (e) {
    console.error('[App] Error carga inicial:', e.message);
  }
}

document.addEventListener('DOMContentLoaded', cargarInicial);

/* ════════════════════════════════════════════════════════════════
   SIDEBAR — collapsar secciones
════════════════════════════════════════════════════════════════ */
document.getElementById('toggleChannels').addEventListener('click', () => {
  const list  = document.getElementById('channelList');
  const arrow = document.querySelector('#toggleChannels .section-arrow');
  const open  = list.style.display !== 'none';
  list.style.display = open ? 'none' : '';
  arrow.classList.toggle('closed', open);
});

document.getElementById('toggleUsers')?.addEventListener('click', () => {
  const list  = document.getElementById('usersList');
  const arrow = document.querySelector('#toggleUsers .section-arrow');
  const open  = list.style.display !== 'none';
  list.style.display = open ? 'none' : '';
  arrow.classList.toggle('closed', open);
});

/* ════════════════════════════════════════════════════════════════
   MOBILE INTERACTION & TOGGLES (LIQUID LAYOUT)
   ════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const appShell = document.querySelector('.app-shell');
  const btnToggleSidebar = document.getElementById('btnToggleSidebar');
  const btnToggleRightPanel = document.getElementById('btnToggleRightPanel');
  const btnToggleChatbot = document.getElementById('btnToggleChatbot');
  const btnCloseAgenda = document.getElementById('btnCloseAgenda');
  const btnCloseChatbot = document.getElementById('btnCloseChatbot');
  const sidebarBackdrop = document.getElementById('sidebarBackdrop');

  function closeAllDrawers() {
    if (appShell) {
      appShell.classList.remove('sidebar-open', 'right-panel-open');
    }
  }

  if (btnToggleSidebar) {
    btnToggleSidebar.addEventListener('click', (e) => {
      e.stopPropagation();
      appShell.classList.remove('right-panel-open');
      appShell.classList.toggle('sidebar-open');
    });
  }

  if (btnToggleRightPanel) {
    btnToggleRightPanel.addEventListener('click', (e) => {
      e.stopPropagation();
      appShell.classList.remove('sidebar-open');
      appShell.classList.toggle('right-panel-open');
    });
  }

  if (btnToggleChatbot) {
    btnToggleChatbot.addEventListener('click', () => {
      if (window.innerWidth <= 992) {
        appShell.classList.remove('sidebar-open');
        appShell.classList.add('right-panel-open');
      }
    });
  }

  if (sidebarBackdrop) {
    sidebarBackdrop.addEventListener('click', closeAllDrawers);
  }

  if (btnCloseAgenda) {
    btnCloseAgenda.addEventListener('click', closeAllDrawers);
  }

  if (btnCloseChatbot) {
    btnCloseChatbot.addEventListener('click', closeAllDrawers);
  }

  // Auto-close sidebar on mobile when switching channels
  document.addEventListener('canal_cambiado', () => {
    if (appShell) {
      appShell.classList.remove('sidebar-open');
    }
  });
});