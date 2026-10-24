import {
  READER_WIDTHS,
  SEARCH_ENGINES,
  dayLabel,
  domainOf,
  escapeAttr,
  escapeHtml,
  faviconFor,
  formatToday,
  greeting,
  initialsOf,
  pageTitleFrom,
  prettyUrl,
  timeAgo,
} from './core.js';

const $ = (id) => document.getElementById(id);

export function cacheDom() {
  return {
    boot: $('boot'),
    shell: $('shell'),
    sidebar: $('sidebar'),
    sidebarScrim: $('sidebarScrim'),
    spaceList: $('spaceList'),
    tabCount: $('tabCount'),
    tabList: $('tabList'),
    backBtn: $('backBtn'),
    forwardBtn: $('forwardBtn'),
    reloadBtn: $('reloadBtn'),
    omniForm: $('omniForm'),
    omnibox: $('omnibox'),
    omniWrap: document.querySelector('.omni-wrap'),
    omniScheme: $('omniScheme'),
    omniIcon: $('omniIcon'),
    readerBtn: $('readerBtn'),
    starBtn: $('starBtn'),
    suggestions: $('suggestions'),
    stage: $('stage'),
    startView: $('startView'),
    internalView: $('internalView'),
    readerView: $('readerView'),
    frameWrap: $('frameWrap'),
    pageFrame: $('pageFrame'),
    frameLoader: $('frameLoader'),
    readerArticle: $('readerArticle'),
    readerMeta: $('readerMeta'),
    readerProgress: $('readerProgress'),
    readerScroll: $('readerScroll'),
    progress: $('progress'),
    enginePill: $('enginePill'),
    engineState: $('engineState'),
    footEngine: $('footEngine'),
    aboutEngine: $('aboutEngine'),
    greeting: $('greeting'),
    today: $('today'),
    heroForm: $('heroForm'),
    heroInput: $('heroInput'),
    quickBlock: $('quickBlock'),
    quickGrid: $('quickGrid'),
    recentBlock: $('recentBlock'),
    recentGrid: $('recentGrid'),
    sheetBackdrop: $('sheetBackdrop'),
    settingsSheet: $('settingsSheet'),
    palette: $('palette'),
    paletteInput: $('paletteInput'),
    paletteList: $('paletteList'),
    helpModal: $('helpModal'),
    tinyModal: $('tinyModal'),
    tinyTitle: $('tinyTitle'),
    tinyForm: $('tinyForm'),
    tinyFields: $('tinyFields'),
    tinySubmit: $('tinySubmit'),
    contextMenu: $('contextMenu'),
    toasts: $('toasts'),
    liveRegion: $('liveRegion'),
    spotlight: $('spotlight'),
    importFile: $('importFile'),
    statTabs: $('statTabs'),
    statHistory: $('statHistory'),
    statBookmarks: $('statBookmarks'),
    readerSizeLabel: $('readerSizeLabel'),
  };
}

export function iconNode(name, className = 'ico') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function fallbackNode(text, className) {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = text;
  return span;
}

function faviconNode(url, title, containerClass, imgClass = '') {
  const box = document.createElement('span');
  box.className = containerClass;
  if (!url) {
    box.append(iconNode('globe', 'ico'));
    return box;
  }
  const img = document.createElement('img');
  img.alt = '';
  img.loading = 'lazy';
  img.decoding = 'async';
  img.src = faviconFor(url);
  if (imgClass) img.className = imgClass;
  img.addEventListener(
    'error',
    () => {
      box.replaceChildren(
        fallbackNode(
          initialsOf(title, url),
          containerClass === 'quick-icon' ? 'quick-glyph' : 'fav-fallback',
        ),
      );
    },
    { once: true },
  );
  box.append(img);
  return box;
}

