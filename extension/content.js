(() => {
  'use strict';
  if (globalThis.__socialFlowInstalled) return;
  globalThis.__socialFlowInstalled = true;
  const {Session} = globalThis.SocialFlowCore;
  const fb = globalThis.SocialFlowFacebook;
  const facebook = fb.isFacebook(location.hostname);
  let session = new Session(), running = false, steps = 0, generation = 0;
  let timer, cancelWait, panel, note = '', runId = '', revision = 0, diagnostics = null;
  function status(full = false) {
    const snapshot = session.snapshot();
    const state = {...snapshot, running, steps, note, facebook, runId, revision, diagnostics, origin: location.origin};
    if (!full) { delete state.seen; delete state.tried; delete state.success; }
    return state;
  }
  function normalNote() {
    if (!running) return 'Đã dừng. Bắt đầu lại sẽ tạo phiên mới.';
    if (!facebook) return 'Đang cuộn · Trang này chỉ hỗ trợ tự cuộn.';
    if (!session.config.autoLike || !session.config.maxLikes) return 'Đang cuộn · Tự like đang tắt.';
    if (session.memoryFull) return 'Đang cuộn · Đã đạt giới hạn nhận diện 5.000 bài.';
    if (session.attempts >= session.config.maxLikes) return 'Đủ giới hạn like · Vẫn tiếp tục cuộn.';
    return `Đang cuộn · Like mỗi ${session.config.every} bài đủ điều kiện.`;
  }
  function render() {
    if (!panel?.isConnected) {
      panel = document.createElement('div');
      panel.setAttribute('data-social-flow', '');
      panel.style.cssText = 'position:fixed!important;bottom:20px!important;left:20px!important;z-index:2147483647!important;';
      const shadow = panel.attachShadow({mode: 'open'});
      shadow.innerHTML = `<style>:host{all:initial}*{box-sizing:border-box}.box{font:13px/1.4 system-ui,sans-serif;background:#13221e;color:#f4f9f6;width:260px;padding:14px;border:1px solid #375a4c;border-radius:14px;box-shadow:0 8px 28px #0003}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}strong{font-size:14px}.dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#5ee7a1;margin-right:7px}p{margin:9px 0 0;color:#bad2c5;font-size:12px}button{font:600 12px system-ui;background:#fff;color:#153d2a;border:0;border-radius:8px;padding:7px 12px;cursor:pointer}button:focus-visible{outline:3px solid #7be4b1}button:disabled{opacity:.55;cursor:default}</style><div class="box"><div class="head"><strong><span class="dot"></span>Social Flow</strong><button type="button">Dừng</button></div><p id="counts"></p><p id="note"></p></div>`;
      shadow.querySelector('button').addEventListener('click', () => { stop().catch(() => {}); });
      document.documentElement.appendChild(panel);
    }
    const root = panel.shadowRoot;
    root.querySelector('#counts').textContent = `${session.viewed} bài hợp lệ · ${session.liked} like · ${steps} lần cuộn`;
    root.querySelector('#note').textContent = note || normalNote();
    root.querySelector('button').disabled = !running;
    root.querySelector('button').textContent = running ? 'Dừng' : 'Đã dừng';
    root.querySelector('.dot').style.background = running ? '#5ee7a1' : '#81958b';
  }
  async function persist() {
    revision++;
    try {
      const result = await chrome.runtime.sendMessage({type: 'SF_SAVE', state: status(true)});
      return result?.ok === true;
    } catch { return false; }
  }
  function wait(ms) {
    return new Promise(resolve => {
      const id = setTimeout(() => { cancelWait = null; resolve(); }, ms);
      cancelWait = () => { clearTimeout(id); cancelWait = null; resolve(); };
    });
  }
  function inView(button) {
    if (!button?.isConnected || button.getClientRects().length === 0) return false;
    const r = button.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight && r.right > 0 && r.left < innerWidth;
  }
  async function tick(token) {
    if (!running || token !== generation) return;
    note = '';
    try {
      if (facebook && session.config.autoLike) {
        const items = fb.collect(document);
        diagnostics = {
          frames: items.length,
          buttons: items.filter(p => p.button).length,
          eligible: items.filter(p => p.eligible).length,
          visible: items.filter(p => p.eligible && inView(p.button)).length,
          missingButton: items.filter(p => p.reason === 'missing-button').length,
          missingKey: items.filter(p => p.reason === 'missing-key').length,
          alreadyLiked: items.filter(p => p.reason === 'already-liked').length,
          sponsored: items.filter(p => p.reason === 'sponsored').length,
        };
        if (!diagnostics.eligible && session.attempts < session.config.maxLikes) {
          note = !diagnostics.frames ? 'Đang cuộn · Chưa tìm thấy khung bài Facebook.' :
            diagnostics.missingKey ? 'Đang cuộn · Có nút Like nhưng chưa nhận diện được bài.' :
            diagnostics.missingButton ? 'Đang cuộn · Chưa xác định được cụm nút Like của bài.' :
            'Đang cuộn · Các bài vừa quét đã có cảm xúc hoặc là quảng cáo.';
        }
        for (const item of items) {
          if (!running || token !== generation) return;
          if (!item.eligible || !inView(item.button) || !session.consider(item.key)) continue;
          session.attempted(item.key);
          // Persist the attempt before acting, so a reload cannot retry it.
          const saved = await persist();
          if (!running || token !== generation) return;
          if (!saved) { note = 'Đang cuộn · Không lưu được lượt thử, đã bỏ qua like.'; continue; }
          // Facebook may recycle DOM nodes while the durable save is pending.
          const fresh = fb.collect(document).find(p => p.key === item.key);
          if (!fresh?.eligible || fresh.signature !== item.signature || !fresh.button?.isConnected || fb.isLiked(fresh.button) || !inView(fresh.button)) continue;
          fresh.button.click();
          await wait(1300);
          if (!running || token !== generation) return;
          const updated = fb.collect(document).find(p => p.key === item.key);
          if (updated && fb.isLiked(updated.button)) session.confirmed(item.key);
          else note = 'Đang cuộn · Chưa xác nhận được like; không thử lại bài này.';
          // At most one click per tick, even when several posts are visible.
          break;
        }
      }
    } catch { note = 'Đang cuộn · Chưa nhận diện được bài ở lượt này.'; }
    if (!running || token !== generation) return;
    try {
      window.scrollBy({top: session.config.step, left: 0, behavior: 'instant'});
      steps++;
    } catch { note = 'Đang chạy · Trang chưa cuộn được, sẽ thử lại ở lượt tiếp theo.'; }
    if (!running || token !== generation) return;
    render();
    await persist();
    if (running && token === generation) timer = setTimeout(() => tick(token), session.config.seconds * 1000);
  }
  async function start(config) {
    if (running) return status();
    session = new Session(config); steps = 0; note = ''; diagnostics = null; running = true;
    runId = crypto.randomUUID(); revision = 0; generation++;
    render(); await persist();
    const token = generation;
    if (running) timer = setTimeout(() => tick(token), session.config.seconds * 1000);
    return status();
  }
  async function stop() {
    running = false; generation++; clearTimeout(timer); cancelWait?.(); note = '';
    render(); await persist(); return status();
  }
  const ready = (async () => {
    try {
      const response = await chrome.runtime.sendMessage({type: 'SF_HELLO'});
      const saved = response?.state;
      if (saved && (!saved.origin || saved.origin === location.origin)) {
        session = new Session(saved.config, saved); steps = saved.steps || 0;
        running = saved.running === true; runId = saved.runId || crypto.randomUUID(); revision = saved.revision || 0;
        if (running) { render(); const token = ++generation; timer = setTimeout(() => tick(token), session.config.seconds * 1000); }
      }
    } catch { /* Starting is still available if there is no saved session. */ }
  })();
  chrome.runtime.onMessage.addListener((message, _sender, reply) => {
    if (!['SF_START', 'SF_STOP', 'SF_STATUS'].includes(message?.type)) return;
    ready.then(async () => {
      if (message.type === 'SF_START') return start(message.config);
      if (message.type === 'SF_STOP') return stop();
      return status();
    }).then(reply, () => reply({error: 'Không điều khiển được tab. Hãy tải lại trang.'}));
    return true;
  });
})();
