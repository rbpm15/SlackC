'use strict';

/**
 * services/dateUtils.js
 * Utilidades para parsear y normalizar fechas en español
 * (mensajes de chat, eventos de agenda y calendarios).
 */

const MESES = {
  enero: 0,
  febrero: 1,
  marzo: 2,
  abril: 3,
  mayo: 4,
  junio: 5,
  julio: 6,
  agosto: 7,
  septiembre: 8,
  setiembre: 8,
  octubre: 9,
  noviembre: 10,
  diciembre: 11
};

const DIAS_SEMANA = {
  domingo: 0,
  lunes: 1,
  martes: 2,
  miércoles: 3,
  miercoles: 3,
  jueves: 4,
  viernes: 5,
  sábado: 6,
  sabado: 6
};

/**
 * Parsea un texto con fecha en español.
 * @param {string} textoFecha - ej. "24 de julio de 2026", "24 de julio", "mañana", "Día 23"
 * @param {string} horaTexto - ej. "15:00 hrs", "3:30 pm"
 * @param {Date} baseDate - Fecha de referencia (por defecto ahora)
 * @param {boolean} esParaNuevo - Si es true y no se indica año pero el mes ya pasó este año, asume el próximo año
 */
function parsearFechaEspanol(textoFecha, horaTexto = '', baseDate = new Date(), esParaNuevo = false) {
  if (!textoFecha || typeof textoFecha !== 'string') return null;
  const texto = textoFecha.toLowerCase().trim();

  let dia = null;
  let mes = null;
  let anio = null;

  // 1. Formato ISO directo: "YYYY-MM-DD"
  const matchISO = texto.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matchISO) {
    anio = parseInt(matchISO[1], 10);
    mes = parseInt(matchISO[2], 10) - 1;
    dia = parseInt(matchISO[3], 10);
    return { dia, mes, anio, esExacta: true };
  }

  // 2. Formato con nombre de mes: "24 de julio de 2026" o "24 de julio" o "24 julio 2026"
  const matchMes = texto.match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)?\s*(\d{4}))?/i);
  if (matchMes) {
    dia = parseInt(matchMes[1], 10);
    mes = MESES[matchMes[2].toLowerCase()];
    anio = matchMes[3] ? parseInt(matchMes[3], 10) : baseDate.getFullYear();

    // Si no especificó año y es para agendar un nuevo evento:
    if (!matchMes[3] && esParaNuevo) {
      const dCheck = new Date(anio, mes, dia, 23, 59, 59);
      if (dCheck < baseDate) {
        anio += 1; // Asumir el próximo año
      }
    }
    return { dia, mes, anio, esExacta: true };
  }

  // 3. Formato numérico: "24/07/2026" o "24/07" o "24-07-2026"
  const matchNum = texto.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
  if (matchNum) {
    dia = parseInt(matchNum[1], 10);
    mes = parseInt(matchNum[2], 10) - 1;
    anio = matchNum[3] ? parseInt(matchNum[3], 10) : baseDate.getFullYear();
    if (!matchNum[3] && esParaNuevo) {
      const dCheck = new Date(anio, mes, dia, 23, 59, 59);
      if (dCheck < baseDate) anio += 1;
    }
    return { dia, mes, anio, esExacta: true };
  }

  // 4. "Hoy"
  if (texto === 'hoy') {
    return { dia: baseDate.getDate(), mes: baseDate.getMonth(), anio: baseDate.getFullYear(), esExacta: true };
  }

  // 5. "Pasado mañana"
  if (texto.includes('pasado mañana') || texto.includes('pasado manana')) {
    const pm = new Date(baseDate);
    pm.setDate(pm.getDate() + 2);
    return { dia: pm.getDate(), mes: pm.getMonth(), anio: pm.getFullYear(), esExacta: true };
  }

  // 6. "Mañana" / "Manana"
  if (texto === 'mañana' || texto === 'manana' || texto.includes('mañana') || texto.includes('manana')) {
    const manana = new Date(baseDate);
    manana.setDate(manana.getDate() + 1);
    return { dia: manana.getDate(), mes: manana.getMonth(), anio: manana.getFullYear(), esExacta: true };
  }

  // 7. Días de la semana ("el lunes", "este viernes", "el sábado")
  for (const [nombreDia, numDia] of Object.entries(DIAS_SEMANA)) {
    if (new RegExp(`\\b${nombreDia}\\b`, 'i').test(texto)) {
      const d = new Date(baseDate);
      const diff = (numDia - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
      return { dia: d.getDate(), mes: d.getMonth(), anio: d.getFullYear(), esExacta: true };
    }
  }

  // 8. "Día 23" o número de día explícito
  const matchDia = texto.match(/(?:día|dia)\s*(\d{1,2})\b/i);
  if (matchDia) {
    dia = parseInt(matchDia[1], 10);
    mes = baseDate.getMonth();
    anio = baseDate.getFullYear();
    if (esParaNuevo) {
      const dCheck = new Date(anio, mes, dia, 23, 59, 59);
      if (dCheck < baseDate) {
        mes += 1;
        if (mes > 11) { mes = 0; anio += 1; }
      }
    }
    return { dia, mes, anio, esExacta: true };
  }

  // 9. Fechas vagas
  if (texto.includes('semana')) {
    return { esVaga: true, diasExpira: 7 };
  }
  if (texto.includes('mes')) {
    return { esVaga: true, diasExpira: 30 };
  }

  // 10. Número suelto al inicio o final (ej. "24")
  const matchNumeroSolo = texto.match(/^(\d{1,2})$/);
  if (matchNumeroSolo) {
    dia = parseInt(matchNumeroSolo[1], 10);
    mes = baseDate.getMonth();
    anio = baseDate.getFullYear();
    if (esParaNuevo) {
      const dCheck = new Date(anio, mes, dia, 23, 59, 59);
      if (dCheck < baseDate) {
        mes += 1;
        if (mes > 11) { mes = 0; anio += 1; }
      }
    }
    return { dia, mes, anio, esExacta: true };
  }

  return null;
}