function svgUse(name) {
  return `<svg class="ico" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

export function applySettings(app) {
  const settings = app.state.settings;
  document.body.classList.toggle('no-grain', !settings.grain);
  document.body.classList.toggle('no-glow', !settings.glow);
  document.body.classList.toggle('no-motion', !settings.motion);
  const mobile = window.innerWidth <= 880;
  document.body.classList.toggle('sidebar-collapsed', settings.sidebarCollapsed && !mobile);

  const root = document.documentElement;
  root.style.setProperty('--reader-size', `${settings.readerSize}px`);
  root.style.setProperty('--reader-width', `${READER_WIDTHS[settings.readerWidth] || 700}px`);
  app.dom.readerArticle.classList.toggle('is-sans', settings.readerFont === 'sans');

  const engineName = SEARCH_ENGINES[settings.searchEngine]?.name || 'the web';
  app.dom.omnibox.placeholder = `Search with ${engineName} or enter an address`;
  app.dom.heroInput.placeholder = `Search with ${engineName} or enter an address`;
}

export function renderSpaces(app) {
  const { spaceList } = app.dom;
  spaceList.replaceChildren();
  for (const space of app.state.spaces) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `space-item${space.id === app.state.activeSpaceId ? ' is-active' : ''}`;
    button.dataset.spaceId = space.id;
    button.style.setProperty('--space-accent', space.accent);
    button.setAttribute('aria-current', space.id === app.state.activeSpaceId ? 'true' : 'false');
    button.innerHTML = `
      <span class="space-glyph">${escapeHtml(space.glyph)}</span>
      <span class="space-name">${escapeHtml(space.name)}</span>
      <span class="space-count">${space.tabs.length}</span>
    `;
    spaceList.append(button);
  }
}

export function renderTabs(app) {
  const space = app.activeSpace();
  const activeId = space.activeTabId;
  app.dom.tabCount.textContent = String(space.tabs.length);
  app.dom.tabList.replaceChildren();

  for (const tab of space.tabs) {
    const isActive = tab.id === activeId;
    const tabEl = document.createElement('div');
    tabEl.className = `tab${isActive ? ' is-active' : ''}${tab.loading ? ' tab-loading' : ''}`;
    tabEl.dataset.tabId = tab.id;
    tabEl.draggable = true;
    tabEl.setAttribute('role', 'tab');
    tabEl.setAttribute('aria-selected', isActive ? 'true' : 'false');
    tabEl.tabIndex = isActive ? 0 : -1;

    tabEl.append(faviconNode(tab.url, tab.title, 'tab-favicon'));

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = tab.title || 'New tab';
    tabEl.append(title);

    if (tab.readerOpen && tab.url) {
      tabEl.append(iconNode('book', 'ico reader-flag'));
    }

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'tab-close';
    close.dataset.action = 'close-tab';
    close.dataset.tabId = tab.id;
    close.setAttribute('aria-label', `Close ${tab.title || 'tab'}`);
    close.innerHTML = svgUse('x');
    tabEl.append(close);

    app.dom.tabList.append(tabEl);
  }
}

function makeQuickCard(app, link) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'quick-card';
  card.dataset.quickId = link.id;
  card.title = `${link.title}\n${link.url}`;

  const icon = document.createElement('span');
  icon.className = 'quick-icon';
  const imgUrl = link.url;
  if (imgUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.src = faviconFor(imgUrl);
    img.addEventListener(
      'error',
      () => icon.replaceChildren(fallbackNode(initialsOf(link.title, link.url), 'quick-glyph')),
      { once: true },
    );
    icon.append(img);
  } else {
    icon.append(fallbackNode(initialsOf(link.title, link.url), 'quick-glyph'));
  }

  const body = document.createElement('span');
  body.className = 'quick-body';
  const title = document.createElement('span');
  title.className = 'quick-title';
  title.textContent = link.title;
  const url = document.createElement('span');
  url.className = 'quick-url';
  url.textContent = domainOf(link.url);
  body.append(title, url);

  const arrow = document.createElement('span');
  arrow.className = 'quick-arrow';
  arrow.innerHTML = svgUse('arrow-up-right');

  card.append(icon, body, arrow);
  return card;
}

function addQuickTile() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'add-tile';
  button.dataset.action = 'add-quick';
  button.innerHTML = `<span class="add-inner">${svgUse('plus')} Add gold</span>`;
  return button;
}

function makeRecent(app, entry) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'recent-item';
  button.dataset.url = entry.url;
  button.title = entry.url;

  button.append(faviconNode(entry.url, entry.title, 'recent-favicon'));

  const body = document.createElement('span');
  body.className = 'recent-body';
  const title = document.createElement('span');
  title.className = 'recent-title';
  title.textContent = entry.title || pageTitleFrom(entry.url);
  const meta = document.createElement('span');
  meta.className = 'recent-meta';
  meta.textContent = prettyUrl(entry.url);
  body.append(title, meta);

  const time = document.createElement('span');
  time.className = 'recent-time';
  time.textContent = timeAgo(entry.ts);

  const arrow = document.createElement('span');
  arrow.className = 'recent-arrow';
  arrow.innerHTML = svgUse('arrow-up-right');

  button.append(body, time, arrow);
  return button;
}

export function renderStart(app) {
  const settings = app.state.settings;
  const { greeting: greetingEl, today } = app.dom;
  if (settings.showGreeting) {
    greetingEl.parentElement.hidden = false;
    greetingEl.textContent = greeting();
    today.textContent = formatToday();
  } else {
    greetingEl.parentElement.hidden = true;
  }

  app.dom.quickBlock.hidden = !settings.showQuickLinks;
  app.dom.recentBlock.hidden = !settings.showRecents;

  app.dom.quickGrid.replaceChildren();
  for (const link of app.state.quickLinks) {
    app.dom.quickGrid.append(makeQuickCard(app, link));
  }
  app.dom.quickGrid.append(addQuickTile());

  app.dom.recentGrid.replaceChildren();
  const seen = new Set();
  const recents = [];
  for (const entry of app.state.history) {
    if (seen.has(entry.url)) continue;
    seen.add(entry.url);
    recents.push(entry);
    if (recents.length >= 6) break;
  }
  if (recents.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-line';
    empty.innerHTML = `${svgUse('clock')} Your trail will appear here`;
    app.dom.recentGrid.append(empty);
  } else {
    for (const entry of recents) app.dom.recentGrid.append(makeRecent(app, entry));
  }
}

export function renderChrome(app) {
  const tab = app.activeTab();
  const internal = app.ui.internal;
  app.dom.backBtn.disabled = !tab || tab.index <= 0;
  app.dom.forwardBtn.disabled = !tab || tab.index >= tab.history.length - 1;
  app.dom.reloadBtn.disabled = !tab || !tab.url;
  app.dom.readerBtn.disabled = !tab || !tab.url;
  app.dom.readerBtn.classList.toggle('is-on', Boolean(tab && tab.readerOpen));
  app.dom.starBtn.disabled = !tab || !tab.url;
  app.dom.starBtn.classList.toggle('is-on', Boolean(tab && tab.url && app.isBookmarked(tab.url)));

  const value = internal ? `dgbrows://${internal}` : tab?.url || '';
  if (document.activeElement !== app.dom.omnibox || !app.ui.omniEditing) {
    app.dom.omnibox.value = value;
  }
  app.dom.omniScheme.classList.toggle('is-insecure', Boolean(tab?.url?.startsWith('http://') && !internal));
  app.dom.omniScheme.classList.toggle('is-search', !internal && !tab?.url);
  const use = app.dom.omniIcon.querySelector('use');
  if (use) {
    let symbol = 'search';
    if (internal) symbol = 'layers';
    else if (tab?.url) symbol = tab.url.startsWith('https://') ? 'lock' : 'globe';
    use.setAttribute('href', `#i-${symbol}`);
  }

  document.querySelectorAll('.nav-item[data-view]').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === internal);
  });

  const title = internal
    ? internal === 'history'
      ? 'History'
      : 'Bookmarks'
    : tab?.title || 'New tab';
  document.title = `${title} — DG Brows`;
}

