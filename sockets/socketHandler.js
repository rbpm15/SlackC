'use strict';

const Message        = require('../models/Message');
const Event          = require('../models/Event');
const { detectarCitaIA } = require('../services/agendaAI');

// ──────────────────────────────────────────────────────────────
//  TRACKER DE USUARIOS ONLINE  { socketId → { nombre, channelId } }
// ──────────────────────────────────────────────────────────────
const usuariosOnline = new Map();

function contarEnCanal(channelId) {
  let count = 0;
  for (const u of usuariosOnline.values()) {
    if (u.channelId === channelId) count++;
  }
  return count;
}

// ──────────────────────────────────────────────────────────────
//  HANDLER PRINCIPAL
// ──────────────────────────────────────────────────────────────
function socketHandler(io) {

  io.on('connection', (socket) => {
    console.log(`[Socket] +1 (${socket.id}) | total: ${io.engine.clientsCount}`);

    // ── Unirse a un canal (sala Socket.io) ──────────────────────
    socket.on('unirse_canal', (data) => {
      const { channelId, autor } = data || {};
      if (!channelId) return;

      // Salir del canal anterior si existe
      const prev = usuariosOnline.get(socket.id);
      if (prev?.channelId) socket.leave(prev.channelId);

      socket.join(channelId);
      usuariosOnline.set(socket.id, { nombre: autor || 'Anónimo', channelId });

      // Notificar miembros del canal
      io.to(channelId).emit('canal_miembros', {
        channelId,
        count: contarEnCanal(channelId),
      });
    });

    // ── Typing indicator ─────────────────────────────────────────
    socket.on('escribiendo', (data) => {
      const { channelId, autor } = data || {};
      if (!channelId) return;

      socket.to(channelId).emit('escribiendo', {
        autor:     autor || 'Alguien',
        socketId:  socket.id,
        channelId,
      });
    });

    // ── Nuevo mensaje ────────────────────────────────────────────
    socket.on('nuevo_mensaje', async (payload) => {
      const texto     = (payload?.texto     || '').trim();
      const autor     = (payload?.autor     || 'Anónimo').trim().slice(0, 40);
      const tmpId     = (payload?.tmpId     || '').toString();
      const channelId = (payload?.channelId || '').toString();

      if (!texto || texto.length > 2000 || !channelId) {
        socket.emit('error_servidor', { error: 'Payload inválido.' });
        return;
      }

      try {
        // 1. Guardar mensaje
        const msgDoc = await Message.create({
          texto,
          autor,
          socketId:  socket.id,
          tmpId,
          channelId,
          tipo:       'usuario',
          tieneEvento: false,
        });

        // 2. Broadcast a todos en el canal (incluido emisor)
        io.to(channelId).emit('mensaje_recibido', {
          _id:        msgDoc._id.toString(),
          tmpId,
          socketId:   socket.id,
          autor,
          texto,
          channelId,
          tieneEvento: false,
          createdAt:  msgDoc.createdAt,
        });

        // 3. Notificar a usuarios en OTROS canales (badge de no leídos)
        socket.broadcast.emit('mensaje_no_leido', {
          channelId,
          autor,
        });

        // 4. Detectar cita con IA (async, no bloquea el broadcast)
        detectarCitaIA(texto).then(async (cita) => {
          if (!cita) return;

          const eventoDoc = await Event.create({
            titulo:        cita.titulo || texto.slice(0, 100),
            dia:           cita.dia,
            diaNum:        cita.diaNum,
            hora:          cita.hora,
            autor,
            channelId,
            fuente:        'ia',
            mensajeOrigen: msgDoc._id,
          });

          await Message.findByIdAndUpdate(msgDoc._id, { tieneEvento: true });

          // Notificar a TODOS (el evento de agenda se muestra sin importar en qué canal estén)
          io.emit('evento_detectado', {
            _id:       eventoDoc._id.toString(),
            titulo:    eventoDoc.titulo,
            dia:       eventoDoc.dia,
            diaNum:    eventoDoc.diaNum,
            hora:      eventoDoc.hora,
            autor,
            channelId,
            fuente:    'ia',
            createdAt: eventoDoc.createdAt,
          });

        }).catch(err => console.error('[Socket] Error IA cita:', err.message));

        // 5. Interacción directa con el Bot si el canal es slcbot
        if (channelId === 'slcbot' && autor !== 'SLC BOT') {
          const { chatConBot } = require('../services/agendaAI');
          
          // Emitimos que el bot está "escribiendo"
          io.to(channelId).emit('escribiendo', {
            autor: 'SLC BOT',
            socketId: 'bot',
            channelId
          });

          chatConBot(texto).then(async (respuesta) => {
            const botMsgDoc = await Message.create({
              texto: respuesta,
              autor: 'SLC BOT',
              socketId: 'bot',
              channelId,
              tipo: 'bot',
              tieneEvento: false,
            });

            io.to(channelId).emit('mensaje_recibido', {
              _id:        botMsgDoc._id.toString(),
              socketId:   'bot',
              autor:      'SLC BOT',
              texto:      respuesta,
              channelId,
              tieneEvento: false,
              createdAt:  botMsgDoc.createdAt,
            });
          }).catch(err => console.error('[Socket] Error ChatBot:', err.message));
        }

      } catch (err) {
        console.error('[Socket] Error mensaje:', err.message);
        socket.emit('error_servidor', { error: 'Error interno del servidor.' });
      }
    });

    // ── Notificación leída ───────────────────────────────────────
    socket.on('marcar_leido', ({ channelId }) => {
      // El cliente avisa que ya vio los mensajes de este canal
      // (en una implementación completa, persistiría en BD)
    });

    // ── Desconexión ──────────────────────────────────────────────
    socket.on('disconnect', () => {
      const info = usuariosOnline.get(socket.id);
      usuariosOnline.delete(socket.id);

      if (info?.channelId) {
        io.to(info.channelId).emit('canal_miembros', {
          channelId: info.channelId,
          count: contarEnCanal(info.channelId),
        });
      }

      console.log(`[Socket] -1 (${socket.id})`);
    });
  });
}

module.exports = { socketHandler };
