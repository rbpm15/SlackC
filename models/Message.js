'use strict';

const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    texto: {
      type: String,
      trim: true,
      default: '',
      maxlength: [2000, 'El mensaje no puede superar 2000 caracteres.'],
    },
    archivo: {
      url:      { type: String, default: null },
      nombre:   { type: String, default: null },
      mimetype: { type: String, default: null },
      tamano:   { type: Number, default: 0 },
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
