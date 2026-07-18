'use strict';

const mongoose = require('mongoose');

/**
 * Conecta la aplicación a MongoDB usando la URI del entorno.
 * Llama a esta función UNA SOLA VEZ desde server.js al arrancar.
 */
async function conectarDB() {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error('❌ MONGODB_URI no está definida en las variables de entorno.');
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ MongoDB conectado correctamente.');
  } catch (error) {
    console.error('❌ Error al conectar MongoDB:', error.message);
    process.exit(1); // Detener el servidor si la BD falla
  }
}

module.exports = { conectarDB };
