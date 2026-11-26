'use strict';
const $ = id => document.getElementById(id);
let tabId, running = false, resumable = false, busy = false, poll;
const fields = ['seconds', 'step', 'every', 'maxLikes', 'autoLike'];
function showConfig(config) {
  const c = SocialFlowCore.normalizeConfig(config);
  for (const name of fields) name === 'autoLike' ? $(name).checked = c[name] : $(name).value = c[name];
}
function readConfig() {
  return SocialFlowCore.normalizeConfig(Object.fromEntries(fields.map(name => [name, name === 'autoLike' ? $(name).checked : $(name).value])));
}
function error(text = '') { $('error').textContent = text; $('error').hidden = !text; }
function setStartLabel(label) {
  const btn = $('start');
  const arrow = btn.querySelector('span');
  btn.textContent = `${label} `;
  if (arrow) btn.appendChild(arrow);
}
function buttons() {
  $('start').disabled = busy || (running && !resumable) || tabId == null;
  $('stop').disabled = busy || !running;
  $('fields').disabled = busy || running;
  setStartLabel(resumable ? 'Tiếp tục phiên' : 'Bắt đầu lướt');
}
function render(state, disconnected = false, canResume = false) {
  running = state?.running === true;
  resumable = Boolean(disconnected && running && canResume);
  const d = state?.diagnostics;
  $('diagnostic-panel').hidden = !state?.facebook;
  $('diagnostics').textContent = d ?
    `Lượt quét gần nhất: ${d.frames} khung bài; ${d.buttons} nút Like; ${d.eligible} bài đủ điều kiện; ${d.visible} nút đang trong màn hình. Bỏ qua: ${d.missingButton} thiếu nút; ${d.missingKey} thiếu định danh; ${d.alreadyLiked} đã có cảm xúc; ${d.sponsored} quảng cáo.` : 'Chưa có lượt quét. Bấm Bắt đầu và chờ lượt cuộn đầu tiên.';
  $('viewed').textContent = state?.viewed || 0; $('liked').textContent = state?.liked || 0; $('steps').textContent = state?.steps || 0;
  $('badge').textContent = running ? 'ĐANG CHẠY' : 'SẴN SÀNG'; $('badge').classList.toggle('active', running);
  if (running && state.config) showConfig(state.config);
  if (disconnected && running) {
    $('status').textContent = resumable
      ? 'Trang đã tải lại. Bấm Tiếp tục phiên để chạy lại hoặc Dừng.'
      : 'Đang chờ trang hoạt động lại. Bạn vẫn có thể bấm Dừng.';
  } else if (state?.note) $('status').textContent = state.note;
  else if (!running) $('status').textContent = 'Bật để bắt đầu một phiên lướt mới trên tab này.';
  else if (!state.facebook) $('status').textContent = 'Đang cuộn website. Tự like chỉ hỗ trợ Facebook desktop.';
  else if (!state.config?.autoLike || !state.config?.maxLikes) $('status').textContent = 'Đang cuộn. Tự like đang tắt.';
  else if (state.attempts >= state.config?.maxLikes) $('status').textContent = `Đã thử ${state.attempts}/${state.config.maxLikes} lượt like. Vẫn tiếp tục lướt.`;
  else $('status').textContent = `Like mỗi ${state.config?.every} bài hợp lệ · Đã thử ${state.attempts || 0}/${state.config?.maxLikes} lượt.`;
  buttons();
}
async function send(message) {
  const response = await chrome.runtime.sendMessage({...message, tabId});
  if (!response?.ok) throw new Error(response?.error || 'Không liên lạc được với extension.');
  return response;
}
$('settings').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || (running && !resumable) || (!resumable && !$('settings').reportValidity())) return;
  busy = true; buttons(); error();
  try {
    if (resumable) {
      const result = await send({type: 'SF_CONTROL', command: 'SF_RESUME'});
      render(result.state, false, false);
    } else {
      const config = readConfig(); await chrome.storage.local.set({socialFlowConfig: config});
      const result = await send({type: 'SF_CONTROL', command: 'SF_START', config});
      render(result.state, false, false);
    }
  } catch (e) { error(e.message); }
  finally { busy = false; buttons(); }
});
$('stop').addEventListener('click', async () => {
  if (busy) return; busy = true; buttons(); error();
  try { const result = await send({type: 'SF_CONTROL', command: 'SF_STOP'}); render(result.state, false, false); }
  catch (e) { error(e.message); }
  finally { busy = false; buttons(); }
});
(async () => {
  buttons();
  try {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab || !/^https?:\/\//.test(tab.url || '')) throw new Error('Mở Facebook hoặc một website rồi bấm lại biểu tượng extension.');
    tabId = tab.id; $('site').textContent = new URL(tab.url).hostname;
    const saved = await chrome.storage.local.get('socialFlowConfig'); showConfig(saved.socialFlowConfig);
    const result = await send({type: 'SF_INSPECT'}); render(result.state, result.disconnected, result.resumable);
    poll = setInterval(async () => {
      if (busy) return;
      try {
        const result = await send({type: 'SF_INSPECT'});
        if (!busy) { error(); render(result.state, result.disconnected, result.resumable); }
      } catch (e) { error(e.message); }
    }, 1000);
  } catch (e) { error(e.message); $('site').textContent = 'Chưa chọn website'; }
  buttons();
})();
window.addEventListener('unload', () => clearInterval(poll));
