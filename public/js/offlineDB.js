/**
 * offlineDB.js
 * Motor de almacenamiento local para SlacIA usando IndexedDB.
 * Proporciona acceso offline a mensajes, eventos, canales y
 * una cola de operaciones pendientes para sincronizar al reconectar.
 *
 * Estructura de la BD:
 *   slacia_offline (v2)
 *   ├── messages   { keyPath: '_id', index: channelId }
 *   ├── events     { keyPath: '_id' }
 *   ├── channels   { keyPath: '_id' }
 *   └── pending    { keyPath: 'localId', autoIncrement: true }
 */
'use strict';

const OfflineDB = (() => {
  const DB_NAME    = 'slacia_offline';
  const DB_VERSION = 2;
  let _db = null;

  /* ──────────────────────────────────────────────
     INICIALIZACIÓN
  ────────────────────────────────────────────── */
  function init() {
    return new Promise((resolve, reject) => {
      if (_db) { resolve(_db); return; }

      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Messages store — índice secundario por channelId
        if (!db.objectStoreNames.contains('messages')) {
          const ms = db.createObjectStore('messages', { keyPath: '_id' });
          ms.createIndex('channelId', 'channelId', { unique: false });
        }

        // Events store
        if (!db.objectStoreNames.contains('events')) {
          db.createObjectStore('events', { keyPath: '_id' });
        }

        // Channels store
        if (!db.objectStoreNames.contains('channels')) {
          db.createObjectStore('channels', { keyPath: '_id' });
        }

        // Pending queue — autoIncrement para prioridad FIFO
        if (!db.objectStoreNames.contains('pending')) {
          const ps = db.createObjectStore('pending', { keyPath: 'localId', autoIncrement: true });
          ps.createIndex('type', 'type', { unique: false });
        }
      };

      req.onsuccess = (e) => {
        _db = e.target.result;
        console.log('[OfflineDB] Inicializado correctamente.');
        resolve(_db);
      };

      req.onerror = (e) => {
        console.error('[OfflineDB] Error al abrir la BD:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  /* ──────────────────────────────────────────────
     HELPER: transacción genérica
  ────────────────────────────────────────────── */
  function _tx(storeName, mode = 'readonly') {
    return _db.transaction(storeName, mode).objectStore(storeName);
  }

  function _req(idbRequest) {
    return new Promise((resolve, reject) => {
      idbRequest.onsuccess = () => resolve(idbRequest.result);
      idbRequest.onerror   = () => reject(idbRequest.error);
    });
  }

  function _getAllFromIndex(storeName, indexName, value) {
    return new Promise((resolve, reject) => {
      const store = _tx(storeName);
      const index = store.index(indexName);
      const req   = index.getAll(value);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  }

  /* ──────────────────────────────────────────────
     MENSAJES
  ────────────────────────────────────────────── */
  /**
   * Guarda (upsert) una lista de mensajes de un canal.
   * Elimina primero los anteriores del canal para evitar stale data.
   */
  async function saveMessages(channelId, messages = []) {
    await init();
    // Primero borrar los mensajes existentes del canal
    const existing = await getMessages(channelId);
    const store = _tx('messages', 'readwrite');
    for (const m of existing) {
      store.delete(m._id);
    }
    // Luego insertar los nuevos
    const store2 = _db.transaction('messages', 'readwrite').objectStore('messages');
    for (const m of messages) {
      const id = (m._id || m.id || '').toString();
      if (id) store2.put({ ...m, _id: id, channelId: channelId.toString() });
    }
    return new Promise((resolve, reject) => {
      store2.transaction.oncomplete = resolve;
      store2.transaction.onerror    = (e) => reject(e.target.error);
    });
  }

  /** Agrega o actualiza un único mensaje en la BD local */
  async function upsertMessage(msg, channelId) {
    await init();
    const id = (msg._id || msg.id || '').toString();
    if (!id) return;
    const store = _tx('messages', 'readwrite');
    return _req(store.put({ ...msg, _id: id, channelId: channelId.toString() }));
  }

  /** Lee todos los mensajes de un canal ordenados por createdAt */
  async function getMessages(channelId) {
    await init();
    const msgs = await _getAllFromIndex('messages', 'channelId', channelId.toString());
    return msgs.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  }

  /** Elimina un mensaje del store local */
  async function deleteMessage(msgId) {
    await init();
    const store = _tx('messages', 'readwrite');
    return _req(store.delete(msgId.toString()));
  }

  /* ──────────────────────────────────────────────
     EVENTOS DE AGENDA
  ────────────────────────────────────────────── */
  /** Guarda (merge) una lista de eventos — no borra los existentes */
  async function saveEvents(events = []) {
    await init();
    const store = _tx('events', 'readwrite');
    for (const ev of events) {
      const id = (ev._id || ev.id || '').toString();
      if (id) store.put({ ...ev, _id: id });
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = resolve;
      store.transaction.onerror    = (e) => reject(e.target.error);
    });
  }

  /** Sincroniza y reemplaza la lista de eventos locales con los válidos del servidor */
  async function syncEvents(events = []) {
    await init();
    const store = _tx('events', 'readwrite');
    await _req(store.clear());
    for (const ev of events) {
      const id = (ev._id || ev.id || '').toString();
      if (id) store.put({ ...ev, _id: id });
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = resolve;
      store.transaction.onerror    = (e) => reject(e.target.error);
    });
  }

  /** Lee todos los eventos locales */
  async function getEvents() {
    await init();
    const store = _tx('events');
    return _req(store.getAll());
  }

  /** Elimina un evento del store local */
  async function deleteEvent(evId) {
    await init();
    const store = _tx('events', 'readwrite');
    return _req(store.delete(evId.toString()));
  }

  /* ──────────────────────────────────────────────
     CANALES
  ────────────────────────────────────────────── */
  async function saveChannels(channels = []) {
    await init();
    const store = _tx('channels', 'readwrite');
    for (const c of channels) {
      const id = (c._id || c.id || '').toString();
      if (id) store.put({ ...c, _id: id });
    }
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = resolve;
      store.transaction.onerror    = (e) => reject(e.target.error);
    });
  }

  async function getChannels() {
    await init();
    const store = _tx('channels');
    return _req(store.getAll());
  }

  /* ──────────────────────────────────────────────
     COLA DE PENDIENTES (Sync Queue)
  ────────────────────────────────────────────── */
  /**
   * Formato de una operación pendiente:
   * {
   *   localId: number (autoIncrement),
   *   type: 'send_message' | 'create_event' | 'delete_event' | 'react_message' | 'delete_message',
   *   payload: { ... },
   *   tmpId: string,    // ID temporal generado en el cliente
   *   createdAt: ISO,
   *   retries: 0
   * }
   */
  async function addToPendingQueue(operation) {
    await init();
    const store = _tx('pending', 'readwrite');
    return _req(store.add({
      ...operation,
      createdAt: new Date().toISOString(),
      retries:   0,
    }));
  }

  async function getPendingQueue() {
    await init();
    const store = _tx('pending');
    return _req(store.getAll());
  }

  async function removeFromPendingQueue(localId) {
    await init();
    const store = _tx('pending', 'readwrite');
    return _req(store.delete(localId));
  }

  async function incrementRetries(localId, currentRetries) {
    await init();
    const store = _tx('pending', 'readwrite');
    const item  = await _req(store.get(localId));
    if (item) {
      item.retries = (item.retries || 0) + 1;
      return _req(_tx('pending', 'readwrite').put(item));
    }
  }

  async function clearPendingQueue() {
    await init();
    const store = _tx('pending', 'readwrite');
    return _req(store.clear());
  }

  /** Cuántos items pendientes hay en la cola */
  async function getPendingCount() {
    await init();
    const store = _tx('pending');
    return _req(store.count());
  }

  /* ──────────────────────────────────────────────
     API PÚBLICA
  ────────────────────────────────────────────── */
  return {
    init,
    // Mensajes
    saveMessages,
    upsertMessage,
    getMessages,
    deleteMessage,
    // Eventos
    saveEvents,
    syncEvents,
    getEvents,
    deleteEvent,
    // Canales
    saveChannels,
    getChannels,
    // Cola de pendientes
    addToPendingQueue,
    getPendingQueue,
    removeFromPendingQueue,
    incrementRetries,
    clearPendingQueue,
    getPendingCount,
  };
})();

window.OfflineDB = OfflineDB;
