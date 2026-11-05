import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stringify} from 'yaml';
import {parseSubscription,parseYAML} from '../src/parse.ts';
import {generate,parseINI,renameAndFilter,regex} from '../src/ini.ts';
import {isHighMultiplier,HIGH_FILTER} from '../src/multiplier.ts';
import {publicIP,validateURL,publicDNS,retrieve,bounded} from '../src/network.ts';
import worker from '../src/index.ts';
import {native,uriCases} from './fixtures.ts';
const ini=fs.readFileSync(new URL('../templates/Full.ini',import.meta.url),'utf8'),t=parseINI(ini);
const doc=(file:string)=>parseYAML(fs.readFileSync(new URL('../templates/'+file,import.meta.url),'utf8'));

const high=['2x','2.5x','3x','3倍','5.0X','10x','12x','12倍','高倍率','高倍','倍率: 2.0','倍率 ： 2.5','香港 2 X 测试','US中英 10倍','1x 2x','02x','1.5x 12倍'];
const low=['0.1x','0.2x','0.5x','1x','1.5x','未标倍率','200Mbps','2Gbps','2026','192.168.1.2:443','倍率: 1.5','02.example.com'];
for(const name of high)test('high multiplier: '+name,()=>{assert.equal(isHighMultiplier(name),true);assert.equal(regex(HIGH_FILTER).test(name),true);});
for(const name of low)test('ordinary multiplier: '+name,()=>{assert.equal(isHighMultiplier(name),false);assert.equal(regex(HIGH_FILTER).test(name),false);});

