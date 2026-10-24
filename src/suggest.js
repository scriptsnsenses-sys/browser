import { TTLCache } from './cache.js';
import { config } from './config.js';

const cache = new TTLCache({ max: 250, ttlMs: 5 * 60_000 });

function parseSuggestions(payload) {
  if (!Array.isArray(payload)) return [];

  if (payload.length > 1 && Array.isArray(payload[1])) {
    return payload[1]
      .map((item) => (typeof item === 'string' ? item : item && item.phrase))
      .filter((item) => typeof item === 'string');
  }

  return payload
    .map((item) => (typeof item === 'string' ? item : item && item.phrase))
    .filter((item) => typeof item === 'string');
}

async function fetchJson(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(3_000),
    headers: {
      'user-agent': config.userAgent,
      accept: 'application/json, text/javascript, */*; q=0.01',
    },
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

export async function suggest(query) {
  const normalized = String(query || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 160);

  if (!normalized) return [];

  const cached = cache.get(normalized);
  if (cached) return cached;

  let suggestions = [];

  try {
    const payload = await fetchJson(
      `https://duckduckgo.com/ac/?q=${encodeURIComponent(normalized)}&type=list`,
    );
    suggestions = parseSuggestions(payload);
  } catch {
    try {
      const payload = await fetchJson(
        `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(normalized)}`,
      );
      suggestions = parseSuggestions(payload);
    } catch {
      suggestions = [];
    }
  }

  const unique = [...new Set(suggestions.map((item) => item.trim()).filter(Boolean))].slice(0, 8);
  cache.set(normalized, unique);
  return unique;
}
