'use strict';

const mongoose = require('mongoose');

/**
 * Esquema de Evento de Agenda.
 * Se crea automáticamente cuando el Regex detecta una cita en un mensaje.
 */
const EventSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'El título del evento es obligatorio.'],
      trim: true,
    },
    dia: {
      type: String,
      required: [true, 'El día del evento es obligatorio.'],
      trim: true,
    },
    diaNum: {
      type: Number,
      required: false,
    },
    hora: {
      type: String,
      required: [true, 'La hora del evento es obligatoria.'],
      trim: true,
    },
    // Fecha real del evento para filtrar expirados (fin del día)
    fechaEvento: {
      type: Date,
      default: null,
    },
    // Para eventos con fecha vaga, se pone una fecha de expiración
    fechaExpiracion: {
      type: Date,
      default: null,
    },
    // Referencia al mensaje que originó este evento (trazabilidad)
    mensajeOrigen: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
      default: null,
    },
    // Quién lo mencionó
    autor: { type: String, trim: true, default: '' },
    // Canal de origen
    channelId: { type: String, default: '' },
    // 'local' | 'n8n'
    fuente: { type: String, default: 'local' },

  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Event', EventSchema);
