(() => {
  'use strict';
  if (globalThis.SocialFlowFacebook) return;
  const clean = text => String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const labels = el => [clean(el.getAttribute('aria-label')), clean(el.textContent)].filter(Boolean);
  const label = el => labels(el)[0] || '';
  const own = (el, root) => {
    const article = el.closest('[role="article"]');
    return root.matches('[role="article"]') ? article === root : !article || !root.contains(article);
  };
  const likeLabels = new Set(['like', 'thích']);
  const likedLabels = new Set(['liked', 'đã thích', 'remove like', 'bỏ thích', 'unlike', 'remove reaction', 'gỡ cảm xúc']);
  const companionLabels = new Set(['comment', 'bình luận', 'leave a comment', 'viết bình luận', 'share', 'chia sẻ', 'send', 'gửi']);
  const identities = new WeakMap();
  const aliases = new Map();
  function identityFor(root, raw) {
    if (!raw) return null;
    const stable = !raw.startsWith('content:');
    let previous = identities.get(root);
    // A different permanent ID means Facebook recycled this DOM element.
    if (stable && previous?.stable && previous.stable !== raw) previous = null;
    const key = aliases.get(raw) || previous?.key || raw;
    identities.set(root, {key, stable: stable ? raw : previous?.stable});
    aliases.set(raw, key);
    if (aliases.size > 10000) aliases.delete(aliases.keys().next().value);
    return key;
  }
  function isFacebook(host) { return ['facebook.com', 'www.facebook.com', 'web.facebook.com'].includes(host); }
  function buttons(root) { return [...root.querySelectorAll('button,[role="button"]')]; }
  function isLiked(button) {
    return !!button && (button.getAttribute('aria-pressed') === 'true' ||
      button.getAttribute('aria-selected') === 'true' || labels(button).some(t => likedLabels.has(t) || /^(remove|undo) (like|love|care|haha|wow|sad|angry)(?:\b|$)/.test(t) || /^(bỏ|gỡ) (thích|cảm xúc)(?:\s|$)/.test(t)));
  }
  function likeButton(button) {
    return !isLiked(button) && labels(button).some(t => likeLabels.has(t));
  }
  function fingerprint(root) {
    const message = [...root.querySelectorAll('[data-ad-preview="message"],[data-ad-rendering-role="story_message"]')].find(el => own(el, root));
    const author = [...root.querySelectorAll('h2 a[href],h3 a[href],strong a[href]')].find(el => own(el, root));
    if (!message || !author) return null;
    const copy = message.cloneNode(true);
    for (const el of copy.querySelectorAll('button,[role="button"]')) el.remove();
    const text = clean(copy.textContent);
    if (text.length < 16) return null;
    try {
      const u = new URL(author.href, location.href);
      if (!/(^|\.)facebook\.com$/.test(u.hostname)) return null;
      const identity = u.pathname + (u.searchParams.get('id') || '');
      const value = identity + '\n' + text.slice(0, 5000);
      let a = 2166136261, b = 5381;
      for (const c of value) { a = Math.imul(a ^ c.codePointAt(0), 16777619); b = Math.imul(b, 33) ^ c.codePointAt(0); }
      return `content:${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}`;
    } catch { return null; }
  }
  function keyFor(root) {
    for (const link of root.querySelectorAll('a[href]')) {
      if (!own(link, root)) continue;
      try {
        const u = new URL(link.href, location.href);
        if (!/(^|\.)facebook\.com$/.test(u.hostname) || u.searchParams.has('comment_id')) continue;
        const post = u.pathname.match(/\/(?:posts|permalink)\/([^/?]+)/);
        if (post) return `post:${post[1]}`;
        const story = u.searchParams.get('story_fbid');
        if (story) return `post:${story}`;
        const photo = u.searchParams.get('fbid');
        if (photo && /^\/photo(?:\.php|\/|$)/.test(u.pathname)) return `photo:${photo}`;
        const video = u.pathname.match(/\/videos\/(\d+)/);
        if (video) return `video:${video[1]}`;
      } catch { /* Links not identifying a post are ignored. */ }
    }
    return fingerprint(root);
  }
  function actionFor(root) {
    const controls = buttons(root).filter(b => own(b, root));
    for (const button of controls) {
      if (!likeButton(button) && !isLiked(button)) continue;
      if (button.disabled || button.getAttribute('aria-disabled') === 'true') continue;
      // Require a small post-action row; never infer an arbitrary comment Like.
      let row = button.parentElement;
      for (let depth = 0; row && row !== root && depth < 8; depth++, row = row.parentElement) {
        const siblings = controls.filter(b => row.contains(b));
        const reactions = siblings.filter(b => likeButton(b) || isLiked(b));
        const hasReply = siblings.some(b => ['reply', 'trả lời', 'phản hồi'].includes(label(b)));
        if (siblings.length >= 2 && siblings.length <= 8 && reactions.length === 1 &&
            !hasReply && siblings.some(b => labels(b).some(t => companionLabels.has(t)))) return button;
      }
    }
    return null;
  }
  function sponsored(root) {
    return [...root.querySelectorAll('span,a,[aria-label]')].some(el => {
      const t = clean(el.getAttribute('aria-label') || (el.children.length === 0 ? el.textContent : ''));
      return t === 'sponsored' || t === 'được tài trợ';
    });
  }
  function collect(doc) {
    const pagelets = [...doc.querySelectorAll('[data-pagelet^="FeedUnit"]')];
    const roots = [];
    for (const pagelet of pagelets) {
      if (pagelet.closest('[role="dialog"]')) continue;
      const articles = [...pagelet.querySelectorAll('[role="article"]')].filter(el =>
        !el.parentElement?.closest('[role="article"]') && actionFor(el));
      roots.push(!actionFor(pagelet) && articles.length === 1 ? articles[0] : pagelet);
    }
    const outsidePagelets = root => !pagelets.some(p => p.contains(root) || root.contains(p));
    for (const feed of doc.querySelectorAll('[role="feed"]')) {
      const articles = [...feed.querySelectorAll('[role="article"]')].filter(el => !el.parentElement?.closest('[role="article"]'));
      const candidates = articles.length ? articles : [...feed.children];
      roots.push(...candidates.filter(outsidePagelets));
    }
    roots.push(...[...doc.querySelectorAll('main [role="article"],[role="main"] [role="article"]')].filter(el =>
      !el.parentElement?.closest('[role="article"]') && outsidePagelets(el)));
    return [...new Set(roots)].filter(root => !root.closest('[role="dialog"]')).map(root => {
      const button = actionFor(root), signature = keyFor(root), key = identityFor(root, signature);
      const reason = sponsored(root) ? 'sponsored' : !button ? 'missing-button' :
        isLiked(button) ? 'already-liked' : !key ? 'missing-key' : 'eligible';
      return {root, key, signature, button, reason, eligible: reason === 'eligible'};
    });
  }
  globalThis.SocialFlowFacebook = Object.freeze({isFacebook, collect, isLiked, keyFor, actionFor});
})();