export function renderView(app) {
  const tab = app.activeTab();
  const internal = app.ui.internal;
  const showStart = !internal && !tab.readerOpen && !tab.url;
  const showReader = !internal && tab.readerOpen;
  const showFrame = !internal && !tab.readerOpen && Boolean(tab.url);

  app.dom.startView.hidden = !showStart;
  app.dom.internalView.hidden = !internal;
  app.dom.readerView.hidden = !showReader;
  app.dom.frameWrap.hidden = !showFrame;

  if (internal) renderInternal(app);
  if (showReader) renderReader(app);
}

export function renderInternal(app) {
  const kind = app.ui.internal;
  if (!kind) return;
  const view = app.dom.internalView;
  if (view.dataset.kind !== kind) {
    view.dataset.kind = kind;
    const isHistory = kind === 'history';
    view.innerHTML = `
      <div class="internal-inner">
        <header class="internal-head">
          <div>
            <div class="internal-eyebrow">${isHistory ? 'Library / Archive' : 'Library / Gold Shelf'}</div>
            <h1 class="internal-title">${
              isHistory ? 'Everywhere <em>you&rsquo;ve been.</em>' : 'The gilded <em>shelf.</em>'
            }</h1>
            <p class="internal-sub">${
              isHistory
                ? 'A quiet ledger of every page you have opened. Search it, reopen it, or let it go.'
                : 'Pages worth keeping. Saved locally, in your browser, in your gold.'
            }</p>
          </div>
          <div class="internal-actions">
            <button class="internal-clear" data-action="${isHistory ? 'clear-history' : 'clear-bookmarks'}">
              ${svgUse('trash')} ${isHistory ? 'Clear history' : 'Clear bookmarks'}
            </button>
          </div>
        </header>
        <div class="lib-tools">
          <label class="lib-search">
            ${svgUse('search')}
            <input id="libSearch" type="text" spellcheck="false" autocomplete="off" placeholder="Filter ${kind}…" value="${escapeAttr(
              app.ui.internalQuery || '',
            )}">
          </label>
          <span class="lib-count" id="libCount"></span>
        </div>
        <div class="lib-results" id="libResults"></div>
      </div>
    `;
  } else {
    const search = view.querySelector('#libSearch');
    if (search && search.value !== (app.ui.internalQuery || '')) {
      search.value = app.ui.internalQuery || '';
    }
  }
  renderInternalResults(app);
}

