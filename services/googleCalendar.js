const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Intentar cargar credenciales
const CREDENTIALS_PATH = path.join(__dirname, '../config/credentials.json');
let auth = null;
let calendar = null;

try {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    const authClient = new google.auth.GoogleAuth({
      keyFile: CREDENTIALS_PATH,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    
    auth = authClient;
    calendar = google.calendar({ version: 'v3', auth });
    console.log('[Google Calendar] API Iniciada correctamente con credentials.json');
  } else if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
    const authClient = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/calendar.events'],
    });
    auth = authClient;
    calendar = google.calendar({ version: 'v3', auth });
    console.log('[Google Calendar] API Iniciada mediante variables de entorno');
  } else {
    console.log('[Google Calendar] CREDENCIALES NO ENCONTRADAS. Por favor, coloca tus credenciales en config/credentials.json o en la variable GOOGLE_SERVICE_ACCOUNT_JSON');
  }
} catch (error) {
  console.error('[Google Calendar] Error iniciando la API:', error.message);
}

function getCalendarId() {
  return process.env.GOOGLE_CALENDAR_ID || 'primary';
}

async function addEventToGoogleCalendar(evtData) {
  if (!calendar) {
    console.log('[Google Calendar] API no configurada, se omite sincronización.');
    return null;
  }

  try {
    // Preparar las fechas
    let startTime, endTime;
    
    if (evtData.fechaEvento) {
      startTime = new Date(evtData.fechaEvento);
      // Asumimos que los eventos duran 1 hora por defecto si no tenemos startTime exacto
      
      // Si la base de datos dice que `fechaEvento` es final del día (23:59), recalcularemos
      // basándonos en 'hora' del evento (ej "10:00")
      if (evtData.hora) {
        const timeMatch = evtData.hora.match(/(\d+):(\d+)/);
        if (timeMatch) {
          startTime.setHours(parseInt(timeMatch[1], 10), parseInt(timeMatch[2], 10), 0, 0);
        }
      }
      
      endTime = new Date(startTime.getTime() + 60 * 60 * 1000); // +1 Hora
    } else {
      // Evento de todo el día si no hay fecha exacta
      const d = new Date();
      if (evtData.diaNum) {
        d.setDate(evtData.diaNum);
      }
      startTime = d;
      endTime = new Date(d.getTime() + 24 * 60 * 60 * 1000); // Día siguiente
    }

    const event = {
      summary: evtData.titulo || 'Evento de SlacIA',
      description: `Evento agendado desde SlacIA.\nAutor: ${evtData.autor || 'Desconocido'}`,
      start: {
        dateTime: startTime.toISOString(),
        timeZone: 'America/Mexico_City', // Ajustar a tu zona horaria si es necesario
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: 'America/Mexico_City',
      },
    };

    const response = await calendar.events.insert({
      calendarId: getCalendarId(),
      resource: event,
    });

    console.log('[Google Calendar] Evento sincronizado exitosamente:', response.data.htmlLink);
    return response.data;
  } catch (err) {
    console.error('[Google Calendar] Error sincronizando evento:', err.message);
    return null;
  }
}

async function fetchGoogleCalendarEvents() {
  if (!calendar) return [];

  try {
    const timeMin = new Date();
    // Obtener los próximos 15 eventos desde hoy
    const response = await calendar.events.list({
      calendarId: getCalendarId(),
      timeMin: timeMin.toISOString(),
      maxResults: 15,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const items = response.data.items || [];
    return items.map(ev => {
      // Parsear la fecha del evento de Google
      const start = ev.start.dateTime || ev.start.date;
      const startDate = new Date(start);
      
      const mesStr = (startDate.getMonth() + 1).toString().padStart(2, '0');
      const dStr = startDate.getDate().toString().padStart(2, '0');
      
      // Formatear hora (HH:mm) para consistencia con el front
      const horaStr = startDate.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
      
      return {
        id: `gcal-${ev.id}`, // Id especial para que no colisionen o para identificarlos
        titulo: ev.summary || '(Sin título)',
        dia: `Día ${startDate.getDate()}`,
        diaNum: startDate.getDate(),
        hora: horaStr,
        autor: 'Google Calendar',
        fuente: 'gcal', // Identificador específico para Google Calendar
        fechaEvento: startDate,
        createdAt: new Date().toISOString()
      };
    });
  } catch (err) {
    console.error('[Google Calendar] Error obteniendo eventos:', err.message);
    return [];
  }
}

module.exports = {
  addEventToGoogleCalendar,
  fetchGoogleCalendarEvents,
};
