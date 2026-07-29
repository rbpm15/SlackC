/**
 * syncManager.js
 * Detecta el estado de la conexión de red (online/offline) y
 * procesa la cola de operaciones pendientes (IndexedDB) cuando se
 * restablece la conexión. Actualiza el badge visual de estado.
 *
 * Depende de: offlineDB.js (debe cargarse antes)
 */
'use strict';

const SyncManager = (() => {
  let _socket = null;
  let _isSyncing = false;
  const MAX_RETRIES = 3;

  /* ──────────────────────────────────────────────
     BADGE UI
  ────────────────────────────────────────────── */
  let _badge = null;
  let _badgeIcon = null;
  let _badgeText = null;
  let _hideTimer = null;

  function _createBadge() {
    if (document.getElementById('syncStatusBadge')) return;
    const badge = document.createElement('div');
    badge.id = 'syncStatusBadge';
    badge.className = 'sync-badge sync-badge--hidden';
    badge.innerHTML = `
      <span id="syncStatusIcon">📡</span>
      <span id="syncStatusText">Sin conexión</span>
    `;
    document.body.appendChild(badge);
    _badge    = badge;
    _badgeIcon = badge.querySelector('#syncStatusIcon');
    _badgeText = badge.querySelector('#syncStatusText');
  }

  /**
   * Actualiza el badge visual.
   * @param {'offline'|'syncing'|'online'|'hidden'} state
   */
  function updateUI(state) {
    if (!_badge) _createBadge();
    clearTimeout(_hideTimer);

    _badge.classList.remove(
      'sync-badge--offline',
      'sync-badge--syncing',
      'sync-badge--online',
      'sync-badge--hidden'
    );

    switch (state) {
      case 'offline':
        _badge.classList.add('sync-badge--offline');
        _badgeIcon.textContent = '📡';
        _badgeText.textContent = 'Sin conexión — guardando localmente';
        break;

      case 'syncing':
        _badge.classList.add('sync-badge--syncing');
        _badgeIcon.textContent = '🔄';
        _badgeText.textContent = 'Sincronizando…';
        break;

      case 'online':
        _badge.classList.add('sync-badge--online');
        _badgeIcon.textContent = '✅';
        _badgeText.textContent = 'Conectado';
        // Ocultar automáticamente tras 3 s
        _hideTimer = setTimeout(() => updateUI('hidden'), 3000);
        break;

      case 'hidden':
      default:
        _badge.classList.add('sync-badge--hidden');
        break;
    }
  }

  /* ──────────────────────────────────────────────
     ESTADO DE RED
  ────────────────────────────────────────────── */
  function isOnline() {
    return navigator.onLine;
  }

  /* ──────────────────────────────────────────────
     PROCESADOR DE COLA
  ────────────────────────────────────────────── */
  async function processQueue() {
    if (_isSyncing) return;
    _isSyncing = true;

    try {
      const queue = await OfflineDB.getPendingQueue();
      if (queue.length === 0) {
        updateUI('online');
        _isSyncing = false;
        return;
      }

      updateUI('syncing');
      console.log(`[SyncManager] Procesando ${queue.length} operación(es) pendiente(s)…`);

      for (const item of queue) {
        if (item.retries >= MAX_RETRIES) {
          console.warn('[SyncManager] Operación descartada tras máx. reintentos:', item);
          await OfflineDB.removeFromPendingQueue(item.localId);
          continue;
        }

        const ok = await _executeOperation(item);
        if (ok) {
          await OfflineDB.removeFromPendingQueue(item.localId);
          console.log(`[SyncManager] Operación sincronizada: ${item.type}`);
        } else {
          await OfflineDB.incrementRetries(item.localId, item.retries);
          console.warn(`[SyncManager] Falló la operación ${item.type} (intento ${item.retries + 1})`);
        }
      }

      // Verificar si quedaron pendientes
      const remaining = await OfflineDB.getPendingCount();
      updateUI(remaining > 0 ? 'syncing' : 'online');

    } catch (err) {
      console.error('[SyncManager] Error al procesar la cola:', err);
    } finally {
      _isSyncing = false;
    }
  }

  /**
   * Ejecuta una operación pendiente en el servidor.
   * Retorna `true` si tuvo éxito, `false` si falló.
   */
  async function _executeOperation(item) {
    try {
      switch (item.type) {

        // ── Enviar mensaje ───────────────────────────────
        case 'send_message': {
          const { channelId, autor, texto, tmpId, channelType } = item.payload;
          // Usamos el socket si está disponible y conectado
          if (_socket && _socket.connected) {
            _socket.emit('mensaje', {
              channelId,
              autor,
              texto,
              tmpId,
              channelType: channelType || 'channel',
            });
            return true;
          }
          // Fallback: REST API
          const res = await fetch('/api/messages', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ channelId, autor, texto, tmpId }),
          });
          return res.ok;
        }

        // ── Crear evento de agenda ───────────────────────
        case 'create_event': {
          const res = await fetch('/api/events', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(item.payload),
          });
          if (res.ok) {
            const data = await res.json();
            // Reemplazar el id temporal por el real de MongoDB en la BD local y en el DOM
            if (data.ok && data.data && item.tmpId) {
              const realId = data.data._id;
              const tmpId  = item.tmpId;
              // Actualizar DOM: cambiar el id del card
              const oldCard = document.getElementById(`ev-${tmpId}`);
              if (oldCard) {
                oldCard.id = `ev-${realId}`;
                const deleteBtn = oldCard.querySelector('.event-card-delete');
                if (deleteBtn) {
                  deleteBtn.setAttribute('onclick', `AgendaModule.eliminarEvento('${realId}')`);
                }
              }
              // Actualizar IndexedDB: borrar tmp, guardar real
              await OfflineDB.deleteEvent(tmpId);
              await OfflineDB.saveEvents([{ ...data.data, _id: realId }]);
            }
            return true;
          }
          return false;
        }

        // ── Eliminar evento ──────────────────────────────
        case 'delete_event': {
          const { eventId } = item.payload;
          const res = await fetch(`/api/events/${eventId}`, { method: 'DELETE' });
          return res.ok;
        }

        // ── Eliminar mensaje ─────────────────────────────
        case 'delete_message': {
          const { messageId } = item.payload;
          if (_socket && _socket.connected) {
            _socket.emit('eliminar_mensaje', { messageId });
            return true;
          }
          return false;
        }

        // ── Reaccionar a mensaje ─────────────────────────
        case 'react_message': {
          const { messageId, emoji, channelId } = item.payload;
          if (_socket && _socket.connected) {
            _socket.emit('reaccion', { messageId, emoji, channelId });
            return true;
          }
          return false;
        }

        default:
          console.warn('[SyncManager] Tipo de operación desconocida:', item.type);
          return true; // descartar
      }
    } catch (err) {
      console.error('[SyncManager] Excepción ejecutando operación:', err);
      return false;
    }
  }

  /* ──────────────────────────────────────────────
     INICIALIZACIÓN
  ────────────────────────────────────────────── */
  function init(socket) {
    _socket = socket;
    _createBadge();

    // Al conectar / reconectar
    const _onOnline = async () => {
      console.log('[SyncManager] Conexión restaurada. Procesando cola…');
      await processQueue();
    };

    const _onOffline = () => {
      console.log('[SyncManager] Conexión perdida.');
      updateUI('offline');
    };

    window.addEventListener('online',  _onOnline);
    window.addEventListener('offline', _onOffline);

    // También escuchar reconexión del socket
    if (_socket) {
      _socket.on('connect', () => {
        console.log('[SyncManager] Socket reconectado.');
        if (navigator.onLine) _onOnline();
      });
    }

    // Estado inicial
    if (!navigator.onLine) {
      updateUI('offline');
    }

    // Comprobar si quedaron pendientes de una sesión anterior
    OfflineDB.getPendingCount().then(count => {
      if (count > 0 && navigator.onLine) {
        console.log(`[SyncManager] ${count} operaciones pendientes de sesión anterior. Sincronizando…`);
        processQueue();
      }
    });
  }

  /* ──────────────────────────────────────────────
     API PÚBLICA
  ────────────────────────────────────────────── */
  return {
    init,
    isOnline,
    processQueue,
    updateUI,
  };
})();

window.SyncManager = SyncManager;
