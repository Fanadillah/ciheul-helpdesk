import { session } from './api.js';

let socket = null;
let connected = false;
let statusListeners = new Set();
const listeners = new Map();
let loadingPromise = null;

function loadClient() {
  if (window.io) return Promise.resolve(window.io);
  if (loadingPromise) return loadingPromise;
  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/socket.io/socket.io.js';
    script.async = true;
    script.onload = () => {
      if (window.io) resolve(window.io);
      else {
        loadingPromise = null;
        reject(new Error('Socket client tidak tersedia'));
      }
    };
    script.onerror = () => {
      loadingPromise = null;
      reject(new Error('Gagal memuat socket client'));
    };
    document.head.appendChild(script);
  });
  return loadingPromise;
}

export function isConnected() {
  return connected;
}

export function onStatus(fn) {
  statusListeners.add(fn);
  fn(connected);
  return () => statusListeners.delete(fn);
}

function emitStatus() {
  statusListeners.forEach((fn) => {
    try { fn(connected); } catch { /* ignore */ }
  });
}

export async function connectSocket() {
  if (socket) return socket;
  const io = await loadClient();
  socket = io('/', {
    auth: { token: session.token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 700,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => { connected = true; emitStatus(); });
  socket.on('disconnect', () => { connected = false; emitStatus(); });
  socket.on('connect_error', () => { connected = false; emitStatus(); });

  [
    'message:new', 'message:read', 'ticket:update', 'ticket:created', 'typing',
    'notification:new', 'presence:update', 'sla:breach',
  ].forEach((event) => {
    socket.on(event, (payload) => {
      const set = listeners.get(event);
      if (!set) return;
      set.forEach((fn) => {
        try { fn(payload); } catch (err) { console.error('[socket handler]', event, err); }
      });
    });
  });
  return socket;
}

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event) && listeners.get(event).delete(fn);
}

export function emitAck(event, payload, timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (!socket || !connected) {
      reject(new Error('Socket belum terhubung'));
      return;
    }
    socket.timeout(timeout).emit(event, payload, (err, ack) => {
      if (err) reject(new Error('Waktu pengiriman habis'));
      else resolve(ack);
    });
  });
}

export function emit(event, payload) {
  if (socket && connected) socket.emit(event, payload);
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    connected = false;
    emitStatus();
  }
}
