/**
 * agenda.js
 * Responsabilidad: renderizado de la agenda y mini-calendario.
 * La detección server-side ya ocurre en socketHandler.js.
 * Este módulo solo pinta tarjetas y gestiona el switch n8n/local.
 */
'use strict';

/* ════════════════════════════════════════════════════════════════
   N8N
════════════════════════════════════════════════════════════════ */
const N8N_WEBHOOK_URL = 'https://tu-instancia.n8n.io/webhook/slacia-evento';

/* ════════════════════════════════════════════════════════════════
   REFS DOM
════════════════════════════════════════════════════════════════ */
const agendaBodyEl  = document.getElementById('agendaBody');
const agendaCountEl = document.getElementById('agendaCount');
const agendaDateEl  = document.getElementById('agendaDate');

/* ════════════════════════════════════════════════════════════════
   FECHA DE HOY EN HEADER
════════════════════════════════════════════════════════════════ */
(function setDate() {
  const DIAS  = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
  const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const hoy   = new Date();
  agendaDateEl.textContent = `${DIAS[hoy.getDay()]}, ${hoy.getDate()} de ${MESES[hoy.getMonth()]}`;
})();

/* ════════════════════════════════════════════════════════════════
   UTILIDADES DE FECHAS EN ESPAÑOL
════════════════════════════════════════════════════════════════ */
const MESES_MAP = {
  enero: 0, febrero: 1, marzo: 2, abril: 3, mayo: 4, junio: 5,
  julio: 6, agosto: 7, septiembre: 8, setiembre: 8, octubre: 9,
  noviembre: 10, diciembre: 11
};

function parsearFechaTexto(textoFecha, baseDate = new Date()) {
  if (!textoFecha || typeof textoFecha !== 'string') return null;
  const texto = textoFecha.toLowerCase().trim();

  // 1. ISO YYYY-MM-DD
  const matchISO = texto.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (matchISO) {
    return { anio: parseInt(matchISO[1], 10), mes: parseInt(matchISO[2], 10) - 1, dia: parseInt(matchISO[3], 10) };
  }

  // 2. "24 de julio de 2026" o "24 de julio"
  const matchMes = texto.match(/(\d{1,2})\s+(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)?\s*(\d{4}))?/i);
  if (matchMes) {
    const dia = parseInt(matchMes[1], 10);
    const mes = MESES_MAP[matchMes[2].toLowerCase()];
    const anio = matchMes[3] ? parseInt(matchMes[3], 10) : baseDate.getFullYear();
    return { dia, mes, anio };
  }

  // 3. "24/07/2026" o "24/07"
  const matchNum = texto.match(/(\d{1,2})[\/-](\d{1,2})(?:[\/-](\d{4}))?/);
  if (matchNum) {
    return {
      dia: parseInt(matchNum[1], 10),
      mes: parseInt(matchNum[2], 10) - 1,
      anio: matchNum[3] ? parseInt(matchNum[3], 10) : baseDate.getFullYear()
    };
  }

  // 4. "Día 23"
  const matchDia = texto.match(/(?:día|dia)\s*(\d{1,2})\b/i);
  if (matchDia) {
    return { dia: parseInt(matchDia[1], 10), mes: baseDate.getMonth(), anio: baseDate.getFullYear() };
  }

  return null;
}

