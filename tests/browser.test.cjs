const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
let browser;
before(async()=>{browser=await chromium.launch({headless:true,args:['--no-sandbox']});});
after(async()=>{await browser?.close();});
const ext=path.join(__dirname,'../extension');
function post(id,{liked=false,sponsored=false,nested=false}={}) {
 return `<article role="article" data-test-post="${id}" style="height:140px"><a href="https://www.facebook.com/person/posts/${id}">Post ${id}</a>${sponsored?'<span>Được tài trợ</span>':''}<p>Nội dung bài viết</p><div class="actions"><button aria-label="${liked?'Remove Like':'Like'}" aria-pressed="${liked}" data-like="${id}">${liked?'Liked':'Like'}</button><button aria-label="Comment">Comment</button><button aria-label="Share">Share</button></div>${nested?'<div role="article"><button aria-label="Like" data-comment-like>Like</button><button aria-label="Reply">Reply</button></div>':''}</article>`;
}
async function fixture(html,hostname='www.facebook.com',saved=null) {
 const page=await browser.newPage({viewport:{width:1000,height:800}});
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:`<!doctype html><html><body>${html}<div style="height:10000px"></div></body></html>`}));
 await page.goto(`https://${hostname}/`);
 await page.evaluate(saved=>{
   window.snapshots=[];window.clicks=[];let listener;
   window.chrome={runtime:{sendMessage:async m=>{if(m.type==='SF_HELLO')return {ok:true,state:saved};if(m.type==='SF_SAVE'){window.snapshots.push(m.state);return {ok:true};}},onMessage:{addListener:f=>listener=f}}};
   window.command=message=>new Promise(resolve=>listener(message,{},resolve));
   document.addEventListener('click',e=>{const b=e.target.closest('[data-like]');if(b){window.clicks.push(b.dataset.like);if(!window.noConfirm){b.setAttribute('aria-pressed','true');b.setAttribute('aria-label','Remove Like');}}if(e.target.closest('[data-comment-like]'))window.clicks.push('COMMENT');});
 },saved);
 for(const file of ['core.js','facebook.js','content.js']) if(fs.existsSync(path.join(ext,file)))await page.addScriptTag({path:path.join(ext,file)});
 return page;
}
async function requireAPI(page){assert.equal(await page.evaluate(()=>!!globalThis.SocialFlowFacebook),true,'Facebook adapter missing');}
test('adapter picks post actions, excludes liked/sponsored/nested comment buttons',async()=>{
 const p=await fixture(`<main><div role="feed">${post('1',{nested:true})}${post('2',{liked:true})}${post('3',{sponsored:true})}</div></main>`);
 try {await requireAPI(p);const items=await p.evaluate(()=>SocialFlowFacebook.collect(document).map(x=>({key:x.key,eligible:x.eligible,button:x.button?.dataset.like})));assert.equal(items.length,3);assert.equal(items[0].eligible,true);assert.equal(items[0].button,'1');assert.equal(items[1].eligible,false);assert.equal(items[2].eligible,false);} finally{await p.close();}
});
test('continues scrolling after cap, ignores blur/input/hidden, stops explicitly',async()=>{
 const p=await fixture(`<div role="feed">${post('1')}${post('2')}${post('3')}</div><input id="typing">`);
 try {await requireAPI(p);await p.clock.install();
 await p.evaluate(()=>command({type:'SF_START',config:{seconds:1,step:100,every:1,maxLikes:1}}));
 await p.clock.runFor(1600);
 assert.deepEqual(await p.evaluate(()=>clicks),['1']);
 await p.evaluate(()=>{Object.defineProperty(document,'hidden',{get:()=>true,configurable:true});document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('blur'));document.querySelector('#typing').focus();document.querySelector('#typing').dispatchEvent(new Event('input',{bubbles:true}));});
 const y=await p.evaluate(()=>scrollY);await p.clock.runFor(2400);
 assert.ok(await p.evaluate(()=>scrollY)>y);assert.deepEqual(await p.evaluate(()=>clicks),['1']);
 const state=await p.evaluate(()=>command({type:'SF_STATUS'}));assert.equal(state.running,true);assert.equal(state.liked,1);
 await p.evaluate(()=>command({type:'SF_STOP'}));const stoppedY=await p.evaluate(()=>scrollY);await p.clock.runFor(5000);assert.equal(await p.evaluate(()=>scrollY),stoppedY);
 }finally{await p.close();}
});
test('unconfirmed click is not retried and consumes attempt budget',async()=>{
 const p=await fixture(`<div role="feed">${post('1')}${post('2')}</div>`);
 try {await requireAPI(p);await p.clock.install();await p.evaluate(()=>{window.noConfirm=true;return command({type:'SF_START',config:{seconds:1,step:100,every:1,maxLikes:1}});});await p.clock.runFor(6000);assert.deepEqual(await p.evaluate(()=>clicks),['1']);const s=await p.evaluate(()=>command({type:'SF_STATUS'}));assert.equal(s.attempts,1);assert.equal(s.liked,0);assert.equal(s.running,true);}finally{await p.close();}
});
test('stop while an attempt waits to persist cancels its click',async()=>{
 const p=await fixture(`<div role="feed">${post('1')}</div>`);
 try {await requireAPI(p);await p.clock.install();await p.evaluate(()=>{const original=chrome.runtime.sendMessage;chrome.runtime.sendMessage=m=>m.type==='SF_SAVE'&&m.state.attempts===1&&m.state.running?new Promise(r=>window.releaseSave=r):original(m);return command({type:'SF_START',config:{seconds:1,every:1}});});await p.clock.runFor(1100);await p.evaluate(()=>command({type:'SF_STOP'}));await p.evaluate(()=>window.releaseSave?.({ok:true}));await p.clock.runFor(4000);assert.deepEqual(await p.evaluate(()=>clicks),[]);}finally{await p.close();}
});
test('other domains scroll only, and saved running state resumes',async()=>{
 const p=await fixture(`<div role="feed">${post('1')}</div>`,'example.test');
 try {await requireAPI(p);await p.clock.install();await p.evaluate(()=>command({type:'SF_START',config:{seconds:1,every:1}}));await p.clock.runFor(3000);assert.ok(await p.evaluate(()=>scrollY)>0);assert.deepEqual(await p.evaluate(()=>clicks),[]);}finally{await p.close();}
 const saved={running:true,config:{seconds:1,every:1,maxLikes:1},seen:['post:1'],tried:['post:1'],success:['post:1'],steps:4};
 const restored=await fixture(`<div role="feed">${post('1')}</div>`,'www.facebook.com',saved);
 try {await requireAPI(restored);const s=await restored.evaluate(()=>command({type:'SF_STATUS'}));assert.equal(s.running,true);assert.equal(s.attempts,1);assert.equal(s.steps,4);}finally{await restored.close();}
});
