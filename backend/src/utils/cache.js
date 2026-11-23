import { MAX_CACHE_ENTRIES } from "../config/env.js";

export class TTLCache {
  constructor(name = "cache", max = MAX_CACHE_ENTRIES) {
    this.name = name;
    this.max = max;
    this.map = new Map();
    setInterval(() => this.cleanup(), 300000).unref();
  }
  get(key) {
    const item = this.map.get(key);
    if (!item) return undefined;
    if (item.expires < Date.now()) { this.map.delete(key); return undefined; }
    return item.value;
  }
  set(key, value, ttl) {
    if (this.map.size >= this.max) {
      const first = this.map.keys().next().value;
      if (first !== undefined) this.map.delete(first);
    }
    this.map.set(key, { value, expires: Date.now() + ttl });
  }
  cleanup() {
    const now = Date.now();
    let removed = 0;
    for (const [key, item] of this.map)
      if (item.expires < now) { this.map.delete(key); removed++; }
    if (removed > 0) console.log(`🧹 [${this.name}] Removed ${removed} expired`);
  }
  size() { return this.map.size; }
}

export const tmdbCache = new TTLCache("TMDB");
export const dnsCache = new TTLCache("DNS");
export const probeCache = new TTLCache("PROBE", 500);

export const inflight = new Map();

export async function cached(cache, key, ttl, fn) {
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (inflight.has(key)) return inflight.get(key);
  const p = fn().then((v) => { cache.set(key, v, ttl); return v; }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}