import { execFile } from 'node:child_process';
import { config } from './config.js';
import { HttpError } from './errors.js';

const state = {
  available: null,
  version: null,
  detail: null,
  checkedAt: 0,
};

const MAX_BUFFER = 9 * 1024 * 1024;

function run(args, timeout) {
  return new Promise((resolve, reject) => {
    execFile(
      config.engineBin,
      args,
      {
        timeout,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
        env: process.env,
      },
      (error, stdout, stderr) => {
        if (error) {
          error.stdout = stdout;
          error.stderr = stderr;
          reject(error);
          return;
        }
        resolve({ stdout, stderr });
      },
    );
  });
}

function markUnavailable(error) {
  state.available = false;
  state.version = null;
  state.checkedAt = Date.now();
  if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
    state.detail = 'Lightpanda binary not found — using the HTTP fallback engine.';
  } else {
    state.detail = String((error && (error.stderr || error.message)) || 'Lightpanda is unavailable.')
      .trim()
      .slice(0, 240);
  }
}

export async function detectEngine(force = false) {
  if (!force && state.checkedAt && Date.now() - state.checkedAt < 5 * 60_000) {
    return getEngineInfo();
  }

  try {
    const result = await run(['version'], 5_000);
    const banner = `${result.stdout || ''}${result.stderr || ''}`.trim();
    state.available = true;
    state.version = banner.split('\n')[0].trim().slice(0, 120) || 'Lightpanda';
    state.detail = null;
    state.checkedAt = Date.now();
  } catch (error) {
    markUnavailable(error);
  }

  return getEngineInfo();
}

export function getEngineInfo() {
  return {
    engine: state.available ? 'lightpanda' : 'http',
    online: state.available === true,
    version: state.version,
    detail: state.detail,
    checkedAt: state.checkedAt ? new Date(state.checkedAt).toISOString() : null,
    fallback: state.available === false,
  };
}

function baseArgs(dump, { reader = false, maxBytes } = {}) {
  const args = [
    'fetch',
    '--dump',
    dump,
    '--log-level',
    'error',
    '--log-format',
    'pretty',
    '--wait-until',
    'networkidle',
    '--wait-ms',
    '5000',
    '--terminate-ms',
    '20000',
  ];

  if (maxBytes) args.push('--dump-max-bytes', String(maxBytes));
  if (reader) args.push('--strip-mode', 'clutter');
  args.push('__URL__');

  return args;
}

function minimalArgs(dump, { reader = false } = {}) {
  const args = ['fetch', '--dump', dump, '--log-level', 'error'];
  if (reader) args.push('--strip-mode', 'clutter');
  args.push('__URL__');
  return args;
}

function looksLikeFlagError(error) {
  const text = String((error && error.stderr) || (error && error.message) || '').toLowerCase();
  return /unknown|unrecognized|invalid option|invalid argument|not recognized/.test(text);
}

async function runDump(args, url, timeout) {
  const finalArgs = args.map((arg) => (arg === '__URL__' ? url : arg));
  const result = await run(finalArgs, timeout);
  const output = String(result.stdout || '').trim();

  if (!output) {
    throw new HttpError(502, 'The page came back empty.', {
      engine: 'lightpanda',
      stderr: String(result.stderr || '').trim().slice(0, 400),
    });
  }

  return output;
}

async function fetchWithEngine(url, { dump, reader, maxBytes, timeout }) {
  const primary = baseArgs(dump, { reader, maxBytes });

  try {
    return await runDump(primary, url, timeout);
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
      markUnavailable(error);
      throw error;
    }

    if (!looksLikeFlagError(error)) {
      throw error;
    }

    const fallback = minimalArgs(dump, { reader });
    return runDump(fallback, url, timeout);
  }
}

export async function fetchMarkdown(url) {
  if (state.available === false) {
    throw new HttpError(503, 'The Lightpanda engine is not available.');
  }

  try {
    return await fetchWithEngine(url, {
      dump: 'markdown',
      reader: true,
      maxBytes: config.maxReaderBytes,
      timeout: config.readerTimeoutMs,
    });
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
      markUnavailable(error);
    }
    throw error;
  }
}

function decodeBody(buffer, contentType) {
  const match = /charset\s*=\s*["']?([^;"'\s]+)/i.exec(contentType || '');
  const charset = match ? match[1] : 'utf-8';
  try {
    return new TextDecoder(charset).decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

async function fetchNative(url, { timeout, maxBytes }) {
  let response;
  try {
    response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeout),
      headers: {
        'user-agent': config.userAgent,
        accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
  } catch (error) {
    if (error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new HttpError(504, 'The site took too long to respond.');
    }
    throw new HttpError(502, 'The site could not be reached.', {
      engine: 'http',
      reason: String((error && error.message) || error).slice(0, 240),
    });
  }

  if (!response.ok) {
    throw new HttpError(
      response.status === 404 ? 404 : 502,
      `The site returned HTTP ${response.status}.`,
      { engine: 'http' },
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType && !/text\/html|application\/xhtml\+xml/i.test(contentType)) {
    throw new HttpError(415, `This page is ${contentType.split(';')[0]}, which the viewer cannot render.`);
  }

  const limit = maxBytes;

  const reader = response.body && response.body.getReader();
  if (!reader) {
    const text = await response.text();
    return text.slice(0, maxBytes);
  }

  const chunks = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    chunks.push(value);
    if (total >= limit) {
      try {
        await reader.cancel();
      } catch {
        /* ignore */
      }
      break;
    }
  }

  const merged = new Uint8Array(Math.min(total, limit));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= merged.length) break;
    const slice = chunk.subarray(0, Math.min(chunk.length, merged.length - offset));
    merged.set(slice, offset);
    offset += slice.length;
  }

  return decodeBody(merged, contentType);
}

function validateHtml(html, url) {
  if (!html || !/<(?:!doctype|html|head|body)\b/i.test(html)) {
    throw new HttpError(502, 'The page did not return readable HTML.', { url });
  }
  return html;
}

export async function fetchRawHtml(url, { timeout = config.pageTimeoutMs } = {}) {
  let engineError = null;

  if (state.available !== false) {
    try {
      const html = await fetchWithEngine(url, {
        dump: 'html',
        reader: false,
        maxBytes: config.maxPageBytes,
        timeout,
      });
      return { html: validateHtml(html, url), engine: 'lightpanda' };
    } catch (error) {
      engineError = error;
      if (error && (error.code === 'ENOENT' || error.code === 'EACCES')) {
        markUnavailable(error);
      }
    }
  }

  try {
    const html = await fetchNative(url, {
      timeout: Math.min(timeout, 18_000),
      maxBytes: config.maxPageBytes,
    });
    return {
      html: validateHtml(html, url),
      engine: 'http',
      fallbackReason: state.detail || (engineError && engineError.message) || null,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      if (engineError && !error.details) {
        error.details = {
          engine: 'lightpanda',
          reason: String(engineError.message || engineError).slice(0, 240),
        };
      }
      throw error;
    }
    throw new HttpError(502, 'This page could not be loaded.', {
      engine: 'http',
      reason: String((error && error.message) || error).slice(0, 240),
    });
  }
}

export const __test = { markUnavailable, state };
