const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
// Minimal tree fixture: exercises selection policy, not a replacement for browser DOM tests.
class Element {
 constructor(tag,attrs={},children=[]){this.tag=tag;this.attrs=attrs;this.children=children;this.textContent=attrs.text||'';for(const c of children)c.parentElement=this;this.href=attrs.href;}
 getAttribute(k){return this.attrs[k]??null;}
 matches(selector){return selector.split(',').some(s=>{s=s.trim();const role=s.match(/^\[role="([^"]+)"\]$/);if(role)return this.attrs.role===role[1];if(s==='a[href]')return this.tag==='a'&&!!this.attrs.href;if(s==='[aria-label]')return 'aria-label'in this.attrs;return s===this.tag;});}
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
