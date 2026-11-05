import {ConversionError,requireValue} from './errors.ts';
import {HIGH_FILTER,isHighMultiplier} from './multiplier.ts';
import type {Proxy} from './parse.ts';

export type Template = {rulesets:string[];groups:string[];renames:string[]};
export function parseINI(text:string): Template {
  const result:Template={rulesets:[],groups:[],renames:[]};let section='';
  for(let line of text.split(/\r?\n/)) {
    line=line.trim();if(!line||line.startsWith(';')||line.startsWith('#'))continue;
    if(/^\[.*\]$/.test(line)){section=line;requireValue(section==='[custom]','UNSUPPORTED_INI_SECTION');continue;}
    requireValue(section==='[custom]','INI_SECTION_REQUIRED');
    const eq=line.indexOf('=');requireValue(eq>0,'INVALID_INI');
    const key=line.slice(0,eq).trim(),value=line.slice(eq+1).trim();
    if(key==='ruleset')result.rulesets.push(value);
    else if(key==='custom_proxy_group')result.groups.push(value);
    else if(key==='rename')result.renames.push(value);
    else if(['enable_rule_generator','overwrite_original_rules'].includes(key))requireValue(value==='true','INI_RULE_GENERATOR_REQUIRED');
    else throw new ConversionError('UNSUPPORTED_INI_KEY');
  }
  requireValue(result.rulesets.length>0 && result.rulesets.length<=64,'RULESET_LIMIT_64');
  requireValue(result.groups.length>0 && result.groups.length<=128,'GROUP_LIMIT');
  return result;
}
export function regex(s:string):RegExp {
  let flags='u';if(s.startsWith('(?i)')){s=s.slice(4);flags+='i';}
  requireValue(s.length<=6000,'REGEX_TOO_LONG');
  try {return new RegExp(s,flags);}catch{throw new ConversionError('UNSUPPORTED_REGEX');}
}
export function renameAndFilter(nodes:Proxy[],t:Template,q:URLSearchParams):Proxy[] {
  nodes=structuredClone(nodes);
  const sourceNames=new Map(nodes.map(p=>[p,p.name]));
  const sourceCounts=new Map<string,number>();for(const p of nodes)sourceCounts.set(p.name,(sourceCounts.get(p.name)||0)+1);
  for(const rule of t.renames){const at=rule.indexOf('@');requireValue(at>0,'INVALID_RENAME');const re=regex(rule.slice(0,at));for(const p of nodes)p.name=p.name.replace(re,rule.slice(at+1));}
  if(q.get('include')){const r=regex(q.get('include')!);nodes=nodes.filter(p=>r.test(p.name));}
  if(q.get('exclude')){const r=regex(q.get('exclude')!);nodes=nodes.filter(p=>!r.test(p.name));}
  if(q.get('sort')==='true')nodes.sort((a,b)=>a.name.localeCompare(b.name));
  const seen=new Set<string>();
  for(const p of nodes){
    if(q.get('emoji')==='false')p.name=p.name.replace(/[\u{1F1E6}-\u{1F1FF}]{2}\s*/gu,'').trim();
    if(q.get('emoji')==='true'&&!/[\u{1F1E6}-\u{1F1FF}]{2}/u.test(p.name)){
      const country=t.groups.find(line=>/^🇭🇰|^🇺🇸|^🇯🇵|^🇸🇬|^🇼🇸|^🇰🇷|^🇨🇦|^🇬🇧|^🇫🇷|^🇩🇪|^🇳🇱|^🇹🇷|^🇷🇺/u.test(line)&&regex(line.split('`')[2]).test(p.name));
      if(country)p.name=country.split(' ')[0]+' '+p.name;
    }
    if(q.get('append_type')==='true')p.name+=' ['+p.type+']';
    if(q.has('udp'))p.udp=q.get('udp')==='true';
    if(q.get('scv')==='true')p['skip-cert-verify']=true;
    if(q.has('tfo'))p.tfo=q.get('tfo')==='true';
    const original=p.name;let i=1;while(seen.has(p.name))p.name=original+' ('+(++i)+')';seen.add(p.name);
  }
  // Renames must update native dialer references as well as display labels.
  const mapping=new Map<string,string>();
  // Object identity survives filtering/sorting. Never guess a reference from a renamed suffix.
  for(const p of nodes){const original=sourceNames.get(p)!;if(sourceCounts.get(original)===1)mapping.set(original,p.name);}
  requireValue(nodes.length,'NO_MATCHING_NODES');
  // Resolve native references after deterministic de-duplication; do not silently break chains.
  for(const p of nodes)if(p['dialer-proxy']){p['dialer-proxy']=mapping.get(p['dialer-proxy'])||p['dialer-proxy'];requireValue(seen.has(p['dialer-proxy']) || p['dialer-proxy']==='DIRECT','MISSING_DIALER_PROXY');}
  return nodes;
}
export function generate(t:Template,nodes:Proxy[]) {
  const rules:string[]=[],providers:Record<string,any>={};
  for(const entry of t.rulesets) {
    const comma=entry.indexOf(',');requireValue(comma>0,'INVALID_RULESET');
    const policy=entry.slice(0,comma),source=entry.slice(comma+1);
    if(source.startsWith('[]')){
      const rule=source.slice(2).split(',');
      if(rule[0]==='FINAL')rules.push('MATCH,'+policy);
      else {const noResolve=rule.at(-1)==='no-resolve';if(noResolve)rule.pop();rules.push([...rule,policy,...(noResolve?['no-resolve']:[])].join(','));}
    }else{
      const m=source.match(/^(clash-domain|clash-classic|clash-ipcidr):(https:\/\/[^,]+)(?:,(\d+))?$/);
      requireValue(m,'UNSUPPORTED_RULESET_SOURCE');
      const url=new URL(m[2]);requireValue(!url.username&&!url.password&&!url.port,'INVALID_RULE_PROVIDER_URL');
      const stem=url.pathname.split('/').at(-1)!.replace(/\.(yaml|mrs|list)$/,'');
      const id=['Academic_Overseas_No_Google','Google_Scholar'].includes(stem)?stem:'r'+Object.keys(providers).length;
      const behavior=({'clash-domain':'domain','clash-classic':'classical','clash-ipcidr':'ipcidr'} as Record<string,string>)[m[1]];
      const format=url.pathname.endsWith('.mrs')?'mrs':url.pathname.endsWith('.yaml')?'yaml':'text';
      requireValue(!(format==='mrs' && behavior==='classical'),'CLASSICAL_MRS_UNSUPPORTED');
      providers[id]={type:'http',behavior,format,url:m[2],path:'./rule_provider/'+id+'.'+format,interval:Number(m[3]||28800)};
      rules.push('RULE-SET,'+id+','+policy);
    }
  }
  const available:Record<string,boolean>={};
  const groups=t.groups.map(line=>{
    const [name,type,...parts]=line.split('`');
    requireValue(name && ['select','url-test','fallback','load-balance'].includes(type),'UNSUPPORTED_GROUP');
    const urlAt=parts.findIndex(s=>s.startsWith('https://')||s.startsWith('http://'));
    const selectors=urlAt>=0?parts.slice(0,urlAt):parts;
    const explicit=selectors.filter(s=>s.startsWith('[]')).map(s=>s.slice(2));
    const patterns=selectors.filter(s=>!s.startsWith('[]')).map(regex);
    let matched=nodes.filter(p=>patterns.some(r=>r.test(p.name)));
    if(name==='🔥 高倍率节点')matched=nodes.filter(p=>isHighMultiplier(p.name));
    if(name==='♻️ 自动选择')matched=matched.filter(p=>!isHighMultiplier(p.name));
    const g:Record<string,any>={name,type,proxies:[...new Set([...explicit,...matched.map(p=>p.name)])]};
    available[name]=matched.length>0 || explicit.length>0;
    // A visible REJECT sentinel makes an unavailable group valid without silently choosing a paid node.
    if(!g.proxies.length)g.proxies=['REJECT'];
    if(type!=='select'){
      requireValue(urlAt>=0,'GROUP_TEST_URL_REQUIRED');
      g.url=parts[urlAt];const [interval,_timeout,tolerance]=(parts[urlAt+1]||'300,,50').split(',');
      g.interval=Number(interval);g.tolerance=Number(tolerance||50);g.lazy=true;
      requireValue(g.interval>=60 && Number.isFinite(g.tolerance),'INVALID_GROUP_TIMING');
    }
    // These RE2-compatible filters document and reinforce the materialized membership.
    if(name==='♻️ 自动选择')g['exclude-filter']=HIGH_FILTER;
    if(name==='🔥 高倍率节点' && matched.length)g.filter=HIGH_FILTER;
    return g;
  });
  const names=new Set([...groups.map(g=>g.name),...nodes.map(p=>p.name),'DIRECT','REJECT','REJECT-DROP','PASS','COMPATIBLE']);
  requireValue(new Set(groups.map(g=>g.name)).size===groups.length,'DUPLICATE_GROUP');
  requireValue(!groups.some(g=>nodes.some(p=>p.name===g.name)),'PROXY_GROUP_NAME_COLLISION');
  for(const g of groups)for(const ref of g.proxies)requireValue(names.has(ref),'DANGLING_GROUP_REFERENCE');
  const adjacency=new Map(groups.map(g=>[g.name,g.proxies]));
  const visit=(n:string,path:Set<string>)=>{requireValue(!path.has(n),'GROUP_CYCLE');for(const ref of adjacency.get(n)??[])if(adjacency.has(ref))visit(ref,new Set([...path,n]));};
  for(const g of groups)visit(g.name,new Set());
  for(const rule of rules){const fields=rule.split(',');const policy=fields.at(-1)==='no-resolve'?fields.at(-2):fields.at(-1);requireValue(names.has(policy!),'DANGLING_RULE_POLICY');}
  return {config:{proxies:nodes,'proxy-groups':groups,'rule-providers':providers,rules},available};
}
