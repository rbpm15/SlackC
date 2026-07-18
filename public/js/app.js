/**
 * app.js — Orquestador principal
 * Conecta Socket.io, gestiona identidad, DMs y notificaciones.
 */
'use strict';

/* ════════════════════════════════════════════════════════════════
   IDENTIDAD
════════════════════════════════════════════════════════════════ */
let myName     = sessionStorage.getItem('slackc_name') || '';
let mySocketId = null;

function resolverNombre() {
  if (myName) return true;
  showNameModal();
  return false;
}

function showNameModal() {
  document.getElementById('nameModal').style.display = 'flex';
  setTimeout(() => document.getElementById('nameInput')?.focus(), 100);
}
function ocultarNameModal() {
  document.getElementById('nameModal').style.display = 'none';
}

if (!myName) showNameModal();

document.getElementById('nameSubmitBtn').addEventListener('click', () => {
  const val = document.getElementById('nameInput').value.trim();
  if (!val) return;
  myName = val.slice(0, 30);
  sessionStorage.setItem('slackc_name', myName);
  ocultarNameModal();
  // Cargar DMs del usuario después de tener nombre
  cargarDMs();
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
    const r = await fetch(`/api/dm/list?user=${encodeURIComponent(myName)}`);
    const d = await r.json();
    if (d.ok) ChatModule.renderizarDMs(d.data, myName);
  } catch { /* silencioso */ }
}

// Click "+" en sección DMs → crear nuevo DM
document.querySelector('#toggleDMs .add-section-btn')?.addEventListener('click', (e) => {
  e.stopPropagation();
  const target = prompt('¿A quién quieres enviar un mensaje directo? (escribe su nombre)');
  if (!target || !target.trim()) return;
  iniciarDM(target.trim());
});

async function iniciarDM(otroUsuario) {
  if (!myName) { showNameModal(); return; }
  try {
    const r = await fetch(`/api/dm?userA=${encodeURIComponent(myName)}&userB=${encodeURIComponent(otroUsuario)}`);
    const d = await r.json();
    if (!d.ok) { alert(d.error); return; }
    // Agregar a la lista si no existe
    const dm = d.data;
    if (!document.querySelector(`[data-channel-id="${dm._id}"]`)) {
      await cargarDMs();
    }
    ChatModule.seleccionarCanal(dm._id, otroUsuario, `Mensajes directos con ${otroUsuario}`, 'dm');
  } catch (e) {
    alert('Error iniciando DM: ' + e.message);
  }
}

/* ════════════════════════════════════════════════════════════════
   CARGA INICIAL
════════════════════════════════════════════════════════════════ */
async function cargarInicial() {
  try {
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

document.getElementById('toggleDMs').addEventListener('click', () => {
  const list  = document.getElementById('dmList');
  const arrow = document.querySelector('#toggleDMs .section-arrow');
  const open  = list.style.display !== 'none';
  list.style.display = open ? 'none' : '';
  arrow.classList.toggle('closed', open);
});