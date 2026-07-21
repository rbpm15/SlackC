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

function obtenerNombresOnline() {
  const nombres = new Set();
  for (const u of usuariosOnline.values()) {
    if (u.nombre && u.nombre !== 'Anónimo' && u.nombre !== 'SLC BOT') {
      nombres.add(u.nombre);
    }
  }
  return Array.from(nombres);
}

// ──────────────────────────────────────────────────────────────
//  HANDLER PRINCIPAL
// ──────────────────────────────────────────────────────────────
function socketHandler(io) {

  io.on('connection', (socket) => {
    console.log(`[Socket] +1 (${socket.id}) | total: ${io.engine.clientsCount}`);

    // ── Unirse a un canal (sala Socket.io) ──────────────────────
    socket.on('unirse_canal', async (data) => {
      const { channelId, autor } = data || {};
      if (!channelId) return;

      if (autor && autor !== 'Anónimo') {
        try {
          const User = require('../models/User');
          const user = await User.findOne({ username: autor });
          if (user && user.isDisabled) {
            socket.emit('error_servidor', { error: 'Tu cuenta ha sido deshabilitada por el administrador.' });
            socket.disconnect();
            return;
          }
        } catch (e) {
          console.error('[Socket] Error verificando usuario', e);
        }
      }

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

      // Broadcast list of online users
      io.emit('usuarios_online', obtenerNombresOnline());
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

          const foundTitle = cita.titulo || texto.slice(0, 100);
          const foundDia = cita.dia;
          let eventoDoc = await Event.findOne({ titulo: foundTitle, dia: foundDia });

          if (eventoDoc) {
            // Deduplicación: agregar autor si no existe
            const autores = eventoDoc.autor.split(',').map(a => a.trim()).filter(Boolean);
            if (!autores.includes(autor)) {
              autores.push(autor);
              eventoDoc.autor = autores.join(', ');
            }
            await eventoDoc.save();
          } else {
            // Calcular fechaEvento y fechaExpiracion
            let fechaEvento = null;
            let fechaExpiracion = null;
            const hoy = new Date();

            if (cita.diaNum) {
              // Fecha exacta: fin del día del evento
              fechaEvento = new Date(hoy.getFullYear(), hoy.getMonth(), cita.diaNum, 23, 59, 59);
              // Si la fecha ya pasó en este mes, podría ser el mes siguiente
              if (fechaEvento < hoy) {
                fechaEvento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, cita.diaNum, 23, 59, 59);
              }
            } else {
              // Fecha vaga ("la próxima semana", etc.) — expira en 7 días
              fechaExpiracion = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
            }

            eventoDoc = await Event.create({
              titulo:        foundTitle,
              dia:           foundDia,
              diaNum:        cita.diaNum,
              hora:          cita.hora,
              autor,
              channelId,
              fuente:        'ia',
              mensajeOrigen: msgDoc._id,
              fechaEvento,
              fechaExpiracion,
            });
          }

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

        // 5. Interacción directa con el Bot si el canal es slcbot o si lo mencionan en cualquier canal
        if ((channelId === 'slcbot' || texto.includes('@SLC BOT') || texto.toLowerCase().includes('@slc')) && autor !== 'SLC BOT') {
          const { chatConBot, resumirConversacion } = require('../services/agendaAI');
          
          // Emitimos que el bot está "escribiendo"
          io.to(channelId).emit('escribiendo', {
            autor: 'SLC BOT',
            socketId: 'bot',
            channelId
          });

          // Detectar si pide resumen
          const textoLower = texto.toLowerCase();
          const esResumen = /\b(resumen|resum[eé]|resumir|qu[eé]\s+se\s+habl[oó]|qu[eé]\s+pas[oó]|lo\s+importante|puntos\s+clave)\b/i.test(textoLower);

          let respuestaPromise;
          if (esResumen) {
            // Buscar mensajes del día en todos los canales (no solo slcbot)
            const inicioHoy = new Date();
            inicioHoy.setHours(0, 0, 0, 0);
            respuestaPromise = Message.find({
              createdAt: { $gte: inicioHoy },
              tipo: 'usuario',
            }).sort({ createdAt: 1 }).limit(200).lean()
              .then(msgs => resumirConversacion(msgs));
          } else {
            // Chat normal con contexto
            const recentMsgs = await Message.find({ channelId })
              .sort({ createdAt: -1 }).limit(20).lean();
            const contexto = {
              usuariosOnline: obtenerNombresOnline(),
              mensajesRecientes: recentMsgs.reverse().filter(m => m.autor !== 'SLC BOT'),
            };
            respuestaPromise = chatConBot(texto, contexto);
          }

          respuestaPromise.then(async (respuesta) => {
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

      // Broadcast list of online users
      io.emit('usuarios_online', obtenerNombresOnline());

      console.log(`[Socket] -1 (${socket.id})`);
    });
  });
}

module.exports = { socketHandler };
