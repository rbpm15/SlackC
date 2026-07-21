'use strict';

require('dotenv').config();

const express      = require('express');
const http         = require('http');
const path         = require('path');
const cookieParser = require('cookie-parser');
const jwt          = require('jsonwebtoken');
const { Server }   = require('socket.io');

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Middleware ───────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Auth Middleware ──────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_slacia_key_2026';
const SYSTEM_PASSWORD = process.env.SYSTEM_PASSWORD || 'SlacIA2026';

function requireAuth(req, res, next) {
  const token = req.cookies.slacia_auth;
  if (!token) {
    return res.redirect('/login');
  }
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.clearCookie('slacia_auth');
    return res.redirect('/login');
  }
}

// ─── Rutas REST ───────────────────────────────────────────────
app.use('/api', requireAuth, apiRoutes);

// ─── Rutas de Autenticación ───────────────────────────────────
app.get('/login', (req, res) => {
  res.render('login', { error: null });
});

app.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === SYSTEM_PASSWORD) {
    const token = jwt.sign({ authenticated: true }, JWT_SECRET, { expiresIn: '7d' });
    res.cookie('slacia_auth', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.redirect('/');
  } else {
    res.render('login', { error: 'Contraseña incorrecta' });
  }
});

// ─── Ruta raíz → entrega el frontend ─────────────────────────
app.get('/', requireAuth, (req, res) => {
  res.render('index');
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
