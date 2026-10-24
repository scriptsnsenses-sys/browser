export class TTLCache {
  constructor({ max = 30, ttlMs = 180_000 } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.items = new Map();
  }

  get(key) {
    const item = this.items.get(key);
    if (!item) return null;

    if (item.expiresAt < Date.now()) {
      this.items.delete(key);
      return null;
    }

    this.items.delete(key);
    this.items.set(key, item);
    return item.value;
  }

  set(key, value, ttlMs = this.ttlMs) {
    if (this.items.has(key)) this.items.delete(key);
    this.items.set(key, { value, expiresAt: Date.now() + ttlMs });

    while (this.items.size > this.max) {
      const oldest = this.items.keys().next().value;
      if (oldest === undefined) break;
      this.items.delete(oldest);
    }
  }

  clear() {
    this.items.clear();
  }
}
