'use strict';
const queues = new Map();
const keyFor = id => `social-flow:${id}`;
const files = ['core.js', 'facebook.js', 'content.js'];
function serial(id, task) {
  const previous = queues.get(id) || Promise.resolve();
  const next = previous.catch(() => {}).then(task);
  queues.set(id, next);
  next.finally(() => { if (queues.get(id) === next) queues.delete(id); }).catch(() => {});
  return next;
}
async function read(id) { return (await chrome.storage.session.get(keyFor(id)))[keyFor(id)] || null; }
async function write(id, value) { await chrome.storage.session.set({[keyFor(id)]: value}); }
async function inject(tabId) { await chrome.scripting.executeScript({target: {tabId}, files}); }
function origin(url) { try { return new URL(url).origin; } catch { return ''; } }
function summary(state) {
  if (!state) return null;
  const {seen, tried, success, ...rest} = state;
  return rest;
}
async function contentMessage(message, sender) {
  if (!sender.tab || sender.frameId !== 0 || !sender.documentId ||
      (sender.documentLifecycle && sender.documentLifecycle !== 'active')) return {ok: false};
  const id = sender.tab.id;
  return serial(id, async () => {
    const previous = await read(id);
    const currentOrigin = origin(sender.url || sender.tab.url);
    if (message.type === 'SF_HELLO') {
      const state = previous?.state?.origin === currentOrigin ? previous.state : null;
      await write(id, {documentId: sender.documentId, state});
      return {ok: true, state};
    }
    if (previous?.documentId !== sender.documentId || message.state?.origin !== currentOrigin) return {ok: false};
    const state = message.state;
    if (!state || typeof state.running !== 'boolean' || !Number.isSafeInteger(state.revision)) return {ok: false};
    if (previous.state?.runId === state.runId && state.revision <= previous.state.revision) return {ok: false};
    if (previous.state?.runId && previous.state.runId !== state.runId && state.revision !== 1) return {ok: false};
    await write(id, {documentId: sender.documentId, state});
    return {ok: true};
  });
}
async function popupMessage(message) {
  const id = message.tabId;
  if (!Number.isInteger(id)) throw new Error('Không tìm được tab đang mở.');
  const tab = await chrome.tabs.get(id);
  if (!/^https?:\/\//.test(tab.url || '')) throw new Error('Hãy mở một website HTTP/HTTPS rồi bật extension.');
  if (message.type === 'SF_INSPECT') {
    try { return {ok: true, state: await chrome.tabs.sendMessage(id, {type: 'SF_STATUS'})}; }
    catch { return {ok: true, state: summary((await read(id))?.state), disconnected: true}; }
  }
  if (!['SF_START', 'SF_STOP'].includes(message.command)) throw new Error('Lệnh không hợp lệ.');
  if (message.command === 'SF_STOP') {
    try { return {ok: true, state: await chrome.tabs.sendMessage(id, {type: 'SF_STOP'})}; }
    catch {
      // Stop remains possible even if the document has gone away.
      return serial(id, async () => {
        const old = await read(id);
        if (old?.state) { old.state.running = false; await write(id, old); }
        return {ok: true, state: summary(old?.state)};
      });
    }
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
    const saved = await read(id);
    if (!saved?.state?.running) return;
    if (saved.state.origin !== origin(tab.url)) {
      await serial(id, () => chrome.storage.session.remove(keyFor(id)));
      return;
    }
    await inject(id);
  } catch { /* activeTab permission may have expired; popup can start again. */ }
});
