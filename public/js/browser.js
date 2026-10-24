import {
  DEFAULT_QUICK_LINKS,
  MAX_HISTORY,
  MAX_TABS,
  SPACE_ACCENTS,
  clamp,
  debounce,
  domainOf,
  faviconFor,
  loadState,
  makeSpace,
  makeTab,
  normalizeAddress,
  normalizeState,
  pageTitleFrom,
  resolveInput,
  safeHttpUrl,
  saveState,
  seedState,
  serializableState,
  uid,
} from './core.js';
import * as ui from './ui.js';

export function createApp() {
  const app = {
    dom: ui.cacheDom(),
    state: loadState(),
    ui: {
      internal: null,
      internalQuery: '',
      omniEditing: false,
      omniDraft: '',
      suggestItems: [],
      suggestIndex: -1,
      suggestQuery: '',
      suggestToken: 0,
      engine: null,
      menuItems: [],
      paletteItems: [],
      paletteIndex: 0,
      tinyHandler: null,
      readerKey: '',
      frameUrl: '',
      loadToken: 0,
      progressTimer: 0,
      recentlyClosed: [],
      lastTabBySpace: {},
      focusOmnibox: () => {},
      openOverlay: () => {},
    },
  };

  app.activeSpace = () =>
    app.state.spaces.find((space) => space.id === app.state.activeSpaceId) || app.state.spaces[0];

  app.activeTab = () => {
    const space = app.activeSpace();
    if (!space) return null;
    return space.tabs.find((tab) => tab.id === space.activeTabId) || space.tabs[0] || null;
  };

  app.isBookmarked = (url) => Boolean(url && app.state.bookmarks.some((entry) => entry.url === url));

  app.persist = debounce(() => saveState(app.state), 220);

  app.saveNow = () => {
    app.state.savedAt = Date.now();
    return saveState(app.state);
  };

  app.refresh = () => {
    ui.applySettings(app);
    ui.renderSpaces(app);
    ui.renderTabs(app);
    ui.renderStart(app);
    ui.renderChrome(app);
    ui.renderView(app);
    ui.syncSettings(app);
    ui.renderEngine(app);
    app.syncFrame();
  };

  app.markDirty = () => {
    app.persist();
    app.refresh();
  };

  function closeMobileSidebar() {
    document.body.classList.remove('sidebar-open');
    if (app.dom.sidebarScrim) app.dom.sidebarScrim.hidden = true;
  }

  app.closeMobileSidebar = closeMobileSidebar;

  app.toggleSidebar = () => {
    if (window.innerWidth <= 880) {
      const open = !document.body.classList.contains('sidebar-open');
      document.body.classList.toggle('sidebar-open', open);
      app.dom.sidebarScrim.hidden = !open;
      return;
    }
    app.state.settings.sidebarCollapsed = !app.state.settings.sidebarCollapsed;
    app.persist();
    ui.applySettings(app);
    ui.syncSettings(app);
  };

  app.syncFrame = () => {
    const tab = app.activeTab();
    if (!tab) return;
    if (app.ui.internal || tab.readerOpen || !tab.url) {
      return;
    }
    if (app.ui.frameUrl !== tab.url) {
      app.loadPage(tab);
    }
  };

  app.loadPage = (tab = app.activeTab(), force = false) => {
    if (!tab || !tab.url) return;
    if (!force && app.ui.frameUrl === tab.url) return;
    app.ui.frameUrl = tab.url;
    app.ui.loadToken += 1;
    tab.loading = true;
    app.dom.frameLoader.hidden = false;
    ui.setBusy(app, true);
    ui.renderTabs(app);
    app.dom.pageFrame.src = `/p?url=${encodeURIComponent(tab.url)}`;
  };

  app.navigate = (raw, options = {}) => {
    const resolved = resolveInput(raw, app.state.settings.searchEngine);
    if (resolved.kind === 'empty') {
      app.goHome();
      return;
    }
    if (resolved.kind === 'internal') {
      if (resolved.internal === 'settings') {
        app.ui.openOverlay('settings');
        return;
      }
      if (resolved.internal === 'shortcuts') {
        app.ui.openOverlay('shortcuts');
        return;
      }
      if (resolved.internal === 'start' || resolved.internal === 'home') {
        app.goHome();
        return;
      }
      app.openInternal(resolved.internal);
      return;
    }
    if (resolved.kind === 'external') {
      window.open(resolved.url, '_blank', 'noopener');
      return;
    }
    const title = resolved.kind === 'search' ? resolved.query : options.title || null;
    if (options.newTab) {
      app.newTab(resolved.url, { activate: true, title });
      return;
    }
    app.navigateUrl(resolved.url, { title });
  };

  app.navigateUrl = (rawUrl, options = {}) => {
    const url = safeHttpUrl(rawUrl);
    if (!url) {
      ui.toast(app, { title: 'That address is not gold', text: 'Only http and https pages can be opened.', tone: 'error', icon: 'shield' });
      return;
    }
    const tab = app.activeTab();
    if (!tab) return;

    const push = options.push !== false;
    const same = tab.url === url;

    if (push) {
      tab.history = tab.history.slice(0, tab.index + 1);
      if (!same) {
        tab.history.push(url);
        tab.index = tab.history.length - 1;
      } else {
        tab.index = Math.max(0, tab.history.length - 1);
      }
    }

    tab.url = url;
    tab.title = options.title || pageTitleFrom(url);
    tab.favicon = faviconFor(url);
    tab.readerOpen = false;
    tab.readerError = null;
    tab.readerLoading = false;
    tab.readerData = null;
    tab.loading = true;
    if (tab.readerAbort) {
      tab.readerAbort.abort();
      tab.readerAbort = null;
    }
    tab.visitId = push ? app.addHistory(url, tab.title) : null;

    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.ui.frameUrl = '';
    closeMobileSidebar();
    app.markDirty();
    app.dom.omnibox.blur();
  };

  app.addHistory = (url, title) => {
    const id = uid('h');
    app.state.history.unshift({
      id,
      url,
      title: title || pageTitleFrom(url),
      ts: Date.now(),
    });
    if (app.state.history.length > MAX_HISTORY) app.state.history.length = MAX_HISTORY;
    return id;
  };

  app.updateHistoryTitle = (tab, title) => {
    if (!tab.visitId) return;
    const entry = app.state.history.find((item) => item.id === tab.visitId);
    if (entry && title) {
      entry.title = title;
      app.persist();
    }
  };

  app.goBack = () => {
    const tab = app.activeTab();
    if (!tab || tab.index <= 0) return;
    tab.index -= 1;
    app.restoreHistory(tab);
  };

  app.goForward = () => {
    const tab = app.activeTab();
    if (!tab || tab.index >= tab.history.length - 1) return;
    tab.index += 1;
    app.restoreHistory(tab);
  };

  app.restoreHistory = (tab) => {
    const url = tab.history[tab.index];
    if (!url) return;
    tab.url = url;
    tab.title = pageTitleFrom(url);
    tab.favicon = faviconFor(url);
    tab.readerOpen = false;
    tab.readerData = null;
    tab.readerError = null;
    tab.loading = true;
    tab.visitId = null;
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.ui.frameUrl = '';
    app.markDirty();
  };

  app.reload = () => {
    const tab = app.activeTab();
    if (app.ui.internal) {
      ui.renderInternal(app);
      return;
    }
    if (tab?.readerOpen) {
      app.loadReader(true);
      return;
    }
    if (tab?.url) {
      app.loadPage(tab, true);
      return;
    }
    ui.renderStart(app);
  };

  app.home = () => {
    const tab = app.activeTab();
    if (!tab) return;
    tab.url = '';
    tab.title = 'New tab';
    tab.favicon = '';
    tab.readerOpen = false;
    tab.readerData = null;
    tab.readerError = null;
    tab.loading = false;
    tab.visitId = null;
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.ui.frameUrl = '';
    app.dom.pageFrame.removeAttribute('src');
    app.markDirty();
    ui.setBusy(app, false);
    app.dom.frameLoader.hidden = true;
  };

  app.goHome = () => {
    app.home();
    closeMobileSidebar();
  };

  app.newTab = (url = '', options = {}) => {
    const space = app.activeSpace();
    if (!space) return null;
    const activate = options.activate !== false;
    const normalized = url ? safeHttpUrl(url) : '';
    const tab = makeTab(normalized);
    if (normalized && options.title) tab.title = options.title;

    if (space.tabs.length >= MAX_TABS) {
      ui.toast(app, {
        title: 'A very full ledger',
        text: `DG Brows keeps ${MAX_TABS} tabs per space. Close a few to gild another.`,
        tone: 'error',
        icon: 'layers',
      });
      return null;
    }

    space.tabs.push(tab);
    if (activate) {
      space.activeTabId = tab.id;
      app.ui.internal = null;
      app.ui.internalQuery = '';
      app.ui.readerKey = '';
      if (normalized) {
        tab.visitId = app.addHistory(normalized, tab.title);
        tab.loading = true;
      }
      closeMobileSidebar();
    }
    app.markDirty();
    return tab;
  };

  app.switchTab = (id) => {
    const space = app.activeSpace();
    const tab = space.tabs.find((item) => item.id === id);
    if (!tab) return;
    space.activeTabId = id;
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    closeMobileSidebar();
    app.markDirty();
  };

  app.closeTab = (id = app.activeTab()?.id, options = {}) => {
    const space = app.activeSpace();
    const index = space.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    const [tab] = space.tabs.splice(index, 1);
    tab.loading = false;

    if (space.tabs.length === 0) {
      const fresh = makeTab();
      space.tabs.push(fresh);
      space.activeTabId = fresh.id;
    } else if (space.activeTabId === tab.id) {
      space.activeTabId = space.tabs[Math.min(index, space.tabs.length - 1)].id;
    }

    app.ui.recentlyClosed.push({ tab, spaceId: space.id, index });
    if (app.ui.recentlyClosed.length > 10) app.ui.recentlyClosed.shift();
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.markDirty();

    if (!options.silent) {
      ui.toast(app, {
        title: 'Tab closed',
        text: tab.title || 'New tab',
        icon: 'x',
        duration: 3600,
        action: {
          label: 'Undo',
          onClick: () => app.restoreClosedTab(),
        },
      });
    }
  };

  app.closeOtherTabs = (id = app.activeTab()?.id) => {
    const space = app.activeSpace();
    const keep = space.tabs.find((tab) => tab.id === id);
    if (!keep) return;
    for (const tab of [...space.tabs]) {
      if (tab.id !== id) {
        app.ui.recentlyClosed.push({ tab, spaceId: space.id, index: space.tabs.indexOf(tab) });
      }
    }
    space.tabs = [keep];
    space.activeTabId = keep.id;
    app.ui.readerKey = '';
    app.markDirty();
  };

  app.restoreClosedTab = () => {
    const item = app.ui.recentlyClosed.pop();
    if (!item) {
      ui.toast(app, { title: 'Nothing to restore', text: 'The ledger of closed tabs is empty.', icon: 'clock' });
      return;
    }
    const space = app.state.spaces.find((entry) => entry.id === item.spaceId) || app.activeSpace();
    const tab = item.tab;
    tab.loading = false;
    tab.readerOpen = false;
    tab.readerData = null;
    tab.readerError = null;
    tab.readerLoading = false;
    tab.visitId = null;
    delete tab.readerAbort;
    if (space.tabs.some((entry) => entry.id === tab.id)) tab.id = uid('tab');
    space.tabs.splice(Math.min(item.index, space.tabs.length), 0, tab);
    space.activeTabId = tab.id;
    app.state.activeSpaceId = space.id;
    app.ui.internal = null;
    app.ui.readerKey = '';
    app.markDirty();
  };

  app.duplicateTab = (id = app.activeTab()?.id) => {
    const space = app.activeSpace();
    const index = space.tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return null;
    const source = space.tabs[index];
    const copy = makeTab(source.url);
    copy.title = source.title;
    copy.history = [...source.history];
    copy.index = source.index;
    copy.favicon = source.favicon;
    space.tabs.splice(index + 1, 0, copy);
    space.activeTabId = copy.id;
    app.ui.internal = null;
    app.ui.readerKey = '';
    app.markDirty();
    return copy;
  };

  app.createSpace = (name) => {
    const space = makeSpace(name, app.state.spaces.length);
    space.accent = SPACE_ACCENTS[app.state.spaces.length % SPACE_ACCENTS.length];
    space.glyph = String(app.state.spaces.length + 1).padStart(2, '0');
    app.state.spaces.push(space);
    app.state.activeSpaceId = space.id;
    app.ui.internal = null;
    app.ui.readerKey = '';
    app.markDirty();
    closeMobileSidebar();
    return space;
  };

  app.switchSpace = (id) => {
    if (!app.state.spaces.some((space) => space.id === id)) return;
    app.state.activeSpaceId = id;
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    closeMobileSidebar();
    app.markDirty();
  };

  app.renameSpace = (id, name) => {
    const space = app.state.spaces.find((entry) => entry.id === id);
    if (!space) return;
    space.name = String(name || space.name).slice(0, 60);
    app.markDirty();
  };

  app.deleteSpace = (id) => {
    if (app.state.spaces.length <= 1) {
      ui.toast(app, { title: 'One space must remain', text: 'DG Brows always keeps a room for the gold.', tone: 'error', icon: 'layers' });
      return;
    }
    const index = app.state.spaces.findIndex((space) => space.id === id);
    if (index < 0) return;
    app.state.spaces.splice(index, 1);
    if (app.state.activeSpaceId === id) {
      app.state.activeSpaceId = app.state.spaces[Math.max(0, index - 1)].id;
    }
    app.ui.internal = null;
    app.ui.readerKey = '';
    app.markDirty();
  };

  app.openInternal = (kind) => {
    if (!['history', 'bookmarks'].includes(kind)) return;
    app.ui.internal = kind;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.ui.omniEditing = false;
    app.refresh();
  };

  app.closeInternal = () => {
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.refresh();
  };

  app.toggleBookmark = (url = app.activeTab()?.url, title = app.activeTab()?.title) => {
    const safe = safeHttpUrl(url);
    if (!safe) {
      ui.toast(app, { title: 'No page to gild', text: 'Open a page before bookmarking it.', tone: 'error', icon: 'bookmark' });
      return;
    }
    const index = app.state.bookmarks.findIndex((entry) => entry.url === safe);
    if (index >= 0) {
      const [removed] = app.state.bookmarks.splice(index, 1);
      app.markDirty();
      ui.toast(app, {
        title: 'Bookmark removed',
        text: removed.title,
        icon: 'bookmark',
        action: {
          label: 'Undo',
          onClick: () => {
            app.state.bookmarks.unshift(removed);
            app.markDirty();
          },
        },
      });
      return;
    }

    const entry = { id: uid('b'), url: safe, title: (title || pageTitleFrom(safe)).slice(0, 300), ts: Date.now() };
    app.state.bookmarks.unshift(entry);
    app.markDirty();
    ui.toast(app, {
      title: 'Kept in gold',
      text: entry.title,
      icon: 'star',
      action: {
        label: 'Undo',
        onClick: () => {
          app.state.bookmarks = app.state.bookmarks.filter((item) => item.id !== entry.id);
          app.markDirty();
        },
      },
    });
  };

  app.removeHistoryEntry = (id) => {
    app.state.history = app.state.history.filter((entry) => entry.id !== id);
    app.markDirty();
  };

  app.removeBookmark = (id) => {
    const entry = app.state.bookmarks.find((item) => item.id === id);
    if (!entry) return;
    app.state.bookmarks = app.state.bookmarks.filter((item) => item.id !== id);
    app.markDirty();
    ui.toast(app, {
      title: 'Bookmark removed',
      text: entry.title,
      icon: 'bookmark',
      action: {
        label: 'Undo',
        onClick: () => {
          app.state.bookmarks.unshift(entry);
          app.markDirty();
        },
      },
    });
  };

  app.clearHistory = () => {
    app.state.history = [];
    app.markDirty();
    ui.toast(app, { title: 'History cleared', text: 'The trail has been swept clean.', icon: 'clock' });
  };

  app.clearBookmarks = () => {
    app.state.bookmarks = [];
    app.markDirty();
    ui.toast(app, { title: 'Bookmarks cleared', text: 'The shelf is bare.', icon: 'bookmark' });
  };

  app.addQuickLink = (title, url) => {
    const safe = normalizeAddress(url);
    if (!safe) {
      ui.toast(app, { title: 'A shortcut needs an address', text: 'Try something like example.com.', tone: 'error', icon: 'globe' });
      return false;
    }
    if (app.state.quickLinks.length >= 12) {
      ui.toast(app, { title: 'Quick access is full', text: 'Remove a shortcut to add another.', tone: 'error', icon: 'plus' });
      return false;
    }
    app.state.quickLinks.push({
      id: uid('q'),
      title: String(title || domainOf(safe) || 'Shortcut').slice(0, 80),
      url: safe,
    });
    app.markDirty();
    ui.toast(app, { title: 'Shortcut added', text: domainOf(safe), icon: 'sparkles' });
    return true;
  };

  app.updateQuickLink = (id, title, url) => {
    const link = app.state.quickLinks.find((entry) => entry.id === id);
    if (!link) return false;
    const safe = normalizeAddress(url);
    if (!safe) {
      ui.toast(app, { title: 'A shortcut needs an address', text: 'Try something like example.com.', tone: 'error', icon: 'globe' });
      return false;
    }
    link.url = safe;
    link.title = String(title || domainOf(safe)).slice(0, 80);
    app.markDirty();
    ui.toast(app, { title: 'Shortcut updated', text: domainOf(safe), icon: 'edit' });
    return true;
  };

  app.removeQuickLink = (id) => {
    const link = app.state.quickLinks.find((entry) => entry.id === id);
    if (!link) return;
    app.state.quickLinks = app.state.quickLinks.filter((entry) => entry.id !== id);
    app.markDirty();
    ui.toast(app, {
      title: 'Shortcut removed',
      text: link.title,
      icon: 'trash',
      action: {
        label: 'Undo',
        onClick: () => {
          app.state.quickLinks.push(link);
          app.markDirty();
        },
      },
    });
  };

  app.updateSetting = (key, value) => {
    if (!(key in app.state.settings)) return;
    if (key === 'readerSize') value = clamp(Number(value) || 19, 16, 24);
    app.state.settings[key] = value;
    ui.applySettings(app);
    if (key.startsWith('show') || key === 'grain' || key === 'glow' || key === 'motion') {
      ui.renderStart(app);
    }
    if (key === 'sidebarCollapsed') {
      ui.syncSettings(app);
    }
    if (key === 'readerSize') app.dom.readerSizeLabel.textContent = `${value}px`;
    app.persist();
  };

  app.openReader = () => {
    const tab = app.activeTab();
    if (!tab?.url) {
      ui.toast(app, { title: 'Reader needs a page', text: 'Open an article first.', tone: 'error', icon: 'book' });
      return;
    }
    tab.readerOpen = true;
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.refresh();
    if (!tab.readerData || tab.readerData.url !== tab.url) app.loadReader();
  };

  app.closeReader = () => {
    const tab = app.activeTab();
    if (!tab) return;
    tab.readerOpen = false;
    if (tab.readerAbort) {
      tab.readerAbort.abort();
      tab.readerAbort = null;
    }
    tab.readerLoading = false;
    app.ui.readerKey = '';
    app.refresh();
  };

  app.toggleReader = () => {
    const tab = app.activeTab();
    if (!tab?.url) {
      ui.toast(app, { title: 'Reader needs a page', text: 'Open an article first.', tone: 'error', icon: 'book' });
      return;
    }
    if (tab.readerOpen) app.closeReader();
    else app.openReader();
  };

  app.loadReader = async (force = false) => {
    const tab = app.activeTab();
    if (!tab?.url) return;
    if (!force && tab.readerData && tab.readerData.url === tab.url) return;
    if (tab.readerAbort) tab.readerAbort.abort();

    const controller = new AbortController();
    tab.readerAbort = controller;
    tab.readerLoading = true;
    tab.readerError = null;
    tab.readerOpen = true;
    app.ui.readerKey = '';
    app.refresh();

    try {
      const response = await fetch(`/api/reader?url=${encodeURIComponent(tab.url)}`, {
        signal: controller.signal,
        headers: { accept: 'application/json' },
      });
      const payload = await response.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload.error || `Reader failed with HTTP ${response.status}`);
      tab.readerData = { ...payload, url: tab.url };
      tab.readerLoading = false;
      app.ui.readerKey = '';
      app.refresh();
    } catch (error) {
      if (error.name === 'AbortError' || controller.signal.aborted) return;
      tab.readerLoading = false;
      tab.readerError = String(error.message || 'The reader could not extract this page.');
      app.ui.readerKey = '';
      app.refresh();
      ui.toast(app, { title: 'Reader interrupted', text: tab.readerError, tone: 'error', icon: 'book' });
    } finally {
      if (tab.readerAbort === controller) tab.readerAbort = null;
    }
  };

  app.adjustReaderSize = (delta) => {
    app.updateSetting('readerSize', clamp(app.state.settings.readerSize + delta, 16, 24));
    ui.syncSettings(app);
  };

  app.exportData = () => {
    const payload = {
      app: 'DG Brows',
      version: 1,
      exportedAt: new Date().toISOString(),
      ...serializableState(app.state),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `dg-brows-gold-${stamp}.json`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    ui.toast(app, { title: 'Gold exported', text: 'Your spaces, history, and bookmarks are in the file.', icon: 'download' });
  };

  app.importData = async (file) => {
    if (!file) return;
    try {
      const text = await file.text();
      const raw = JSON.parse(text);
      app.state = normalizeState(raw);
      app.ui.internal = null;
      app.ui.internalQuery = '';
      app.ui.readerKey = '';
      app.ui.frameUrl = '';
      app.saveNow();
      app.refresh();
      ui.toast(app, { title: 'Gold imported', text: 'Your ledger is restored.', icon: 'upload' });
    } catch (error) {
      ui.toast(app, { title: 'Import failed', text: String(error.message || error), tone: 'error', icon: 'upload' });
    }
  };

  app.resetAll = () => {
    app.state = seedState();
    app.ui.internal = null;
    app.ui.internalQuery = '';
    app.ui.readerKey = '';
    app.ui.frameUrl = '';
    app.dom.pageFrame.removeAttribute('src');
    app.saveNow();
    app.refresh();
    ui.toast(app, { title: 'DG Brows reset', text: 'A fresh coat of black and gold.', icon: 'sparkles' });
  };

  app.addDefaultShortcuts = () => {
    app.state.quickLinks = DEFAULT_QUICK_LINKS.map((link) => ({ id: uid('q'), ...link }));
    app.markDirty();
  };

  app.loadEngine = async (force = false) => {
    try {
      const response = await fetch(`/api/health${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const info = payload.engine || {};
      app.ui.engine = {
        online: Boolean(info.online),
        mode: info.online ? 'lightpanda' : info.fallback || info.engine === 'http' ? 'http' : 'offline',
        version: info.version || null,
        detail: info.detail || null,
      };
    } catch {
      app.ui.engine = {
        online: false,
        mode: 'offline',
        version: null,
        detail: 'Could not reach the DG Brows engine status endpoint.',
      };
    }
    ui.renderEngine(app);
    return app.ui.engine;
  };

  app.handleFrameMessage = (event) => {
    if (event.source !== app.dom.pageFrame.contentWindow) return;
    const data = event.data;
    if (!data || data.__dgb !== 1) return;
    const tab = app.activeTab();
    if (!tab) return;

    if (data.type === 'meta') {
      const title = String(data.title || '').trim().slice(0, 300);
      if (title && title !== tab.title) {
        tab.title = title;
        app.updateHistoryTitle(tab, title);
        ui.renderTabs(app);
        ui.renderChrome(app);
        if (!app.ui.internal) ui.renderStart(app);
        app.persist();
      }
      return;
    }
    if (data.type === 'navigate') {
      const url = safeHttpUrl(data.url);
      if (url) app.navigateUrl(url, { title: optionsTitle(url) });
      return;
    }
    if (data.type === 'open') {
      const url = safeHttpUrl(data.url);
      if (url) app.newTab(url, { activate: true });
      return;
    }
    if (data.type === 'focus-omnibox') {
      app.ui.focusOmnibox();
      return;
    }
    if (data.type === 'palette') {
      app.ui.openOverlay('palette');
      return;
    }
    if (data.type === 'pageerror') {
      tab.loading = false;
      app.dom.frameLoader.hidden = true;
      ui.setBusy(app, false);
      ui.renderTabs(app);
      ui.toast(app, {
        title: 'Navigation interrupted',
        text: String(data.message || 'The page could not be loaded.').slice(0, 200),
        tone: 'error',
        icon: 'shield',
      });
      return;
    }
    if (data.type === 'home') {
      app.goHome();
    }
  };

  function optionsTitle(url) {
    return pageTitleFrom(url);
  }

  app.start = () => {
    ui.applySettings(app);
    app.refresh();
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('view');
    if (requestedView === 'history' || requestedView === 'bookmarks') {
      app.openInternal(requestedView);
    }
    app.loadEngine();

    app.dom.pageFrame.addEventListener('load', () => {
      const tab = app.activeTab();
      if (!tab || !tab.url) return;
      if (app.ui.frameUrl !== tab.url) return;
      tab.loading = false;
      app.dom.frameLoader.hidden = true;
      ui.setBusy(app, false);
      ui.renderTabs(app);
    });

    window.addEventListener('message', app.handleFrameMessage);
    window.addEventListener('beforeunload', () => app.saveNow());
    window.addEventListener('resize', () => ui.applySettings(app));

    const finishBoot = () => {
      const boot = app.dom.boot;
      if (!boot || boot.classList.contains('is-done')) return;
      boot.classList.add('is-done');
      setTimeout(() => boot.remove(), 950);
    };
    setTimeout(finishBoot, 850);
    window.addEventListener('load', () => setTimeout(finishBoot, 250), { once: true });

    setInterval(() => {
      if (!app.ui.internal && !app.activeTab()?.url) ui.renderStart(app);
    }, 60_000);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    }
  };

  return app;
}
