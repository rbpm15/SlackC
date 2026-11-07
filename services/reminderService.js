'use strict';

/**
 * services/reminderService.js
 * Servicio en segundo plano para verificar periódicamente eventos que lleguen
 * a su fecha y hora programada y disparar notificaciones en tiempo real vía Socket.io.
 */

const Event = require('../models/Event');
const { obtenerFechaHoraInicio, crearFechaMexico } = require('./dateUtils');

let _intervalId = null;

/**
 * Inicia el cron / verificador de recordatorios.
 * @param {object} io - Instancia de Socket.io Server
 */
function iniciarServicioRecordatorios(io) {
  if (_intervalId) clearInterval(_intervalId);

  console.log('⏰ [Recordatorios] Servicio de notificaciones programadas iniciado.');

  async function verificar() {
    try {
      const ahora = new Date();
      // Ventana de hoy completo en horario de México
      const mxParts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Mexico_City',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      }).formatToParts(ahora);
      const map = {};
      mxParts.forEach(p => map[p.type] = p.value);
      const y = parseInt(map.year, 10);
      const m = parseInt(map.month, 10) - 1;
      const d = parseInt(map.day, 10);

      const hoyInicio = crearFechaMexico(y, m, d, 0, 0, 0);
      const hoyFin = crearFechaMexico(y, m, d, 23, 59, 59);

      // Limpiar automáticamente de la base de datos eventos de días que ya pasaron
      await Event.deleteMany({
        $or: [
          { fechaEvento: { $lt: hoyInicio } },
          { fechaExpiracion: { $lt: ahora } }
        ]
      });

      // Eventos programados para hoy que no hayan sido notificados
      const eventos = await Event.find({
        fechaEvento: { $gte: hoyInicio, $lte: hoyFin },
        notification_status: { $ne: 'sent' }
      });

      for (const ev of eventos) {
        const fechaHoraInicio = obtenerFechaHoraInicio(ev);
        if (!fechaHoraInicio) continue;

        const diffMs = ahora.getTime() - fechaHoraInicio.getTime();

        // Notificar si está en la ventana exacta (desde 1 minuto antes hasta 2 minutos después del inicio)
        if (diffMs >= -60 * 1000 && diffMs <= 120 * 1000) {
          ev.notification_status = 'sent';
          await ev.save();

          console.log(`⏰ [Recordatorio] 🔔 ¡Es hora del evento! "${ev.titulo}" (${ev.dia} a las ${ev.hora})`);

          // Emitir a todos los clientes conectados
          io.emit('recordatorio_evento', {
            id:          ev._id.toString(),
            _id:         ev._id.toString(),
            titulo:      ev.titulo,
            dia:         ev.dia,
            hora:        ev.hora,
            autor:       ev.autor || '',
            fuente:      ev.fuente || 'local',
            fechaEvento: ev.fechaEvento,
          });
        }
      }
    } catch (err) {
      console.error('[Recordatorios] Error en verificación:', err.message);
    }
  }

  // Ejecutar verificación inicial
  verificar();

  // Revisar cada 30 segundos
  _intervalId = setInterval(verificar, 30 * 1000);
}

module.exports = {
  iniciarServicioRecordatorios,
};

