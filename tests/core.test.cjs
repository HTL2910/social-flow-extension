const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ctx={}; vm.createContext(ctx);
const file=path.join(__dirname,'../extension/core.js');
if(fs.existsSync(file)) vm.runInContext(fs.readFileSync(file,'utf8'),ctx);
test('session policy exists',()=>assert.ok(ctx.SocialFlowCore,'Session policy missing'));
test('every third unique eligible post, dedupe and attempt cap',()=>{
 const C=ctx.SocialFlowCore; assert.ok(C,'Session policy missing');
 const s=new C.Session({every:3,maxLikes:2});
 assert.equal(s.consider('1'),false); assert.equal(s.consider('1'),false);
 assert.equal(s.consider('2'),false); assert.equal(s.consider('3'),true);
 s.attempted('3'); s.confirmed('3'); s.confirmed('3');
 assert.equal(s.liked,1);
 assert.equal(s.consider('4'),false); assert.equal(s.consider('5'),false);
 assert.equal(s.consider('6'),true); s.attempted('6');
 for(let i=7;i<=30;i++) assert.equal(s.consider(String(i)),false);
 assert.equal(s.viewed,30); assert.equal(s.attempts,2); assert.equal(s.liked,1);
});
test('no confirmation without an attempt; restore does not re-like',()=>{
 const C=ctx.SocialFlowCore; assert.ok(C,'Session policy missing');
 const s=new C.Session({every:1,maxLikes:5}); s.confirmed('ghost'); assert.equal(s.liked,0);
 assert.equal(s.consider('a'),true); s.attempted('a');
 const r=new C.Session(s.config,s.snapshot());
 assert.equal(r.consider('a'),false); assert.equal(r.attempts,1);
 assert.equal(r.consider('b'),true);
});
test('configuration handles malformed inputs and disables likes explicitly',()=>{
 const C=ctx.SocialFlowCore; assert.ok(C,'Session policy missing');
 const c=C.normalizeConfig({every:0,maxLikes:-3,seconds:Infinity,step:999999,autoLike:false});
 assert.equal(c.every,1);assert.equal(c.maxLikes,0);assert.equal(c.seconds,3);assert.equal(c.step,1000);
 const s=new C.Session({every:1,autoLike:false});assert.equal(s.consider('a'),false);
});
test('dedupe memory cap disables further likes but retains session',()=>{
 const C=ctx.SocialFlowCore;assert.ok(C,'Session policy missing');
 const s=new C.Session({every:1,maxLikes:9999});
 for(let i=0;i<5000;i++) s.consider(String(i));
 assert.equal(s.consider('overflow'),false);assert.equal(s.memoryFull,true);
 assert.equal(s.seen.size,5000);
});
