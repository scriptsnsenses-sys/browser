import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { config } from './config.js';
import { fetchMarkdown, fetchRawHtml } from './engine.js';
import { HttpError } from './errors.js';

const ALLOWED_TAGS = [
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'blockquote',
  'p',
  'a',
  'ul',
  'ol',
  'li',
  'b',
  'i',
  'strong',
  'em',
  'strike',
  'del',
  'ins',
  'code',
  'hr',
  'br',
  'div',
  'span',
  'table',
  'thead',
  'caption',
  'tbody',
  'tr',
  'th',
  'td',
  'pre',
  'img',
  'figure',
  'figcaption',
  'mark',
  'sup',
  'sub',
  'dl',
  'dt',
  'dd',
  'details',
  'summary',
  'kbd',
];

function absolute(value, base) {
  if (!value) return '';
  const trimmed = String(value).trim();
  if (/^(#|mailto:|tel:)/i.test(trimmed)) return trimmed;
  try {
    const resolved = new URL(trimmed, base);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return '';
    return resolved.href;
  } catch {
    return '';
  }
}

function sanitizeArticle(html, baseUrl) {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      code: ['class'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => {
        const href = absolute(attribs.href, baseUrl);
        if (!href) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'a',
          attribs: {
            href,
            ...(attribs.title ? { title: attribs.title } : {}),
            rel: 'noopener noreferrer nofollow',
          },
        };
      },
      img: (tagName, attribs) => {
        const src = absolute(attribs.src, baseUrl);
        if (!src) return { tagName: 'span', attribs: {} };
        return {
          tagName: 'img',
          attribs: {
            src,
            ...(attribs.alt ? { alt: attribs.alt } : { alt: '' }),
            ...(attribs.title ? { title: attribs.title } : {}),
            ...(attribs.width ? { width: attribs.width } : {}),
            ...(attribs.height ? { height: attribs.height } : {}),
            loading: 'lazy',
            decoding: 'async',
          },
        };
      },
    },
  });
}

function textOf(html) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function firstHeading(markdown) {
  const lines = markdown.split('\n');
  const first = lines.findIndex((line) => line.trim().length > 0);
  if (first >= 0 && /^#\s+/.test(lines[first])) {
    const raw = lines[first].replace(/^#\s+/, '').trim();
    lines.splice(first, 1);
    const title = textOf(
      raw
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[*_`~]/g, ''),
    );
    return { title, markdown: lines.join('\n') };
  }
  return { title: null, markdown };
}

function pageTitle(html) {
  const match = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  if (!match) return null;
  const title = textOf(match[1]);
  return title || null;
}

function extractMain(html) {
  const cleaned = html
    .replace(/<(script|style|noscript|svg|template|nav|aside|footer|form|button)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<(header)\b[^>]*>[\s\S]*?<\/header>/gi, '');

  const article = /<article\b[^>]*>([\s\S]*?)<\/article>/i.exec(cleaned);
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(cleaned);
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(cleaned);

  if (article && textOf(article[1]).length > 300) return article[1];
  if (main && textOf(main[1]).length > 300) return main[1];
  return body ? body[1] : cleaned;
}

function describe(html) {
  const paragraph = /<p\b[^>]*>([\s\S]*?)<\/p>/i.exec(html);
  if (!paragraph) return '';
  const text = textOf(paragraph[1]);
  if (text.length < 40) return '';
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
}

export async function buildReader(url) {
  let title = null;
  let html = '';
  let engine = 'lightpanda';
  let markdown = null;

  try {
    markdown = await fetchMarkdown(url);
  } catch {
    markdown = null;
  }

  if (markdown && markdown.trim()) {
    const parsed = firstHeading(markdown);
    title = parsed.title;
    const rendered = marked.parse(parsed.markdown, {
      gfm: true,
      breaks: false,
      async: false,
    });
    html = sanitizeArticle(rendered, url);
  } else {
    const page = await fetchRawHtml(url, { timeout: config.readerTimeoutMs });
    engine = page.engine === 'lightpanda' ? 'lightpanda-html' : 'http';
    title = pageTitle(page.html);
    html = sanitizeArticle(extractMain(page.html), url);
  }

  const text = textOf(html);
  const words = text ? text.split(/\s+/).length : 0;

  if (words < 5) {
    throw new HttpError(422, 'DG Brows could not find readable content on this page.');
  }

  return {
    url,
    title: title || new URL(url).hostname,
    description: describe(html),
    html,
    words,
    readMinutes: Math.max(1, Math.round(words / 220)),
    engine,
  };
}
