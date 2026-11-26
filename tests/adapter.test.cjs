const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
// Minimal tree fixture: exercises selection policy, not a replacement for browser DOM tests.
class Element {
 constructor(tag,attrs={},children=[]){
   this.tag=tag;this.tagName=tag.toUpperCase();this.nodeType=1;this.attrs=attrs;this.children=children;
   this.textContent=attrs.text??children.map(c=>c.textContent||'').join('');
   for(const c of children)c.parentElement=this;
   this.href=attrs.href;
 }
 getAttribute(k){return Object.prototype.hasOwnProperty.call(this.attrs,k)?this.attrs[k]:null;}
 matches(selector){return selector.split(',').some(s=>{
   s=s.trim();
   if(s.includes(' ')){
     const parts=s.split(/\s+/);
     if(!this.matches(parts[parts.length-1]))return false;
     let cur=this.parentElement;
     for(let i=parts.length-2;i>=0;i--){
       while(cur&&!cur.matches(parts[i]))cur=cur.parentElement;
       if(!cur)return false;
       cur=cur.parentElement;
     }
     return true;
   }
   const attrPrefix=s.match(/^\[([^=\]]+)\^="([^"]+)"\]$/);
   if(attrPrefix)return String(this.attrs[attrPrefix[1]]||'').startsWith(attrPrefix[2]);
   const attrEq=s.match(/^\[([^=\]]+)="([^"]+)"\]$/);
   if(attrEq)return this.attrs[attrEq[1]]===attrEq[2];
   if(s==='a[href]')return this.tag==='a'&&!!this.attrs.href;
   const attrPresence=s.match(/^\[([^=\]]+)\]$/);
   if(attrPresence)return Object.prototype.hasOwnProperty.call(this.attrs,attrPresence[1]);
   return s===this.tag;
 });}
 closest(s){for(let el=this;el;el=el.parentElement)if(el.matches(s))return el;return null;}
 contains(el){for(let p=el;p;p=p.parentElement)if(p===this)return true;return false;}
 querySelectorAll(s){const found=[];for(const c of this.children){if(c.matches(s))found.push(c);found.push(...c.querySelectorAll(s));}return found;}
}
const b=(label,attrs={})=>new Element('button',{'aria-label':label,...attrs});
const link=id=>new Element('a',{href:`https://www.facebook.com/u/posts/${id}`});
const ctx={URL,location:{href:'https://www.facebook.com/'}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../extension/facebook.js'),'utf8'),ctx);
const api=ctx.SocialFlowFacebook;
test('only exact supported hosts enable auto-like',()=>{assert.equal(api.isFacebook('www.facebook.com'),true);assert.equal(api.isFacebook('facebook.com.attacker.test'),false);assert.equal(api.isFacebook('m.facebook.com'),false);});
test('post action is selected, nested comment Like ignored',()=>{
 const like=b('Like'),commentLike=b('Like');const root=new Element('article',{role:'article'},[link('123'),new Element('div',{},[like,b('Comment'),b('Share')]),new Element('div',{role:'article'},[commentLike,b('Reply')])]);
 assert.equal(api.actionFor(root),like);assert.equal(api.keyFor(root),'post:123');
});
test('a lone comment Like is not a post action',()=>{const root=new Element('article',{role:'article'},[link('123'),new Element('div',{},[b('Like'),b('Reply')])]);assert.equal(api.actionFor(root),null);});
test('liked or disabled action is recognized or ignored',()=>{const like=b('Remove Like',{'aria-pressed':'true'});assert.equal(api.isLiked(like),true);const disabled=b('Like',{'aria-disabled':'true'});const root=new Element('article',{role:'article'},[new Element('div',{},[disabled,b('Comment')])]);assert.equal(api.actionFor(root),null);});
test('comment permalinks do not supply the post identity',()=>{const root=new Element('article',{role:'article'},[new Element('a',{href:'https://www.facebook.com/u/posts/123?comment_id=42'})]);assert.equal(api.keyFor(root),null);});
test('a page-card Like above the actual post row is never selected',()=>{
 const pageLike=b('Like'),postLike=b('Like');
 const root=new Element('article',{role:'article'},[link('123'),new Element('div',{},[new Element('div',{},[pageLike]),new Element('div',{},[postLike,b('Comment'),b('Share')])])]);
 assert.equal(api.actionFor(root),postLike);
});
test('isLiked recognizes Vietnamese non-Like reactions',()=>{
 for(const label of ['Bỏ Yêu thích','Bỏ Thương thương','Bỏ Haha','Bỏ Wow','Bỏ Buồn','Bỏ Phẫn nộ','Gỡ Yêu thích','Hủy Phẫn nộ']){
   assert.equal(api.isLiked(b(label)),true,`should recognize "${label}"`);
 }
 assert.equal(api.isLiked(new Element('div',{role:'button',text:'Yêu thích'})),true);
 assert.equal(api.isLiked(b('Thích')),false);
});
test('actionFor excludes comment rows with descriptive Reply aria-label',()=>{
 const commentLike=b('Like');
 const replyWithTarget=new Element('button',{'aria-label':'Reply to John',text:'Reply'});
 const viReplyWithTarget=new Element('button',{'aria-label':'Trả lời bình luận của An',text:'Trả lời'});
 const root1=new Element('article',{role:'article'},[link('123'),new Element('div',{},[commentLike,replyWithTarget,b('Share')])]);
 const root2=new Element('article',{role:'article'},[link('123'),new Element('div',{},[b('Thích'),viReplyWithTarget,b('Chia sẻ')])]);
 assert.equal(api.actionFor(root1),null);
 assert.equal(api.actionFor(root2),null);
});
test('sponsored detects split-span, hidden-decoy, flex-order, and SVG badges while ignoring body/comments',()=>{
 // Split-span with hidden decoy chars
 const splitAd=new Element('article',{role:'article'},[
   new Element('span',{},[
     new Element('span',{text:'S'}),
     new Element('span',{style:'display:none',text:'X'}),
     new Element('span',{text:'pon'}),
     new Element('span',{style:'position:absolute; top:3em',text:'999'}),
     new Element('span',{style:'font-size:0px',text:'ZZ'}),
     new Element('span',{text:'sored'}),
   ])
 ]);
 assert.equal(api.sponsored(splitAd),true);
 // Flex-order shuffled Vietnamese Sponsored badge
 const orderedAd=new Element('article',{role:'article'},[
   new Element('span',{},[
     new Element('span',{style:'order:2',text:' tài trợ'}),
     new Element('span',{style:'order:1',text:'Được'}),
   ])
 ]);
 assert.equal(api.sponsored(orderedAd),true);
 // SVG <use> referencing external label in ownerDocument
 const defsTarget=new Element('text',{id:'sp-lbl',text:'Được tài trợ'});
 const fakeDoc={getElementById:id=>id==='sp-lbl'?defsTarget:null};
 const svgAd=new Element('article',{role:'article'},[
   new Element('svg',{},[new Element('use',{href:'#sp-lbl'})])
 ]);
 svgAd.ownerDocument=fakeDoc;
 assert.equal(api.sponsored(svgAd),true);
 // Post body and nested comment mentioning Sponsored / Được tài trợ must NOT be flagged
 const normalPost=new Element('article',{role:'article'},[
   link('555'),
   new Element('div',{'data-ad-preview':'message'},[new Element('span',{text:'Sponsored'})]),
   new Element('p',{},[new Element('span',{text:'Được tài trợ'})]),
   new Element('div',{role:'article'},[new Element('span',{text:'Sponsored'})]),
   new Element('div',{},[b('Like'),b('Comment'),b('Share')])
 ]);
 assert.equal(api.sponsored(normalPost),false);
});
test('collect emits all valid top-level articles inside a multi-article FeedUnit',()=>{
 const a1=new Element('div',{role:'article'},[link('101'),new Element('div',{},[b('Like'),b('Comment'),b('Share')])]);
 const a2=new Element('div',{role:'article'},[link('102'),new Element('div',{},[b('Thích'),b('Bình luận'),b('Chia sẻ')])]);
 const unit=new Element('div',{'data-pagelet':'FeedUnit_0'},[a1,a2]);
 const doc=new Element('main',{},[unit]);
 const items=api.collect(doc);
 assert.equal(items.length,2);
 assert.deepEqual([...items.map(i=>i.key)],['post:101','post:102']);
 assert.ok(items.every(i=>i.eligible));
});
