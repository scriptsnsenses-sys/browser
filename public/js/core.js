export const STORAGE_KEY = 'dgbrows.state.v1';
export const APP_VERSION = '1.0.0';
export const MAX_HISTORY = 500;
export const MAX_TABS = 24;

export const SEARCH_ENGINES = {
  duckduckgo: { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=' },
  google: { name: 'Google', url: 'https://www.google.com/search?q=' },
  bing: { name: 'Bing', url: 'https://www.bing.com/search?q=' },
  brave: { name: 'Brave Search', url: 'https://search.brave.com/search?q=' },
};

export const SPACE_ACCENTS = ['#e8c47a', '#d9a44d', '#f0d49a', '#c9a86a', '#b8893b', '#e3b96b'];

export const DEFAULT_SETTINGS = {
  grain: true,
  glow: true,
  motion: true,
  sidebarCollapsed: false,
  searchEngine: 'duckduckgo',
  showGreeting: true,
  showQuickLinks: true,
  showRecents: true,
  readerFont: 'serif',
  readerSize: 19,
  readerWidth: 'normal',
};

export const READER_WIDTHS = {
  narrow: 600,
  normal: 700,
  wide: 840,
};

export const DEFAULT_QUICK_LINKS = [
  { title: 'Lightpanda', url: 'https://lightpanda.io/' },
  { title: 'DG Brows repo', url: 'https://github.com/scriptsnsenses-sys/browser' },
  { title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
  { title: 'Hacker News', url: 'https://news.ycombinator.com/' },
  { title: 'MDN', url: 'https://developer.mozilla.org/' },
  { title: 'Lobsters', url: 'https://lobste.rs/' },
];

export function uid(prefix = 'id') {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, '&#96;');
}

export function debounce(fn, wait = 200) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function safeHttpUrl(value, base) {
  if (!value) return '';
  try {
    const url = new URL(String(value).trim(), base);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href;
  } catch {
    return '';
  }
}

export function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function prettyUrl(url) {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return `${parsed.hostname.replace(/^www\./, '')}${path === '/' ? '' : path}`;
  } catch {
    return url || '';
  }
}

export function displayUrl(url) {
  return url || '';
}

export function pageTitleFrom(url) {
  const host = domainOf(url);
  if (!host) return 'New tab';
  return host;
}

export function faviconFor(url, size = 64) {
  const host = domainOf(url);
  if (!host) return '';
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

export function initialsOf(title, url) {
  const clean = String(title || '').trim();
  if (clean) {
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return clean.slice(0, 2).toUpperCase();
  }
  const host = domainOf(url);
  return host ? host.slice(0, 2).toUpperCase() : 'DG';
}

export function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return 'Still awake';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Good night';
}

export function formatToday(date = new Date()) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch {
    return date.toDateString();
  }
}

export function timeAgo(timestamp, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return 'now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(timestamp);
  } catch {
    return new Date(timestamp).toDateString();
  }
}

export function dayLabel(timestamp, now = new Date()) {
  const then = new Date(timestamp);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const value = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  const diff = Math.round((start - value) / 86_400_000);
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) {
    try {
      return new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(then);
    } catch {
      return 'Earlier';
    }
  }
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long', day: 'numeric' }).format(then);
  } catch {
    return 'Earlier';
  }
}

export function searchUrl(query, engineKey) {
  const engine = SEARCH_ENGINES[engineKey] || SEARCH_ENGINES.duckduckgo;
  return `${engine.url}${encodeURIComponent(query)}`;
}

