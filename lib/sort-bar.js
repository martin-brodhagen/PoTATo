export class SortBar {
  constructor(opts) {
    this.container = opts.container;
    this.options = opts.options || [];
    const validKeys = new Set(this.options.map(o => o.key));
    this.activeKey = (opts.activeKey && validKeys.has(opts.activeKey))
      ? opts.activeKey : (this.options[0]?.key || 'alpha');
    this.activeDirection = opts.activeDirection || this._getDefaultDirection(this.activeKey);
    this.onChange = opts.onChange || (() => {});
    this._sortButtons = new Map();
    this.buildDOM();
  }

  _getDefaultDirection(key) {
    const opt = this.options.find(o => o.key === key);
    if (opt && opt.defaultDirection) return opt.defaultDirection;
    if (['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'bp', 'acc', 'pri'].includes(key)) return 'desc';
    return 'asc';
  }

  buildDOM() {
    this.bar = document.createElement('div');
    this.bar.className = 'sort-bar';

    for (const opt of this.options) {
      const btn = document.createElement('button');
      btn.className = 'sort-bar-btn';
      btn.dataset.key = opt.key;
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        if (opt.onClick) {
          opt.onClick(opt.key);
        } else {
          this._onClick(opt.key);
        }
      });
      this.bar.appendChild(btn);
      this._sortButtons.set(opt.key, btn);
    }

    this.el = this.bar;
    this.container.appendChild(this.el);
    this._updateUI();
  }

  _onClick(key) {
    if (key === this.activeKey) {
      this.activeDirection = this.activeDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.activeKey = key;
      this.activeDirection = this._getDefaultDirection(key);
    }
    this._updateUI();
    this.onChange(this.activeKey, this.activeDirection);
  }

  _updateUI() {
    for (const [key, btn] of this._sortButtons) {
      btn.classList.toggle('active', key === this.activeKey);
    }
  }

  setActive(key, direction) {
    this.activeKey = key;
    this.activeDirection = direction || this._getDefaultDirection(key);
    this._updateUI();
  }

  getActiveKey() {
    return this.activeKey;
  }

  getActiveDirection() {
    return this.activeDirection;
  }

  destroy() {
    this.bar.remove();
  }
}
