export class BreadcrumbView {
  constructor({ container, onNavigate }) {
    this.container = container;
    this.onNavigate = onNavigate;
    this.items = [];
    this.activeIndex = -1;
    this._listenerAttached = false;
  }

  reset(item) {
    this.items = [item];
    this.activeIndex = 0;
    this.render();
  }

  push(item) {
    const existing = this.items.findIndex(
      (b) => b.type === item.type && b.id === item.id
    );
    if (existing !== -1) {
      this.activeIndex = existing;
    } else {
      this.items = this.items.slice(0, this.activeIndex + 1);
      this.items.push(item);
      this.activeIndex = this.items.length - 1;
    }
    this.render();
  }

  handleClick(index) {
    this.activeIndex = index;
    this.render();
    if (this.onNavigate) {
      this.onNavigate(this.items[index]);
    }
  }

  render() {
    if (this.items.length === 0) {
      this.container.innerHTML = "";
      this.container.classList.add("hidden");
      return;
    }
    this.container.classList.remove("hidden");
    let html = '<div class="breadcrumbs">';
    for (let i = 0; i < this.items.length; i++) {
      const b = this.items[i];
      if (i > 0) html += '<span class="breadcrumb-sep">›</span>';
      const cls = i === this.activeIndex
        ? "breadcrumb breadcrumb-active"
        : "breadcrumb";
      html += `<span class="${cls}" data-breadcrumb-index="${i}">${b.name}</span>`;
    }
    html += "</div>";
    this.container.innerHTML = html;

    if (!this._listenerAttached) {
      this.container.addEventListener("click", (e) => {
        const target = e.target.closest(".breadcrumb");
        if (!target) return;
        const index = parseInt(target.dataset.breadcrumbIndex);
        this.handleClick(index);
      });
      this._listenerAttached = true;
    }
  }

  destroy() {
    this.container.innerHTML = "";
    this._listenerAttached = false;
  }
}