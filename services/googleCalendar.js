'use strict';

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const { parsearHoraInicio, parsearFechaEspanol } = require('./dateUtils');

const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.json');
let calendar = null;

function getCalendarClient() {
  if (calendar) return calendar;
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const authClient = new google.auth.GoogleAuth({
        keyFile: CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
      });
      calendar = google.calendar({ version: 'v3', auth: authClient });
      console.log('[Google Calendar] API Iniciada correctamente con credentials.json');
      return calendar;
    } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.GOOGLE_SERVICE_ACCOUNT_JSON.trim()) {
      const credentials = typeof process.env.GOOGLE_SERVICE_ACCOUNT_JSON === 'string'
        ? JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
        : process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
      const authClient = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/calendar.events'],
      });
      calendar = google.calendar({ version: 'v3', auth: authClient });
      console.log('[Google Calendar] API Iniciada mediante variables de entorno');
      return calendar;
    } else {
      return null;
    }
  } catch (error) {
    console.error('[Google Calendar] Error iniciando la API:', error.message);
    return null;
  }
}

// Inicializar al arranque si hay credenciales disponibles
getCalendarClient();

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

/**
 * Agrega un evento a Google Calendar con fecha y hora exactas en la zona horaria America/Mexico_City.
 * Usa formato RFC 3339 con offset explícito (-06:00) para garantizar que nunca haya desfases
 * sin importar la zona horaria del servidor (Render UTC, local, etc.).
 */
async function addEventToGoogleCalendar(evtData) {
  const cal = getCalendarClient();
  if (!cal) {
    console.log('[Google Calendar] API no configurada, se omite sincronización.');
    return null;
  }

  try {
    const { horas, minutos } = parsearHoraInicio(evtData.hora || '');

    let anio = (evtData.anio !== undefined && evtData.anio !== null) ? Number(evtData.anio) : null;
    let mes = (evtData.mes !== undefined && evtData.mes !== null) ? Number(evtData.mes) : null; // 0-indexed
    let diaNum = (evtData.diaNum !== undefined && evtData.diaNum !== null) ? Number(evtData.diaNum) : null;

    if (evtData.dia && (diaNum === null || mes === null || anio === null)) {
      const p = parsearFechaEspanol(evtData.dia, evtData.hora || '', new Date(), true);
      if (p && p.esExacta) {
        if (diaNum === null) diaNum = p.dia;
        if (mes === null) mes = p.mes;
        if (anio === null) anio = p.anio;
      }
    }

    if (evtData.fechaEvento && (diaNum === null || mes === null || anio === null)) {
      const d = new Date(evtData.fechaEvento);
      if (!isNaN(d.getTime())) {
        const parts = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Mexico_City',
          year: 'numeric',
          month: 'numeric',
          day: 'numeric'
        }).formatToParts(d);
        const map = {};
        parts.forEach(p => map[p.type] = p.value);
        if (anio === null) anio = parseInt(map.year, 10);
        if (mes === null || mes === undefined) mes = parseInt(map.month, 10) - 1;
        if (diaNum === null) diaNum = parseInt(map.day, 10);
      }
    }

    const hoy = new Date();
    if (anio === null) anio = hoy.getFullYear();
    if (mes === null || mes === undefined) mes = hoy.getMonth();
    if (diaNum === null) diaNum = hoy.getDate();

    // Formatear fechas RFC 3339 con offset explícito de México (-06:00)
    // Usamos Date.UTC para sumar la duración de 1 hora de manera segura sin alterar zonas horarias
    const pad = n => String(n).padStart(2, '0');
    const startUtc = new Date(Date.UTC(anio, mes, diaNum, horas, minutos, 0));
    const endUtc = new Date(startUtc.getTime() + 60 * 60 * 1000); // 1 hora de duración

    const formatRFC3339Mexico = (d) => {
      const Y = d.getUTCFullYear();
      const M = pad(d.getUTCMonth() + 1);
      const D = pad(d.getUTCDate());
      const h = pad(d.getUTCHours());
      const m = pad(d.getUTCMinutes());
      const s = pad(d.getUTCSeconds());
      return `${Y}-${M}-${D}T${h}:${m}:${s}-06:00`;
    };

    const startDateTime = formatRFC3339Mexico(startUtc);
    const endDateTime = formatRFC3339Mexico(endUtc);

    const event = {
      summary: evtData.titulo || 'Evento de SlacIA',
      description: `Evento agendado desde SlacIA.\nAutor: ${evtData.autor || 'Desconocido'}`,
      start: {
        dateTime: startDateTime,
        timeZone: 'America/Mexico_City',
      },
      end: {
        dateTime: endDateTime,
        timeZone: 'America/Mexico_City',
      },
    };

    const response = await cal.events.insert({
      calendarId: getCalendarId(),
      resource: event,
    });

    console.log('[Google Calendar] Evento sincronizado exitosamente:', response.data.htmlLink, 'Horario México:', startDateTime);
    return response.data;
  } catch (err) {
    console.error('[Google Calendar] Error sincronizando evento:', err.message);
    return null;
  }
}

/**
 * Obtiene los próximos eventos desde Google Calendar parseados en la zona horaria America/Mexico_City.
 */
async function fetchGoogleCalendarEvents() {
  const cal = getCalendarClient();
  if (!cal) return [];

  try {
    const timeMin = new Date();
    // Obtener los próximos 15 eventos desde hoy
    const response = await cal.events.list({
      calendarId: getCalendarId(),
      timeMin: timeMin.toISOString(),
      maxResults: 15,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = response.data.items || [];
    const MESES_NOMBRES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

    return items.map(ev => {
      // Parsear la fecha del evento de Google
      const start = ev.start.dateTime || ev.start.date;
      const startDate = new Date(start);

      // Usar timeZone explícito 'America/Mexico_City' para que nunca dependa del servidor
      const horaStr = startDate.toLocaleTimeString('es-MX', {
        timeZone: 'America/Mexico_City',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const diaNum = parseInt(startDate.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        day: 'numeric'
      }), 10);

      const mesNum = parseInt(startDate.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        month: 'numeric'
      }), 10) - 1;

      const anioNum = parseInt(startDate.toLocaleDateString('es-MX', {
        timeZone: 'America/Mexico_City',
        year: 'numeric'
      }), 10);

      return {
        id: `gcal-${ev.id}`,
        titulo: ev.summary || '(Sin título)',
        dia: `${diaNum} de ${MESES_NOMBRES[mesNum]} de ${anioNum}`,
        diaNum,
        mes: mesNum,
        anio: anioNum,
        hora: horaStr,
        autor: 'Google Calendar',
        fuente: 'gcal',
        fechaEvento: startDate,
        createdAt: new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('[Google Calendar] Error obteniendo eventos:', err.message);
    return [];
  }
}

/**
 * Elimina un evento en Google Calendar usando su ID.
 */
async function deleteGoogleCalendarEvent(eventId) {
  const cal = getCalendarClient();
  if (!cal || !eventId) return false;

  try {
    const realId = eventId.replace('gcal-', '');
    await cal.events.delete({
      calendarId: getCalendarId(),
      eventId: realId,
    });
    console.log('[Google Calendar] Evento eliminado exitosamente de Google Calendar:', realId);
    return true;
  } catch (err) {
    console.error('[Google Calendar] Error eliminando evento:', err.message);
    return false;
  }
}

module.exports = {
  addEventToGoogleCalendar,
  fetchGoogleCalendarEvents,
  deleteGoogleCalendarEvent,
};
