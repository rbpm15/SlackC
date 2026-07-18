'use strict';

require('dotenv').config();

const express    = require('express');
const http       = require('http');
const path       = require('path');
const { Server } = require('socket.io');

const { conectarDB }    = require('./config/db');
const apiRoutes         = require('./routes/apiRoutes');
const { socketHandler } = require('./sockets/socketHandler');

// ─── Express ──────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// ─── Socket.io ────────────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*' },           // ajusta en producción
  transports: ['websocket', 'polling'],
});
app.set('io', io);

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rutas REST ───────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Ruta raíz → entrega el frontend ─────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Socket.io: delegar lógica al handler ────────────────────
socketHandler(io);

// ─── Arranque ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

(async () => {
  await conectarDB();          // primero BD, luego servidor
  server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  });
})();
