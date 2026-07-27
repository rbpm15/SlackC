'use strict';

const mongoose = require('mongoose');

const ChannelSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },
        description: {
            type: String,
            default: '',
        },
        isDirectMessage: {
            type: Boolean,
            default: false,
        },
        owner: {
            type: String,
        },
        users: [{ type: String }], // Array de nombres de usuario para los DMs o para los miembros en canales públicos
    },
    { timestamps: true }
);

module.exports = mongoose.model('Channel', ChannelSchema);