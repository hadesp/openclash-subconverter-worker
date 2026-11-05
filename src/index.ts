import {stringify} from 'yaml';
import {ConversionError,requireValue} from './errors.ts';
import {retrieve} from './network.ts';
import {loadSubscription} from './subscription.ts';
import {generate,parseINI,renameAndFilter} from './ini.ts';

export interface Env {ACCESS_KEY?:string; RELEASE:string; ACCEPTED?:string; CONVERT_RATE?:{limit(options:{key:string}):Promise<{success:boolean}>};}
const TEMPLATE='https://raw.githubusercontent.com/hadesp/Custom_OpenClash_Rules/main/cfg/Custom_Clash_Full.ini';
const headers={'cache-control':'private, no-store, max-age=0','cdn-cache-control':'no-store','cloudflare-cdn-cache-control':'no-store','pragma':'no-cache','expires':'0','referrer-policy':'no-referrer','x-content-type-options':'nosniff'};
const allowed=new Set(['target','new_name','url','config','include','exclude','emoji','list','sort','udp','scv','append_type','fdn','rule_provider','expand','classic','tfo','tls13']);
const response=(body:string,status=200,extra:Record<string,string>={})=>new Response(body,{status,headers:{...headers,...extra}});
const clientUserAgent=(request:Request)=>{
  const value=(request.headers.get('user-agent')||'').trim();
  return value.length<=256 && /^[\x20-\x7E]+$/.test(value) && /(?:clash|mihomo|meta|verge|openclash)/i.test(value)
    ? value
    : 'Clash.Meta';
};
export default {
  async fetch(request:Request,env:Env):Promise<Response> {
    let stage='REQUEST';
    try {
      const url=new URL(request.url);
      if(request.method!=='GET')return response('METHOD_NOT_ALLOWED',405,{allow:'GET'});
      if(url.pathname==='/version'||(env.ACCESS_KEY&&url.pathname==='/k/'+env.ACCESS_KEY+'/version'))return response('hadesp-subconverter '+env.RELEASE+'; Mihomo v1.19.33; enabled='+(env.ACCEPTED==='true'),200,{'content-type':'text/plain; charset=utf-8','access-control-allow-origin':'*'});
      // Fail closed: a development artifact must never become a public conversion proxy by accident.
      requireValue(env.ACCESS_KEY && /^[A-Za-z0-9_-]{32,}$/.test(env.ACCESS_KEY),'SERVICE_NOT_CONFIGURED');
      requireValue(url.pathname==='/k/'+env.ACCESS_KEY+'/sub','NOT_FOUND');
      requireValue(env.ACCEPTED==='true','ACCEPTANCE_GATE_CLOSED');
      if(!url.search)return response('OK - OpenClash subconverter is ready',200,{'content-type':'text/plain; charset=utf-8'});
      requireValue(env.CONVERT_RATE,'SERVICE_NOT_CONFIGURED');
      if(!(await env.CONVERT_RATE.limit({key:'conversion'})).success)return response('RATE_LIMITED',429,{'retry-after':'60'});
      requireValue(url.href.length<=16000,'REQUEST_TOO_LONG');
      const q=url.searchParams;
      for(const key of q.keys()){requireValue(allowed.has(key),'UNSUPPORTED_API_PARAMETER');requireValue(q.getAll(key).length===1,'DUPLICATE_API_PARAMETER');}
      requireValue(['clash','clashr','mihomo','meta','clashmeta','clash.meta'].includes(q.get('target')||''),'TARGET_NOT_SUPPORTED');
      requireValue(q.get('config')===TEMPLATE,'TEMPLATE_NOT_ALLOWED');
      requireValue(!q.get('tls13')||q.get('tls13')==='false','TLS13_OVERRIDE_UNSUPPORTED');
      requireValue(!q.get('rule_provider')||q.get('rule_provider')==='true','INLINE_RULE_EXPANSION_UNSUPPORTED');
      const sources=(q.get('url')||'').split('|');requireValue(sources.length>0&&sources.length<=8&&sources.every(Boolean),'INVALID_SOURCE_COUNT');
      // Sequential download bounds concurrent memory/subrequest use; no response or subscription caching.
      const nodes=[],sourceHeaders={'user-agent':clientUserAgent(request)};
      for(const source of sources){stage='SOURCE_DOWNLOAD';const content=await retrieve(source,sourceHeaders);stage='SOURCE_PARSE';nodes.push(...await loadSubscription(content));}
      requireValue(nodes.length<=2000,'TOO_MANY_NODES');
      stage='TEMPLATE_DOWNLOAD';const ini=await retrieve(TEMPLATE);stage='TEMPLATE_PARSE';const template=parseINI(ini);
      stage='NODE_TRANSFORM';
      const proxies=renameAndFilter(nodes,template,q);
      if(q.get('list')==='true')return response(stringify({proxies}),200,{'content-type':'text/yaml; charset=utf-8'});
      stage='CONFIG_GENERATE';const {config,available}=generate(template,proxies);
      const empty=Object.values(available).filter(v=>!v).length;
      stage='YAML_SERIALIZE';return response(stringify(config),200,{'content-type':'text/yaml; charset=utf-8','x-unavailable-group-count':String(empty),'x-converter-version':env.RELEASE});
    } catch(e) {
      // Never stringify the original exception, request, query, subscription or node.
      const error=e instanceof ConversionError?e:new ConversionError('INTERNAL_'+stage,500);
      return response(error.code,error.code==='NOT_FOUND'?404:error.status);
    }
  }
};
