import dns from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './errors.js';

const BLOCKED_HOSTS = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
]);

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.home.arpa', '.intranet'];

const dnsCache = new Map();
const DNS_TTL_MS = 60_000;
const MAX_URL_LENGTH = 4096;

export function normalizeUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new HttpError(400, 'Enter an address to open.');
  }

  let raw = input.trim();
  if (raw.length > MAX_URL_LENGTH) {
    throw new HttpError(414, 'That address is too long.');
  }

  if (!/^[a-z][a-z0-9+.-]*:/i.test(raw)) {
    raw = `https://${raw}`;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, 'That address is not valid.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new HttpError(400, 'Only http and https addresses can be opened.');
  }

  if (url.username || url.password) {
    throw new HttpError(400, 'Addresses with embedded credentials are not supported.');
  }

  if (!url.hostname) {
    throw new HttpError(400, 'That address has no host.');
  }

  return url.href;
}

export function isPrivateAddress(address) {
  if (!address || typeof address !== 'string') return true;

  if (net.isIPv4(address)) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
    const [a, b, c] = parts;

    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;

    return false;
  }

  if (net.isIPv6(address)) {
    const value = address.toLowerCase();

    if (value === '::' || value === '::1') return true;

    if (value.startsWith('::ffff:')) {
      const mapped = value.slice(7);
      if (net.isIPv4(mapped)) return isPrivateAddress(mapped);
      const pair = mapped.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (pair) {
        const hi = Number.parseInt(pair[1], 16);
        const lo = Number.parseInt(pair[2], 16);
        return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
      }
    }

    if (/^f[cd]/.test(value)) return true;
    if (/^fe[89ab]/.test(value)) return true;
    if (/^ff/.test(value)) return true;

    return false;
  }

  return true;
}

export async function assertPublicUrl(url, { allowPrivate = false } = {}) {
  if (allowPrivate) return;

  const host = url.hostname.toLowerCase().replace(/\.$/, '');

  if (!host || BLOCKED_HOSTS.has(host)) {
    throw new HttpError(403, 'That host is not available from DG Brows.');
  }

  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    throw new HttpError(403, 'That host is not available from DG Brows.');
  }

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) {
      throw new HttpError(403, 'Private and local addresses are blocked.');
    }
    return;
  }

  let cached = dnsCache.get(host);
  if (!cached || cached.expiresAt < Date.now()) {
    let records;
    try {
      records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
      throw new HttpError(502, `Could not resolve ${host}.`);
    }
    cached = { records, expiresAt: Date.now() + DNS_TTL_MS };
    dnsCache.set(host, cached);

    if (dnsCache.size > 400) {
      const oldest = dnsCache.keys().next().value;
      if (oldest) dnsCache.delete(oldest);
    }
  }

  if (!cached.records.length || cached.records.some((record) => isPrivateAddress(record.address))) {
    throw new HttpError(403, 'Private and local addresses are blocked.');
  }
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