export function looksLikeUrl(value) {
  const text = String(value || '').trim();
  if (!text || /\s/.test(text)) return false;
  if (/^https?:\/\//i.test(text)) return true;
  if (/^localhost(?::\d{2,5})?(?:[/?#].*)?$/i.test(text)) return true;
  if (/^(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:[/?#].*)?$/.test(text)) return true;
  if (/^\[[0-9a-f:]+\](?::\d{2,5})?(?:[/?#].*)?$/i.test(text)) return true;
  if (!/^[a-z0-9][a-z0-9.-]*(?::\d{2,5})?(?:[/?#].*)?$/i.test(text)) return false;
  if (!/[./]/.test(text)) return false;
  const hostPart = text.split(/[/?#]/)[0].split(':')[0];
  if (!hostPart.includes('.')) return false;
  if (/^\.|\.$/.test(hostPart)) return false;
  return true;
}

export function normalizeAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  let candidate = text;
  if (candidate.startsWith('//')) candidate = `https:${candidate}`;
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;
  return safeHttpUrl(candidate);
}

export function resolveInput(value, engineKey = 'duckduckgo') {
  const text = String(value || '').trim();
  if (!text) return { kind: 'empty' };

  const internal = /^(?:dgbrows|dg):\/\/([a-z-]+)\/?$/i.exec(text);
  if (internal) {
    const kind = internal[1].toLowerCase();
    if (['history', 'bookmarks', 'settings', 'shortcuts', 'start', 'home'].includes(kind)) {
      return { kind: 'internal', internal: kind };
    }
  }

  if (/^(mailto|tel):/i.test(text)) return { kind: 'external', url: text };

  if (/^https?:\/\//i.test(text)) {
    const url = safeHttpUrl(text);
    if (url) return { kind: 'url', url };
  }

  if (looksLikeUrl(text)) {
    const url = normalizeAddress(text);
    if (url) return { kind: 'url', url };
  }

  return { kind: 'search', query: text, url: searchUrl(text, engineKey) };
}

export function makeTab(url = '') {
  const id = uid('tab');
  const normalized = url ? safeHttpUrl(url) : '';
  return {
    id,
    title: normalized ? pageTitleFrom(normalized) : 'New tab',
    url: normalized,
    history: normalized ? [normalized] : [],
    index: normalized ? 0 : -1,
    favicon: normalized ? faviconFor(normalized) : '',
    readerOpen: false,
    readerData: null,
    readerError: null,
    readerLoading: false,
    loading: false,
    visitId: null,
  };
}

export function makeSpace(name, index = 0, links = []) {
  const tab = makeTab();
  const accent = SPACE_ACCENTS[index % SPACE_ACCENTS.length];
  return {
    id: uid('space'),
    name: name || `Space ${index + 1}`,
    accent,
    glyph: String(index + 1).padStart(2, '0'),
    tabs: [tab],
    activeTabId: tab.id,
  };
}

export function seedState() {
  const spaces = [
    makeSpace('The Gold Room', 0),
    makeSpace('Research', 1),
    makeSpace('Quiet', 2),
  ];
  return {
    version: 1,
    spaces,
    activeSpaceId: spaces[0].id,
    settings: { ...DEFAULT_SETTINGS },
    quickLinks: DEFAULT_QUICK_LINKS.map((link) => ({ id: uid('q'), ...link })),
    history: [],
    bookmarks: [],
    savedAt: Date.now(),
  };
}

function normalizeEntry(entry, prefix) {
  if (!entry || typeof entry !== 'object') return null;
  const url = safeHttpUrl(entry.url);
  if (!url) return null;
  return {
    id: typeof entry.id === 'string' ? entry.id : uid(prefix),
    url,
    title: String(entry.title || pageTitleFrom(url)).slice(0, 300),
    ts: Number.isFinite(entry.ts) ? entry.ts : Date.now(),
  };
}

export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.spaces)) return seedState();

  const spaces = raw.spaces
    .filter((space) => space && typeof space === 'object')
    .slice(0, 12)
    .map((space, index) => {
      const accent = /^#[0-9a-f]{6}$/i.test(space.accent || '')
        ? space.accent
        : SPACE_ACCENTS[index % SPACE_ACCENTS.length];
      const tabs = Array.isArray(space.tabs)
        ? space.tabs
            .filter((tab) => tab && typeof tab === 'object')
            .slice(0, MAX_TABS)
            .map((tab) => {
              const url = safeHttpUrl(tab.url);
              const history = Array.isArray(tab.history)
                ? tab.history.map((item) => safeHttpUrl(item)).filter(Boolean).slice(-80)
                : [];
              if (url && history.length === 0) history.push(url);
              const index = clamp(Number.isInteger(tab.index) ? tab.index : history.length - 1, -1, history.length - 1);
              return {
                id: typeof tab.id === 'string' ? tab.id : uid('tab'),
                title: String(tab.title || (url ? pageTitleFrom(url) : 'New tab')).slice(0, 300),
                url,
                history,
                index,
                favicon: String(tab.favicon || (url ? faviconFor(url) : '')).slice(0, 500),
                readerOpen: false,
                readerData: null,
                readerError: null,
                readerLoading: false,
                loading: false,
                visitId: null,
              };
            })
        : [];
      if (tabs.length === 0) tabs.push(makeTab());
      const activeTabId = tabs.some((tab) => tab.id === space.activeTabId)
        ? space.activeTabId
        : tabs[0].id;
      return {
        id: typeof space.id === 'string' ? space.id : uid('space'),
        name: String(space.name || `Space ${index + 1}`).slice(0, 60),
        accent,
        glyph: String(space.glyph || String(index + 1).padStart(2, '0')).slice(0, 3),
        tabs,
        activeTabId,
      };
    });

  if (spaces.length === 0) return seedState();

  const settings = { ...DEFAULT_SETTINGS, ...(raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) };
  if (!SEARCH_ENGINES[settings.searchEngine]) settings.searchEngine = DEFAULT_SETTINGS.searchEngine;
  if (!['serif', 'sans'].includes(settings.readerFont)) settings.readerFont = 'serif';
  if (!READER_WIDTHS[settings.readerWidth]) settings.readerWidth = 'normal';
  settings.readerSize = clamp(Number(settings.readerSize) || 19, 16, 24);
  for (const key of ['grain', 'glow', 'motion', 'sidebarCollapsed', 'showGreeting', 'showQuickLinks', 'showRecents']) {
    settings[key] = Boolean(settings[key]);
  }

  const quickSource = Array.isArray(raw.quickLinks) ? raw.quickLinks : DEFAULT_QUICK_LINKS;
  const quickLinks = quickSource
    .map((link) => {
      if (!link || typeof link !== 'object') return null;
      const url = safeHttpUrl(link.url);
      if (!url) return null;
      return {
        id: typeof link.id === 'string' ? link.id : uid('q'),
        title: String(link.title || domainOf(url) || 'Shortcut').slice(0, 80),
        url,
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  const history = (Array.isArray(raw.history) ? raw.history : [])
    .map((entry) => normalizeEntry(entry, 'h'))
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, MAX_HISTORY);

  const bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : [])
    .map((entry) => normalizeEntry(entry, 'b'))
    .filter(Boolean)
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 300);

  const activeSpaceId = spaces.some((space) => space.id === raw.activeSpaceId)
    ? raw.activeSpaceId
    : spaces[0].id;

  return {
    version: 1,
    spaces,
    activeSpaceId,
    settings,
    quickLinks,
    history,
    bookmarks,
    savedAt: Number(raw.savedAt) || Date.now(),
  };
}

export function serializableState(state) {
  return {
    version: 1,
    activeSpaceId: state.activeSpaceId,
    settings: state.settings,
    quickLinks: state.quickLinks,
    history: state.history.slice(0, MAX_HISTORY),
    bookmarks: state.bookmarks,
    spaces: state.spaces.map((space) => ({
      id: space.id,
      name: space.name,
      accent: space.accent,
      glyph: space.glyph,
      activeTabId: space.activeTabId,
      tabs: space.tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        url: tab.url,
        history: tab.history,
        index: tab.index,
        favicon: tab.favicon,
      })),
    })),
    savedAt: Date.now(),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    return normalizeState(JSON.parse(raw));
  } catch {
    return seedState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState(state)));
    return true;
  } catch {
    try {
      const lean = serializableState(state);
      lean.history = lean.history.slice(0, 120);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(lean));
      return true;
    } catch {
      return false;
    }
  }
}

export function clearStoredState() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
