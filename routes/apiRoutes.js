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
    const { user } = req.query;
    let query = { isDirectMessage: false };
    if (user && user !== 'admin') {
      // Retornar si es miembro o si es canal abierto a todos (users vacío)
      query.$or = [
        { users: user },
        { users: { $exists: true, $size: 0 } },
        { users: { $exists: false } }
      ];
    }
    
    let canales = await Channel.find(query)
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
    const { name, description, owner } = req.body;
    if (!name) return res.status(400).json({ ok: false, error: 'El nombre es obligatorio.' });

    const canal = await Channel.create({
      name: name.toLowerCase().replace(/\s+/g, '-').slice(0, 30),
      description: description || '',
      owner: owner || null,
      users: owner ? [owner] : [],
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

// GET /api/channels/:id/members — lista los miembros de un canal
router.get('/channels/:id/members', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id).lean();
    if (!channel) return res.status(404).json({ ok: false, error: 'Canal no encontrado' });
    res.json({ ok: true, owner: channel.owner || null, users: channel.users || [] });
  } catch (err) {
    console.error('[API] GET /channels/members:', err.message);
    res.status(500).json({ ok: false, error: 'Error al obtener miembros.' });
  }
});

// POST /api/channels/:id/members — agregar miembro
router.post('/channels/:id/members', async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ ok: false, error: 'Falta username' });
    
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ ok: false });
    
    if (channel.owner) {
      if (!channel.users.includes(username)) {
        channel.users.push(username);
        await channel.save();
      }
    }
    res.json({ ok: true, data: channel });
  } catch (err) {
    res.status(500).json({ ok: false });
  }
});

