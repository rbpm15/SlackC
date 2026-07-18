'use strict';

const { Router }    = require('express');
const Channel       = require('../models/Channel');
const Message       = require('../models/Message');
const Event         = require('../models/Event');

const router = Router();

// ══════════════════════════════════════════════════════════════
//  CANALES
// ══════════════════════════════════════════════════════════════

// GET /api/channels — lista todos los canales (no DMs)
router.get('/channels', async (req, res) => {
  try {
    let canales = await Channel.find({ isDirectMessage: false })
      .sort({ createdAt: 1 }).lean();

    // Seed: crear canales por defecto si la BD está vacía
    if (canales.length === 0) {
      const defaults = [
        { name: 'general',    description: 'Canal de comunicación general del equipo' },
        { name: 'desarrollo', description: 'Código, PRs y automatizaciones' },
        { name: 'operaciones',description: 'Gestión de recursos y logística' },
      ];
      await Channel.insertMany(defaults);
      canales = await Channel.find({ isDirectMessage: false })
        .sort({ createdAt: 1 }).lean();
    }

    res.json({ ok: true, data: canales });
  } catch (err) {
    console.error('[API] GET /channels:', err.message);
    res.status(500).json({ ok: false, error: 'Error obteniendo canales.' });
  }
});

// POST /api/channels — crear nuevo canal
router.post('/channels', async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });

    const canal = await Channel.create({
      name: name.toLowerCase().replace(/\s+/g, '-').slice(0, 30),
      description: description || '',
    });

    res.json({ ok: true, data: canal });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ ok: false, error: 'Ya existe un canal con ese nombre.' });
    }
    console.error('[API] POST /channels:', err.message);
    res.status(500).json({ ok: false, error: 'Error creando canal.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  MENSAJES DIRECTOS
// ══════════════════════════════════════════════════════════════

// GET /api/dm — obtener o crear un canal DM entre dos usuarios
router.get('/dm', async (req, res) => {
  try {
    const { userA, userB } = req.query;
    if (!userA || !userB) {
      return res.status(400).json({ ok: false, error: 'Se requieren userA y userB.' });
    }

    // Buscar DM existente (el array users contiene exactamente ambos nombres)
    const sorted = [userA, userB].sort();
    let dm = await Channel.findOne({
      isDirectMessage: true,
      users: { $all: sorted, $size: 2 },
    });

    if (!dm) {
      dm = await Channel.create({
        name:            `dm_${sorted.join('_')}`.toLowerCase().replace(/\s+/g, ''),
        description:     `Mensajes directos entre ${userA} y ${userB}`,
        isDirectMessage: true,
        users:           sorted,
      });
    }

    res.json({ ok: true, data: dm });
  } catch (err) {
    console.error('[API] GET /dm:', err.message);
    res.status(500).json({ ok: false, error: 'Error obteniendo DM.' });
  }
});

// GET /api/dm/list?user=... — listar todos los DMs de un usuario
router.get('/dm/list', async (req, res) => {
  try {
    const { user } = req.query;
    if (!user) return res.status(400).json({ ok: false, error: 'Se requiere user.' });

    const dms = await Channel.find({
      isDirectMessage: true,
      users: user,
    }).lean();

    res.json({ ok: true, data: dms });
  } catch (err) {
    console.error('[API] GET /dm/list:', err.message);
    res.status(500).json({ ok: false, error: 'Error listando DMs.' });
  }
});

const User          = require('../models/User');

// POST /api/users/register — registrar u actualizar alias de usuario
router.post('/users/register', async (req, res) => {
  try {
    const { username, oldUsername } = req.body;
    if (!username) return res.status(400).json({ ok: false, error: 'username es requerido' });
    
    const newName = username.trim().slice(0, 30);
    const oldName = oldUsername ? oldUsername.trim().slice(0, 30) : null;

    if (newName && newName !== 'SLC BOT' && newName !== 'Usuario') {
      // Verificar si el usuario está deshabilitado
      const existingUser = await User.findOne({ username: newName });
      if (existingUser && existingUser.isDisabled) {
        return res.status(403).json({ ok: false, error: 'Cuenta deshabilitada por el administrador.' });
      }

      // Registrar el nuevo nombre y actualizar metadatos
      await User.findOneAndUpdate(
        { username: newName },
        { 
          username: newName,
          lastConnection: new Date(),
          device: req.headers['user-agent'] || 'Unknown'
        },
        { upsert: true, new: true }
      );

      // Si cambió de nombre, hacer actualización en cascada
      if (oldName && oldName !== newName && oldName !== 'Usuario' && oldName !== 'SLC BOT') {
        // Borrar el alias viejo de la colección de usuarios
        await User.deleteOne({ username: oldName });

        // Actualizar todos sus mensajes anteriores
        await Message.updateMany({ autor: oldName }, { autor: newName });

        // Actualizar todos sus eventos anteriores en la agenda
        await Event.updateMany({ autor: oldName }, { autor: newName });

        // Actualizar su nombre en los canales de Mensajes Directos (DMs)
        await Channel.updateMany(
          { users: oldName },
          { $set: { "users.$[elem]": newName } },
          { arrayFilters: [{ elem: oldName }] }
        );
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] POST /users/register:', err.message);
    res.status(500).json({ ok: false, error: 'Error registrando o actualizando usuario.' });
  }
});

// GET /api/users — listar todos los usuarios conocidos (autores de mensajes o miembros de canales)
router.get('/users', async (req, res) => {
  try {
    const dbUsers = await User.find().distinct('username');
    const mUsers = await Message.find().distinct('autor');
    const cUsers = await Channel.find().distinct('users');
    // Combinar y quitar duplicados
    const allUsers = [...new Set([...dbUsers, ...mUsers, ...cUsers])];
    // Filtrar falsy values o bots
    const filter = allUsers.filter(u => u && u !== 'SLC BOT' && u !== 'Usuario');
    res.json({ ok: true, data: filter });
  } catch (err) {
    console.error('[API] GET /users:', err.message);
    res.status(500).json({ ok: false, error: 'Error listando usuarios.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  MENSAJES
// ══════════════════════════════════════════════════════════════

// GET /api/messages?channelId=...
router.get('/messages', async (req, res) => {
  try {
    const { channelId } = req.query;
    if (!channelId) return res.json({ ok: true, data: [] });

    const mensajes = await Message.find({ channelId })
      .sort({ createdAt: 1 })
      .limit(100)
      .lean();

    res.json({ ok: true, data: mensajes });
  } catch (err) {
    console.error('[API] GET /messages:', err.message);
    res.status(500).json({ ok: false, error: 'Error obteniendo mensajes.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  BÚSQUEDA
// ══════════════════════════════════════════════════════════════

// GET /api/search?q=...
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (q.length < 2) return res.json({ ok: true, data: { mensajes: [], canales: [] } });

    const regex = new RegExp(q, 'i');

    const [mensajes, canales] = await Promise.all([
      Message.find({ texto: regex })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean(),
      Channel.find({ name: regex })
        .sort({ name: 1 })
        .limit(10)
        .lean(),
    ]);

    res.json({ ok: true, data: { mensajes, canales } });
  } catch (err) {
    console.error('[API] GET /search:', err.message);
    res.status(500).json({ ok: false, error: 'Error en la búsqueda.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  EVENTOS / AGENDA
// ══════════════════════════════════════════════════════════════

// GET /api/events
router.get('/events', async (req, res) => {
  try {
    const eventos = await Event.find()
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ ok: true, data: eventos });
  } catch (err) {
    console.error('[API] GET /events:', err.message);
    res.status(500).json({ ok: false, error: 'Error obteniendo eventos.' });
  }
});

// POST /api/events
router.post('/events', async (req, res) => {
  try {
    const { titulo, dia, diaNum, hora, autor, fuente, desc } = req.body;
    const evento = await Event.create({
      titulo: desc ? `${titulo} - ${desc}` : titulo,
      dia: dia,
      diaNum: diaNum,
      hora: hora,
      autor: autor || 'Usuario',
      fuente: fuente || 'local'
    });
    
    const io = req.app.get('io');
    if (io) {
      io.emit('evento_detectado', evento);
    }
    res.json({ ok: true, data: evento });
  } catch (err) {
    console.error('[API] POST /events:', err.message);
    res.status(500).json({ ok: false, error: 'Error creando evento.' });
  }
});

// DELETE /api/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    await Event.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /events/:id:', err.message);
    res.status(500).json({ ok: false, error: 'Error eliminando evento.' });
  }
});

// POST /api/bot/chat (Chatbot Panel direct interaction)
router.post('/bot/chat', async (req, res) => {
  try {
    const { texto } = req.body;
    if (!texto) return res.status(400).json({ ok: false, error: 'Texto requerido.' });
    
    const { chatConBot } = require('../services/agendaAI');
    const respuesta = await chatConBot(texto);
    
    res.json({ ok: true, respuesta });
  } catch (err) {
    console.error('[API] POST /bot/chat:', err.message);
    res.status(500).json({ ok: false, error: 'Error interno del bot.' });
  }
});

// ══════════════════════════════════════════════════════════════
//  ADMINISTRACIÓN
// ══════════════════════════════════════════════════════════════

// Admin Login
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'Sl@ckC_2026_Secure$Admin!99') {
    res.json({ ok: true, token: 'superadmin_token_123' });
  } else {
    res.status(401).json({ ok: false, error: 'Credenciales inválidas' });
  }
});

// Admin Get Users
router.get('/admin/users', async (req, res) => {
  if (req.headers['authorization'] !== 'Bearer superadmin_token_123') {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const users = await User.find().sort({ lastConnection: -1 }).lean();
    res.json({ ok: true, data: users });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Toggle Disable User
router.post('/admin/users/:username/toggle', async (req, res) => {
  if (req.headers['authorization'] !== 'Bearer superadmin_token_123') {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const user = await User.findOne({ username: req.params.username });
    if (!user) return res.status(404).json({ ok: false, error: 'Usuario no encontrado' });
    
    user.isDisabled = !user.isDisabled;
    await user.save();
    res.json({ ok: true, isDisabled: user.isDisabled });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
