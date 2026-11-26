(() => {
  'use strict';
  if (globalThis.SocialFlowFacebook) return;
  const clean = text => String(text || '').replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const labels = el => [clean(el.getAttribute('aria-label')), clean(el.textContent)].filter(Boolean);
  const own = (el, root) => {
    const article = el.closest('[role="article"]');
    return root.matches('[role="article"]') ? article === root : !article || !root.contains(article);
  };
  const likeLabels = new Set(['like', 'thích']);
  const likedLabels = new Set([
    'liked', 'đã thích', 'remove like', 'bỏ thích', 'unlike', 'remove reaction', 'gỡ cảm xúc', 'bỏ cảm xúc',
    'love', 'care', 'haha', 'wow', 'sad', 'angry', 'yêu thích', 'thương thương', 'buồn', 'phẫn nộ',
  ]);
  const likedEnRe = /^(?:remove|undo) (?:like|love|care|haha|wow|sad|angry|reaction)(?:\b|$)/;
  const likedViRe = /^(?:bỏ|gỡ|hủy) (?:thích|yêu thích|thương thương|haha|wow|buồn|phẫn nộ|cảm xúc)(?:\s|$)/;
  const replyRe = /^(?:reply|trả lời|phản hồi)(?:\b|\s|$)/;
  const companionLabels = new Set(['comment', 'bình luận', 'leave a comment', 'viết bình luận', 'share', 'chia sẻ', 'send', 'gửi']);
  const sponsoredLabels = new Set(['sponsored', 'được tài trợ']);
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
      button.getAttribute('aria-selected') === 'true' ||
      labels(button).some(t => likedLabels.has(t) || likedEnRe.test(t) || likedViRe.test(t)));
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
        const hasReply = siblings.some(b => labels(b).some(t => replyRe.test(t)));
        if (siblings.length >= 2 && siblings.length <= 8 && reactions.length === 1 &&
            !hasReply && siblings.some(b => labels(b).some(t => companionLabels.has(t)))) return button;
      }
    }
    return null;
  }
  function isPostBodyNode(el, root) {
    const body = el.closest('[data-ad-preview="message"],[data-ad-rendering-role="story_message"],p');
    return !!body && body !== root && root.contains(body);
  }
  function parseInlineStyle(el) {
    const raw = el.getAttribute?.('style') || '';
    const map = {};
    for (const decl of raw.split(';')) {
      const idx = decl.indexOf(':');
      if (idx > 0) map[decl.slice(0, idx).trim().toLowerCase()] = decl.slice(idx + 1).trim().toLowerCase();
    }
    return map;
  }
  function readStyle(el, inline) {
    let computed = null;
    if (typeof globalThis.getComputedStyle === 'function' && el.nodeType === 1) {
      try { computed = globalThis.getComputedStyle(el); } catch { computed = null; }
    }
    return prop => inline[prop] || computed?.getPropertyValue?.(prop)?.trim().toLowerCase() || '';
  }
  function isHiddenDecoy(el) {
    if (!el || (el.nodeType !== undefined && el.nodeType !== 1)) return false;
    if (el.getAttribute?.('hidden') != null) return true;
    const inline = parseInlineStyle(el);
    const prop = readStyle(el, inline);
    const display = prop('display');
    if (display === 'none') return true;
    const visibility = prop('visibility');
    if (visibility === 'hidden' || visibility === 'collapse') return true;
    const opacity = prop('opacity');
    if (opacity !== '' && Number(opacity) === 0) return true;
    const fontSize = prop('font-size');
    if (/^0(?:[a-z%]+)?$/.test(fontSize)) return true;
    if (/scale\(\s*0(?:\s*,|\s*\))/.test(prop('transform'))) return true;
    const pos = prop('position');
    if (pos === 'absolute' || pos === 'fixed') {
      const top = prop('top'), left = prop('left'), clip = prop('clip'), clipPath = prop('clip-path');
      if ((top && top !== 'auto' && !/^0(?:[a-z%]+)?$/.test(top)) ||
          (left && left !== 'auto' && !/^0(?:[a-z%]+)?$/.test(left)) ||
          /^rect\(\s*0/.test(clip) || /inset\(\s*50%/.test(clipPath)) return true;
    }
    const width = prop('width'), height = prop('height'), overflow = prop('overflow');
    if (overflow === 'hidden' && (/^0(?:[a-z%]+)?$/.test(width) || /^0(?:[a-z%]+)?$/.test(height))) return true;
    return false;
  }
  function visibleText(el, depth = 0) {
    if (!el || depth > 8) return '';
    if (el.nodeType === 3) return el.nodeValue || '';
    if (isHiddenDecoy(el)) return '';
    const kids = el.childNodes ? [...el.childNodes] : (el.children || []);
    if (!kids.length) return el.textContent || '';
    const ordered = kids.map((child, index) => {
      const inline = child.nodeType === 1 || child.getAttribute ? parseInlineStyle(child) : {};
      const ord = Number(inline.order);
      return {child, index, order: Number.isFinite(ord) ? ord : 0};
    });
    if (ordered.some(item => item.order !== 0)) {
      ordered.sort((a, b) => a.order - b.order || a.index - b.index);
    }
    let out = '';
    for (const {child} of ordered) out += visibleText(child, depth + 1);
    return out;
  }
  function referencedLabel(doc, attrValue) {
    if (!doc || !attrValue || typeof doc.getElementById !== 'function') return '';
    return clean(attrValue.trim().split(/\s+/).map(id => {
      const target = doc.getElementById(id.replace(/^#/, ''));
      return target ? (target.getAttribute?.('aria-label') || target.textContent || '') : '';
    }).join(' '));
  }
  function sponsored(root) {
    const doc = root.ownerDocument || null;
    for (const el of root.querySelectorAll('span,a,svg,[aria-label],[aria-labelledby]')) {
      if (!own(el, root) || isPostBodyNode(el, root)) continue;
      if (isHiddenDecoy(el)) continue;
      const aria = clean(el.getAttribute('aria-label'));
      if (sponsoredLabels.has(aria)) return true;
      const labelledBy = referencedLabel(doc, el.getAttribute('aria-labelledby'));
      if (sponsoredLabels.has(labelledBy)) return true;
      const tag = (el.tagName || el.tag || '').toLowerCase();
      if (tag === 'a') {
        const href = el.getAttribute('href') || '';
        if (/\/ads\/about\b|\/ad_center\b/i.test(href)) return true;
      }
      if (tag === 'svg') {
        if (sponsoredLabels.has(clean(el.textContent))) return true;
        for (const use of el.querySelectorAll('use')) {
          const ref = use.getAttribute('href') || use.getAttribute('xlink:href') || '';
          if (ref.startsWith('#') && sponsoredLabels.has(referencedLabel(doc, ref))) return true;
        }
        continue;
      }
      if (el.children.length === 0) {
        if (sponsoredLabels.has(clean(el.textContent))) return true;
      } else if ((el.textContent || '').length <= 200 && el.querySelectorAll('span,b,i,svg').length <= 60) {
        if (sponsoredLabels.has(clean(visibleText(el)))) return true;
      }
    }
    return false;
  }
  function collect(doc) {
    const pagelets = [...doc.querySelectorAll('[data-pagelet^="FeedUnit"]')];
    const roots = [];
    for (const pagelet of pagelets) {
      if (pagelet.closest('[role="dialog"]')) continue;
      const articles = [...pagelet.querySelectorAll('[role="article"]')].filter(el =>
        !el.parentElement?.closest('[role="article"]') && actionFor(el));
      if (!actionFor(pagelet) && articles.length >= 1) roots.push(...articles);
      else roots.push(pagelet);
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
  globalThis.SocialFlowFacebook = Object.freeze({isFacebook, collect, isLiked, keyFor, actionFor, sponsored});
})();
