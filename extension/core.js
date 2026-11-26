(() => {
  'use strict';
  if (globalThis.SocialFlowCore) return;
  const DEFAULTS = Object.freeze({seconds: 3, step: 450, every: 10, maxLikes: 5, autoLike: true});
  function number(value, fallback, min, max) {
    const n = value === '' || value == null ? NaN : Number(value);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
  }
  function normalizeConfig(input = {}) {
    return {
      seconds: number(input.seconds, 3, 1, 120),
      step: number(input.step, 450, 100, 1000),
      every: number(input.every, 10, 1, 1000),
      maxLikes: number(input.maxLikes, 5, 0, 10000),
      autoLike: input.autoLike !== false,
    };
  }
  function compactKey(key) {
    if (typeof key !== 'string' || !key) return '';
    if (key.length <= 28) return key;
    let a = 2166136261, b = 5381;
    for (const c of key) {
      const cp = c.codePointAt(0);
      a = Math.imul(a ^ cp, 16777619);
      b = Math.imul(b, 33) ^ cp;
    }
    return `h:${(a >>> 0).toString(16).padStart(8, '0')}${(b >>> 0).toString(16).padStart(8, '0')}`;
  }
  class Session {
    constructor(config = {}, saved = {}) {
      this.config = normalizeConfig(config);
      this.seen = new Set((saved.seen || []).map(compactKey).filter(Boolean).slice(0, 5000));
      this.tried = new Set((saved.tried || []).map(compactKey).filter(Boolean).slice(0, 5000));
      this.success = new Set((saved.success || []).map(compactKey).filter(k => k && this.tried.has(k)));
      this.viewed = this.seen.size;
      this.attempts = this.tried.size;
      this.liked = this.success.size;
      this.memoryFull = saved.memoryFull === true;
      this._addedSeen = new Set();
      this._addedTried = new Set();
      this._addedSuccess = new Set();
      this._removedTried = new Set();
    }
    consider(key) {
      const k = compactKey(key);
      if (!k || this.seen.has(k)) return false;
      if (this.seen.size >= 5000) { this.memoryFull = true; return false; }
      this.seen.add(k);
      this._addedSeen.add(k);
      this.viewed = this.seen.size;
      return this.config.autoLike && this.attempts < this.config.maxLikes &&
        this.viewed % this.config.every === 0;
    }
    attempted(key) {
      const k = compactKey(key);
      if (this.seen.has(k) && !this.tried.has(k) && this.attempts < this.config.maxLikes) {
        this.tried.add(k);
        this._removedTried.delete(k);
        this._addedTried.add(k);
        this.attempts = this.tried.size;
      }
    }
    unattempted(key) {
      const k = compactKey(key);
      if (this.tried.has(k) && !this.success.has(k)) {
        this.tried.delete(k);
        this._addedTried.delete(k);
        this._removedTried.add(k);
        this.attempts = this.tried.size;
      }
    }
    confirmed(key) {
      const k = compactKey(key);
      if (this.tried.has(k) && !this.success.has(k)) {
        this.success.add(k);
        this._addedSuccess.add(k);
        this.liked = this.success.size;
      }
    }
    commitDelta() {
      this._addedSeen.clear();
      this._addedTried.clear();
      this._addedSuccess.clear();
      this._removedTried.clear();
    }
    deltaSnapshot() {
      return {
        config: this.config,
        viewed: this.viewed,
        attempts: this.attempts,
        liked: this.liked,
        memoryFull: this.memoryFull,
        delta: {
          seen: [...this._addedSeen],
          tried: [...this._addedTried],
          success: [...this._addedSuccess],
          removedTried: [...this._removedTried],
        },
      };
    }
    snapshot() {
      return {config: this.config, seen: [...this.seen], tried: [...this.tried],
        success: [...this.success], viewed: this.viewed, attempts: this.attempts,
        liked: this.liked, memoryFull: this.memoryFull};
    }
  }
  globalThis.SocialFlowCore = Object.freeze({DEFAULTS, normalizeConfig, compactKey, Session});
})();
