export const TAB_REGISTRY = {
  'team-builder': {
    side: 'left',
    panelId: 'tab-content-team-builder',
  },
  'pokedex': {
    side: 'left',
    panelId: 'tab-content-pokedex',
    subTabs: ['pokemon', 'moves', 'abilities', 'items'],
  },
  'imports': {
    side: 'left',
    panelId: 'tab-content-imports',
  },
  'search-detail': {
    side: 'right',
    panelId: 'tab-content-search-detail',
  },
  'defensive-coverage': {
    side: 'right',
    panelId: 'tab-content-defensive-coverage',
  },
  'offensive-coverage': {
    side: 'right',
    panelId: 'tab-content-offensive-coverage',
  },
  'damage-calc': {
    side: 'right',
    panelId: 'tab-content-damage-calc',
  },
};

export class NavigationController {
  constructor(options = {}) {
    this._state = {
      leftTab: 'team-builder',
      rightTab: 'search-detail',
      subTab: 'pokemon',
    };
    this._listeners = [];
    this._widgets = {};
    this._mounted = new Set();
    this._tabRegistry = options.tabRegistry || TAB_REGISTRY;
    this._onActivate = options.onActivate || {};
    this._leftTabSubTabs = {}; // tracks last subTab per left tab

    this._init();
  }

  _init() {
    document.querySelector('.main-sections')?.addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      const tabId = tab.dataset.tab;
      if (!tabId) return;
      this.navigate(tabId);
    });

    document.querySelectorAll('.sub-tab').forEach((el) => {
      el.addEventListener('click', () => {
        const subTabId = el.dataset.subtab;
        if (!subTabId) return;
        const parentPanel = el.closest('.tab-content');
        if (!parentPanel) return;
        this.navigate(this._state.leftTab, { subTab: subTabId });
      });
    });
  }

  getState() {
    return { ...this._state };
  }

  navigate(tabId, { subTab } = {}) {
    const tab = this._tabRegistry[tabId];
    if (!tab) return;

    const prevState = this.getState();
    const prevLeftTab = prevState.leftTab;
    const prevRightTab = prevState.rightTab;

    if (tab.side === 'left') {
      const switchingTabs = this._state.leftTab !== tabId;
      if (switchingTabs) {
        this._leftTabSubTabs[this._state.leftTab] = this._state.subTab;
        this._state.leftTab = tabId;
        this._state.subTab = tab.subTabs
          ? (this._leftTabSubTabs[tabId] || subTab || 'pokemon')
          : null;
      } else if (subTab) {
        this._state.subTab = subTab;
      }
    } else {
      this._state.rightTab = tabId;
      // Don't clear subTab - preserve left tab's subTab state
    }

    if (prevLeftTab !== this._state.leftTab ||
        prevRightTab !== this._state.rightTab ||
        prevState.subTab !== this._state.subTab) {
      this._handleTabActivation(prevLeftTab, prevRightTab);
      this._render();
      this._notifyListeners();
    }
  }

  _handleTabActivation(prevLeftTab, prevRightTab) {
    const activatedTab = this._state.rightTab !== prevRightTab
      ? this._state.rightTab
      : this._state.leftTab;

    if (this._onActivate[activatedTab] && !this._activatedTabs?.has(activatedTab)) {
      if (!this._activatedTabs) this._activatedTabs = new Set();
      this._activatedTabs.add(activatedTab);
      this._onActivate[activatedTab]();
    }
  }

  _render() {
    this._updateTabBar();
    this._updatePanels();
    this._updateSubTabs();
  }

  _updateTabBar() {
    const allTabs = document.querySelectorAll('.tab');
    allTabs.forEach((el) => {
      const tabId = el.dataset.tab;
      const tab = this._tabRegistry[tabId];
      if (!tab) return;

      const isActive = (tab.side === 'left' && tabId === this._state.leftTab) ||
                       (tab.side === 'right' && tabId === this._state.rightTab);
      el.classList.toggle('active', isActive);
    });
  }

  _updatePanels() {
    Object.entries(this._tabRegistry).forEach(([tabId, tab]) => {
      const panel = document.getElementById(tab.panelId);
      if (!panel) return;

      const isActive = (tab.side === 'left' && tabId === this._state.leftTab) ||
                       (tab.side === 'right' && tabId === this._state.rightTab);
      panel.classList.toggle('hidden', !isActive);
    });
  }

  _updateSubTabs() {
    const activeLeftTab = this._tabRegistry[this._state.leftTab];
    const subTabBar = document.querySelector('#tab-content-pokedex .sub-tab-bar');
    const subTabs = subTabBar?.querySelectorAll('.sub-tab');

    if (!activeLeftTab?.subTabs || !subTabs) {
      return;
    }

    subTabs.forEach((el) => {
      const subTabId = el.dataset.subtab;
      el.classList.toggle('active', subTabId === this._state.subTab);
    });

    const subTabContents = document.querySelectorAll('#tab-content-pokedex .subtab-content');
    subTabContents.forEach((el) => {
      const contentId = el.id.replace('subtab-content-', '');
      el.classList.toggle('hidden', contentId !== this._state.subTab);
    });
  }

  registerWidget(tabId, widget) {
    if (!this._widgets[tabId]) {
      this._widgets[tabId] = [];
    }
    this._widgets[tabId].push(widget);
  }

  unregisterWidget(tabId, widget) {
    if (this._widgets[tabId]) {
      this._widgets[tabId] = this._widgets[tabId].filter((w) => w !== widget);
    }
  }

  _notifyListeners() {
    this._listeners.forEach((fn) => fn(this.getState()));
  }

  onChange(fn) {
    this._listeners.push(fn);
  }

  destroy() {
    this._listeners = [];
    this._widgets = {};
  }
}