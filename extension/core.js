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
  class Session {
    constructor(config = {}, saved = {}) {
      this.config = normalizeConfig(config);
      this.seen = new Set((saved.seen || []).slice(0, 5000));
      this.tried = new Set((saved.tried || []).slice(0, 5000));
      this.success = new Set((saved.success || []).filter(k => this.tried.has(k)));
      this.viewed = this.seen.size;
      this.attempts = this.tried.size;
      this.liked = this.success.size;
      this.memoryFull = saved.memoryFull === true;
    }
    consider(key) {
      if (!key || this.seen.has(key)) return false;
      if (this.seen.size >= 5000) { this.memoryFull = true; return false; }
      this.seen.add(key);
      this.viewed = this.seen.size;
      return this.config.autoLike && this.attempts < this.config.maxLikes &&
        this.viewed % this.config.every === 0;
    }
    attempted(key) {
      if (this.seen.has(key) && !this.tried.has(key) && this.attempts < this.config.maxLikes) {
        this.tried.add(key); this.attempts = this.tried.size;
      }
    }
    confirmed(key) {
      if (this.tried.has(key)) { this.success.add(key); this.liked = this.success.size; }
    }
    snapshot() {
      return {config: this.config, seen: [...this.seen], tried: [...this.tried],
        success: [...this.success], viewed: this.viewed, attempts: this.attempts,
        liked: this.liked, memoryFull: this.memoryFull};
    }
  }
  globalThis.SocialFlowCore = Object.freeze({DEFAULTS, normalizeConfig, Session});
})();
