'use strict';

const Message        = require('../models/Message');
const Event          = require('../models/Event');
const { detectarCitaIA } = require('../services/agendaAI');
const { calcularFechaEvento } = require('../services/dateUtils');

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
        try {
          const ChannelObj = require('../models/Channel');
          let checkChannel = false;
          // Validar si el channelId es un ObjectId válido antes de buscar en Mongo
          if (/^[0-9a-fA-F]{24}$/.test(channelId)) {
            checkChannel = await ChannelObj.findById(channelId);
          }
          
          if (checkChannel && checkChannel.isDirectMessage) {
            // Es un DM. Notificar solo a los usuarios implicados
            for (const [sId, info] of usuariosOnline.entries()) {
              if (sId !== socket.id && checkChannel.users.includes(info.nombre)) {
                io.to(sId).emit('mensaje_no_leido', {
                  channelId,
                  autor,
                  isDirectMessage: true,
                  texto
                });
              }
            }
          } else {
            // Canal público. Broadcast a todos.
            socket.broadcast.emit('mensaje_no_leido', {
              channelId,
              autor,
              isDirectMessage: false,
              texto
            });
          }
        } catch (err) {
          console.error('[Socket] Error al procesar notificación de no leído', err);
        }

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
            let finalDiaNum = (cita.diaNum !== undefined && cita.diaNum !== null) ? Number(cita.diaNum) : null;
            let finalMes = (cita.mes !== undefined && cita.mes !== null) ? Number(cita.mes) : null;
            let finalAnio = (cita.anio !== undefined && cita.anio !== null) ? Number(cita.anio) : null;
            const hoy = new Date();
            const { parsearHoraInicio } = require('../services/dateUtils');
            const { horas, minutos } = parsearHoraInicio(cita.hora || '');

            if (cita.fechaISO) {
              const [y, m, d] = cita.fechaISO.split('-').map(Number);
              fechaEvento = new Date(y, m - 1, d, horas, minutos, 0);
              finalAnio = y;
              finalMes = m - 1;
              finalDiaNum = d;
            } else if (cita.dia) {
              const res = calcularFechaEvento(cita.dia, cita.hora, hoy, true);
              fechaEvento = res.fechaEvento;
              fechaExpiracion = res.fechaExpiracion;
              if (res.diaNum && !finalDiaNum) finalDiaNum = res.diaNum;
              if (res.mes !== null && res.mes !== undefined && finalMes === null) finalMes = res.mes;
              if (res.anio && !finalAnio) finalAnio = res.anio;
            }

            if (!fechaEvento && !fechaExpiracion) {
              if (finalDiaNum) {
                let m = finalMes !== null ? finalMes : hoy.getMonth();
                let a = finalAnio || hoy.getFullYear();
                fechaEvento = new Date(a, m, finalDiaNum, horas, minutos, 0);
                if (fechaEvento < hoy) {
                  fechaEvento = new Date(a, m + 1, finalDiaNum, horas, minutos, 0);
                  finalMes = m + 1;
                }
              } else {
                fechaExpiracion = new Date(hoy.getTime() + 7 * 24 * 60 * 60 * 1000);
              }
            }

            // Si la fecha ya pasó en el calendario (días anteriores a hoy), no registrarla
            const inicioHoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 0, 0, 0);
            if (fechaEvento && fechaEvento < inicioHoy) {
              console.log('[Socket] Cita ignorada por corresponder a una fecha pasada:', cita.titulo, cita.dia);
              return;
            }

            eventoDoc = await Event.create({
              titulo:        foundTitle,
              dia:           foundDia,
              diaNum:        finalDiaNum,
              mes:           finalMes,
              anio:          finalAnio,
              hora:          cita.hora,
              autor,
              channelId,
              fuente:        'ia',
              mensajeOrigen: msgDoc._id,
              fechaEvento,
              fechaExpiracion,
            });

            // Sincronizar con Google Calendar de fondo
            const { addEventToGoogleCalendar } = require('../services/googleCalendar');
            addEventToGoogleCalendar(eventoDoc).then(async (gRes) => {
              if (gRes && gRes.id) {
                await Event.findByIdAndUpdate(eventoDoc._id, { gcalEventId: gRes.id });
              }
            }).catch(e => console.error(e));
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

    // ── Eliminar mensaje (soft delete) ───────────────────────────
    socket.on('eliminar_mensaje', async (data) => {
      const { messageId, autor, channelId } = data || {};
      if (!messageId || !autor || !channelId) return;

      try {
        const msg = await Message.findById(messageId);
        if (msg && msg.autor === autor) {
          msg.isDeleted = true;
          msg.texto = 'Mensaje eliminado';
          await msg.save();

          io.to(channelId).emit('mensaje_actualizado', {
            _id: msg._id,
            texto: msg.texto,
            isDeleted: msg.isDeleted,
            reactions: msg.reactions,
          });
        }
      } catch (err) {
        console.error('[Socket] Error eliminando mensaje:', err.message);
      }
    });

    // ── Reaccionar a mensaje ─────────────────────────────────────
    socket.on('reaccionar_mensaje', async (data) => {
      const { messageId, emoji, autor, channelId } = data || {};
      if (!messageId || !emoji || !autor || !channelId) return;

      try {
        const msg = await Message.findById(messageId);
        if (msg) {
          // find if reaction exists
          let reaction = msg.reactions.find(r => r.emoji === emoji);
          if (reaction) {
            // toggle user
            if (reaction.users.includes(autor)) {
              reaction.users = reaction.users.filter(u => u !== autor);
            } else {
              reaction.users.push(autor);
            }
          } else {
            msg.reactions.push({ emoji, users: [autor] });
          }
          
          // filter out reactions with 0 users
          msg.reactions = msg.reactions.filter(r => r.users.length > 0);
          
          await msg.save();

          io.to(channelId).emit('mensaje_actualizado', {
            _id: msg._id,
            texto: msg.texto,
            isDeleted: msg.isDeleted,
            reactions: msg.reactions,
          });
        }
      } catch (err) {
        console.error('[Socket] Error reaccionando a mensaje:', err.message);
      }
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