export function renderInternalResults(app) {
  const kind = app.ui.internal;
  const results = document.getElementById('libResults');
  const count = document.getElementById('libCount');
  if (!kind || !results || !count) return;

  const query = (app.ui.internalQuery || '').trim().toLowerCase();
  const source = kind === 'history' ? app.state.history : app.state.bookmarks;
  const filtered = source
    .filter((entry) => {
      if (!query) return true;
      return (
        entry.title.toLowerCase().includes(query) ||
        entry.url.toLowerCase().includes(query) ||
        domainOf(entry.url).includes(query)
      );
    })
    .sort((a, b) => b.ts - a.ts);

  count.textContent = `${filtered.length} ${filtered.length === 1 ? 'page' : 'pages'}`;
  results.replaceChildren();

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'lib-empty';
    empty.innerHTML = `
      ${svgUse(kind === 'history' ? 'clock' : 'bookmark')}
      <b>${query ? 'Nothing matches.' : kind === 'history' ? 'A blank trail.' : 'The shelf is empty.'}</b>
      <span>${
        query
          ? 'Try a shorter search, or a different fragment of the address.'
          : kind === 'history'
            ? 'Pages you visit will gather here, oldest to newest.'
            : 'Press the star in the address bar to keep a page.'
      }</span>
    `;
    results.append(empty);
    return;
  }

  let lastGroup = '';
  for (const entry of filtered) {
    const group = kind === 'history' ? dayLabel(entry.ts) : 'Saved pages';
    if (group !== lastGroup) {
      const head = document.createElement('div');
      head.className = 'lib-group-head';
      head.textContent = group;
      results.append(head);
      lastGroup = group;
    }
    results.append(makeLibRow(app, entry, kind));
  }
}

function makeLibRow(app, entry, kind) {
  const row = document.createElement('div');
  row.className = 'lib-item';
  row.dataset.url = entry.url;
  row.dataset.entryId = entry.id;
  row.dataset.kind = kind;
  row.setAttribute('role', 'link');
  row.tabIndex = 0;

  row.append(faviconNode(entry.url, entry.title, 'lib-favicon'));

  const body = document.createElement('span');
  body.className = 'lib-body';
  const title = document.createElement('span');
  title.className = 'lib-title';
  title.textContent = entry.title || pageTitleFrom(entry.url);
  const url = document.createElement('span');
  url.className = 'lib-url';
  url.textContent = prettyUrl(entry.url);
  body.append(title, url);

  const date = document.createElement('span');
  date.className = 'lib-date';
  date.textContent = timeAgo(entry.ts);

  const actions = document.createElement('span');
  actions.className = 'lib-actions';

  const openNew = document.createElement('button');
  openNew.type = 'button';
  openNew.className = 'lib-btn';
  openNew.dataset.libAction = 'open-new';
  openNew.title = 'Open in a new tab';
  openNew.setAttribute('aria-label', 'Open in a new tab');
  openNew.innerHTML = svgUse('arrow-up-right');

  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'lib-btn';
  copy.dataset.libAction = 'copy';
  copy.title = 'Copy address';
  copy.setAttribute('aria-label', 'Copy address');
  copy.innerHTML = svgUse('copy');

  actions.append(openNew, copy);

  if (kind === 'history') {
    const bookmark = document.createElement('button');
    bookmark.type = 'button';
    bookmark.className = `lib-btn${app.isBookmarked(entry.url) ? ' is-on' : ''}`;
    bookmark.dataset.libAction = 'bookmark';
    bookmark.title = app.isBookmarked(entry.url) ? 'Remove bookmark' : 'Bookmark';
    bookmark.setAttribute('aria-label', bookmark.title);
    bookmark.innerHTML = svgUse('star');
    actions.append(bookmark);
  }

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'lib-btn is-danger';
  remove.dataset.libAction = 'remove';
  remove.title = kind === 'history' ? 'Remove from history' : 'Remove bookmark';
  remove.setAttribute('aria-label', remove.title);
  remove.innerHTML = svgUse('trash');
  actions.append(remove);

  row.append(body, date, actions);
  return row;
}

