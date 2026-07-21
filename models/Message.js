'use strict';

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    texto: {
      type: String,
      required: [true, 'El texto del mensaje es obligatorio.'],
      trim: true,
      maxlength: [2000, 'El mensaje no puede superar 2000 caracteres.'],
    },
    // Nombre de quien envió el mensaje
    autor: {
      type: String,
      trim: true,
      default: 'Anónimo',
    },
    // Socket ID del emisor (para deduplicación en cliente)
    socketId: {
      type: String,
      default: '',
    },
    // ID temporal generado por el cliente para deduplicar
    tmpId: {
      type: String,
      default: '',
    },
    tipo: {
      type: String,
      enum: ['usuario', 'bot'],
      default: 'usuario',
    },
    tieneEvento: {
      type: Boolean,
      default: false,
    },
    // ID del canal al que pertenece
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel',
      required: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    reactions: {
      type: [
        {
          emoji: String,
          users: [String]
        }
      ],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Message', MessageSchema);
