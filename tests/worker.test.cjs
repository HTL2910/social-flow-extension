const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function worker(){
 const db={},listeners={},injected=[];
 const chrome={storage:{session:{get:async key=>({[key]:db[key]}),set:async obj=>Object.assign(db,structuredClone(obj)),remove:async key=>{delete db[key];}}},runtime:{onMessage:{addListener:f=>listeners.message=f}},tabs:{onRemoved:{addListener:f=>listeners.remove=f},onUpdated:{addListener:f=>listeners.update=f},get:async id=>({id,url:'https://www.facebook.com/'}),sendMessage:async()=>({running:true})},scripting:{executeScript:async args=>{injected.push(args);return [];}}};
 const context={chrome,URL,console,setTimeout,clearTimeout};vm.createContext(context);
 const file=path.join(__dirname,'../extension/background.js');if(fs.existsSync(file))vm.runInContext(fs.readFileSync(file,'utf8'),context);
 return {db,listeners,injected,send:(message,documentId='docA')=>new Promise(resolve=>{assert.ok(listeners.message,'Worker listener missing');listeners.message(message,{tab:{id:7,url:'https://www.facebook.com/'},documentId,url:'https://www.facebook.com/',frameId:0,documentLifecycle:'active'},resolve);})};
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