export function renderReader(app) {
  const tab = app.activeTab();
  const article = app.dom.readerArticle;
  article.classList.toggle('is-sans', app.state.settings.readerFont === 'sans');

  if (tab.readerLoading) {
    app.ui.readerKey = `loading:${tab.url}`;
    app.dom.readerMeta.innerHTML = `<span class="rm-site">Reading ${escapeHtml(domainOf(tab.url))}</span><span class="rm-dot"></span><span class="rm-engine">extracting</span>`;
    article.innerHTML = `
      <div class="reader-loading">
        <div class="loader-emblem"><img src="/assets/dg-brows-mark.png" alt=""></div>
        <span>Separating the page from its noise</span>
      </div>
    `;
    return;
  }

  if (tab.readerError) {
    const key = `error:${tab.url}:${tab.readerError}`;
    if (app.ui.readerKey !== key) {
      app.ui.readerKey = key;
      article.innerHTML = `
        <div class="reader-loading">
          <div class="loader-emblem"><img src="/assets/dg-brows-mark.png" alt=""></div>
          <span>${escapeHtml(tab.readerError)}</span>
          <button class="btn gold" data-action="retry-reader">${svgUse('reload')} Try again</button>
        </div>
      `;
    }
    app.dom.readerMeta.innerHTML = `<span class="rm-site">${escapeHtml(domainOf(tab.url))}</span><span class="rm-dot"></span><span class="rm-engine">reader unavailable</span>`;
    return;
  }

  if (!tab.readerData) {
    article.innerHTML = '';
    return;
  }

  const data = tab.readerData;
  const key = `data:${tab.url}:${data.words}:${data.title}`;
  const site = domainOf(data.url || tab.url);
  app.dom.readerMeta.innerHTML = `
    <span class="rm-site">${escapeHtml(site)}</span>
    <span class="rm-dot"></span>
    <span>${data.readMinutes} min read</span>
    <span class="rm-dot"></span>
    <span class="rm-engine">${escapeHtml(data.engine || 'reader')}</span>
  `;

  if (app.ui.readerKey === key) return;
  app.ui.readerKey = key;
  article.innerHTML = `
    <div class="reader-kicker">Reader mode</div>
    <h1 class="reader-title">${escapeHtml(data.title || pageTitleFrom(data.url))}</h1>
    ${data.description ? `<p class="reader-deck">${escapeHtml(data.description)}</p>` : ''}
    <div class="reader-byline">
      <span>${data.words.toLocaleString()} words</span>
      <span class="rm-dot"></span>
      <span>${data.readMinutes} minute read</span>
      <span class="rm-dot"></span>
      <a href="${escapeAttr(data.url)}" target="_blank" rel="noopener noreferrer">Open original</a>
    </div>
    <div class="reader-body">${data.html}</div>
    <div class="reader-source">
      <a href="${escapeAttr(data.url)}" target="_blank" rel="noopener noreferrer">
        Read at ${escapeHtml(site)} ${svgUse('external')}
      </a>
    </div>
  `;
  app.dom.readerScroll.scrollTop = 0;
  app.dom.readerProgress.style.width = '0%';
}

