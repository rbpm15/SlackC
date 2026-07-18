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
   MINI CALENDARIO (estado vacío profesional)
════════════════════════════════════════════════════════════════ */
function crearMiniCalendario() {
  const hoy     = new Date();
  const anio    = hoy.getFullYear();
  const mes     = hoy.getMonth();
  const diaHoy  = hoy.getDate();

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
    const esHoy = d === diaHoy;
    celdas += `<span class="cal-cell${esHoy ? ' today' : ''}" id="cal-day-${d}" onclick="window.AgendaModule.filtrarPorDia(${d})">${d}</span>`;
  }

  return `
    <div class="mini-calendar">
      <div class="mini-cal-header">
        <span>${MESES_ES[mes]} ${anio}</span>
      </div>
      <div class="mini-cal-days">
        ${DIAS_CORTO.map(d => `<span class="cal-day-label">${d}</span>`).join('')}
      </div>
      <div class="mini-cal-grid">${celdas}</div>
    </div>
    <div style="margin: 16px 20px 8px; font-size: 14px; font-weight: 700; color: var(--text-main); border-bottom: 1px solid var(--border-color); padding-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
      <span>Próximos eventos</span>
      <button onclick="AgendaModule.abrirModalRegistro()" title="Registrar nuevo evento" style="background:none; border:none; color:var(--slack-primary); cursor:pointer; font-size:20px; font-weight:bold; display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:4px; line-height:1; transition:background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)';" onmouseout="this.style.background='none';">+</button>
    </div>
    <div id="emptyEventsContainer" style="display: none; text-align: center; padding: 20px 10px;">
      <p id="emptyEventsText" class="mini-cal-empty-text" style="display:block; margin-bottom: 12px;">Sin eventos registrados</p>
      <button id="btnRegistrarAhora" class="name-modal-btn" style="display: none; margin: 0 auto; padding: 6px 12px; font-size: 13px; width: auto;" onclick="AgendaModule.abrirModalRegistro()">Registrar ahora</button>
    </div>
  `;
}

// Insertar calendario al arrancar
agendaBodyEl.innerHTML = crearMiniCalendario();

