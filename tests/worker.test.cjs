const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function worker({tabUrl='https://www.facebook.com/',tabSend=async()=>({running:true}),onSet}={}){
 const db={},listeners={},injected=[];
 const chrome={
   storage:{session:{
     get:async key=>key===null?structuredClone(db):({[key]:db[key]}),
     set:async obj=>{if(onSet)await onSet(obj,db);Object.assign(db,structuredClone(obj));},
     remove:async key=>{for(const k of (Array.isArray(key)?key:[key]))delete db[k];}
   }},
   runtime:{onMessage:{addListener:f=>listeners.message=f}},
   tabs:{
     onRemoved:{addListener:f=>listeners.remove=f},
     onUpdated:{addListener:f=>listeners.update=f},
     get:async id=>({id,url:typeof tabUrl==='function'?tabUrl(id):tabUrl}),
     sendMessage:async(id,msg)=>tabSend(id,msg)
   },
   scripting:{executeScript:async args=>{injected.push(args);return [];}}
 };
 const context={chrome,URL,console,setTimeout,clearTimeout};vm.createContext(context);
 const file=path.join(__dirname,'../extension/background.js');if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {
   db,listeners,injected,
   send:(message,documentId='docA')=>new Promise(resolve=>{
     assert.ok(listeners.message,'Worker listener missing');
     listeners.message(message,{tab:{id:7,url:'https://www.facebook.com/'},documentId,url:'https://www.facebook.com/',frameId:0,documentLifecycle:'active'},resolve);
   }),
   popup:message=>new Promise(resolve=>{
     assert.ok(listeners.message,'Worker listener missing');
     listeners.message(message,{},resolve);
   }),
 };
}
const state=(revision,extra={})=>({running:true,origin:'https://www.facebook.com',runId:'run1',revision,config:{},seen:[],tried:[],success:[],...extra});
test('worker owns snapshots by document and rejects stale revisions',async()=>{
 const w=worker();assert.ok(w.listeners.message,'Worker listener missing');
 assert.equal((await w.send({type:'SF_HELLO'})).ok,true);
 assert.equal((await w.send({type:'SF_SAVE',state:state(2)})).ok,true);
 assert.equal((await w.send({type:'SF_SAVE',state:state(1,{running:false})})).ok,false);
 const restored=await w.send({type:'SF_HELLO'},'docB');assert.equal(restored.state.running,true);
 assert.equal((await w.send({type:'SF_SAVE',state:state(3,{running:false})})).ok,false);
 assert.equal((await w.send({type:'SF_SAVE',state:state(3)},'docB')).ok,true);
});
test('navigation reinjects only same-origin running tab',async()=>{
 const w=worker();assert.ok(w.listeners.update,'Worker navigation listener missing');
 await w.send({type:'SF_HELLO'});await w.send({type:'SF_SAVE',state:state(1)});
 await w.listeners.update(7,{status:'complete'},{url:'https://www.facebook.com/new'});
 await new Promise(r=>setImmediate(r));assert.equal(w.injected.length,1);
 await w.listeners.update(7,{status:'complete'},{url:'https://example.com/'});
 await new Promise(r=>setImmediate(r));assert.equal(w.injected.length,1);
});
test('closing a tab removes saved state',async()=>{
 const w=worker();assert.ok(w.listeners.remove,'Worker close listener missing');
 await w.send({type:'SF_HELLO'});await w.send({type:'SF_SAVE',state:state(1)});
 await w.listeners.remove(7);await new Promise(r=>setImmediate(r));assert.equal(Object.keys(w.db).length,0);
});
test('worker accepts first seen revision > 1 for a newer runId and rejects retired runIds',async()=>{
 const w=worker();
 await w.send({type:'SF_HELLO'});
 assert.equal((await w.send({type:'SF_SAVE',state:state(1,{runId:'run1'})})).ok,true);
 // Simulate lost revision=1 on run2; revision=2 with full snapshot must still be accepted
 assert.equal((await w.send({type:'SF_SAVE',state:state(2,{runId:'run2'})})).ok,true);
 assert.equal(w.db['social-flow:7'].state.runId,'run2');
 // Retired run1 can never overwrite run2 even with higher revision
 assert.equal((await w.send({type:'SF_SAVE',state:state(99,{runId:'run1'})})).ok,false);
});
test('onUpdated with empty tab.url preserves saved running state',async()=>{
 const w=worker();
 await w.send({type:'SF_HELLO'});await w.send({type:'SF_SAVE',state:state(1)});
 await w.listeners.update(7,{status:'complete'},{});
 await new Promise(r=>setImmediate(r));
 assert.equal(w.injected.length,0);
 assert.equal(w.db['social-flow:7']?.state?.running,true,'missing tab.url must not wipe saved session');
});
test('disconnected SF_STOP invalidates documentId and advances revision against waking scripts',async()=>{
 const w=worker({tabSend:async()=>{throw new Error('Receiving end does not exist');}});
 await w.send({type:'SF_HELLO'},'docA');
 await w.send({type:'SF_SAVE',state:state(3,{runId:'run1'})},'docA');
 const stopped=await w.popup({type:'SF_CONTROL',command:'SF_STOP',tabId:7});
 assert.equal(stopped.ok,true);
 assert.equal(stopped.state.running,false);
 assert.equal(w.db['social-flow:7'].documentId,null);
 assert.equal(w.db['social-flow:7'].state.revision,4);
 // Waking docA trying to flip running back to true is rejected
 const stale=await w.send({type:'SF_SAVE',state:state(5,{runId:'run1',running:true})},'docA');
 assert.equal(stale.ok,false);
 assert.equal(stale.needHello,true);
 assert.equal(w.db['social-flow:7'].state.running,false);
});
test('disconnected same-origin running tab is resumable via SF_INSPECT and SF_RESUME (with popup.js)',async()=>{
 let connected=false;
 const w=worker({
   tabSend:async(_id,msg)=>{
     if(!connected) throw new Error('Receiving end does not exist');
     if(msg.type==='SF_STATUS') return {running:true,facebook:true,viewed:4,liked:1,steps:9,attempts:1,config:{seconds:3,step:450,every:10,maxLikes:5,autoLike:true}};
     return {running:false};
   }
 });
 await w.send({type:'SF_HELLO'},'docA');
 await w.send({type:'SF_SAVE',state:state(2,{viewed:4,liked:1,steps:9})},'docA');
 const inspected=await w.popup({type:'SF_INSPECT',tabId:7});
 assert.equal(inspected.ok,true);
 assert.equal(inspected.disconnected,true);
 assert.equal(inspected.resumable,true);
 // Verify popup.js enables #start with 'Tiếp tục phiên' and sends SF_RESUME on submit
 const elems=new Map();
 const makeEl=id=>{
   const listeners={};
   const span={tag:'span',textContent:'↘'};
   return {
     id,value:'',checked:true,disabled:false,hidden:false,textContent:'',
     classList:{toggle(){}},
     querySelector:s=>s==='span'?span:null,
     appendChild(){},
     reportValidity:()=>true,
     addEventListener:(t,fn)=>listeners[t]=fn,
     trigger:t=>listeners[t]?.({preventDefault(){}})
   };
 };
 const getEl=id=>{if(!elems.has(id))elems.set(id,makeEl(id));return elems.get(id);};
 const commands=[];
 const popupCtx={
   URL,console,setInterval:()=>1,clearInterval(){},
   document:{getElementById:getEl},
   window:{addEventListener(){}},
   chrome:{
     tabs:{query:async()=>[{id:7,url:'https://www.facebook.com/'}]},
     storage:{local:{get:async()=>({}),set:async()=>{}}},
     runtime:{sendMessage:async msg=>{
       commands.push(msg);
       if(msg.command==='SF_RESUME') connected=true;
       return w.popup(msg);
     }}
   }
 };
 vm.createContext(popupCtx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/core.js'),'utf8'),popupCtx);
 vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/popup.js'),'utf8'),popupCtx);
 await new Promise(r=>setImmediate(r));
 assert.equal(getEl('error').textContent,'','unexpected popup init error');
 assert.equal(getEl('start').disabled,false,'resumable tab must keep Start/Resume enabled');
 assert.match(getEl('start').textContent,/Tiếp tục phiên/);
 assert.equal(getEl('fields').disabled,true,'config remains locked while resumable');
 await getEl('settings').trigger('submit');
 await new Promise(r=>setImmediate(r));
 assert.equal(commands.some(c=>c.command==='SF_RESUME'),true);
 assert.equal(w.injected.length,1);
 assert.equal(getEl('start').disabled,true,'once resumed and connected, start disables again');
});
test('worker merges delta SF_SAVE payloads and recovers from QUOTA_BYTES by pruning stopped tabs',async()=>{
 let quotaTriggered=false;
 const w=worker({
   onSet:async(obj,db)=>{
     if(!quotaTriggered && obj['social-flow:7']?.state?.revision===3){
       quotaTriggered=true;
       throw new Error('QUOTA_BYTES quota exceeded');
     }
     if(obj['social-flow:7']?.state?.revision===4){
       throw new Error('QUOTA_BYTES quota exceeded');
     }
   }
 });
 // Seed a stopped session on another tab to be pruned on quota error
 w.db['social-flow:99']={documentId:null,state:{running:false,origin:'https://example.com',seen:['a'],tried:[],success:[]}};
 await w.send({type:'SF_HELLO'});
 assert.equal((await w.send({type:'SF_SAVE',state:state(1,{seen:['post:1'],tried:[],success:[]})})).ok,true);
 // Delta add + rollback
 const delta1={running:true,origin:'https://www.facebook.com',runId:'run1',revision:2,config:{},delta:{seen:['post:2'],tried:['post:2'],success:[],removedTried:[]}};
 assert.equal((await w.send({type:'SF_SAVE',state:delta1})).ok,true);
 assert.deepEqual(w.db['social-flow:7'].state.seen,['post:1','post:2']);
 assert.deepEqual(w.db['social-flow:7'].state.tried,['post:2']);
 // Quota hit on rev 3 -> prunes stopped tab 99 and succeeds!
 const delta2={running:true,origin:'https://www.facebook.com',runId:'run1',revision:3,config:{},delta:{seen:[],tried:[],success:[],removedTried:['post:2']}};
 assert.equal((await w.send({type:'SF_SAVE',state:delta2})).ok,true);
 assert.equal(w.db['social-flow:99'],undefined,'stopped tab session should be pruned on quota error');
 assert.deepEqual(w.db['social-flow:7'].state.tried,[]);
 // Unrecoverable quota hit on rev 4 -> returns quotaExceeded cleanly
 const delta3={running:true,origin:'https://www.facebook.com',runId:'run1',revision:4,config:{},delta:{seen:['post:3'],tried:[],success:[],removedTried:[]}};
 const res=await w.send({type:'SF_SAVE',state:delta3});
 assert.equal(res.ok,false);
 assert.equal(res.quotaExceeded,true);
});
