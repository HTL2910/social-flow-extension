const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../extension/facebook.js'),'utf8');
function fixture(html){const dom=new JSDOM(html,{url:'https://www.facebook.com/',runScripts:'outside-only'});dom.window.eval(source);return {dom,api:dom.window.SocialFlowFacebook,doc:dom.window.document};}
const actions='<div class="actions"><div role="button" aria-label="Bày tỏ cảm xúc"><span>Thích</span></div><div role="button">Bình luận</div><div role="button">Chia sẻ</div></div>';
test('FeedUnit without role feed/article and React aria label with Like visible text is detected',()=>{
 const {api,doc}=fixture(`<main><div data-pagelet="FeedUnit_0"><a href="/user/posts/123">Bài</a>${actions}</div></main>`);
 const items=api.collect(doc);assert.equal(items.length,1);assert.equal(items[0].eligible,true);assert.equal(items[0].key,'post:123');
});
test('deeply wrapped action row is still detected without mixing page Like',()=>{
 const wrap=s=>'<div>'.repeat(5)+s+'</div>'.repeat(5);
 const {api,doc}=fixture(`<div role="feed"><div role="article"><a href="/user/posts/123">Bài</a><div><div role="button">Like</div></div><div>${wrap('<div role="button">Thích</div>')}${wrap('<div role="button">Bình luận</div>')}${wrap('<div role="button">Chia sẻ</div>')}</div></div></div>`);
 const item=api.collect(doc)[0];assert.equal(item.eligible,true);assert.equal(item.button.textContent,'Thích');
});
test('a photo post permalink supplies stable identity',()=>{
 const {api,doc}=fixture(`<article role="article"><a href="/photo/?fbid=12345&set=a.456">Ảnh</a>${actions}</article>`);
 assert.equal(api.keyFor(doc.querySelector('article')),'photo:12345');
});
test('without permalink, author plus story message provides stable opaque identity',()=>{
 const html=`<main><div data-pagelet="FeedUnit_0"><h3><a href="/example.author">Tác giả mẫu</a></h3><div data-ad-preview="message">Nội dung bài mẫu đủ dài để nhận diện độc lập.</div>${actions}</div></main>`;
 const {api,doc}=fixture(html);const item=api.collect(doc)[0];assert.ok(item?.eligible);assert.match(item.key,/^content:/);assert.ok(!item.key.includes('Nội dung'));
 const second=fixture(html);assert.equal(second.api.collect(second.doc)[0].key,item.key);
 const other=fixture(html.replace('Nội dung bài mẫu đủ dài để nhận diện độc lập.','Một nội dung khác đủ dài và khác bài trước.'));assert.notEqual(other.api.collect(other.doc)[0].key,item.key);
});
test('already reacted label wins over Like text; comment and sponsored controls excluded',()=>{
 const {api,doc}=fixture(`<main><div data-pagelet="FeedUnit_0"><a href="/user/posts/1">Bài</a><div><div role="button" aria-label="Remove Like"><span>Like</span></div><div role="button">Comment</div></div><div role="article"><button>Like</button><button>Reply</button></div></div><div data-pagelet="FeedUnit_1"><a href="/user/posts/2">Bài</a><span>Được tài trợ</span>${actions}</div></main>`);
 const items=api.collect(doc);assert.equal(items.length,2);assert.equal(items[0].reason,'already-liked');assert.equal(items[1].reason,'sponsored');assert.ok(items.every(x=>!x.eligible));
});
test('missing stable identity is reported rather than clicking random controls',()=>{
 const {api,doc}=fixture(`<main><div data-pagelet="FeedUnit_0">${actions}</div></main>`);const item=api.collect(doc)[0];assert.equal(item?.reason,'missing-key');assert.equal(item.eligible,false);
});
test('content loop actually clicks detected Like and reports confirmation in a DOM fixture',async()=>{
 const {dom,doc}=fixture(`<main><div data-pagelet="FeedUnit_0"><a href="/user/posts/123">Bài</a>${actions}</div></main>`);
 const w=dom.window;let listener,clicks=0;
 const button=doc.querySelector('.actions [role="button"]');
 button.getClientRects=()=>[{}];button.getBoundingClientRect=()=>({width:100,height:30,top:100,bottom:130,left:10,right:110});
 button.addEventListener('click',()=>{clicks++;button.setAttribute('aria-pressed','true');button.setAttribute('aria-label','Bỏ thích');});
 w.scrollBy=()=>{};
 w.chrome={runtime:{sendMessage:async m=>m.type==='SF_HELLO'?{ok:true,state:null}:{ok:true},onMessage:{addListener:f=>listener=f}}};
 w.eval(fs.readFileSync(path.join(__dirname,'../extension/core.js'),'utf8'));
 w.eval(fs.readFileSync(path.join(__dirname,'../extension/content.js'),'utf8'));
 const command=m=>new Promise(resolve=>listener(m,{},resolve));
 try{
  await command({type:'SF_START',config:{seconds:1,every:1,maxLikes:1}});
  const end=Date.now()+5000;let status;
  while(Date.now()<end){await new Promise(r=>setTimeout(r,50));status=await command({type:'SF_STATUS'});if(status.liked===1)break;}
  assert.equal(clicks,1);assert.equal(status.liked,1);assert.equal(status.running,true);assert.equal(status.diagnostics.frames,1);assert.equal(status.diagnostics.buttons,1);
  await command({type:'SF_STOP'});
 }finally{dom.window.close();}
});

test('same post keeps identity through expanded text and a later permalink; signature detects changed content',()=>{
 const {api,doc}=fixture(`<main><div data-pagelet="FeedUnit_0"><h3><a href="/author">Author</a></h3><div data-ad-preview="message">A long enough original post preview.</div>${actions}</div></main>`);
 const initial=api.collect(doc)[0];
 doc.querySelector('[data-ad-preview]').textContent+=' More content after expansion.';
 const expanded=api.collect(doc)[0];assert.equal(expanded.key,initial.key);assert.notEqual(expanded.signature,initial.signature);
 const anchor=doc.createElement('a');anchor.href='/author/posts/123';doc.querySelector('[data-pagelet]').prepend(anchor);
 const linked=api.collect(doc)[0];assert.equal(linked.key,initial.key);
 const clone=doc.querySelector('[data-pagelet]').cloneNode(true);doc.querySelector('[data-pagelet]').replaceWith(clone);
 assert.equal(api.collect(doc)[0].key,initial.key,'known permalink alias survives a DOM remount');
});

test('recycled root with a different permanent post URL gets a new identity',()=>{
 const {api,doc}=fixture(`<main><div data-pagelet="FeedUnit_0"><a href="/author/posts/123">Time</a>${actions}</div></main>`);
 assert.equal(api.collect(doc)[0].key,'post:123');
 doc.querySelector('a').href='/author/posts/456';
 assert.equal(api.collect(doc)[0].key,'post:456');
});
