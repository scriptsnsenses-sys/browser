import {
  SEARCH_ENGINES,
  domainOf,
  escapeHtml,
  normalizeAddress,
  pageTitleFrom,
  prettyUrl,
  resolveInput,
} from './core.js';
import * as ui from './ui.js';

export function initShell(app) {
  const dom = app.dom;
  let suggestTimer = 0;
  let dragTabId = null;

  function focusOmnibox() {
    dom.omnibox.focus();
    dom.omnibox.select();
  }

  function openSettings() {
    closePalette();
    closeHelp();
    closeTiny();
    ui.hideMenu(app);
    ui.hideSuggestions(app);
    dom.sheetBackdrop.hidden = false;
    dom.settingsSheet.hidden = false;
    ui.syncSettings(app);
    requestAnimationFrame(() => {
      dom.settingsSheet.querySelector('[data-action="close-settings"]')?.focus();
    });
  }

  function closeSettings() {
    dom.settingsSheet.hidden = true;
    dom.sheetBackdrop.hidden = true;
  }

  function openHelp() {
    closeSettings();
    closePalette();
    closeTiny();
    dom.helpModal.hidden = false;
    requestAnimationFrame(() => {
      dom.helpModal.querySelector('[data-action="close-help"]')?.focus();
    });
  }

  function closeHelp() {
    dom.helpModal.hidden = true;
  }

  function openPalette() {
    closeSettings();
    closeHelp();
    closeTiny();
    ui.hideMenu(app);
    ui.hideSuggestions(app);
    dom.palette.hidden = false;
    dom.paletteInput.value = '';
    app.ui.paletteIndex = 0;
    rebuildPalette('');
    dom.paletteInput.focus();
  }

  function closePalette() {
    dom.palette.hidden = true;
  }

  function closeTiny() {
    dom.tinyModal.hidden = true;
    app.ui.tinyHandler = null;
  }

  function setTinyNote(text) {
    let note = dom.tinyFields.querySelector('.tiny-note.auto');
    if (!note) {
      note = document.createElement('p');
      note.className = 'tiny-note auto';
      dom.tinyFields.append(note);
    }
    note.textContent = text;
    note.style.color = 'var(--danger)';
  }

  function openTiny(config) {
    closePalette();
    closeHelp();
    ui.hideMenu(app);
    dom.tinyTitle.textContent = config.title || 'Add';
    dom.tinyFields.replaceChildren();
    for (const field of config.fields || []) {
      const wrap = document.createElement('label');
      wrap.className = 'tiny-field';
      const label = document.createElement('span');
      label.className = 'tiny-label';
      label.textContent = field.label;
      const input = document.createElement('input');
      input.className = 'tiny-input';
      input.type = field.type || 'text';
      input.name = field.name;
      input.value = field.value || '';
      input.placeholder = field.placeholder || '';
      input.autocomplete = 'off';
      input.spellcheck = false;
      if (field.required) input.required = true;
      wrap.append(label, input);
      dom.tinyFields.append(wrap);
    }
    if (config.note) {
      const note = document.createElement('p');
      note.className = 'tiny-note';
      note.textContent = config.note;
      dom.tinyFields.append(note);
    }
    dom.tinySubmit.textContent = config.submit || 'Save';
    dom.tinySubmit.className = `btn ${config.danger ? 'danger-ghost' : 'gold'}`;
    app.ui.tinyHandler = config.onSubmit;
    dom.tinyModal.hidden = false;
    requestAnimationFrame(() => {
      const input = dom.tinyFields.querySelector('input');
      if (input) input.focus();
      else dom.tinySubmit.focus();
    });
  }

  function openQuickModal(link = null) {
    openTiny({
      title: link ? 'Edit shortcut' : 'Add a shortcut',
      fields: [
        { name: 'title', label: 'Title', value: link?.title || '', placeholder: 'The New York Times' },
        { name: 'url', label: 'Address', value: link?.url || '', placeholder: 'https://example.com', required: true },
      ],
      note: 'A little gold for your start page.',
      submit: link ? 'Save shortcut' : 'Add shortcut',
      onSubmit(values) {
        const title = values.title.trim();
        const url = values.url.trim();
        const ok = link ? app.updateQuickLink(link.id, title, url) : app.addQuickLink(title, url);
        return ok ? true : 'Use a full web address, like example.com.';
      },
    });
  }

  function openSpaceModal(space = null) {
    openTiny({
      title: space ? 'Rename space' : 'A new space',
      fields: [
        { name: 'name', label: 'Space name', value: space?.name || '', placeholder: 'Research', required: true },
      ],
      note: 'Spaces keep tabs, history, and ideas apart.',
      submit: space ? 'Rename' : 'Create space',
      onSubmit(values) {
        const name = values.name.trim();
        if (!name) return 'Give the space a name.';
        if (space) app.renameSpace(space.id, name);
        else app.createSpace(name);
        return true;
      },
    });
  }

  function confirmAction({ title, text, submit, onConfirm }) {
    openTiny({
      title,
      fields: [],
      note: text,
      submit,
      danger: true,
      onSubmit() {
        onConfirm();
        return true;
      },
    });
  }

  function confirmClearHistory() {
    if (app.state.history.length === 0) {
      ui.toast(app, { title: 'History is already empty', text: 'Nothing to sweep away.', icon: 'clock' });
      return;
    }
    confirmAction({
      title: 'Clear history?',
      text: 'Every visited page leaves the ledger. Bookmarks remain.',
      submit: 'Clear history',
      onConfirm: () => app.clearHistory(),
    });
  }

  function confirmClearBookmarks() {
    if (app.state.bookmarks.length === 0) {
      ui.toast(app, { title: 'The shelf is empty', text: 'No bookmarks to clear.', icon: 'bookmark' });
      return;
    }
    confirmAction({
      title: 'Clear bookmarks?',
      text: 'Every saved page leaves the gold shelf. This cannot be undone.',
      submit: 'Clear bookmarks',
      onConfirm: () => app.clearBookmarks(),
    });
  }

  function confirmReset() {
    confirmAction({
      title: 'Reset DG Brows?',
      text: 'Every space, tab, shortcut, bookmark, and page of history will be returned to a fresh install.',
      submit: 'Reset everything',
      onConfirm: () => app.resetAll(),
    });
  }

  async function copyText(text) {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      ui.toast(app, { title: 'Copied', text: text.slice(0, 120), icon: 'copy', duration: 2600 });
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try {
        document.execCommand('copy');
        ui.toast(app, { title: 'Copied', text: text.slice(0, 120), icon: 'copy', duration: 2600 });
      } catch {
        ui.toast(app, { title: 'Could not copy', text: 'Your browser blocked clipboard access.', tone: 'error', icon: 'copy' });
      }
      area.remove();
    }
  }

  async function refreshEngineInfo() {
    const info = await app.loadEngine(true);
    const online = Boolean(info?.online);
    const viaHttp = info?.mode === 'http';
    ui.toast(app, {
      title: online ? 'Lightpanda online' : viaHttp ? 'HTTP fallback active' : 'Engine offline',
      text: online
        ? `${info.version || 'Lightpanda'} is rendering your pages.`
        : viaHttp
          ? 'Lightpanda is unavailable; pages are fetched directly.'
          : info?.detail || 'The status endpoint could not be reached.',
      icon: online ? 'sparkles' : 'globe',
      tone: online ? 'gold' : 'error',
    });
  }

  function applySuggestion(item) {
    if (!item) return;
    ui.hideSuggestions(app);
    app.ui.omniEditing = false;
    dom.omnibox.blur();
    if (item.internal) {
      if (item.internal === 'settings') openSettings();
      else if (item.internal === 'shortcuts') openHelp();
      else app.openInternal(item.internal);
      return;
    }
    if (item.url) {
      app.navigateUrl(item.url);
      return;
    }
    if (item.query) app.navigate(item.query);
  }

  function paintSuggestions() {
    ui.renderSuggestions(app, app.ui.suggestItems, app.ui.suggestIndex);
    requestAnimationFrame(() => {
      dom.suggestions.querySelector('.sug-item.is-selected')?.scrollIntoView({ block: 'nearest' });
    });
  }

  function setSuggestionIndex(index) {
    const length = app.ui.suggestItems.length;
    if (!length) return;
    app.ui.suggestIndex = (index + length) % length;
    paintSuggestions();
  }

  function buildSuggestions(value, remote = []) {
    const text = value.trim();
    const items = [];
    const seen = new Set();
    const engineKey = app.state.settings.searchEngine;
    const engine = SEARCH_ENGINES[engineKey] || SEARCH_ENGINES.duckduckgo;

    const add = (item) => {
      const key = `${item.url || ''}|${item.query || ''}|${item.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push(item);
    };

    if (!text) {
      for (const link of app.state.quickLinks.slice(0, 6)) {
        add({ group: 'Quick access', title: link.title, sub: domainOf(link.url), url: link.url, icon: 'sparkles' });
      }
      const recent = new Set();
      for (const entry of app.state.history) {
        if (recent.has(entry.url)) continue;
        recent.add(entry.url);
        add({ group: 'Recent', title: entry.title, sub: prettyUrl(entry.url), url: entry.url, icon: 'clock' });
        if (recent.size >= 4) break;
      }
      return items;
    }

    const resolved = resolveInput(text, engineKey);
    if (resolved.kind === 'url') {
      add({ group: 'Open address', title: text, sub: resolved.url, url: resolved.url, icon: 'globe', badge: 'Go' });
    } else if (resolved.kind === 'internal') {
      add({
        group: 'DG Brows',
        title: `dgbrows://${resolved.internal}`,
        sub: 'Internal page',
        internal: resolved.internal,
        icon: 'layers',
        badge: 'Open',
      });
    } else if (resolved.kind === 'search') {
      add({
        group: 'Search',
        title: `Search for “${text}”`,
        sub: engine.name,
        query: text,
        icon: 'search',
        badge: 'Search',
      });
    }

    const query = text.toLowerCase();
    const seenUrls = new Set();
    for (const entry of app.state.history) {
      if (seenUrls.has(entry.url)) continue;
      if (!entry.title.toLowerCase().includes(query) && !entry.url.toLowerCase().includes(query)) continue;
      seenUrls.add(entry.url);
      add({ group: 'History', title: entry.title, sub: prettyUrl(entry.url), url: entry.url, icon: 'clock' });
      if (seenUrls.size >= 3) break;
    }

    const seenBooks = new Set();
    for (const entry of app.state.bookmarks) {
      if (seenBooks.has(entry.url)) continue;
      if (!entry.title.toLowerCase().includes(query) && !entry.url.toLowerCase().includes(query)) continue;
      seenBooks.add(entry.url);
      add({ group: 'Bookmarks', title: entry.title, sub: prettyUrl(entry.url), url: entry.url, icon: 'bookmark' });
      if (seenBooks.size >= 3) break;
    }

    for (const link of app.state.quickLinks) {
      if (!link.title.toLowerCase().includes(query) && !link.url.toLowerCase().includes(query)) continue;
      add({ group: 'Quick access', title: link.title, sub: domainOf(link.url), url: link.url, icon: 'sparkles' });
    }

    for (const phrase of remote) {
      if (!phrase || phrase.toLowerCase() === query) continue;
      add({ group: 'Suggestions', title: phrase, sub: engine.name, query: phrase, icon: 'search' });
    }

    return items.slice(0, 18);
  }

  function updateSuggestions(value, remote = []) {
    app.ui.suggestItems = buildSuggestions(value, remote);
    app.ui.suggestIndex = value.trim() && app.ui.suggestItems.length ? 0 : -1;
    paintSuggestions();
    ui.showSuggestions(app);
  }

  function requestRemoteSuggestions(value) {
    clearTimeout(suggestTimer);
    const text = value.trim();
    if (!text) return;
    const token = ++app.ui.suggestToken;
    suggestTimer = setTimeout(async () => {
      if (document.activeElement !== dom.omnibox) return;
      const current = dom.omnibox.value;
      if (!current.trim()) return;
      try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(current)}`, {
          headers: { accept: 'application/json' },
        });
        const payload = await response.json();
        if (token !== app.ui.suggestToken) return;
        if (dom.omnibox.value !== current || document.activeElement !== dom.omnibox) return;
        updateSuggestions(current, Array.isArray(payload.suggestions) ? payload.suggestions : []);
      } catch {
        /* suggestions are optional */
      }
    }, 170);
  }

  function rebuildPalette(query) {
    const q = query.trim().toLowerCase();
    const activeTab = app.activeTab();
    const space = app.activeSpace();
    const engine = SEARCH_ENGINES[app.state.settings.searchEngine] || SEARCH_ENGINES.duckduckgo;
    const items = [];
    const add = (group, title, sub, icon, key, run) => {
      items.push({ group, title, sub, icon, key, run });
    };

    add('Navigate', 'New tab', 'A fresh start page', 'plus', 'Ctrl T', () => {
      app.newTab();
      requestAnimationFrame(focusOmnibox);
    });
    add('Navigate', 'New space', 'A new room for tabs and ideas', 'layers', 'Ctrl N', () => openSpaceModal());
    add('Navigate', 'Start page', 'Return to the hero', 'home', null, () => app.goHome());
    add('Go', 'History', 'Every page you have opened', 'clock', null, () => app.openInternal('history'));
    add('Go', 'Bookmarks', 'The gilded shelf', 'bookmark', null, () => app.openInternal('bookmarks'));

    if (activeTab?.url) {
      add('This page', activeTab.readerOpen ? 'Close reader' : 'Reader mode', 'Strip the page to its words', 'book', 'Ctrl E', () => app.toggleReader());
      add('This page', app.isBookmarked(activeTab.url) ? 'Remove bookmark' : 'Bookmark page', prettyUrl(activeTab.url), 'star', 'Ctrl D', () => app.toggleBookmark());
      add('This page', 'Reload page', prettyUrl(activeTab.url), 'reload', 'Ctrl R', () => app.reload());
      add('This page', 'Copy address', activeTab.url, 'copy', null, () => copyText(activeTab.url));
      add('This page', 'Open original', activeTab.url, 'external', null, () => window.open(activeTab.url, '_blank', 'noopener'));
    }

    add('Workspace', 'Settings', 'Appearance, search, and reader', 'sliders', null, openSettings);
    add('Workspace', 'Keyboard shortcuts', 'The gilded key map', 'keyboard', null, openHelp);
    add(
      'Workspace',
      app.state.settings.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
      'More room for the web',
      'layers',
      'Ctrl B',
      () => app.toggleSidebar(),
    );
    add('Workspace', 'Export gold', 'Download spaces, history, and bookmarks', 'download', null, () => app.exportData());

    for (const entry of app.state.spaces) {
      add('Spaces', `Switch to ${entry.name}`, `${entry.tabs.length} ${entry.tabs.length === 1 ? 'tab' : 'tabs'}`, 'layers', null, () =>
        app.switchSpace(entry.id),
      );
    }

    for (const tab of space.tabs) {
      add('Open tabs', tab.title || 'New tab', tab.url ? prettyUrl(tab.url) : 'Start page', 'globe', null, () => app.switchTab(tab.id));
    }

    for (const link of app.state.quickLinks) {
      add('Quick access', link.title, domainOf(link.url), 'sparkles', null, () => app.navigateUrl(link.url));
    }

    for (const entry of app.state.bookmarks.slice(0, 8)) {
      add('Bookmarks', entry.title, prettyUrl(entry.url), 'bookmark', null, () => app.navigateUrl(entry.url));
    }

    const filtered = q
      ? items.filter((item) => `${item.title} ${item.sub || ''} ${item.group}`.toLowerCase().includes(q))
      : items;

    if (q) {
      filtered.unshift({
        group: 'Search',
        title: `Search for “${query.trim()}”`,
        sub: engine.name,
        icon: 'search',
        key: '↵',
        run: () => app.navigate(query.trim()),
      });
    }

    app.ui.paletteItems = filtered;
    app.ui.paletteIndex = 0;
    ui.renderPalette(app, filtered, app.ui.paletteIndex);
  }

  function runPaletteItem(index) {
    const item = app.ui.paletteItems[index];
    if (!item) return;
    closePalette();
    item.run();
  }

  function openTabMenu(tab, x, y) {
    const space = app.activeSpace();
    ui.showMenu(app, x, y, [
      { label: tab.title || 'New tab' },
      {
        text: 'Reload',
        icon: 'reload',
        onSelect: () => {
          app.switchTab(tab.id);
          app.reload();
        },
      },
      { text: 'Duplicate tab', icon: 'copy', onSelect: () => app.duplicateTab(tab.id) },
      { separator: true },
      {
        text: app.isBookmarked(tab.url) ? 'Remove bookmark' : 'Bookmark page',
        icon: 'star',
        disabled: !tab.url,
        onSelect: () => app.toggleBookmark(tab.url, tab.title),
      },
      { text: 'Close tab', icon: 'x', kbd: 'Ctrl W', onSelect: () => app.closeTab(tab.id) },
      {
        text: 'Close other tabs',
        icon: 'trash',
        disabled: space.tabs.length < 2,
        onSelect: () => app.closeOtherTabs(tab.id),
      },
      { separator: true },
      {
        text: 'New tab',
        icon: 'plus',
        kbd: 'Ctrl T',
        onSelect: () => {
          app.newTab();
          requestAnimationFrame(focusOmnibox);
        },
      },
    ]);
  }

  function openSpaceMenu(space, x, y) {
    ui.showMenu(app, x, y, [
      { label: space.name },
      { text: 'Rename space', icon: 'edit', onSelect: () => openSpaceModal(space) },
      {
        text: 'New tab here',
        icon: 'plus',
        onSelect: () => {
          app.switchSpace(space.id);
          app.newTab();
          requestAnimationFrame(focusOmnibox);
        },
      },
      { separator: true },
      {
        text: 'Delete space',
        icon: 'trash',
        danger: true,
        disabled: app.state.spaces.length <= 1,
        onSelect: () =>
          confirmAction({
            title: `Delete “${space.name}”?`,
            text: 'The space and all of its tabs will be closed. History and bookmarks remain.',
            submit: 'Delete space',
            onConfirm: () => app.deleteSpace(space.id),
          }),
      },
    ]);
  }

  function openQuickMenu(link, x, y) {
    ui.showMenu(app, x, y, [
      { label: link.title },
      { text: 'Open', icon: 'arrow-up-right', onSelect: () => app.navigateUrl(link.url) },
      { text: 'Open in new tab', icon: 'plus', onSelect: () => app.newTab(link.url, { activate: true }) },
      { separator: true },
      { text: 'Edit shortcut', icon: 'edit', onSelect: () => openQuickModal(link) },
      { text: 'Remove shortcut', icon: 'trash', danger: true, onSelect: () => app.removeQuickLink(link.id) },
    ]);
  }

  function openHistoryMenu(entry, kind, x, y) {
    const items = [
      { label: entry.title },
      { text: 'Open', icon: 'arrow-up-right', onSelect: () => app.navigateUrl(entry.url) },
      { text: 'Open in new tab', icon: 'plus', onSelect: () => app.newTab(entry.url, { activate: true }) },
      { text: 'Copy address', icon: 'copy', onSelect: () => copyText(entry.url) },
    ];
    if (kind === 'history') {
      items.push({
        text: app.isBookmarked(entry.url) ? 'Remove bookmark' : 'Bookmark page',
        icon: 'star',
        onSelect: () => app.toggleBookmark(entry.url, entry.title),
      });
    }
    items.push({ separator: true });
    items.push({
      text: kind === 'history' ? 'Remove from history' : 'Remove bookmark',
      icon: 'trash',
      danger: true,
      onSelect: () => {
        if (kind === 'history') app.removeHistoryEntry(entry.id);
        else app.removeBookmark(entry.id);
      },
    });
    ui.showMenu(app, x, y, items);
  }

  function handleLibAction(action, row, kind) {
    const url = row.dataset.url;
    const id = row.dataset.entryId;
    if (action === 'open-new') {
      app.newTab(url, { activate: true });
      return;
    }
    if (action === 'copy') {
      copyText(url);
      return;
    }
    if (action === 'bookmark') {
      app.toggleBookmark(url, pageTitleFrom(url));
      return;
    }
    if (action === 'remove') {
      if (kind === 'history') app.removeHistoryEntry(id);
      else app.removeBookmark(id);
    }
  }

  document.addEventListener('click', (event) => {
    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    let handled = true;

    switch (action) {
      case 'back':
        app.goBack();
        break;
      case 'forward':
        app.goForward();
        break;
      case 'reload':
        app.reload();
        break;
      case 'new-tab':
        app.newTab();
        requestAnimationFrame(focusOmnibox);
        break;
      case 'new-space':
        openSpaceModal();
        break;
      case 'toggle-sidebar':
        app.toggleSidebar();
        break;
      case 'palette':
        openPalette();
        break;
      case 'view':
        app.openInternal(actionEl.dataset.view);
        requestAnimationFrame(() => document.getElementById('libSearch')?.focus());
        break;
      case 'open-settings':
        openSettings();
        break;
      case 'close-settings':
        closeSettings();
        break;
      case 'toggle-reader':
        app.toggleReader();
        break;
      case 'bookmark':
        app.toggleBookmark();
        break;
      case 'home':
        app.goHome();
        break;
      case 'engine-info':
        refreshEngineInfo();
        break;
      case 'add-quick':
        openQuickModal();
        break;
      case 'close-reader':
        app.closeReader();
        break;
      case 'reader-smaller':
        app.adjustReaderSize(-1);
        break;
      case 'reader-bigger':
        app.adjustReaderSize(1);
        break;
      case 'open-external': {
        const url = app.activeTab()?.url;
        if (url) window.open(url, '_blank', 'noopener');
        break;
      }
      case 'show-shortcuts':
        openHelp();
        break;
      case 'close-help':
        closeHelp();
        break;
      case 'close-tiny':
        closeTiny();
        break;
      case 'export-data':
        app.exportData();
        break;
      case 'import-data':
        dom.importFile.click();
        break;
      case 'clear-history':
        confirmClearHistory();
        break;
      case 'clear-bookmarks':
        confirmClearBookmarks();
        break;
      case 'clear-all':
        confirmReset();
        break;
      case 'retry-reader':
        app.loadReader(true);
        break;
      case 'close-tab':
        event.stopPropagation();
        app.closeTab(actionEl.dataset.tabId);
        break;
      case 'copy-address': {
        const url = app.activeTab()?.url;
        if (url) copyText(url);
        break;
      }
      default:
        handled = false;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  dom.tabList.addEventListener('click', (event) => {
    if (event.target.closest('[data-action="close-tab"]')) return;
    const tabEl = event.target.closest('.tab');
    if (tabEl) app.switchTab(tabEl.dataset.tabId);
  });

  dom.tabList.addEventListener('auxclick', (event) => {
    if (event.button !== 1) return;
    const tabEl = event.target.closest('.tab');
    if (tabEl) {
      event.preventDefault();
      app.closeTab(tabEl.dataset.tabId);
    }
  });

  dom.tabList.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const tabEl = event.target.closest('.tab');
    if (!tabEl) return;
    event.preventDefault();
    app.switchTab(tabEl.dataset.tabId);
  });

  dom.tabList.addEventListener('contextmenu', (event) => {
    const tabEl = event.target.closest('.tab');
    if (!tabEl) return;
    const space = app.activeSpace();
    const tab = space.tabs.find((entry) => entry.id === tabEl.dataset.tabId);
    if (!tab) return;
    event.preventDefault();
    openTabMenu(tab, event.clientX, event.clientY);
  });

  dom.tabList.addEventListener('dragstart', (event) => {
    const tabEl = event.target.closest('.tab');
    if (!tabEl) return;
    dragTabId = tabEl.dataset.tabId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', dragTabId);
    requestAnimationFrame(() => tabEl.classList.add('dragging'));
  });

  dom.tabList.addEventListener('dragend', () => {
    dragTabId = null;
    dom.tabList.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('dragging', 'drop-target'));
  });

  dom.tabList.addEventListener('dragover', (event) => {
    const tabEl = event.target.closest('.tab');
    if (!tabEl || !dragTabId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    dom.tabList.querySelectorAll('.tab').forEach((tab) => tab.classList.remove('drop-target'));
    if (tabEl.dataset.tabId !== dragTabId) tabEl.classList.add('drop-target');
  });

  dom.tabList.addEventListener('drop', (event) => {
    const tabEl = event.target.closest('.tab');
    if (!tabEl || !dragTabId) return;
    event.preventDefault();
    const space = app.activeSpace();
    const from = space.tabs.findIndex((tab) => tab.id === dragTabId);
    const to = space.tabs.findIndex((tab) => tab.id === tabEl.dataset.tabId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = space.tabs.splice(from, 1);
    space.tabs.splice(to, 0, moved);
    dragTabId = null;
    app.markDirty();
  });

  dom.spaceList.addEventListener('click', (event) => {
    const item = event.target.closest('.space-item');
    if (item) app.switchSpace(item.dataset.spaceId);
  });

  dom.spaceList.addEventListener('contextmenu', (event) => {
    const item = event.target.closest('.space-item');
    if (!item) return;
    const space = app.state.spaces.find((entry) => entry.id === item.dataset.spaceId);
    if (!space) return;
    event.preventDefault();
    openSpaceMenu(space, event.clientX, event.clientY);
  });

  dom.quickGrid.addEventListener('click', (event) => {
    const card = event.target.closest('.quick-card');
    if (!card) return;
    const link = app.state.quickLinks.find((entry) => entry.id === card.dataset.quickId);
    if (link) app.navigateUrl(link.url);
  });

  dom.quickGrid.addEventListener('contextmenu', (event) => {
    const card = event.target.closest('.quick-card');
    if (!card) return;
    const link = app.state.quickLinks.find((entry) => entry.id === card.dataset.quickId);
    if (!link) return;
    event.preventDefault();
    openQuickMenu(link, event.clientX, event.clientY);
  });

  dom.recentGrid.addEventListener('click', (event) => {
    const item = event.target.closest('.recent-item');
    if (item?.dataset.url) app.navigateUrl(item.dataset.url);
  });

  dom.heroForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = dom.heroInput.value.trim();
    if (!value) {
      dom.heroInput.focus();
      return;
    }
    app.navigate(value);
    dom.heroInput.value = '';
  });

  dom.omnibox.addEventListener('focus', () => {
    app.ui.omniEditing = true;
    dom.omnibox.parentElement.classList.add('is-focused');
    requestAnimationFrame(() => dom.omnibox.select());
    updateSuggestions(dom.omnibox.value);
    requestRemoteSuggestions(dom.omnibox.value);
  });

  dom.omnibox.addEventListener('input', () => {
    app.ui.omniEditing = true;
    updateSuggestions(dom.omnibox.value);
    requestRemoteSuggestions(dom.omnibox.value);
  });

  dom.omnibox.addEventListener('blur', () => {
    dom.omnibox.parentElement.classList.remove('is-focused');
    setTimeout(() => {
      if (document.activeElement === dom.omnibox) return;
      app.ui.omniEditing = false;
      ui.hideSuggestions(app);
      ui.renderChrome(app);
    }, 140);
  });

  dom.omnibox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      ui.hideSuggestions(app);
      ui.renderChrome(app);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!app.ui.suggestItems.length) return;
      event.preventDefault();
      setSuggestionIndex(app.ui.suggestIndex + (event.key === 'ArrowDown' ? 1 : -1));
      return;
    }
    if (event.key === 'Enter') {
      if (!dom.suggestions.hidden && app.ui.suggestIndex >= 0 && app.ui.suggestItems.length) {
        event.preventDefault();
        applySuggestion(app.ui.suggestItems[app.ui.suggestIndex]);
      }
      return;
    }
    if (event.key === 'Tab' && !dom.suggestions.hidden) {
      const item = app.ui.suggestItems[app.ui.suggestIndex];
      if (item) {
        event.preventDefault();
        dom.omnibox.value = item.url || item.query || dom.omnibox.value;
      }
    }
  });

  dom.omniForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = dom.omnibox.value;
    ui.hideSuggestions(app);
    app.ui.omniEditing = false;
    dom.omnibox.blur();
    app.navigate(value);
  });

  dom.suggestions.addEventListener('mousedown', (event) => event.preventDefault());

  dom.suggestions.addEventListener('click', (event) => {
    const item = event.target.closest('.sug-item');
    if (!item) return;
    applySuggestion(app.ui.suggestItems[Number(item.dataset.index)]);
  });

  dom.internalView.addEventListener('input', (event) => {
    if (event.target.id !== 'libSearch') return;
    app.ui.internalQuery = event.target.value;
    ui.renderInternalResults(app);
  });

  dom.internalView.addEventListener('keydown', (event) => {
    if (event.target.id === 'libSearch' && event.key === 'Escape') {
      if (event.target.value) {
        event.preventDefault();
        event.stopPropagation();
        event.target.value = '';
        app.ui.internalQuery = '';
        ui.renderInternalResults(app);
      }
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const row = event.target.closest('.lib-item');
    if (!row) return;
    event.preventDefault();
    app.navigateUrl(row.dataset.url);
  });

  dom.internalView.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-lib-action]');
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      const row = actionButton.closest('.lib-item');
      if (row) handleLibAction(actionButton.dataset.libAction, row, row.dataset.kind);
      return;
    }
    const row = event.target.closest('.lib-item');
    if (row?.dataset.url) app.navigateUrl(row.dataset.url);
  });

  dom.internalView.addEventListener('contextmenu', (event) => {
    const row = event.target.closest('.lib-item');
    if (!row) return;
    const kind = row.dataset.kind;
    const source = kind === 'history' ? app.state.history : app.state.bookmarks;
    const entry = source.find((item) => item.id === row.dataset.entryId);
    if (!entry) return;
    event.preventDefault();
    openHistoryMenu(entry, kind, event.clientX, event.clientY);
  });

  dom.readerScroll.addEventListener('scroll', () => {
    const max = dom.readerScroll.scrollHeight - dom.readerScroll.clientHeight;
    const ratio = max > 0 ? dom.readerScroll.scrollTop / max : 0;
    dom.readerProgress.style.width = `${Math.min(100, Math.max(0, ratio * 100))}%`;
  });

  dom.readerArticle.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (!/^https?:/i.test(href)) return;
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) app.newTab(href, { activate: true });
    else app.navigateUrl(href);
  });

  dom.sheetBackdrop.addEventListener('click', closeSettings);

  dom.settingsSheet.addEventListener('click', (event) => {
    const segmented = event.target.closest('[data-segmented] button[data-value]');
    if (segmented) {
      app.updateSetting(segmented.parentElement.dataset.segmented, segmented.dataset.value);
      ui.syncSettings(app);
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target === dom.importFile) {
      const file = dom.importFile.files?.[0];
      if (file) app.importData(file);
      dom.importFile.value = '';
      return;
    }
    const control = event.target.closest('[data-setting]');
    if (!control || !dom.settingsSheet.contains(control)) return;
    if (control.type === 'checkbox') app.updateSetting(control.dataset.setting, control.checked);
    else if (control.tagName === 'SELECT') app.updateSetting(control.dataset.setting, control.value);
  });

  document.addEventListener('input', (event) => {
    const control = event.target.closest('[data-setting="readerSize"]');
    if (!control || !dom.settingsSheet.contains(control)) return;
    app.updateSetting('readerSize', Number(control.value));
    dom.readerSizeLabel.textContent = `${control.value}px`;
  });

  dom.paletteInput.addEventListener('input', () => rebuildPalette(dom.paletteInput.value));

  dom.paletteInput.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePalette();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      if (!app.ui.paletteItems.length) return;
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const length = app.ui.paletteItems.length;
      app.ui.paletteIndex = (app.ui.paletteIndex + delta + length) % length;
      ui.renderPalette(app, app.ui.paletteItems, app.ui.paletteIndex);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runPaletteItem(app.ui.paletteIndex);
    }
  });

  dom.paletteList.addEventListener('click', (event) => {
    const item = event.target.closest('[data-palette-index]');
    if (item) runPaletteItem(Number(item.dataset.paletteIndex));
  });

  dom.tinyForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const values = {};
    for (const input of dom.tinyFields.querySelectorAll('input')) {
      if (input.required && !input.value.trim()) {
        setTinyNote('Please fill in every field.');
        input.focus();
        return;
      }
      values[input.name] = input.value;
    }
    const result = app.ui.tinyHandler?.(values);
    if (result === false) return;
    if (typeof result === 'string') {
      setTinyNote(result);
      return;
    }
    closeTiny();
  });

  dom.palette.addEventListener('click', (event) => {
    if (event.target === dom.palette) closePalette();
  });

  dom.helpModal.addEventListener('click', (event) => {
    if (event.target === dom.helpModal) closeHelp();
  });

  dom.tinyModal.addEventListener('click', (event) => {
    if (event.target === dom.tinyModal) closeTiny();
  });

  dom.contextMenu.addEventListener('click', (event) => {
    const button = event.target.closest('[data-menu-index]');
    if (!button) return;
    const item = app.ui.menuItems[Number(button.dataset.menuIndex)];
    ui.hideMenu(app);
    if (item && !item.disabled) item.onSelect?.();
  });

  dom.sidebarScrim.addEventListener('click', () => app.closeMobileSidebar());

  document.addEventListener('pointerdown', (event) => {
    if (dom.contextMenu.hidden) return;
    if (!dom.contextMenu.contains(event.target)) ui.hideMenu(app);
  });

  document.addEventListener('pointermove', (event) => {
    if (!app.state.settings.glow) return;
    if (app.ui.spotlightFrame) return;
    app.ui.spotlightFrame = requestAnimationFrame(() => {
      app.ui.spotlightFrame = 0;
      dom.spotlight.style.setProperty('--mx', `${event.clientX}px`);
      dom.spotlight.style.setProperty('--my', `${event.clientY}px`);
    });
  });

  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (event.key === 'Escape') {
      if (!dom.contextMenu.hidden) {
        ui.hideMenu(app);
        return;
      }
      if (!dom.suggestions.hidden) {
        ui.hideSuggestions(app);
        return;
      }
      if (!dom.tinyModal.hidden) {
        closeTiny();
        return;
      }
      if (!dom.palette.hidden) {
        closePalette();
        return;
      }
      if (!dom.helpModal.hidden) {
        closeHelp();
        return;
      }
      if (!dom.settingsSheet.hidden) {
        closeSettings();
        return;
      }
      if (document.body.classList.contains('sidebar-open')) {
        app.closeMobileSidebar();
        return;
      }
      if (document.activeElement === dom.omnibox) dom.omnibox.blur();
      return;
    }

    if (!mod) return;

    if (key === 'k') {
      event.preventDefault();
      if (dom.palette.hidden) openPalette();
      else closePalette();
      return;
    }
    if (key === 'l') {
      event.preventDefault();
      closeSettings();
      closePalette();
      closeHelp();
      focusOmnibox();
      return;
    }
    if (key === 't' && event.shiftKey) {
      event.preventDefault();
      app.restoreClosedTab();
      return;
    }
    if (key === 't') {
      event.preventDefault();
      app.newTab();
      requestAnimationFrame(focusOmnibox);
      return;
    }
    if (key === 'w') {
      event.preventDefault();
      app.closeTab();
      return;
    }
    if (key === 'r') {
      event.preventDefault();
      app.reload();
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      app.toggleBookmark();
      return;
    }
    if (key === 'e') {
      event.preventDefault();
      app.toggleReader();
      return;
    }
    if (key === 'b') {
      event.preventDefault();
      app.toggleSidebar();
      return;
    }
    if (key === 'n') {
      event.preventDefault();
      openSpaceModal();
      return;
    }
    if (key === '[') {
      event.preventDefault();
      app.goBack();
      return;
    }
    if (key === ']') {
      event.preventDefault();
      app.goForward();
      return;
    }
    if (/^[1-9]$/.test(event.key)) {
      const space = app.activeSpace();
      const tab = space.tabs[Number(event.key) - 1];
      if (tab) {
        event.preventDefault();
        app.switchTab(tab.id);
      }
    }
  });

  dom.importFile.addEventListener('change', () => {
    dom.importFile.value = '';
  });

  app.ui.focusOmnibox = focusOmnibox;
  app.ui.openOverlay = (name) => {
    if (name === 'settings') openSettings();
    else if (name === 'shortcuts') openHelp();
    else if (name === 'palette') openPalette();
  };

  window.addEventListener('resize', () => {
    ui.hideMenu(app);
    if (window.innerWidth > 880) app.closeMobileSidebar();
    ui.applySettings(app);
  });

  dom.sidebar.addEventListener('click', (event) => {
    if (!event.target.closest('.tab, .space-item, .nav-item')) {
      return;
    }
    if (window.innerWidth <= 880) app.closeMobileSidebar();
  });

  return app;
}
