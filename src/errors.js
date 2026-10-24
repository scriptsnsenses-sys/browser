export class HttpError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export function statusOf(error, fallback = 502) {
  const status = Number(error && error.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : fallback;
}

export function messageOf(error, fallback = 'Something went wrong.') {
  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim();
  }
  return fallback;
}
