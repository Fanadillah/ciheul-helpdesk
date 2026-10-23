'use strict';

class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = 'Autentikasi diperlukan') => new HttpError(401, msg);
const forbidden = (msg = 'Tidak memiliki akses') => new HttpError(403, msg);
const notFound = (msg = 'Data tidak ditemukan') => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function errorMiddleware(err, req, res, _next) {
  const status = err.status || 500;
  if (status >= 500) {
    // keep the stack in the server log, never leak it to clients
    console.error('[error]', err);
  }
  res.status(status).json({
    error: {
      message: status >= 500 ? 'Terjadi kesalahan pada server' : err.message,
      details: err.details || undefined,
    },
  });
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  asyncHandler,
  errorMiddleware,
};