/* ════════════════════════════════════════════════════════════════
   MINI CALENDARIO (estado vacío profesional y navegación)
════════════════════════════════════════════════════════════════ */
function crearMiniCalendarioHtml() {
  const hoy     = new Date();
  const anio    = AgendaModule.currentYear !== undefined ? AgendaModule.currentYear : hoy.getFullYear();
  const mes     = AgendaModule.currentMonth !== undefined ? AgendaModule.currentMonth : hoy.getMonth();
  const diaHoy  = hoy.getDate();
  const esMesActual = (anio === hoy.getFullYear() && mes === hoy.getMonth());

  const DIAS_CORTO = ['D','L','M','X','J','V','S'];
  const MESES_ES   = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  // Primer día del mes y total de días
  const primerDia  = new Date(anio, mes, 1).getDay();
  const totalDias  = new Date(anio, mes + 1, 0).getDate();

  // Generar celdas
  let celdas = '';
  for (let i = 0; i < primerDia; i++) {
    celdas += `<span class="cal-cell empty"></span>`;
  }
  for (let d = 1; d <= totalDias; d++) {
    const esHoy = esMesActual && d === diaHoy;
    celdas += `<span class="cal-cell${esHoy ? ' today' : ''}" id="cal-day-${d}" onclick="window.AgendaModule.filtrarPorDia(${d})">${d}</span>`;
  }

  return `
    <div class="mini-calendar" id="miniCalendarWrapper">
      <div class="mini-cal-header" style="display: flex; justify-content: space-between; align-items: center;">
        <button onclick="AgendaModule.cambiarMes(-1)" style="flex-shrink:0; width: 24px; height:24px; background: none; border: none; cursor: pointer; color: var(--slack-primary); font-size: 16px; border-radius: 4px;" onmouseover="this.style.background='rgba(0,0,0,0.05)';" onmouseout="this.style.background='none';">◀</button>
        <span>${MESES_ES[mes]} ${anio}</span>
        <button onclick="AgendaModule.cambiarMes(1)" style="flex-shrink:0; width: 24px; height:24px; background: none; border: none; cursor: pointer; color: var(--slack-primary); font-size: 16px; border-radius: 4px;" onmouseover="this.style.background='rgba(0,0,0,0.05)';" onmouseout="this.style.background='none';">▶</button>
      </div>
      <div class="mini-cal-days">
        ${DIAS_CORTO.map(d => `<span class="cal-day-label">${d}</span>`).join('')}
      </div>
      <div class="mini-cal-grid">${celdas}</div>
    </div>
    <div id="miniCalendarTools">
      <div style="margin: 16px 20px 8px; font-size: 14px; font-weight: 700; color: var(--text-main); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
        <span>Próximos eventos</span>
        <button onclick="AgendaModule.abrirModalRegistro()" title="Registrar nuevo evento" style="background:none; border:none; color:var(--slack-primary); cursor:pointer; font-size:20px; font-weight:bold; display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:4px; line-height:1; transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)';" onmouseout="this.style.background='none';">+</button>
      </div>
      <div id="emptyEventsContainer" style="display: none; text-align: center; padding: 20px 10px;">
        <p id="emptyEventsText" class="mini-cal-empty-text" style="display:block; margin-bottom: 12px;">Sin eventos registrados</p>
        <button id="btnRegistrarAhora" class="name-modal-btn" style="display: none; margin: 0 auto; padding: 6px 12px; font-size: 13px; width: auto;" onclick="AgendaModule.abrirModalRegistro()">Registrar ahora</button>
      </div>
    </div>
  `;
}

// Insertar calendario al arrancar
function initCalendarDOM() {
  const prevCal = document.getElementById('miniCalendarWrapper');
  const prevTools = document.getElementById('miniCalendarTools');
  if (prevCal) prevCal.remove();
  if (prevTools) prevTools.remove();

  // Eliminar estado vacío inicial de EJS para que no rompa el layout
  const initEmpty = document.getElementById('agendaEmpty');
  if (initEmpty) initEmpty.remove();

  const wrap = document.createElement('div');
  wrap.innerHTML = crearMiniCalendarioHtml();
  // Insertar al inicio para que las tarjetas de eventos queden debajo
  agendaBodyEl.insertBefore(wrap.querySelector('#miniCalendarTools'), agendaBodyEl.firstChild);
  agendaBodyEl.insertBefore(wrap.querySelector('#miniCalendarWrapper'), agendaBodyEl.firstChild);
}

// Insertar calendario al arrancar (solo estructura, luego se sobreescribe el state)
// Se llama initCalendarDOM después, pues AgendaModule debe instanciarse.

/* ════════════════════════════════════════════════════════════════
   CONTADOR
════════════════════════════════════════════════════════════════ */
function actualizarContador() {
  const total = document.querySelectorAll('.event-card').length;
  agendaCountEl.textContent = `${total} evento${total !== 1 ? 's' : ''}`;

  // Si no hay eventos, asegurarse de que el calendario exista y mostrar el texto vacío
  if (total === 0) {
    if (!document.getElementById('miniCalendarWrapper')) {
      initCalendarDOM();
    } else {
      const emptyCont = agendaBodyEl.querySelector('#emptyEventsContainer');
      if (emptyCont) {
        emptyCont.style.display = 'block';
        document.getElementById('emptyEventsText').textContent = 'Sin eventos registrados';
        document.getElementById('btnRegistrarAhora').style.display = 'none';
      }
    }
  } else {
    const selectedDay = document.querySelector('.cal-cell.selected-day');
    if (!selectedDay) {
      const emptyCont = agendaBodyEl.querySelector('#emptyEventsContainer');
      if (emptyCont) emptyCont.style.display = 'none';
    }
  }
}

