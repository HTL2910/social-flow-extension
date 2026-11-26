const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const spin=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
function panelNode(){return {style:{},isConnected:false,setAttribute(){},addEventListener(){},attachShadow(){const nodes=new Map();return this.shadowRoot={innerHTML:'',querySelector(s){if(!nodes.has(s))nodes.set(s,panelNode());return nodes.get(s);}};}};}
async function harness({facebook=true,confirm=true,saved=null,collectError=false}={}){
 let listener,now=0,seq=0,scroll=0;const timers=new Map(),events={},clicks=[],snapshots=[];
 const button={isConnected:true,pressed:false,getClientRects:()=>[{}],getBoundingClientRect:()=>({width:100,height:30,top:100,bottom:130,left:100,right:200}),click(){clicks.push('post:1');if(confirm)this.pressed=true;}};
 const document={hidden:false,documentElement:{appendChild(el){el.isConnected=true;}},createElement:()=>panelNode(),addEventListener(type,fn){events[type]=fn;}};
 const context={console,crypto:{randomUUID},document,location:{hostname:facebook?'www.facebook.com':'example.com',origin:facebook?'https://www.facebook.com':'https://example.com'},innerHeight:800,innerWidth:1000,setTimeout(fn,ms){const id=++seq;timers.set(id,{fn,at:now+ms});return id;},clearTimeout(id){timers.delete(id);},addEventListener(type,fn){events[type]=fn;},scrollBy({top}){scroll+=top;},SocialFlowFacebook:{isFacebook:()=>facebook,isLiked:b=>b?.pressed===true,collect(){if(collectError)throw new Error('changed DOM');return [{key:context.currentPostKey||'post:1',signature:context.currentSignature,button,eligible:!button.pressed}];}},chrome:{runtime:{sendMessage:async message=>{if(message.type==='SF_HELLO')return {state:saved};snapshots.push(structuredClone(message.state));return {ok:true};},onMessage:{addListener:fn=>listener=fn}}}};
 context.window=context;vm.createContext(context);
 for(const file of ['core.js','content.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension',file),'utf8'),context);
 await spin();
 return {context,clicks,snapshots,events,get scroll(){return scroll;},command:message=>new Promise(resolve=>listener(message,{},resolve)),async advance(ms){const end=now+ms;await spin();while(true){const pair=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!pair)break;now=pair[1].at;timers.delete(pair[0]);pair[1].fn();await spin();}now=end;await spin();}};
}
test('tab hiding, blur and typing never stop scrolling; only explicit stop does',async()=>{
 const h=await harness();await h.command({type:'SF_START',config:{seconds:1,every:1,maxLikes:1,step:100}});await h.advance(2500);
 assert.deepEqual(h.clicks,['post:1']);assert.equal((await h.command({type:'SF_STATUS'})).liked,1);
 h.context.document.hidden=true;for(const event of ['visibilitychange','blur','input'])h.events[event]?.({type:event});
 const before=h.scroll;await h.advance(4000);assert.ok(h.scroll>before);assert.equal((await h.command({type:'SF_STATUS'})).running,true);
 await h.command({type:'SF_STOP'});const after=h.scroll;await h.advance(5000);assert.equal(h.scroll,after);assert.equal(h.clicks.length,1);
});
test('unconfirmed likes consume cap, never retry and never pause scrolling',async()=>{
 const h=await harness({confirm:false});await h.command({type:'SF_START',config:{seconds:1,every:1,maxLikes:1}});await h.advance(7000);
 const s=await h.command({type:'SF_STATUS'});assert.equal(s.attempts,1);assert.equal(s.liked,0);assert.equal(s.running,true);assert.equal(h.clicks.length,1);assert.ok(s.steps>=4);
});
test('stop cancels a pending click awaiting durable save',async()=>{
 const h=await harness();const send=h.context.chrome.runtime.sendMessage;let release;
 h.context.chrome.runtime.sendMessage=message=>message.type==='SF_SAVE'&&message.state.running&&message.state.attempts===1?new Promise(resolve=>release=resolve):send(message);
 await h.command({type:'SF_START',config:{seconds:1,every:1}});await h.advance(1100);assert.equal(typeof release,'function');
 await h.command({type:'SF_STOP'});release({ok:true});await h.advance(5000);assert.equal(h.clicks.length,0);assert.equal(h.scroll,0);
});
test('generic site scrolls without attempting likes',async()=>{
 const h=await harness({facebook:false});await h.command({type:'SF_START',config:{seconds:1,every:1}});await h.advance(5000);assert.ok(h.scroll>0);assert.equal(h.clicks.length,0);
});
test('restored state retains attempts and active run',async()=>{
 const h=await harness({saved:{running:true,origin:'https://www.facebook.com',runId:'a',revision:5,config:{seconds:1,every:1,maxLikes:1},seen:['post:1'],tried:['post:1'],success:[],steps:4}});
 await h.advance(4000);assert.equal(h.clicks.length,0);const s=await h.command({type:'SF_STATUS'});assert.equal(s.running,true);assert.equal(s.attempts,1);assert.ok(s.steps>4);
});
test('adapter errors do not prevent continued scrolling',async()=>{
 const h=await harness({collectError:true});await h.command({type:'SF_START',config:{seconds:1}});await h.advance(3000);assert.ok(h.scroll>0,'a DOM recognition failure must not stop scrolling');assert.equal((await h.command({type:'SF_STATUS'})).running,true);
});

test('a recycled post DOM node is not clicked after the awaited save',async()=>{
 const h=await harness();const send=h.context.chrome.runtime.sendMessage;
 h.context.chrome.runtime.sendMessage=async message=>{const result=await send(message);if(message.type==='SF_SAVE'&&message.state.attempts===1)h.context.currentPostKey='post:OTHER';return result;};
 await h.command({type:'SF_START',config:{seconds:1,every:1,maxLikes:1}});await h.advance(3000);assert.equal(h.clicks.length,0,'identity must be revalidated after persistence');
});

test('changed content under a pinned identity is not clicked after save',async()=>{
 const h=await harness();const send=h.context.chrome.runtime.sendMessage;
 h.context.currentSignature='content:original';
 h.context.chrome.runtime.sendMessage=async message=>{const result=await send(message);if(message.type==='SF_SAVE'&&message.state.attempts===1)h.context.currentSignature='content:changed';return result;};
 await h.command({type:'SF_START',config:{seconds:1,every:1,maxLikes:1}});await h.advance(3000);assert.equal(h.clicks.length,0);
});
