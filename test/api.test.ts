import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {parse} from 'yaml';
import worker from '../src/index.ts';
import {uriCases} from './fixtures.ts';
const template=fs.readFileSync(new URL('../templates/Full.ini',import.meta.url),'utf8');
const key='FAKE_TEST_ACCESS_KEY_'+'x'.repeat(32);
const env={ACCESS_KEY:key,RELEASE:'fixture',ACCEPTED:'true',CONVERT_RATE:{limit:async()=>({success:true})}};
const templateURL='https://raw.githubusercontent.com/hadesp/Custom_OpenClash_Rules/main/cfg/Custom_Clash_Full.ini';
test('exact OpenClash 0.48.002 request produces a full mixed protocol YAML; no secret propagation',async()=>{
 const original=globalThis.fetch,seen:string[]=[];
 try{
  globalThis.fetch=(async(input:any,init:any)=>{
   const url=String(input);seen.push(url);
   assert(!JSON.stringify(init?.headers||{}).includes(key));
   if(url.includes('dns-query'))return new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'}]}));
   if(url===templateURL)return new Response(template);
   return new Response(uriCases.join('\n'));
  }) as typeof fetch;
  const q=new URLSearchParams({target:'clash',new_name:'true',url:'https://example.org/fake?token=FAKE|https://example.net/fake?token=FAKE',config:templateURL,include:'',exclude:'',emoji:'true',list:'false',sort:'false',scv:'false',append_type:'false',fdn:'true',expand:'false',classic:'true'});
  const r=await worker.fetch(new Request('https://test.invalid/k/'+key+'/sub?'+q),env);
  assert.equal(r.status,200);const config=parse(await r.text());
  assert.equal(config['proxy-groups'].length,64);assert.equal(config.rules.length,64);
  assert.equal(config.proxies.length,(uriCases.length+1)*2);
  assert.equal(new Set(config.proxies.map((p:any)=>p.name)).size,config.proxies.length);
  assert.equal(config['proxy-groups'].find((g:any)=>g.name==='📚 学术资源').proxies[0],'🎯 全球直连');
  assert(r.headers.get('cdn-cache-control')==='no-store');
  assert(!seen.some(u=>u.includes('api.asailor.org')));
 }finally{globalThis.fetch=original;}
});
test('API denies unknown options, duplicate parameters, unapproved templates and rate-limit bypass',async()=>{
 const base='https://test.invalid/k/'+key+'/sub?target=clash&config='+encodeURIComponent(templateURL);
 for(const suffix of ['&unknown=FAKE_SECRET','&target=clash','&config=https://evil.invalid/template']){
  const r=await worker.fetch(new Request(base+suffix),env);assert.equal(r.status,400);assert(!(await r.text()).includes('FAKE_SECRET'));
 }
 const limited=await worker.fetch(new Request(base),{...env,CONVERT_RATE:{limit:async()=>({success:false})}});
 assert.equal(limited.status,429);assert.equal(limited.headers.get('retry-after'),'60');
 const version=await worker.fetch(new Request('https://test.invalid/k/'+key+'/version'),env);
 const text=await version.text();assert(text.length<220);assert(text.includes('subconverter'));assert(!text.includes(key));
});