export function renderSuggestions(app, items, selectedIndex) {
  const box = app.dom.suggestions;
  box.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'sug-empty';
    empty.textContent = 'No matches in the ledger';
    box.append(empty);
    return;
  }

  let group = '';
  items.forEach((item, index) => {
    if (item.group !== group) {
      group = item.group;
      const label = document.createElement('div');
      label.className = 'sug-label';
      label.textContent = group;
      box.append(label);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `sug-item${index === selectedIndex ? ' is-selected' : ''}`;
    button.dataset.index = String(index);

    const icon = document.createElement('span');
    icon.className = 'sug-icon';
    if (item.url) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = faviconFor(item.url, 32);
      img.addEventListener(
        'error',
        () => icon.replaceChildren(iconNode(item.icon || 'globe')),
        { once: true },
      );
      icon.append(img);
    } else {
      icon.append(iconNode(item.icon || 'search'));
    }

    const text = document.createElement('span');
    text.className = 'sug-text';
    const title = document.createElement('span');
    title.className = 'sug-title';
    title.textContent = item.title;
    text.append(title);
    if (item.sub) {
      const sub = document.createElement('span');
      sub.className = 'sug-url';
      sub.textContent = item.sub;
      text.append(sub);
    }

    button.append(icon, text);
    if (item.badge) {
      const badge = document.createElement('span');
      badge.className = 'sug-badge';
      badge.textContent = item.badge;
      button.append(badge);
    }
    const enter = document.createElement('span');
    enter.className = 'sug-enter';
    enter.innerHTML = svgUse('arrow-right');
    button.append(enter);

    box.append(button);
  });
}

export function renderPalette(app, items, selectedIndex) {
  const list = app.dom.paletteList;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('div');
    empty.className = 'pal-empty';
    empty.textContent = 'No command matches. Try “new tab” or a page title.';
    list.append(empty);
    return;
  }

  let group = '';
  items.forEach((item, index) => {
    if (item.group !== group) {
      group = item.group;
      const label = document.createElement('div');
      label.className = 'pal-label';
      label.textContent = group;
      list.append(label);
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = `pal-item${index === selectedIndex ? ' is-selected' : ''}`;
    button.dataset.paletteIndex = String(index);

    const icon = document.createElement('span');
    icon.className = 'pal-icon';
    icon.append(iconNode(item.icon || 'command'));

    const text = document.createElement('span');
    text.className = 'pal-text';
    const title = document.createElement('span');
    title.className = 'pal-title';
    title.textContent = item.title;
    text.append(title);
    if (item.sub) {
      const sub = document.createElement('span');
      sub.className = 'pal-sub';
      sub.textContent = item.sub;
      text.append(sub);
    }

    button.append(icon, text);
    if (item.key) {
      const key = document.createElement('kbd');
      key.className = 'pal-key';
      key.textContent = item.key;
      button.append(key);
    }
    list.append(button);
  });

  requestAnimationFrame(() => {
    list.querySelector('.pal-item.is-selected')?.scrollIntoView({ block: 'nearest' });
  });
}

export function syncSettings(app) {
  const settings = app.state.settings;
  for (const input of app.dom.settingsSheet.querySelectorAll('[data-setting]')) {
    const key = input.dataset.setting;
    if (!(key in settings)) continue;
    if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = settings[key];
  }
  for (const segmented of app.dom.settingsSheet.querySelectorAll('[data-segmented]')) {
    const key = segmented.dataset.segmented;
    segmented.querySelectorAll('button[data-value]').forEach((button) => {
      button.classList.toggle('is-on', button.dataset.value === settings[key]);
    });
  }
  if (app.dom.readerSizeLabel) app.dom.readerSizeLabel.textContent = `${settings.readerSize}px`;
  renderStats(app);
}

export function renderStats(app) {
  const tabCount = app.state.spaces.reduce((total, space) => total + space.tabs.length, 0);
  app.dom.statTabs.textContent = String(tabCount);
  app.dom.statHistory.textContent = String(app.state.history.length);
  app.dom.statBookmarks.textContent = String(app.state.bookmarks.length);
}

