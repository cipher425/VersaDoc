/**
 * Least-Recently-Used cache built on Map (a Map remembers insertion order, so the first key
 * is always the least recently used one). Size 0 = disabled.
 */
export class LRU {
  constructor(maxSize) {
    this.max = maxSize;
    this.map = new Map();
    this.hits = 0;
    this.misses = 0;
  }

  get(key) {
    if (!this.max) return undefined;
    const k = String(key);
    if (!this.map.has(k)) {
      this.misses++;
      return undefined;
    }
    const value = this.map.get(k);
    this.map.delete(k); // move to the "most recent" end
    this.map.set(k, value);
    this.hits++;
    return value;
  }

  set(key, value) {
    if (!this.max) return;
    const k = String(key);
    this.map.delete(k);
    this.map.set(k, value);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }

  stats() {
    return { size: this.map.size, max: this.max, hits: this.hits, misses: this.misses };
  }
}
