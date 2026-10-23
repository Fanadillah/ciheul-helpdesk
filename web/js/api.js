const TOKEN_KEY = 'helpdesk_token';
const USER_KEY = 'helpdesk_user';

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

export const session = {
  get token() {
    return localStorage.getItem(TOKEN_KEY);
  },
  get user() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  set(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

let unauthorizedHandler = null;
export function onUnauthorized(fn) {
  unauthorizedHandler = fn;
}

export async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const init = { method: options.method || 'GET', headers };
  if (options.body !== undefined) {
    if (options.body instanceof FormData) {
      init.body = options.body;
    } else {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(options.body);
    }
  }
  if (session.token) headers.authorization = `Bearer ${session.token}`;

  let res;
  try {
    res = await fetch(path, init);
  } catch (err) {
    throw new ApiError('Tidak dapat terhubung ke server. Periksa koneksi Anda.', 0);
  }

  let data = null;
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }

  if (res.status === 401 && !path.includes('/api/auth/login')) {
    session.clear();
    if (unauthorizedHandler) unauthorizedHandler();
    throw new ApiError('Sesi berakhir. Silakan login kembali.', 401);
  }

  if (!res.ok) {
    const message = (data && data.error && data.error.message) || `Permintaan gagal (${res.status})`;
    throw new ApiError(message, res.status, data && data.error && data.error.details);
  }
  return data;
}