/* ════════════════════════════════════════════════════════════════
   ORDENAMIENTO Y RENDERIZADO DE TARJETAS DE EVENTO
════════════════════════════════════════════════════════════════ */

/**
 * Calcula el timestamp exacto de un evento para ordenamiento cronológico.
 * Eventos más próximos tienen un timestamp menor.
 */
function obtenerTimestampEvento(ev) {
  let anio = (ev.anio !== undefined && ev.anio !== null) ? Number(ev.anio) : null;
  let mes = (ev.mes !== undefined && ev.mes !== null) ? Number(ev.mes) : null;
  let diaNum = (ev.diaNum !== undefined && ev.diaNum !== null) ? Number(ev.diaNum) : null;

  // Si ev.dia tiene fecha en texto, extraerla si nos falta algún dato
  if ((!diaNum || mes === null || !anio) && ev.dia) {
    const p = parsearFechaTexto(ev.dia);
    if (p) {
      if (!diaNum) diaNum = p.dia;
      if (mes === null) mes = p.mes;
      if (!anio) anio = p.anio;
    }
  }

  // Si aún no tenemos día/mes/año, extraer de fechaEvento
  if ((!diaNum || mes === null || !anio) && ev.fechaEvento) {
    const f = new Date(ev.fechaEvento);
    if (!isNaN(f.getTime())) {
      if (!anio) anio = f.getFullYear();
      if (mes === null) mes = f.getMonth();
      if (!diaNum) diaNum = f.getDate();
    }
  }

  let horas = 12;
  let minutos = 0;

  if (ev.hora) {
    const matchHora = ev.hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (matchHora) {
      horas = parseInt(matchHora[1], 10);
      minutos = matchHora[2] ? parseInt(matchHora[2], 10) : 0;
      const meridian = matchHora[3]?.toLowerCase();
      if (meridian === 'pm' && horas < 12) horas += 12;
      if (meridian === 'am' && horas === 12) horas = 0;
    }
  }

  if (diaNum && mes !== null && anio) {
    return new Date(anio, mes, diaNum, horas, minutos, 0).getTime();
  }

  if (ev.fechaEvento) {
    const f = new Date(ev.fechaEvento);
    if (!isNaN(f.getTime())) return f.getTime();
  }

  if (ev.fechaExpiracion) {
    const f = new Date(ev.fechaExpiracion);
    if (!isNaN(f.getTime())) return f.getTime();
  }

  if (ev.createdAt) {
    return new Date(ev.createdAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  }

  return Number.MAX_SAFE_INTEGER;
}

const _recordatoriosNotificados = new Set();

/**
 * Verificador periódico en el cliente para disparar la alerta cuando
 * el reloj del sistema alcance la fecha y hora exacta del evento.
 */
function verificarRecordatoriosLocales() {
  if (!AgendaModule.cachedEvents || AgendaModule.cachedEvents.length === 0) return;
  const ahora = Date.now();

  AgendaModule.cachedEvents.forEach(ev => {
    const id = (ev.id || ev._id || '').toString();
    if (!id || _recordatoriosNotificados.has(id)) return;

    const ts = obtenerTimestampEvento(ev);
    if (!ts || ts === Number.MAX_SAFE_INTEGER) return;

    const diff = ahora - ts;
    // Dispara si estamos en la ventana exacta (entre 0 y 90 segundos desde el inicio)
    if (diff >= 0 && diff <= 90 * 1000) {
      _recordatoriosNotificados.add(id);
      if (typeof mostrarAlertaEvento === 'function') {
        mostrarAlertaEvento(ev);
      }
    }
  });
}

// Revisar cada 20 segundos en segundo plano
setInterval(verificarRecordatoriosLocales, 20 * 1000);

/**
 * Inserta la tarjeta en la posición ordenada:
 * del evento más reciente/próximo al que tarde más.
 */
function insertarTarjetaOrdenada(card, timestamp) {
  card.dataset.timestamp = timestamp;

  const existingCards = Array.from(agendaBodyEl.querySelectorAll('.event-card'));
  let inserted = false;

  for (const existing of existingCards) {
    if (existing === card) continue;
    const existingTs = parseInt(existing.dataset.timestamp, 10);
    const compTs = isNaN(existingTs) ? Number.MAX_SAFE_INTEGER : existingTs;
    if (timestamp < compTs) {
      agendaBodyEl.insertBefore(card, existing);
      inserted = true;
      break;
    }
  }

  if (!inserted) {
    agendaBodyEl.appendChild(card);
  }
}

function renderizarEvento(evento, animado = true) {
  const evId = `ev-${evento.id}`;
  const horaCreado = new Date(evento.createdAt || Date.now()).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });
  let autorHtml = '';
  if (evento.autor) {
    const autores = evento.autor.split(',').map(a => a.trim()).filter(Boolean);
    if (autores.length === 1) {
      autorHtml = `<span class="event-tag autor-tag">👤 ${escapeHtml(autores[0])}</span>`;
    } else {
      autorHtml = `<span class="event-tag autor-tag tooltip" style="cursor:pointer;" onclick="alert('Escrito por:\\n${escapeHtml(autores.join('\\n'))}')" title="Haz clic para ver quiénes">👥 ${autores.length} personas</span>`;
    }
  }

  let fuenteHtml = '';
  if (evento.fuente === 'n8n') {
    fuenteHtml = `<span class="event-tag src-n8n">⚡ n8n</span>`;
  } else if (evento.fuente === 'gcal') {
    fuenteHtml = `<span class="event-tag src-gcal" style="background:#e8f0fe; color:#1967d2; border:1px solid #c2e0ff;">📅 G-Calendar</span>`;
  } else if (evento.fuente === 'manual') {
    fuenteHtml = `<span class="event-tag src-manual" style="background:#fff3cd; color:#856404; border:1px solid #ffeeba;">✍️ Manualmente</span>`;
  } else {
    fuenteHtml = `<span class="event-tag src-local">🤖 IA</span>`;
  }

  const cardHtml = `
    <div class="event-card-header">
      <span class="event-card-title">${escapeHtml(evento.titulo)}</span>
      <button class="event-card-delete"
        onclick="AgendaModule.eliminarEvento('${evento.id}')"
        title="Eliminar">×</button>
    </div>
    <div class="event-card-tags">
      <span class="event-tag day-tag">📅 ${escapeHtml(evento.dia)}</span>
      <span class="event-tag time-tag">🕐 ${escapeHtml(evento.hora)}</span>
      ${autorHtml}
      ${fuenteHtml}
    </div>
    <div class="event-card-footer">Actualizado a las ${horaCreado}</div>
  `;

  const timestamp = obtenerTimestampEvento(evento);

  let card = document.getElementById(evId);
  if (card) {
    // Actualizar tarjeta existente y recolocar en orden
    card.innerHTML = cardHtml;
    card.dataset.diaNum = (evento.diaNum !== undefined && evento.diaNum !== null) ? evento.diaNum : '';
    card.dataset.mes = (evento.mes !== undefined && evento.mes !== null) ? evento.mes : '';
    card.dataset.anio = (evento.anio !== undefined && evento.anio !== null) ? evento.anio : '';
    insertarTarjetaOrdenada(card, timestamp);
    if (animado) {
      card.classList.add('flash-new');
      setTimeout(() => card.classList.remove('flash-new'), 2000);
    }
    return;
  }

  card = document.createElement('div');
  card.id        = evId;
  card.className = 'event-card' + (animado ? ' anim-slide-right' : '');
  card.dataset.diaNum = (evento.diaNum !== undefined && evento.diaNum !== null) ? evento.diaNum : '';
  card.dataset.mes = (evento.mes !== undefined && evento.mes !== null) ? evento.mes : '';
  card.dataset.anio = (evento.anio !== undefined && evento.anio !== null) ? evento.anio : '';
  card.innerHTML = cardHtml;

  insertarTarjetaOrdenada(card, timestamp);
  actualizarContador();

  // Marcar punto en el calendario si tenemos día numérico y corresponde al mes actual en vista
  if (evento.diaNum && evento.mes === AgendaModule.currentMonth && evento.anio === AgendaModule.currentYear) {
    const cell = document.getElementById(`cal-day-${evento.diaNum}`);
    if (cell && !cell.querySelector('.event-indicator')) {
      cell.innerHTML += `<div class="event-indicator"></div>`;
    }
  }

  if (animado) {
    requestAnimationFrame(() => {
      card.classList.add('flash-new');
      setTimeout(() => card.classList.remove('flash-new'), 2000);
    });
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

/* ════════════════════════════════════════════════════════════════
   SWITCH N8N / IA LOCAL
════════════════════════════════════════════════════════════════ */
const n8nSwitchEl       = document.getElementById('n8nSwitch');
const n8nLabelEl        = document.getElementById('n8nLabel');
const integrationDotEl  = document.getElementById('integrationDot');
const integrationTextEl = document.getElementById('integrationStatusText');
let n8nActivo = false;

n8nSwitchEl.addEventListener('change', () => {
  n8nActivo = n8nSwitchEl.checked;
  if (n8nActivo) {
    n8nLabelEl.textContent        = 'n8n activo';
    integrationDotEl.className    = 'integration-dot n8n';
    integrationTextEl.textContent = 'Enviando eventos a n8n';
  } else {
    n8nLabelEl.textContent        = 'IA Local';
    integrationDotEl.className    = 'integration-dot local';
    integrationTextEl.textContent = 'IA Local activa';
  }
});

async function enviarAN8n(payload) {
  try {
    const res = await fetch(N8N_WEBHOOK_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/* ════════════════════════════════════════════════════════════════
   API PÚBLICA
════════════════════════════════════════════════════════════════ */
const AgendaModule = {
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),
  cachedEvents: [],

  cambiarMes(delta) {
    this.currentMonth += delta;
    if (this.currentMonth < 0) {
      this.currentMonth = 11;
      this.currentYear--;
    } else if (this.currentMonth > 11) {
      this.currentMonth = 0;
      this.currentYear++;
    }
    
    // Obtener los eventos seleccionados si los hubiera y restablecerlos
    this.selectedDate = null;
    document.querySelectorAll('.event-card').forEach(c => c.style.display = 'block');
    
    initCalendarDOM();
    
    // Volver a calcular marcadores de eventos
    this.recalcularMarcadoresCalendario();
    actualizarContador();
  },

  recalcularMarcadoresCalendario() {
    // Quitar todos los puntos
    document.querySelectorAll('.event-indicator').forEach(i => i.remove());
    // Añadir puntos para los eventos que apliquen
    document.querySelectorAll('.event-card').forEach(c => {
      const d = parseInt(c.dataset.diaNum, 10);
      const m = parseInt(c.dataset.mes, 10);
      const a = parseInt(c.dataset.anio, 10);
      if (!isNaN(d) && !isNaN(m) && !isNaN(a) && m === this.currentMonth && a === this.currentYear) {
        const cell = document.getElementById(`cal-day-${d}`);
        if (cell && !cell.querySelector('.event-indicator')) {
          cell.innerHTML += `<div class="event-indicator"></div>`;
        }
      }
    });
  },

  /** Llamado por app.js cuando el servidor confirma un evento via socket */
  async recibirEventoSocket(ev) {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    let diaNumEv = (ev.diaNum !== undefined && ev.diaNum !== null) ? Number(ev.diaNum) : null;
    let mesEv = (ev.mes !== undefined && ev.mes !== null) ? Number(ev.mes) : null;
    let anioEv = (ev.anio !== undefined && ev.anio !== null) ? Number(ev.anio) : null;

    if (ev.dia) {
      const parsed = parsearFechaTexto(ev.dia, hoy);
      if (parsed) {
        if (!diaNumEv) diaNumEv = parsed.dia;
        if (mesEv === null) mesEv = parsed.mes;
        if (anioEv === null) anioEv = parsed.anio;
      }
    }

    let fechaReal = ev.fechaEvento ? new Date(ev.fechaEvento) : null;
    if (fechaReal && !diaNumEv) {
      mesEv = fechaReal.getMonth();
      anioEv = fechaReal.getFullYear();
      diaNumEv = fechaReal.getDate();
    }

    if (mesEv === null) mesEv = this.currentMonth;
    if (anioEv === null) anioEv = this.currentYear;

    let finDelDia = null;
    if (diaNumEv) {
      finDelDia = new Date(anioEv, mesEv, diaNumEv, 23, 59, 59);
    } else if (fechaReal) {
      finDelDia = fechaReal;
    }

    // Si la fecha ya pasó (ayer o antes), no agregar como evento futuro
    if (finDelDia && finDelDia < hoy) return;

    const evento = {
      id:        ev._id || ev.id,
      titulo:    ev.titulo,
      dia:       ev.dia,
      diaNum:    diaNumEv,
      mes:       mesEv,
      anio:      anioEv,
      hora:      ev.hora,
      autor:     ev.autor || '',
      fuente:    ev.fuente || 'local',
      fechaEvento: ev.fechaEvento || (finDelDia ? finDelDia.toISOString() : null),
      createdAt: ev.createdAt || new Date().toISOString(),
    };

    // Si n8n está activo, también enviar al webhook
    if (n8nActivo) {
      const ok = await enviarAN8n(evento);
      if (ok) evento.fuente = 'n8n';
    }

    this.cachedEvents.push(evento);
    this.cachedEvents.sort((a, b) => obtenerTimestampEvento(a) - obtenerTimestampEvento(b));
    renderizarEvento(evento, true);
  },

  /** Cargar historial de eventos desde la API al iniciar */
  cargarDesdeServidor(eventos = []) {
    const hoy = new Date();
    hoy.setHours(0,0,0,0);
    
    this.cachedEvents = [];
    
    // Limpiar tarjetas de eventos existentes para evitar duplicados u obsoletos
    agendaBodyEl.querySelectorAll('.event-card').forEach(c => c.remove());

    const eventosValidos = [];

    eventos.forEach(ev => {
      let diaNumEv = (ev.diaNum !== undefined && ev.diaNum !== null) ? Number(ev.diaNum) : null;
      let mesEv = (ev.mes !== undefined && ev.mes !== null) ? Number(ev.mes) : null;
      let anioEv = (ev.anio !== undefined && ev.anio !== null) ? Number(ev.anio) : null;

      if (ev.dia) {
        const parsed = parsearFechaTexto(ev.dia, ev.createdAt ? new Date(ev.createdAt) : hoy);
        if (parsed) {
          if (!diaNumEv) diaNumEv = parsed.dia;
          if (mesEv === null) mesEv = parsed.mes;
          if (anioEv === null) anioEv = parsed.anio;
        }
      }

      let fechaReal = ev.fechaEvento ? new Date(ev.fechaEvento) : null;
      if (fechaReal && !diaNumEv) {
        mesEv = fechaReal.getMonth();
        anioEv = fechaReal.getFullYear();
        diaNumEv = fechaReal.getDate();
      }

      if (mesEv === null) mesEv = this.currentMonth;
      if (anioEv === null) anioEv = this.currentYear;

      let finDelDia = null;
      if (diaNumEv) {
        finDelDia = new Date(anioEv, mesEv, diaNumEv, 23, 59, 59);
      } else if (fechaReal) {
        finDelDia = fechaReal;
      }

      // Si la fecha ya pasó (ayer o antes), descartar de próximos eventos
      if (finDelDia && finDelDia < hoy) return;

      const evtFormat = {
        id:        ev._id || ev.id,
        titulo:    ev.titulo,
        dia:       ev.dia,
        diaNum:    diaNumEv,
        mes:       mesEv,
        anio:      anioEv,
        hora:      ev.hora,
        autor:     ev.autor || '',
        fuente:    ev.fuente || 'local',
        fechaEvento: ev.fechaEvento || (finDelDia ? finDelDia.toISOString() : null),
        createdAt: ev.createdAt,
      };
      
      eventosValidos.push(evtFormat);
    });

    // Ordenar de más cercano/próximo al que tarde más
    eventosValidos.sort((a, b) => obtenerTimestampEvento(a) - obtenerTimestampEvento(b));

    this.cachedEvents = eventosValidos;

    eventosValidos.forEach(evtFormat => {
      renderizarEvento(evtFormat, false);
    });

    this.recalcularMarcadoresCalendario();
    actualizarContador();
  },

  /** Eliminar tarjeta del DOM y DB */
  async eliminarEvento(id) {
    if (!confirm('¿Seguro que deseas eliminar este evento?')) return;

    // Eliminar del IndexedDB local
    if (window.OfflineDB) {
      OfflineDB.deleteEvent(id).catch(() => {});
    }

    // Si es un id temporal (offline), solo limpiar la cola si estaba pendiente
    if (id.startsWith('local_')) {
      // Nada que hacer en el server, solo remover del DOM
    } else if (!window.SyncManager || SyncManager.isOnline()) {
      try {
        await fetch(`/api/events/${id}`, { method: 'DELETE' });
      } catch (e) {
        console.error('Error eliminando evento', e);
        // Encolar para cuando haya red
        if (window.OfflineDB) {
          OfflineDB.addToPendingQueue({ type: 'delete_event', payload: { eventId: id } }).catch(() => {});
        }
      }
    } else {
      // Sin red: encolar
      if (window.OfflineDB) {
        OfflineDB.addToPendingQueue({ type: 'delete_event', payload: { eventId: id } }).catch(() => {});
      }
      if (window.SyncManager) SyncManager.updateUI('offline');
    }

    const card = document.getElementById(`ev-${id}`);
    if (!card) return;

    const diaNum = card.dataset.diaNum;

    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(20px)';
    setTimeout(() => {
      card.remove();
      actualizarContador();

      if (diaNum) {
        const otros = document.querySelector(`.event-card[data-dia-num="${diaNum}"]`);
        if (!otros) {
          const cell = document.getElementById(`cal-day-${diaNum}`);
          const ind  = cell?.querySelector('.event-indicator');
          if (ind) ind.remove();
        }
      }
    }, 220);
  },

  /** Filtrar eventos por día al hacer clic en el calendario */
  filtrarPorDia(diaNum) {
    const cell = document.getElementById(`cal-day-${diaNum}`);
    if (!cell) return;
    
    const isSelected = cell.classList.contains('selected-day');
    
    // Quitar selección a todos
    document.querySelectorAll('.cal-cell').forEach(c => c.classList.remove('selected-day'));
    
    const cards = document.querySelectorAll('.event-card');
    const emptyCont = document.getElementById('emptyEventsContainer');
    const emptyText = document.getElementById('emptyEventsText');
    const btnRegistrar = document.getElementById('btnRegistrarAhora');
    
    if (isSelected) {
      cell.classList.remove('selected-day');
      cards.forEach(c => c.style.display = 'block');
      
      if (cards.length === 0) {
        if (emptyCont) {
          emptyCont.style.display = 'block';
          emptyText.textContent = 'Sin eventos registrados';
          if (btnRegistrar) btnRegistrar.style.display = 'none';
          AgendaModule.selectedDate = null;
        }
      } else {
        if (emptyCont) emptyCont.style.display = 'none';
      }
    } else {
      // Seleccionar este y filtrar
      cell.classList.add('selected-day');
      let visibles = 0;
      cards.forEach(c => {
        const d = parseInt(c.dataset.diaNum, 10);
        const m = parseInt(c.dataset.mes, 10);
        const a = parseInt(c.dataset.anio, 10);
        if (d === diaNum && m === this.currentMonth && a === this.currentYear) {
          c.style.display = 'block';
          visibles++;
        } else {
          c.style.display = 'none';
        }
      });
      
      if (visibles === 0) {
        if (emptyCont) {
          emptyCont.style.display = 'block';
          emptyText.textContent = 'No hay eventos registrados en esta fecha';
          if (btnRegistrar) btnRegistrar.style.display = 'inline-block';
          
          const mesStr = (this.currentMonth + 1).toString().padStart(2, '0');
          const dStr = diaNum.toString().padStart(2, '0');
          AgendaModule.selectedDate = `${this.currentYear}-${mesStr}-${dStr}`;
        }
      } else {
        if (emptyCont) emptyCont.style.display = 'none';
      }
    }
  },

  selectedDate: null,

  abrirModalRegistro() {
    const modal = document.getElementById('newEventModal');
    if (!modal) return;
    
    document.getElementById('newEventTitle').value = '';
    document.getElementById('newEventTime').value = '';
    document.getElementById('newEventDesc').value = '';
    
    const dateInput = document.getElementById('newEventDate');
    if (this.selectedDate) {
      dateInput.value = this.selectedDate;
    } else {
      const mesStr = (this.currentMonth + 1).toString().padStart(2, '0');
      const dStr = new Date().getDate().toString().padStart(2, '0'); // might be invalid if month has fewer days, but ok for default
      dateInput.value = `${this.currentYear}-${mesStr}-${dStr}`;
    }
    
    modal.style.display = 'flex';
  },

  cerrarModalRegistro() {
    const modal = document.getElementById('newEventModal');
    if (modal) modal.style.display = 'none';
  },

  async guardarEventoManual() {
    const titulo = document.getElementById('newEventTitle').value.trim();
    const fecha  = document.getElementById('newEventDate').value;
    const hora   = document.getElementById('newEventTime').value;
    const desc   = document.getElementById('newEventDesc').value.trim();

    if (!titulo || !fecha || !hora) {
      alert('Por favor completa el título, fecha y horario.');
      return;
    }

    const diaNum = parseInt(fecha.split('-')[2], 10);
    const mesNum = parseInt(fecha.split('-')[1], 10) - 1; // 0-indexed
    const anioNum = parseInt(fecha.split('-')[0], 10);
    const autor  = document.getElementById('profileNameDisplay')?.textContent || 'Usuario';
    const MESES_NOMBRES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

    // Parsear hora para calcular la hora exacta del evento
    let horas = 12;
    let minutos = 0;
    if (hora) {
      const matchH = hora.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (matchH) {
        horas = parseInt(matchH[1], 10);
        minutos = matchH[2] ? parseInt(matchH[2], 10) : 0;
        const mer = matchH[3]?.toLowerCase();
        if (mer === 'pm' && horas < 12) horas += 12;
        if (mer === 'am' && horas === 12) horas = 0;
      }
    }
    const fechaExacta = new Date(anioNum, mesNum, diaNum, horas, minutos, 0);

    const evt = {
      titulo,
      dia:    `${diaNum} de ${MESES_NOMBRES[mesNum]} de ${anioNum}`,
      diaNum,
      mes:    mesNum,
      anio:   anioNum,
      hora,
      autor,
      fuente: 'manual',
      desc,
      fechaEvento: fechaExacta.toISOString(),
    };

    // Generar id temporal para optimistic update
    const tmpId = `local_${Date.now()}`;
    const evtLocal = {
      ...evt,
      _id:       tmpId,
      id:        tmpId,
      mes:       mesNum,
      anio:      anioNum,
      createdAt: new Date().toISOString(),
      pendingSync: true,
    };

    // 1. Guardar en IndexedDB y renderizar de inmediato (offline-first)
    if (window.OfflineDB) {
      await OfflineDB.saveEvents([evtLocal]).catch(() => {});
    }
    renderizarEvento(evtLocal, true);
    this.cerrarModalRegistro();

    // 2. Enviar al servidor o encolar si no hay red
    if (!window.SyncManager || SyncManager.isOnline()) {
      try {
        const res  = await fetch('/api/events', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(evt),
        });
        const data = await res.json();
        if (data.ok && data.data) {
          const realId = data.data._id;
          // Reemplazar en DOM
          const oldCard = document.getElementById(`ev-${tmpId}`);
          if (oldCard) {
            oldCard.id = `ev-${realId}`;
            const delBtn = oldCard.querySelector('.event-card-delete');
            if (delBtn) delBtn.setAttribute('onclick', `AgendaModule.eliminarEvento('${realId}')`);
          }
          // Actualizar IndexedDB
          if (window.OfflineDB) {
            await OfflineDB.deleteEvent(tmpId).catch(() => {});
            await OfflineDB.saveEvents([{ ...data.data, _id: realId }]).catch(() => {});
          }
        } else {
          alert('Error: ' + (data.error || 'No se pudo guardar'));
        }
      } catch (e) {
        // Red caîda a mitad — encolar para cuando haya conexión
        if (window.OfflineDB) {
          await OfflineDB.addToPendingQueue({
            type:  'create_event',
            tmpId,
            payload: evt,
          }).catch(() => {});
        }
        if (window.SyncManager) SyncManager.updateUI('offline');
      }
    } else {
      // Sin red: encolar directamente
      if (window.OfflineDB) {
        await OfflineDB.addToPendingQueue({
          type:  'create_event',
          tmpId,
          payload: evt,
        }).catch(() => {});
      }
      if (window.SyncManager) SyncManager.updateUI('offline');
      console.log('[Agenda] Evento encolado offline:', tmpId);
    }
  }
};

window.AgendaModule = AgendaModule;
initCalendarDOM();

/* ════════════════════════════════════════════════════════════════
   HELPER
════════════════════════════════════════════════════════════════ */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
