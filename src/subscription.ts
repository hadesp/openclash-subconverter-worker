import {ConversionError,requireValue} from './errors.ts';
import {parseSubscription,parseYAML,validateProxy,type Proxy} from './parse.ts';
import {regex} from './ini.ts';
import {retrieve} from './network.ts';
type Reader=(url:string,headers?:Record<string,string>)=>Promise<string>;
/** Flatten HTTP/inline source Providers in memory, never copying their URLs into output. */
export async function loadSubscription(text:string,read:Reader=retrieve,depth=0,budget={providers:0}):Promise<Proxy[]> {
  requireValue(depth<4,'SOURCE_PROVIDER_DEPTH');
  requireValue(text.length<=2_000_000,'SUBSCRIPTION_TOO_LARGE');
  const first=text.split(/\r?\n/).find(l=>l.trim()&&!l.trim().startsWith('#')&&l.trim()!=='---')?.trim()||'';
  if(!((first.startsWith('{')||/^[\w'"-]+\s*:/.test(first))&&!/^[a-z][a-z0-9+.-]*:\/\//i.test(first)))return parseSubscription(text);
  const doc=parseYAML(text),providers=doc?.['proxy-providers'];
  if(!providers||!Object.keys(providers).length)return parseSubscription(text);
  requireValue(typeof providers==='object'&&!Array.isArray(providers),'INVALID_SOURCE_PROVIDERS');
  requireValue(doc.proxies==null||Array.isArray(doc.proxies),'INVALID_PROXY_ARRAY');
  const nodes:Proxy[]=doc.proxies==null?[]:doc.proxies.map(validateProxy);
  for(const provider of Object.values(providers) as any[]){
    requireValue(++budget.providers<=16,'SOURCE_PROVIDER_LIMIT');
    requireValue(provider&&typeof provider==='object','INVALID_SOURCE_PROVIDER');
    requireValue(!provider.proxy||provider.proxy==='DIRECT','SOURCE_PROVIDER_PROXY_UNSUPPORTED');
    let current:Proxy[];
    if(provider.type==='inline'){
      requireValue(Array.isArray(provider.payload),'INLINE_PROVIDER_PAYLOAD_REQUIRED');current=provider.payload.map(validateProxy);
    }else{
      requireValue(provider.type==='http'&&typeof provider.url==='string','SOURCE_PROVIDER_HTTP_REQUIRED');
      const headers:Record<string,string>={};
      for(const [k,v] of Object.entries(provider.header||{})){
        requireValue(['user-agent','authorization','accept'].includes(k.toLowerCase()),'SOURCE_PROVIDER_HEADER_UNSUPPORTED');
        const values=Array.isArray(v)?v:[v];requireValue(values.length===1&&typeof values[0]==='string'&&!/[\r\n]/.test(values[0]),'INVALID_SOURCE_PROVIDER_HEADER');headers[k.toLowerCase()]=values[0];
      }
      current=await loadSubscription(await read(provider.url,headers),read,depth+1,budget);
    }
    if(provider.filter){const re=regex(provider.filter);current=current.filter(p=>re.test(p.name));}
    if(provider['exclude-filter']){const re=regex(provider['exclude-filter']);current=current.filter(p=>!re.test(p.name));}
    const override=structuredClone(provider.override||{});
    requireValue(override&&typeof override==='object'&&!Array.isArray(override),'INVALID_SOURCE_PROVIDER_OVERRIDE');
    const prefix=String(override['additional-prefix']||''),suffix=String(override['additional-suffix']||'');
    delete override['additional-prefix'];delete override['additional-suffix'];
    requireValue(!override['proxy-name'],'SOURCE_PROVIDER_RENAME_USE_INI');
    const mapping=new Map<string,string>();
    for(const p of current){const old=p.name;Object.assign(p,structuredClone(override));p.name=prefix+p.name+suffix;mapping.set(old,p.name);}
    for(const p of current)if(p['dialer-proxy']&&mapping.has(p['dialer-proxy']))p['dialer-proxy']=mapping.get(p['dialer-proxy']);
    nodes.push(...current.map(validateProxy));requireValue(nodes.length<=2000,'TOO_MANY_NODES');
  }
  requireValue(nodes.length,'NO_MATCHING_NODES');return nodes;
}
