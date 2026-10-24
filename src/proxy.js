import { HttpError } from './errors.js';

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function bridgeScript(url) {
  return `<script>
(function () {
  if (window.__DG_BRIDGE__) return;
  window.__DG_BRIDGE__ = true;
  var PAGE_URL = ${JSON.stringify(url)};
  function send(message) {
    try {
      parent.postMessage(Object.assign({ __dgb: 1 }, message), '*');
    } catch (error) {}
  }
  function announce() {
    send({ type: 'meta', url: PAGE_URL, title: (document.title || '').trim() });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', announce, { once: true });
  } else {
    announce();
  }
  window.addEventListener('load', announce);
  var titleEl = document.querySelector('title');
  if (titleEl && window.MutationObserver) {
    new MutationObserver(announce).observe(titleEl, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }
  document.addEventListener('click', function (event) {
    var anchor = event.target && event.target.closest
      ? event.target.closest('a[href]')
      : null;
    if (!anchor) return;
    if (anchor.hasAttribute('download')) return;
    var href = anchor.href;
    if (!/^https?:/i.test(href)) return;
    var newTab = event.metaKey || event.ctrlKey || event.shiftKey ||
      event.button === 1 || (anchor.target && anchor.target !== '_self');
    event.preventDefault();
    event.stopPropagation();
    send({ type: newTab ? 'open' : 'navigate', url: href });
  }, true);
  document.addEventListener('submit', function (event) {
    var form = event.target;
    if (!form || form.tagName !== 'FORM') return;
    if ((form.method || 'get').toLowerCase() !== 'get') return;
    try {
      var action = new URL(form.getAttribute('action') || PAGE_URL, document.baseURI);
      new FormData(form).forEach(function (value, key) {
        if (typeof value === 'string') action.searchParams.set(key, value);
      });
      event.preventDefault();
      send({ type: 'navigate', url: action.href });
    } catch (error) {}
  }, true);
  document.addEventListener('keydown', function (event) {
    var meta = event.ctrlKey || event.metaKey;
    if (!meta) return;
    if (event.key === 'l' || event.key === 'L') {
      event.preventDefault();
      send({ type: 'focus-omnibox' });
    }
    if (event.key === 'k' || event.key === 'K') {
      event.preventDefault();
      send({ type: 'palette' });
    }
  }, true);
})();
</script>`;
}

const BRAND_STYLE = `<style>
  ::selection { background: #e8c47a; color: #050505; }
  html { scrollbar-color: rgba(232,196,122,.35) #080806; }
  ::-webkit-scrollbar { width: 11px; height: 11px; }
  ::-webkit-scrollbar-track { background: #080806; }
  ::-webkit-scrollbar-thumb {
    background: rgba(232,196,122,.22); border-radius: 20px;
    border: 3px solid #080806; background-clip: padding-box;
  }
</style>`;

function injectHead(html, snippet) {
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }

  const root = /<html\b[^>]*>/i.exec(html);
  if (root) {
    const at = root.index + root[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }

  const doctype = /<!doctype[^>]*>/i.exec(html);
  if (doctype) {
    const at = doctype.index + doctype[0].length;
    return html.slice(0, at) + snippet + html.slice(at);
  }

  return snippet + html;
}

export function preparePage(rawHtml, url) {
  if (typeof rawHtml !== 'string' || !rawHtml.trim()) {
    throw new HttpError(502, 'The page came back empty.');
  }

  let html = rawHtml.trim();

  html = html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*(?:"|')?\s*(?:content-security-policy|refresh|x-frame-options)\s*(?:"|')?[^>]*>/gi,
    '',
  );
  html = html.replace(/<base\b[^>]*>/gi, '');

  const base = `<base href="${escapeAttr(url)}">`;
  const snippet = `${base}${BRAND_STYLE}${bridgeScript(url)}`;

  return injectHead(html, snippet);
}

export const __test = { bridgeScript };