/**
 * Calcula la fecha de expiración o fin de día para un evento.
 */
function calcularFechaEvento(textoFecha, horaTexto = '', baseDate = new Date(), esParaNuevo = false) {
  const parsed = parsearFechaEspanol(textoFecha, horaTexto, baseDate, esParaNuevo);
  if (!parsed) return { fechaEvento: null, fechaExpiracion: null };

  if (parsed.esExacta) {
    // 23:59:59 para que sea válido durante todo el día indicado
    const fecha = new Date(parsed.anio, parsed.mes, parsed.dia, 23, 59, 59);
    return { fechaEvento: fecha, fechaExpiracion: null, parsed };
  }

  if (parsed.esVaga) {
    const fechaExp = new Date(baseDate.getTime() + (parsed.diasExpira || 7) * 24 * 60 * 60 * 1000);
    return { fechaEvento: null, fechaExpiracion: fechaExp, parsed };
  }

  return { fechaEvento: null, fechaExpiracion: null };
}

/**
 * Parsea la hora de inicio a partir de un texto (ej. "15:00 hrs", "3:30 pm", "09:00 - 14:00 hrs").
 */
function parsearHoraInicio(horaStr) {
  if (!horaStr || typeof horaStr !== 'string') return { horas: 9, minutos: 0 };
  const str = horaStr.toLowerCase().trim();
  const match = str.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|hrs?|h|de\s+la\s+tarde|de\s+la\s+ma[nñ]ana)?/i);
  if (!match) return { horas: 9, minutos: 0 };

  let horas = parseInt(match[1], 10);
  let minutos = match[2] ? parseInt(match[2], 10) : 0;
  const sufijo = (match[3] || '').toLowerCase();

  if ((sufijo.includes('pm') || sufijo.includes('tarde')) && horas < 12) {
    horas += 12;
  } else if ((sufijo.includes('am') || sufijo.includes('mañana') || sufijo.includes('manana')) && horas === 12) {
    horas = 0;
  }
  return { horas, minutos };
}

/**
 * Obtiene la fecha y hora exacta de inicio de un evento (objeto Date).
 */
function obtenerFechaHoraInicio(ev) {
  if (!ev) return null;
  let anio = ev.anio !== undefined ? ev.anio : null;
  let mes = ev.mes !== undefined ? ev.mes : null;
  let diaNum = ev.diaNum !== undefined ? ev.diaNum : null;

  if (ev.fechaEvento) {
    const f = new Date(ev.fechaEvento);
    if (!isNaN(f.getTime())) {
      anio = f.getFullYear();
      mes = f.getMonth();
      diaNum = f.getDate();
    }
  }

  if (anio === null || mes === null || diaNum === null) {
    if (ev.dia) {
      const parsed = parsearFechaEspanol(ev.dia, ev.hora || '', ev.createdAt ? new Date(ev.createdAt) : new Date());
      if (parsed && parsed.esExacta) {
        anio = parsed.anio;
        mes = parsed.mes;
        diaNum = parsed.dia;
      }
    }
  }

  if (anio === null && diaNum) {
    const base = ev.createdAt ? new Date(ev.createdAt) : new Date();
    anio = base.getFullYear();
    mes = base.getMonth();
  }

  if (anio !== null && mes !== null && diaNum !== null) {
    const { horas, minutos } = parsearHoraInicio(ev.hora);
    return new Date(anio, mes, diaNum, horas, minutos, 0, 0);
  }

  return null;
}

module.exports = {
  MESES,
  DIAS_SEMANA,
  parsearFechaEspanol,
  calcularFechaEvento,
  parsearHoraInicio,
  obtenerFechaHoraInicio,
};

