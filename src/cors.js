import { config } from './config.js';

const PREFLIGHT_MAX_AGE = '86400';
const ALLOWED_METHODS = 'GET, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type';

export function createCors(origins) {
  const allowed = new Set(origins);
  const allowAll = allowed.has('*');

  return function cors(req, res, next) {
    const origin = req.headers.origin;
    if (!origin || allowed.size === 0 || !(allowAll || allowed.has(origin))) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', allowAll ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Max-Age', PREFLIGHT_MAX_AGE);

    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.status(204).end();
      return;
    }

    next();
  };
}

export const cors = createCors(config.corsOrigins);