test('Full retains original groups plus high group; 64 rulesets are distinct from 64 groups',()=>{
 assert.equal(t.groups.length,64);assert.equal(t.rulesets.length,64);
 const original=JSON.parse(fs.readFileSync(new URL('../docs/upstream-groups.json',import.meta.url),'utf8')) as string[];
 for(const name of original)assert(t.groups.some(g=>g.split('`')[0]===name));
 assert.throws(()=>parseINI(ini+'\nruleset=x,[]FINAL'),/RULESET_LIMIT_64/);
});
test('mixed native YAML preserves every field, including unknown nested fields',()=>{
 const input=native.map(p=>({...p,'future-unknown-field':{fake:['a',1,true]},'ws-opts':{headers:{'X-Fake':'value'}}}));
 assert.deepEqual(parseSubscription(stringify({proxies:input})),input);
});
test('URI list, base64 mixed subscription, CRLF and unicode',()=>{
 const plain=uriCases.join('\r\n');const parsed=parseSubscription(plain);
 assert.equal(parsed.length,uriCases.length+1);assert.deepEqual(parseSubscription(Buffer.from(plain).toString('base64')),parsed);
 assert.equal(parsed.find(p=>p.name==='Mieru:3000-3009/UDP')!['port-range'],'3000-3009');
 assert.equal(parsed.find(p=>p.name==='VLESS-httpupgrade')!['ws-opts']['v2ray-http-upgrade'],true);
 assert.equal(parsed.find(p=>p.name==='HY2')!.ports,'443,8443');
 assert.equal(parsed.find(p=>p.name==='HY2')!['hop-interval'],'10');
 assert.equal(parsed.find(p=>p.name==='HY1')!['auth-str'],'FAKE_TEST_PASSWORD_NOT_A_REAL_CREDENTIAL');
 assert(!parsed.some(p=>p['skip-cert-verify']===true));
});
test('unsupported input fails explicitly rather than losing data or nodes',()=>{
 assert.throws(()=>parseSubscription('vless://id@example.com:443?unknown-secret=fake#x'));
 assert.throws(()=>parseSubscription('unknown://x@example.com:443#x'));
 assert.throws(()=>parseSubscription('proxies: []'));
 assert.throws(()=>parseSubscription('proxies: []\nproxies: []'));
 assert.throws(()=>parseSubscription('proxies: &a [*a]'));
});
test('high nodes remain manual; auto has no high member; empty high group uses REJECT',()=>{
 const nodes=high.concat(low).map(name=>({...native[0],name}));
 const {config,available}=generate(t,nodes);const get=(n:string)=>config['proxy-groups'].find(g=>g.name===n)!;
 assert.deepEqual(get('🔥 高倍率节点').proxies,high);
 assert.deepEqual(get('♻️ 自动选择').proxies,low);
 for(const n of high)assert(get('🚀 手动选择').proxies.includes(n));
 assert(get('🚀 手动选择').proxies.includes('🔥 高倍率节点'));
 assert.equal(get('📚 学术资源').proxies[0],'🎯 全球直连');
 const empty=generate(t,[{...native[0],name:'1x'}]);
 assert.deepEqual(empty.config['proxy-groups'].find(g=>g.name==='🔥 高倍率节点')!.proxies,['REJECT']);
 assert.equal(empty.available['🔥 高倍率节点'],false);assert(available['🔥 高倍率节点']);
});
test('scholar excluded from academic; routing domains and private-first precedence',()=>{
 const {config}=generate(t,[native[0]]);
 const match=(host:string)=>{
  for(const r of config.rules){const [kind,id,policy]=r.split(',');if(kind==='RULE-SET'&&['Google_Scholar','Academic_Overseas_No_Google'].includes(id)){
   const payload=id==='Google_Scholar'?doc('Scholar.yaml').payload:doc('Academic.yaml').payload;
   if(payload.some((s:string)=>{const [k,d]=s.split(',');return host===d || k==='DOMAIN-SUFFIX'&&host.endsWith('.'+d);}))return policy;
  }}return null;
 };
 for(const h of ['www.nature.com','pubs.acs.org','pubs.rsc.org','onlinelibrary.wiley.com','www.science.org','www.sciencedirect.com','webofscience.com','oup.silverchair-cdn.com','ars.els-cdn.com','sciencedirectassets.com'])assert.equal(match(h),'📚 学术资源',h);
 for(const h of ['scholar.google.com','scholar.google.co.uk','scholar.googleusercontent.com'])assert.equal(match(h),'🇬 谷歌服务',h);
 for(const h of ['cnki.net','wanfangdata.com.cn','edu.cn','ac.cn','somecollege.edu','d3gs88v2si9epo.cloudfront.net','dlt9ksh5o30zl.cloudfront.net','bmc.com'])assert.equal(match(h),null,h);
 assert.equal(config.rules[0],'GEOSITE,private,🎯 全球直连');
 assert.equal(config.rules.at(-1),'MATCH,🐟 漏网之鱼');
 const academic=doc('Academic.yaml').payload as string[];assert.equal(new Set(academic).size,academic.length);
 assert(!academic.some(s=>s.includes('google')||s.endsWith(',cloudfront.net')||s.endsWith(',cloudflare.com')));
});
test('rename, include/exclude, duplicate names, cycles and dangling references',()=>{
 const tiny=parseINI('[custom]\nruleset=a,[]FINAL\ncustom_proxy_group=a`select`.*\nrename=old@new');
 const ps=renameAndFilter([{...native[0],name:'old'},{...native[0],name:'old'},{...native[0],name:'skip'}],tiny,new URLSearchParams({include:'(?i)new'}));
 assert.deepEqual(ps.map(p=>p.name),['new','new (2)']);assert.equal(generate(tiny,ps).config.rules[0],'MATCH,a');
 assert.throws(()=>generate({...tiny,groups:['a`select`[]a']},ps));
 assert.throws(()=>generate({...tiny,groups:['a`select`[]missing']},ps));
});
for(const ip of ['127.0.0.1','0.0.0.0','10.0.0.1','172.16.1.1','192.168.1.1','169.254.169.254','100.64.0.1','192.0.0.1','224.0.0.1','::1','::','fe80::1','fc00::1','::ffff:127.0.0.1','2001:db8::1'])test('reject private/special IP '+ip,()=>assert(!publicIP(ip)));
test('URL parser rejects encoded/alternative private IPs and ports',()=>{
 for(const url of ['file:///etc/passwd','http://127.1/','http://2130706433/','http://0x7f000001/','http://user:pass@google.com/','https://google.com:8443/','http://metadata.google.internal/','http://localhost/','http://[::1]/','https://google.com./'])assert.throws(()=>validateURL(url),url);
 assert(validateURL('https://www.nature.com/path?token=FAKE'));
});
test('DNS denies mixed private/public answers',async()=>{
 const mock=(async()=>new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'},{type:1,data:'127.0.0.1'}]}))) as typeof fetch;
 await assert.rejects(()=>publicDNS('example.org',mock));
});
test('redirects revalidate destination and response size is capped',async()=>{
 const mock=(async(input:any)=>String(input).includes('dns-query')?new Response(JSON.stringify({Status:0,Answer:[{type:1,data:'1.1.1.1'}]})):new Response(null,{status:302,headers:{location:'http://169.254.169.254/secret'}})) as typeof fetch;
 await assert.rejects(()=>retrieve('https://example.org/sub?token=FAKE',mock));
 await assert.rejects(()=>bounded(new Response('x'.repeat(101)),100));
});
test('service gate, version and redacted errors; private responses are never cached',async()=>{
 const env={RELEASE:'test',ACCESS_KEY:'A'.repeat(40)};
 const v=await worker.fetch(new Request('https://test.invalid/version'),env);assert((await v.text()).includes('accepted=false'));
 const r=await worker.fetch(new Request('https://test.invalid/k/'+env.ACCESS_KEY+'/sub?url=SECRET'),env);
 assert.equal(await r.text(),'ACCEPTANCE_GATE_CLOSED');assert(r.headers.get('cache-control')!.includes('no-store'));
 assert.equal((await worker.fetch(new Request('https://test.invalid/sub?token=SECRET'),env)).status,404);
});
