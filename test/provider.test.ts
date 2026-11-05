import test from 'node:test';
import assert from 'node:assert/strict';
import {stringify} from 'yaml';
import {loadSubscription} from '../src/subscription.ts';
import {native} from './fixtures.ts';
test('native full YAML resolves nested public HTTP/inline Providers and preserves override fields',async()=>{
 const original={...native[0],name:'ordinary 1x','unknown-field':{array:[1,'fake']}};
 const full={'proxy-providers':{a:{type:'http',url:'https://example.org/FAKE',header:{Authorization:['Bearer FAKE']},filter:'1x',override:{'additional-prefix':'[FAKE] ',udp:true,'future-option':{a:1}}},b:{type:'inline',payload:[{...native[0],name:'2x'}]}}};
 const read=async(url:string,headers?:Record<string,string>)=>{assert.equal(url,'https://example.org/FAKE');assert.equal(headers?.authorization,'Bearer FAKE');return stringify({proxies:[original]});};
 const nodes=await loadSubscription(stringify(full),read);
 assert.equal(nodes.length,2);assert.equal(nodes[0].name,'[FAKE] ordinary 1x');assert.equal(nodes[0].udp,true);assert.deepEqual(nodes[0]['unknown-field'],original['unknown-field']);assert.deepEqual(nodes[0]['future-option'],{a:1});
 assert(!JSON.stringify(nodes).includes('Bearer FAKE'));
});
test('recursive provider cycles are bounded and local files are refused',async()=>{
 const recursive=stringify({'proxy-providers':{p:{type:'http',url:'https://example.org/FAKE'}}});
 await assert.rejects(()=>loadSubscription(recursive,async()=>recursive),/SOURCE_PROVIDER_DEPTH/);
 await assert.rejects(()=>loadSubscription(stringify({'proxy-providers':{p:{type:'file',path:'/etc/shadow'}}})),/SOURCE_PROVIDER_HTTP_REQUIRED/);
});