/* ════════════════════════════════════════════════════════════════
   CONTADOR
════════════════════════════════════════════════════════════════ */
function actualizarContador() {
  const total = document.querySelectorAll('.event-card').length;
  agendaCountEl.textContent = `${total} evento${total !== 1 ? 's' : ''}`;

  // Si no hay eventos, asegurarse de que el calendario exista y mostrar el texto vacío
  if (total === 0) {
    if (!agendaBodyEl.querySelector('.mini-calendar')) {
      agendaBodyEl.innerHTML = crearMiniCalendario();
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
   RENDERIZAR TARJETA DE EVENTO
════════════════════════════════════════════════════════════════ */
function renderizarEvento(evento, animado = true) {
  const evId = `ev-${evento.id}`;
  if (document.getElementById(evId)) return;

  const horaCreado = new Date(evento.createdAt).toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
  });

  const fuenteHtml = evento.fuente === 'n8n'
    ? `<span class="event-tag src-n8n">⚡ n8n</span>`
    : `<span class="event-tag src-local">🤖 IA</span>`;

  const autorHtml = evento.autor
    ? `<span class="event-tag autor-tag">👤 ${escapeHtml(evento.autor)}</span>`
    : '';

  const card = document.createElement('div');
  card.id        = evId;
  card.className = 'event-card' + (animado ? ' anim-slide-right' : '');
  card.dataset.diaNum = evento.diaNum || '';

  card.innerHTML = `
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
    <div class="event-card-footer">Detectado a las ${horaCreado}</div>
  `;

  agendaBodyEl.appendChild(card);
  actualizarContador();

  // Marcar punto en el calendario si tenemos día numérico
  if (evento.diaNum) {
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

  /** Llamado por app.js cuando el servidor confirma un evento via socket */
  async recibirEventoSocket(ev) {
    const evento = {
      id:        ev._id || ev.id,
      titulo:    ev.titulo,
      dia:       ev.dia,
      diaNum:    ev.diaNum,
      hora:      ev.hora,
      autor:     ev.autor || '',
      fuente:    ev.fuente || 'local',
      createdAt: ev.createdAt || new Date().toISOString(),
    };

    // Si n8n está activo, también enviar al webhook
    if (n8nActivo) {
      const ok = await enviarAN8n(evento);
      if (ok) evento.fuente = 'n8n';
    }

    renderizarEvento(evento, true);
  },

  /** Cargar historial de eventos desde la API al iniciar */
  cargarDesdeServidor(eventos = []) {
    [...eventos].reverse().forEach(ev => renderizarEvento({
      id:        ev._id || ev.id,
      titulo:    ev.titulo,
      dia:       ev.dia,
      diaNum:    ev.diaNum,
      hora:      ev.hora,
      autor:     ev.autor || '',
      fuente:    ev.fuente || 'local',
      createdAt: ev.createdAt,
    }, false));
  },

  /** Eliminar tarjeta del DOM y DB */
  async eliminarEvento(id) {
    if (!confirm('¿Seguro que deseas eliminar este evento?')) return;
    
    try {
      await fetch(`/api/events/${id}`, { method: 'DELETE' });
    } catch (e) {
      console.error('Error eliminando evento', e);
    }
    
    const card = document.getElementById(`ev-${id}`);
    if (!card) return;
    
    // Obtener día para saber si tenemos que quitar el puntito
    const diaNum = card.dataset.diaNum;
    
    card.style.transition = 'opacity 0.2s, transform 0.2s';
    card.style.opacity    = '0';
    card.style.transform  = 'translateX(20px)';
    setTimeout(() => {
      card.remove();
      actualizarContador();
      
      // Quitar puntito del calendario si ya no hay eventos ese día
      if (diaNum) {
        const otros = document.querySelector(`.event-card[data-dia-num="${diaNum}"]`);
        if (!otros) {
          const cell = document.getElementById(`cal-day-${diaNum}`);
          const ind = cell?.querySelector('.event-indicator');
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
        if (c.dataset.diaNum == diaNum) {
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
          
          const hoy = new Date();
          const mes = (hoy.getMonth() + 1).toString().padStart(2, '0');
          const d = diaNum.toString().padStart(2, '0');
          AgendaModule.selectedDate = `${hoy.getFullYear()}-${mes}-${d}`;
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
      const hoy = new Date();
      const mes = (hoy.getMonth() + 1).toString().padStart(2, '0');
      const d = hoy.getDate().toString().padStart(2, '0');
      dateInput.value = `${hoy.getFullYear()}-${mes}-${d}`;
    }
    
    modal.style.display = 'flex';
  },

  cerrarModalRegistro() {
    const modal = document.getElementById('newEventModal');
    if (modal) modal.style.display = 'none';
  },

  async guardarEventoManual() {
    const titulo = document.getElementById('newEventTitle').value.trim();
    const fecha = document.getElementById('newEventDate').value;
    const hora = document.getElementById('newEventTime').value;
    const desc = document.getElementById('newEventDesc').value.trim();
    
    if (!titulo || !fecha || !hora) {
      alert('Por favor completa el título, fecha y horario.');
      return;
    }
    
    const diaNum = parseInt(fecha.split('-')[2], 10);
    const autor = document.getElementById('profileNameDisplay')?.textContent || 'Usuario';
    
    const evt = {
      titulo: titulo,
      dia: `Día ${diaNum}`,
      diaNum: diaNum,
      hora: hora,
      autor: autor,
      fuente: 'local',
      desc: desc
    };
    
    try {
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(evt)
      });
      const data = await res.json();
      if (data.ok) {
        this.cerrarModalRegistro();
      } else {
        alert('Error: ' + data.error);
      }
    } catch (e) {
      alert('Error al guardar el evento.');
    }
  }
};

window.AgendaModule = AgendaModule;

/* ════════════════════════════════════════════════════════════════
   HELPER
════════════════════════════════════════════════════════════════ */
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