// DELETE /api/channels/:id/members/:username — remover miembro
router.delete('/channels/:id/members/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ ok: false });
    
    if (channel.owner && channel.owner !== username) { // previene que el creador se elimine a sí mismo
      channel.users = channel.users.filter(u => u !== username);
      await channel.save();
    }
    res.json({ ok: true, data: channel });
  } catch (err) {
    res.status(500).json({ ok: false });
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

// GET /api/events (filtra eventos cuya fecha ya pasó)
router.get('/events', async (req, res) => {
  try {
    // ----------------------------------------------------
    // Soporte para consultas n8n (flujo de notificaciones)
    // ----------------------------------------------------
    if (req.query.date === 'today' || req.query.date_exact || req.query.notification_status) {
      let filter = {};
      
      if (req.query.notification_status) filter.notification_status = req.query.notification_status;
      if (req.query.event_type) filter.event_type = req.query.event_type;
      
      if (req.query.date === 'today') {
        const start = new Date(); start.setHours(0,0,0,0);
        const end = new Date(); end.setHours(23,59,59,999);
        filter.fechaEvento = { $gte: start, $lte: end };
      } else if (req.query.date_exact) {
        // Formato esperado: YYYY-MM-DD
        const start = new Date(req.query.date_exact); start.setHours(0,0,0,0);
        const end = new Date(req.query.date_exact); end.setHours(23,59,59,999);
        filter.fechaEvento = { $gte: start, $lte: end };
      }
      
      const evs = await Event.find(filter).lean();
      return res.json({ ok: true, data: evs });
    }
    // ----------------------------------------------------

    const ahora = new Date();

    // Eliminar eventos pasados
    await Event.deleteMany({
      $or: [
        { fechaEvento: { $lt: ahora } },
        { fechaExpiracion: { $lt: ahora } },
      ]
    });

    let eventos = await Event.find({
      $or: [
        // Eventos con fecha exacta que aún no han pasado
        { fechaEvento: { $gte: ahora } },
        // Eventos vagos con fecha de expiración que aún no ha pasado
        { fechaEvento: null, fechaExpiracion: { $gte: ahora } },
        // Eventos sin ninguna fecha (legacy / sin calcular) — mostrar siempre
        { fechaEvento: null, fechaExpiracion: null },
      ]
    })
      .sort({ fechaEvento: 1 })
      .limit(50)
      .lean();

    // Sincronizar lectura desde Google Calendar
    try {
      const { fetchGoogleCalendarEvents } = require('../services/googleCalendar');
      const gcalEvents = await fetchGoogleCalendarEvents();
      
      const knownGcalIds = new Set(eventos.map(e => e.gcalEventId).filter(Boolean));
      const knownKeys = new Set(eventos.map(e => `${(e.titulo || '').toLowerCase().trim()}_${e.diaNum || ''}`));

      const filteredGcalEvents = gcalEvents.filter(ge => {
        const realId = ge.id.replace('gcal-', '');
        if (knownGcalIds.has(realId)) return false;
        
        const key = `${(ge.titulo || '').toLowerCase().trim()}_${ge.diaNum || ''}`;
        if (knownKeys.has(key)) return false;

        return true;
      });

      // Combinar eventos evitando duplicados
      eventos = [...eventos, ...filteredGcalEvents];
      
      // Re-ordenar combinados
      eventos.sort((a, b) => {
        const da = a.fechaEvento ? new Date(a.fechaEvento).getTime() : 0;
        const db = b.fechaEvento ? new Date(b.fechaEvento).getTime() : 0;
        return da - db;
      });
      
    } catch (gcalErr) {
      console.error('[Google Calendar] Error integrando eventos en GET:', gcalErr.message);
    }
      
    res.json({ ok: true, data: eventos });
  } catch (err) {
    console.error('[API] GET /events:', err.message);
    res.status(500).json({ ok: false, error: 'Error obteniendo eventos.' });
  }
});

// POST /api/events
router.post('/events', async (req, res) => {
  try {
    const { 
      titulo, dia, diaNum, hora, autor, fuente, desc,
      event_type, contact_method, notification_status, client_email, client_phone, client_name, personalized_message
    } = req.body;
    const finalTitulo = desc ? `${titulo} - ${desc}` : titulo;
    
    let evento = await Event.findOne({ titulo: finalTitulo, dia: dia });

    if (evento) {
      // Deduplicación de autor
      const autores = evento.autor.split(',').map(a => a.trim()).filter(Boolean);
      const authAdd = autor || 'Usuario';
      if (!autores.includes(authAdd)) {
        autores.push(authAdd);
        evento.autor = autores.join(', ');
      }
      await evento.save();
    } else {
      // Calcular fechaEvento para eventos manuales
      let fechaEvento = null;
      if (diaNum) {
        const hoy = new Date();
        fechaEvento = new Date(hoy.getFullYear(), hoy.getMonth(), diaNum, 23, 59, 59);
        if (fechaEvento < hoy) {
          fechaEvento = new Date(hoy.getFullYear(), hoy.getMonth() + 1, diaNum, 23, 59, 59);
        }
      }
      evento = await Event.create({
        titulo: finalTitulo,
        dia: dia,
        diaNum: diaNum,
        hora: hora,
        autor: autor || 'Usuario',
        fuente: fuente || 'manual',
        fechaEvento,
        event_type: event_type || 'internal',
        contact_method: contact_method || 'none',
        notification_status: notification_status || 'none',
        client_email: client_email || '',
        client_phone: client_phone || '',
        client_name: client_name || '',
        personalized_message: personalized_message || ''
      });
      
      // Sincronizar con Google Calendar de fondo y guardar el ID para no duplicarlo al leer
      const { addEventToGoogleCalendar } = require('../services/googleCalendar');
      addEventToGoogleCalendar(evento).then(async (gRes) => {
        if (gRes && gRes.id) {
          await Event.findByIdAndUpdate(evento._id, { gcalEventId: gRes.id });
        }
      }).catch(e => console.error(e));
    }
    
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

// PATCH /api/events/:id
router.patch('/events/:id', async (req, res) => {
  try {
    const upds = req.body;
    const ev = await Event.findByIdAndUpdate(req.params.id, { $set: upds }, { new: true });
    if (!ev) return res.status(404).json({ ok: false, error: 'Evento no encontrado' });
    res.json({ ok: true, data: ev });
  } catch (err) {
    console.error('[API] PATCH /events/:id:', err.message);
    res.status(500).json({ ok: false, error: 'Error actualizando evento.' });
  }
});

// DELETE /api/events/:id
router.delete('/events/:id', async (req, res) => {
  try {
    const id = req.params.id;
    if (id.startsWith('gcal-')) {
      const realGcalId = id.replace('gcal-', '');
      // Borrar de Google Calendar directamente
      try {
        const { google } = require('googleapis');
        const fs = require('fs');
        const path = require('path');
        const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.json');
        
        let authClient = null;
        if (fs.existsSync(CREDENTIALS_PATH)) {
          authClient = new google.auth.GoogleAuth({
            keyFile: CREDENTIALS_PATH,
            scopes: ['https://www.googleapis.com/auth/calendar.events'],
          });
        } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
          authClient = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
            scopes: ['https://www.googleapis.com/auth/calendar.events'],
          });
        }
        
        if (authClient) {
          const calendar = google.calendar({ version: 'v3', auth: authClient });
          await calendar.events.delete({
            calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
            eventId: realGcalId
          });
          console.log('[Google Calendar] Evento eliminado:', realGcalId);
        }
      } catch (gcalErr) {
        console.error('[Google Calendar] Error eliminando evento:', gcalErr.message);
      }
      return res.json({ ok: true });
    }

    const ev = await Event.findById(id);
    if (ev) {
      if (ev.gcalEventId) {
        try {
          const { google } = require('googleapis');
          const fs = require('fs');
          const path = require('path');
          const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.json');
          
          let authClient = null;
          if (fs.existsSync(CREDENTIALS_PATH)) {
            authClient = new google.auth.GoogleAuth({
              keyFile: CREDENTIALS_PATH,
              scopes: ['https://www.googleapis.com/auth/calendar.events'],
            });
          } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
            authClient = new google.auth.GoogleAuth({
              credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
              scopes: ['https://www.googleapis.com/auth/calendar.events'],
            });
          }
          if (authClient) {
            const calendar = google.calendar({ version: 'v3', auth: authClient });
            await calendar.events.delete({
              calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
              eventId: ev.gcalEventId
            });
          }
        } catch (e) {
          console.error('[Google Calendar] Error borrando sincronizado:', e.message);
        }
      }
      await ev.deleteOne();
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[API] DELETE /events/:id:', err.message);
    res.status(500).json({ ok: false, error: 'Error eliminando evento.' });
  }
});

// POST /api/bot/chat (Chatbot Panel direct interaction)
router.post('/bot/chat', async (req, res) => {
  try {
    const { texto, channelId } = req.body;
    if (!texto) return res.status(400).json({ ok: false, error: 'Texto requerido.' });
    
    const { chatConBot, resumirConversacion } = require('../services/agendaAI');

    // Detectar si pide resumen
    const esResumen = /\b(resumen|resum[eé]|resumir|qu[eé]\s+se\s+habl[oó]|qu[eé]\s+pas[oó]|lo\s+importante|puntos\s+clave)\b/i.test(texto.toLowerCase());

    let respuesta;
    if (esResumen) {
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);
      const msgs = await Message.find({
        createdAt: { $gte: inicioHoy },
        tipo: 'usuario',
      }).sort({ createdAt: 1 }).limit(200).lean();
      respuesta = await resumirConversacion(msgs);
    } else {
      // Obtener contexto de mensajes recientes
      let mensajesRecientes = [];
      if (channelId) {
        mensajesRecientes = await Message.find({ channelId })
          .sort({ createdAt: -1 }).limit(15).lean();
        mensajesRecientes = mensajesRecientes.reverse().filter(m => m.autor !== 'SLC BOT');
      }
      respuesta = await chatConBot(texto, { mensajesRecientes });
    }
    
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

// Admin Get Messages
router.get('/admin/messages', async (req, res) => {
  if (req.headers['authorization'] !== 'Bearer superadmin_token_123') {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const search = req.query.search || '';
    let query = {};
    if (search) {
      query.texto = new RegExp(search, 'i');
    }
    
    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
      
    res.json({ ok: true, data: messages });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Admin Delete Message
router.delete('/admin/messages/:id', async (req, res) => {
  if (req.headers['authorization'] !== 'Bearer superadmin_token_123') {
    return res.status(403).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const msg = await Message.findByIdAndDelete(req.params.id);
    if (msg) {
      // Opcional: Emitir por socket para borrar en tiempo real del DOM a los clientes conectados si se necesita
      const io = req.app.get('io');
      if (io) {
        io.emit('mensaje_eliminado', { _id: req.params.id, channelId: msg.channelId });
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
