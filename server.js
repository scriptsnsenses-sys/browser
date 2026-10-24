import compression from 'compression';
import express from 'express';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TTLCache } from './src/cache.js';
import { config } from './src/config.js';
import { cors } from './src/cors.js';
import { detectEngine, fetchRawHtml, getEngineInfo } from './src/engine.js';
import { renderErrorPage } from './src/errorPage.js';
import { HttpError, messageOf, statusOf } from './src/errors.js';
import { preparePage } from './src/proxy.js';
import { isLimited, rateLimit } from './src/rateLimit.js';
import { buildReader } from './src/reader.js';
import { suggest } from './src/suggest.js';
import { assertPublicUrl, normalizeUrl } from './src/urls.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'));

const pageCache = new TTLCache({ max: 28, ttlMs: 3 * 60_000 });
const readerCache = new TTLCache({ max: 30, ttlMs: 5 * 60_000 });

const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(compression());

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // /p is meant to be framed by the DG Brows viewer, including from a
  // separately hosted frontend, so it skips the app-shell frame and CSP guards.
  if (req.path !== '/p') {
    res.setHeader('Content-Security-Policy', APP_CSP);
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }

  next();
});

app.use(cors);

function logRequest(req, res, startedAt, extra = '') {
  const elapsed = Date.now() - startedAt;
  const suffix = extra ? ` ${extra}` : '';
  console.log(`${req.method} ${req.path} ${res.statusCode} ${elapsed}ms${suffix}`);
}

function detailOf(error) {
  if (!error || !error.details) return null;

  if (typeof error.details === 'string') return error.details;

  const parts = [];
  if (error.details.engine) parts.push(error.details.engine);
  if (error.details.reason) parts.push(error.details.reason);
  if (error.details.stderr) parts.push(error.details.stderr);
  if (error.details.url) parts.push(error.details.url);

  return parts.filter(Boolean).join(' · ') || null;
}

function sendErrorPage(res, status, url, error, title = 'This page could not be opened') {
  if (res.headersSent) return;
  res.status(status).type('html').send(
    renderErrorPage({
      status,
      url,
      title,
      message: messageOf(error),
      detail: detailOf(error),
    }),
  );
}

app.get('/healthz', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ ok: true, service: 'dg-brows', version: pkg.version, uptime: process.uptime() });
});

app.get('/api/health', async (req, res) => {
  if (req.query.refresh === '1') await detectEngine(true);
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    service: 'dg-brows',
    version: pkg.version,
    uptime: Math.round(process.uptime()),
    engine: getEngineInfo(),
  });
});

app.get('/api/suggest', rateLimit({ max: 240 }), async (req, res) => {
  if (isLimited(req)) {
    res.status(429).json({ suggestions: [] });
    return;
  }

  const query = typeof req.query.q === 'string' ? req.query.q : '';
  try {
    const suggestions = await suggest(query);
    res.setHeader('Cache-Control', 'private, max-age=60');
    res.json({ suggestions });
  } catch (error) {
    res.status(200).json({ suggestions: [] });
  }
});

app.get('/api/reader', rateLimit({ max: 40 }), async (req, res) => {
  const startedAt = Date.now();

  if (isLimited(req)) {
    res.status(429).json({ error: 'You are reading faster than the gold can keep up. Try again in a minute.' });
    return;
  }

  let url = '';
  try {
    url = normalizeUrl(req.query.url);
    await assertPublicUrl(new URL(url), { allowPrivate: config.allowPrivate });

    const cached = readerCache.get(url);
    if (cached) {
      res.setHeader('Cache-Control', 'private, max-age=120');
      res.json({ ...cached, cached: true });
      logRequest(req, res, startedAt, 'cache');
      return;
    }

    const reader = await buildReader(url);
    readerCache.set(url, reader);
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.json(reader);
    logRequest(req, res, startedAt, reader.engine);
  } catch (error) {
    const status = statusOf(error, 422);
    res.status(status).json({ error: messageOf(error), url });
    logRequest(req, res, startedAt, `reader error`);
  }
});

app.get('/p', rateLimit({ max: 120 }), async (req, res) => {
  const startedAt = Date.now();

  if (isLimited(req)) {
    res.setHeader('Cache-Control', 'no-store');
    sendErrorPage(
      res,
      429,
      '',
      new HttpError(429, 'You are opening pages faster than the gold can keep up. Give it a moment.'),
      'Too many pages at once',
    );
    logRequest(req, res, startedAt, 'limited');
    return;
  }

  let url = '';
  try {
    url = normalizeUrl(req.query.url);
    await assertPublicUrl(new URL(url), { allowPrivate: config.allowPrivate });

    const cached = pageCache.get(url);
    if (cached) {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-DG-Engine', cached.engine);
      res.type('html').send(cached.html);
      logRequest(req, res, startedAt, `${cached.engine} cache`);
      return;
    }

    const page = await fetchAndPrepare(url);
    pageCache.set(url, page);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-DG-Engine', page.engine);
    res.type('html').send(page.html);
    logRequest(req, res, startedAt, page.engine);
  } catch (error) {
    const status = statusOf(error, 502);
    res.setHeader('Cache-Control', 'no-store');
    sendErrorPage(res, status, url, error);
    logRequest(req, res, startedAt, 'error');
  }
});

async function fetchAndPrepare(url) {
  const page = await fetchRawHtml(url);
  return {
    html: preparePage(page.html, url),
    engine: page.engine,
  };
}

const publicDir = path.join(here, 'public');

app.use(
  express.static(publicDir, {
    extensions: ['html'],
    setHeaders(res, filePath) {
      if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
        res.setHeader('Cache-Control', 'no-cache');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    },
  }),
);

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.redirect('/');
});

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  console.error('[dg-brows]', error);
  const status = statusOf(error, 500);
  if (req.path.startsWith('/api/')) {
    res.status(status).json({ error: messageOf(error, 'Unexpected error') });
    return;
  }
  res.status(status).type('text').send(messageOf(error, 'Unexpected error'));
});

const server = app.listen(config.port, config.host, () => {
  console.log(`DG Brows listening on http://${config.host}:${config.port}`);
  detectEngine(true).then((info) => {
    if (info.online) {
      console.log(`Engine: ${info.version || 'Lightpanda'} online`);
    } else {
      console.warn(`Engine: HTTP fallback — ${info.detail}`);
    }
  });
});

function shutdown(signal) {
  console.log(`DG Brows received ${signal}, closing.`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
