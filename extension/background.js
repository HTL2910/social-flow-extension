'use strict';
const queues = new Map();
const keyFor = id => `social-flow:${id}`;
const files = ['core.js', 'facebook.js', 'content.js'];
const MAX_KEYS = 5000;
const MAX_RETIRED = 20;
function serial(id, task) {
  const previous = queues.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(id, next);
  next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
  return next;
}
function isQuotaError(error) { return /quota/i.test(error?.message || String(error || '')); }
async function read(id) { return (await chrome.storage.session.get(keyFor(id)))[keyFor(id)] || null; }
async function pruneStoppedSessions(excludeKey) {
  try {
    const all = await chrome.storage.session.get(null);
    if (!all || typeof all !== 'object') return false;
    const stale = Object.keys(all).filter(k =>
      k.startsWith('social-flow:') && k !== excludeKey && !all[k]?.state?.running);
    if (!stale.length) return false;
    await chrome.storage.session.remove(stale);
    return true;
  } catch { return false; }
}
async function write(id, value) {
  const key = keyFor(id);
  try {
    await chrome.storage.session.set({[key]: value});
    return {ok: true};
  } catch (error) {
    if (isQuotaError(error) && await pruneStoppedSessions(key)) {
      try {
        await chrome.storage.session.set({[key]: value});
        return {ok: true};
      } catch (retryError) {
        if (isQuotaError(retryError)) return {ok: false, quotaExceeded: true, error: 'Bộ nhớ phiên đã đầy.'};
        throw retryError;
      }
    }
    if (isQuotaError(error)) return {ok: false, quotaExceeded: true, error: 'Bộ nhớ phiên đã đầy.'};
    throw error;
  }
}
async function inject(tabId) { await chrome.scripting.executeScript({target: {tabId}, files}); }
function origin(url) { try { return new URL(url).origin; } catch { return ''; } }
function summary(state) {
  if (!state) return null;
  const {seen, tried, success, delta, ...rest} = state;
  return rest;
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
function normalizeKeys(list, limit = MAX_KEYS) {
  const out = new Set();
  for (const item of list || []) {
    const k = compactKey(item);
    if (k && out.size < limit) out.add(k);
  }
  return [...out];
}
function mergeKeys(base, added, removed = null, limit = MAX_KEYS) {
  const out = new Set((base || []).map(compactKey).filter(Boolean));
  for (const item of removed || []) out.delete(compactKey(item));
  for (const item of added || []) {
    const k = compactKey(item);
    if (k && out.size < limit) out.add(k);
  }
  return [...out].slice(0, limit);
}
function retireRun(list, runId) {
  const next = Array.isArray(list) ? list.filter(Boolean) : [];
  if (runId && !next.includes(runId)) next.push(runId);
  return next.slice(-MAX_RETIRED);
}
async function contentMessage(message, sender) {
  if (!sender.tab || sender.frameId !== 0 || !sender.documentId ||
      (sender.documentLifecycle && sender.documentLifecycle !== 'active')) return {ok: false};
  const id = sender.tab.id;
  return serial(id, async () => {
    const previous = await read(id);
    const currentOrigin = origin(sender.url || sender.tab.url);
    const retiredRunIds = Array.isArray(previous?.retiredRunIds) ? previous.retiredRunIds : [];
    if (message.type === 'SF_HELLO') {
      const state = previous?.state?.origin === currentOrigin ? previous.state : null;
      const saved = await write(id, {documentId: sender.documentId, retiredRunIds, state});
      if (!saved.ok) return saved;
      return {ok: true, state};
    }
    if (previous?.documentId !== sender.documentId) {
      return {ok: false, needHello: !previous || previous.documentId === null};
    }
    const incoming = message.state;
    if (!incoming || incoming.origin !== currentOrigin ||
        typeof incoming.running !== 'boolean' ||
        !Number.isSafeInteger(incoming.revision) || incoming.revision < 1) return {ok: false};
    if (incoming.runId && retiredRunIds.includes(incoming.runId)) return {ok: false};
    const sameRun = previous.state?.runId === incoming.runId;
    if (sameRun && incoming.revision <= previous.state.revision) return {ok: false};
    const hasFull = Array.isArray(incoming.seen) && Array.isArray(incoming.tried) && Array.isArray(incoming.success);
    let nextState;
    if (hasFull) {
      const {delta: _ignored, ...rest} = incoming;
      const seen = normalizeKeys(incoming.seen);
      const tried = normalizeKeys(incoming.tried);
      const triedSet = new Set(tried);
      const success = normalizeKeys(incoming.success).filter(k => triedSet.has(k));
      nextState = {...rest, seen, tried, success, viewed: seen.length, attempts: tried.length, liked: success.length};
    } else if (incoming.delta && sameRun && Array.isArray(previous.state?.seen)) {
      const {delta, ...rest} = incoming;
      const seen = mergeKeys(previous.state.seen, delta.seen);
      const tried = mergeKeys(previous.state.tried, delta.tried, delta.removedTried);
      const triedSet = new Set(tried);
      const success = mergeKeys(previous.state.success, delta.success).filter(k => triedSet.has(k));
      nextState = {...rest, seen, tried, success, viewed: seen.length, attempts: tried.length, liked: success.length};
    } else {
      return {ok: false, needFull: true};
    }
    const nextRetired = !sameRun && previous.state?.runId
      ? retireRun(retiredRunIds, previous.state.runId) : retiredRunIds;
    return write(id, {documentId: sender.documentId, retiredRunIds: nextRetired, state: nextState});
  });
}
async function popupMessage(message) {
  const id = message.tabId;
  if (!Number.isInteger(id)) throw new Error('Không tìm được tab đang mở.');
  const tab = await chrome.tabs.get(id);
  if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Hãy mở một website HTTP/HTTPS rồi bật extension.');
  const currentOrigin = origin(tab.url);
  if (message.type === 'SF_INSPECT') {
    try { return {ok: true, state: await chrome.tabs.sendMessage(id, {type: 'SF_STATUS'})}; }
    catch {
      return serial(id, async () => {
        const saved = await read(id);
        if (saved?.state?.origin && saved.state.origin !== currentOrigin) {
          await chrome.storage.session.remove(keyFor(id));
          return {ok: true, state: null, disconnected: false, resumable: false};
        }
        const resumable = Boolean(saved?.state?.running && saved.state.origin === currentOrigin);
        return {ok: true, state: summary(saved?.state), disconnected: true, resumable};
      });
    }
  }
  if (!['SF_START', 'SF_STOP', 'SF_RESUME'].includes(message.command)) throw new Error('Lệnh không hợp lệ.');
  if (message.command === 'SF_STOP') {
    try { return {ok: true, state: await chrome.tabs.sendMessage(id, {type: 'SF_STOP'})}; }
    catch {
      // Stop remains possible even if the document has gone away; invalidate owner so a waking script cannot re-enable running.
      return serial(id, async () => {
        const old = await read(id);
        if (old?.state) {
          old.state.running = false;
          old.state.revision = (Number.isSafeInteger(old.state.revision) ? old.state.revision : 0) + 1;
          const retiredRunIds = retireRun(old.retiredRunIds, old.state.runId);
          await write(id, {documentId: null, retiredRunIds, state: old.state});
        }
        return {ok: true, state: summary(old?.state)};
      });
    }
  }
  if (message.command === 'SF_RESUME') {
    const saved = await read(id);
    if (!saved?.state?.running || saved.state.origin !== currentOrigin) {
      throw new Error('Không có phiên đang chạy để tiếp tục trên trang này.');
    }
    await inject(id);
    const state = await chrome.tabs.sendMessage(id, {type: 'SF_STATUS'});
    if (state?.error) throw new Error(state.error);
    return {ok: true, state};
  }
  await inject(id);
  const state = await chrome.tabs.sendMessage(id, {type: 'SF_START', config: message.config});
  if (state?.error) throw new Error(state.error);
  return {ok: true, state};
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  let request;
  if (['SF_HELLO', 'SF_SAVE'].includes(message?.type)) request = contentMessage(message, sender);
  else if (['SF_CONTROL', 'SF_INSPECT'].includes(message?.type) && !sender.tab) request = popupMessage(message);
  else return;
  request.then(reply, error => reply({ok: false, error: error.message || 'Không thể điều khiển tab.'}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => serial(id, () => chrome.storage.session.remove(keyFor(id))));
chrome.tabs.onUpdated.addListener(async (id, change, tab) => {
  if (change.status !== 'complete') return;
  try {
    const shouldInject = await serial(id, async () => {
      const saved = await read(id);
      if (!saved?.state?.running) return false;
      const nextOrigin = origin(tab?.url);
      // Do not wipe saved state if activeTab expired and tab.url is unavailable.
      if (!nextOrigin) return false;
      if (saved.state.origin !== nextOrigin) {
        await chrome.storage.session.remove(keyFor(id));
        return false;
      }
      return true;
    });
    if (shouldInject) await inject(id);
  } catch { /* activeTab permission may have expired; popup can resume or start again. */ }
});
