'use strict';

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    lastConnection: {
      type: Date,
      default: Date.now
    },
    device: {
      type: String,
      default: 'Unknown'
    },
    isDisabled: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('User', UserSchema);