export function renderEngine(app) {
  const engine = app.ui.engine;
  const pill = app.dom.enginePill;
  if (!engine) {
    pill.classList.remove('is-http', 'is-offline');
    app.dom.engineState.textContent = 'connecting';
    app.dom.footEngine.textContent = 'Engine connecting…';
    app.dom.aboutEngine.textContent = 'connecting…';
    return;
  }

  pill.classList.toggle('is-http', engine.mode === 'http');
  pill.classList.toggle('is-offline', engine.mode === 'offline');
  app.dom.engineState.textContent = engine.online ? 'online' : engine.mode === 'http' ? 'fallback' : 'offline';
  app.dom.enginePill.title = engine.detail || (engine.online ? 'Lightpanda engine online' : 'HTTP fallback');
  app.dom.footEngine.textContent = engine.online
    ? `${engine.version || 'Lightpanda'} online`
    : engine.mode === 'http'
      ? 'HTTP fallback active'
      : 'Engine offline';
  app.dom.aboutEngine.textContent = engine.online
    ? `${engine.version || 'Lightpanda'} · online`
    : engine.mode === 'http'
      ? 'HTTP fallback · Lightpanda unavailable'
      : 'offline';
}

export function setBusy(app, busy) {
  const bar = app.dom.progress;
  if (busy) {
    bar.classList.remove('is-done');
    void bar.offsetWidth;
    bar.classList.add('is-active');
    return;
  }
  bar.classList.remove('is-active');
  bar.classList.add('is-done');
  clearTimeout(app.ui.progressTimer);
  app.ui.progressTimer = setTimeout(() => bar.classList.remove('is-done'), 520);
}

export function toast(app, options) {
  const { title, text, icon = 'check', tone = 'gold', action = null, duration = 4200 } = options;
  const node = document.createElement('div');
  node.className = `toast${tone === 'error' ? ' is-error' : ''}`;

  const iconBox = document.createElement('span');
  iconBox.className = 'toast-icon';
  iconBox.append(iconNode(icon));

  const body = document.createElement('span');
  body.className = 'toast-body';
  const heading = document.createElement('span');
  heading.className = 'toast-title';
  heading.textContent = title;
  body.append(heading);
  if (text) {
    const line = document.createElement('span');
    line.className = 'toast-text';
    line.textContent = text;
    body.append(line);
  }

  node.append(iconBox, body);

  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast-action';
    button.textContent = action.label;
    button.addEventListener('click', () => {
      action.onClick();
      dismiss();
    });
    node.append(button);
  }

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'toast-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.innerHTML = svgUse('x');
  close.addEventListener('click', dismiss);
  node.append(close);

  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    clearTimeout(timer);
    node.classList.add('is-leaving');
    setTimeout(() => node.remove(), 260);
  }
  const timer = setTimeout(dismiss, duration);

  while (app.dom.toasts.children.length >= 4) {
    app.dom.toasts.firstElementChild?.remove();
  }
  app.dom.toasts.append(node);
  app.dom.liveRegion.textContent = `${title}${text ? `: ${text}` : ''}`;
}

export function showMenu(app, x, y, items) {
  const menu = app.dom.contextMenu;
  app.ui.menuItems = items;
  menu.replaceChildren();

  items.forEach((item, index) => {
    if (item.separator) {
      const sep = document.createElement('div');
      sep.className = 'ctx-sep';
      menu.append(sep);
      return;
    }
    if (item.label) {
      const label = document.createElement('div');
      label.className = 'ctx-label';
      label.textContent = item.label;
      menu.append(label);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ctx-item${item.danger ? ' is-danger' : ''}`;
    button.dataset.menuIndex = String(index);
    if (item.disabled) {
      button.disabled = true;
      button.style.opacity = '0.35';
    }
    if (item.icon) button.append(iconNode(item.icon));
    const text = document.createElement('span');
    text.textContent = item.text;
    button.append(text);
    if (item.kbd) {
      const key = document.createElement('kbd');
      key.textContent = item.kbd;
      button.append(key);
    }
    menu.append(button);
  });

  menu.hidden = false;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 10);
  const top = Math.min(y, window.innerHeight - rect.height - 10);
  menu.style.left = `${Math.max(10, left)}px`;
  menu.style.top = `${Math.max(10, top)}px`;
}

export function hideMenu(app) {
  app.dom.contextMenu.hidden = true;
  app.ui.menuItems = [];
}

export function showSuggestions(app) {
  app.dom.suggestions.hidden = false;
  app.dom.omniWrap.classList.add('is-open');
}

export function hideSuggestions(app) {
  app.dom.suggestions.hidden = true;
  app.dom.omniWrap.classList.remove('is-open');
  app.ui.suggestIndex = -1;
  app.ui.suggestItems = [];
}
