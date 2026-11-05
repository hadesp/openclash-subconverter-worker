// Reproducible public-data build; never accepts a subscription URL or node file.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import YAML from 'yaml';
const base=path.resolve(import.meta.dirname,'..');
const upstream=path.resolve(base,'../upstream-rules'),geo=path.resolve(base,'../upstream-geosite');
const dest=path.resolve(base,'../Custom_OpenClash_Rules');
const candidateFile=path.join(base,'docs/academic-candidates.json');
const candidates=JSON.parse(fs.readFileSync(candidateFile,'utf8'));
const excluded=new Map();
const domestic=new Set(['cnki.net','cqvip.com','duxiu.com','chaoxing.com','superlib.net','zhangqiaokeyan.com','sciengine.com','sciopen.com','sciencechina-press.com','keai.net','keaipublishing.com']);
const broad=new Set(['edu','ac.uk','edu.au','ac.jp','ac.kr','ac.nz','ac.in','edu.sg','ac.il']);
const uncertain=new Set(['d3gs88v2si9epo.cloudfront.net','dlt9ksh5o30zl.cloudfront.net','bmc.com']);
const rules=new Set(),sources=[];
function accept(type,domain,source){
  domain=domain.toLowerCase();
  let reason='';
  if(domain==='cn'||domain.endsWith('.cn')||domestic.has(domain))reason='国内域名或中国出版机构，保留现有大陆绕行机制';
  if(broad.has(domain))reason='过宽的教育后缀，未纳入';
  if(uncertain.has(domain))reason=domain==='bmc.com'?'BMC 企业软件域名，不等同于 biomedcentral.com':'未取得当前官方资产引用证据，隔离待核查';
  if(/(^|\.)google(?:usercontent)?\./.test(domain)||domain.includes('google-scholar'))reason='Google Scholar/Google 从海外学术集合排除';
  if(reason){excluded.set(domain,reason);return;}
  rules.add(type+','+domain);sources.push({type,domain,source});
}
const seen=new Set();
function expand(name){
  if(name==='google-scholar')return;
  if(seen.has(name))return;seen.add(name);
  for(let line of fs.readFileSync(path.join(geo,'data',name),'utf8').split(/\r?\n/)){
    line=line.replace(/#.*/,'').trim();if(!line)continue;
    const [token]=line.split(/\s+/);
    if(token.startsWith('include:')){if(token.includes('@'))throw Error('Unimplemented include attribute');expand(token.slice(8));}
    else if(token.startsWith('full:'))accept('DOMAIN',token.slice(5),'v2fly/'+name);
    else if(token.startsWith('regexp:'))throw Error('Unreviewed geosite regexp');
    else if(token.startsWith('keyword:'))throw Error('Unreviewed geosite keyword');
    else accept('DOMAIN-SUFFIX',token.startsWith('domain:')?token.slice(7):token,'v2fly/'+name);
  }
}
expand('category-scholar-!cn');
for(const c of candidates)accept(c.type,c.domain,'用户候选清单');
for(const d of ['aip.org','aps.org','iop.org','acm.org','cambridge.org','academic.oup.com','silverchair-cdn.com','els-cdn.com','sciencedirectassets.com'])accept('DOMAIN-SUFFIX',d,'上游学术来源补充');
fs.mkdirSync(dest,{recursive:true});
for(const dir of ['cfg/yaml','rule','docs'])fs.mkdirSync(path.join(dest,dir),{recursive:true});
const rbase='https://raw.githubusercontent.com/hadesp/Custom_OpenClash_Rules/main/';
const payload=[...rules].sort();
fs.writeFileSync(path.join(dest,'rule/Academic_Overseas_No_Google.yaml'),YAML.stringify({payload}));
// One provider holds all Scholar domains including googleusercontent; only one additional ruleset.
const scholars=new Set(fs.readFileSync(path.join(geo,'data/google-scholar'),'utf8').split(/\r?\n/).filter(l=>l.startsWith('full:')).map(l=>'DOMAIN,'+l.slice(5).split(/\s/)[0]));
scholars.add('DOMAIN-SUFFIX,scholar.googleusercontent.com');
fs.writeFileSync(path.join(dest,'rule/Google_Scholar.yaml'),YAML.stringify({payload:[...scholars].sort()}));
let ini=fs.readFileSync(path.join(upstream,'cfg/Custom_Clash_Full.ini'),'utf8').replace(/\r\n/g,'\n');
fs.writeFileSync(path.join(base,'docs/upstream-groups.json'),JSON.stringify(ini.match(/^custom_proxy_group=.*$/gm).map(l=>l.slice('custom_proxy_group='.length).split('`')[0]),null,2));
ini=ini.replace(';学术资源包括 Google Scholar、IEEE、ACM 和主要学术出版平台等相关域名',';学术资源排除 Google Scholar；生成快照保留上游海外学术和审核通过的候选域名');
ini=ini.replace('ruleset=📚 学术资源,[]GEOSITE,category-scholar-!cn','ruleset=📚 学术资源,clash-classic:'+rbase+'rule/Academic_Overseas_No_Google.yaml,28800');
// Immediately after private rules: keep custom rules from taking priority over either academic provider.
const marker='ruleset=🎯 全球直连,[]GEOIP,private,no-resolve';
const academic=ini.match(/^ruleset=📚 学术资源,.*$/m)[0];
ini=ini.replace(academic+'\n','');
ini=ini.replace(marker,marker+'\n;学术专用规则优先于通用自定义直连/代理，避免被覆盖\nruleset=🇬 谷歌服务,clash-classic:'+rbase+'rule/Google_Scholar.yaml,28800\n'+academic);
ini=ini.split('\n').map(l=>{
  if(l.startsWith('custom_proxy_group=')&&l.includes('`select`')&&l.includes('[]🐢 低倍率节点'))l=l.replace('[]🐢 低倍率节点','[]🐢 低倍率节点`[]🔥 高倍率节点');
  if(l.startsWith('custom_proxy_group=📚 学术资源`'))l=l.replace('`select`','`select`[]🎯 全球直连`');
  return l;
}).join('\n');
const high='custom_proxy_group=🔥 高倍率节点`url-test`(高倍率|高倍|倍率[ :：]*[2-9]|[2-9][0-9.]*[xX倍])`https://www.gstatic.com/generate_204`300,,50';
ini=ini.replace('custom_proxy_group=🎯 全球直连',high+'\ncustom_proxy_group=🎯 全球直连');
ini='; Modified for hadesp: academic exclusions and strict backend multiplier membership.\n; 高倍率与自动选择成员由配套 Worker 的同一判定函数计算；普通后端不保证此扩展。\n'+ini;
fs.writeFileSync(path.join(dest,'cfg/Custom_Clash_Full.ini'),ini);
fs.writeFileSync(path.join(base,'templates/Full.ini'),ini);
fs.copyFileSync(path.join(dest,'rule/Academic_Overseas_No_Google.yaml'),path.join(base,'templates/Academic.yaml'));
fs.copyFileSync(path.join(dest,'rule/Google_Scholar.yaml'),path.join(base,'templates/Scholar.yaml'));
const sourceSHAs=Object.fromEntries([['rules',upstream],['geosite',geo]].map(([k,v])=>[k,execFileSync('git',['-C',v,'rev-parse','HEAD'],{encoding:'utf8'}).trim()]));
fs.writeFileSync(path.join(dest,'docs/academic-audit.json'),JSON.stringify({sourceSHAs,count:payload.length,candidates:candidates.length,excluded:[...excluded].map(([domain,reason])=>({domain,reason})),sources},null,2));
fs.copyFileSync(path.join(upstream,'LICENCE'),path.join(dest,'LICENCE'));
fs.copyFileSync(path.join(geo,'LICENSE'),path.join(dest,'docs/domain-list-community-LICENSE'));
console.log(JSON.stringify({rules:ini.match(/^ruleset=/gm).length,groups:ini.match(/^custom_proxy_group=/gm).length,academicRules:payload.length,scholarRules:scholars.size,excluded:excluded.size,sourceSHAs}));
