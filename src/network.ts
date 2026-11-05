import ipaddr from 'ipaddr.js';
import {ConversionError,requireValue} from './errors.ts';

export const MAX_BYTES=2_000_000;
export function publicIP(ip:string):boolean {
  try {const parsed=ipaddr.process(ip.replace(/^\[|\]$/g,''));return parsed.range()==='unicast';}catch{return false;}
}
export function validateURL(value:string):URL {
  let u:URL;try{u=new URL(value);}catch{throw new ConversionError('INVALID_SOURCE_URL');}
  requireValue(['https:','http:'].includes(u.protocol),'INVALID_SOURCE_SCHEME');
  requireValue(!u.username&&!u.password&&!u.hash && value.length<=12000,'INVALID_SOURCE_URL');
  requireValue(!u.port || (u.protocol==='https:'&&u.port==='443')||(u.protocol==='http:'&&u.port==='80'),'SOURCE_PORT_NOT_ALLOWED');
  const host=u.hostname.replace(/^\[|\]$/g,'').toLowerCase();
  requireValue(!host.endsWith('.') && !host.includes('%'),'INVALID_SOURCE_HOST');
  if(ipaddr.isValid(host))requireValue(publicIP(host),'PRIVATE_ADDRESS_DENIED');
  else requireValue(host.includes('.') && !/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host) && !host.endsWith('.arpa') && host.split('.').every(l=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)),'INVALID_SOURCE_HOST');
  return u;
}
export async function bounded(response:Response,max=MAX_BYTES):Promise<string> {
  requireValue(!Number.isFinite(Number(response.headers.get('content-length'))) || Number(response.headers.get('content-length'))<=max,'UPSTREAM_TOO_LARGE');
  requireValue(response.body,'EMPTY_UPSTREAM');
  const reader=response.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;requireValue(size<=max,'UPSTREAM_TOO_LARGE');chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  const all=new Uint8Array(size);let at=0;for(const part of chunks){all.set(part,at);at+=part.length;}
  try{return new TextDecoder('utf-8',{fatal:true}).decode(all);}catch{throw new ConversionError('UPSTREAM_NOT_UTF8');}
}
export async function publicDNS(host:string,fetcher:typeof fetch=globalThis.fetch.bind(globalThis)):Promise<string[]> {
  host=host.replace(/^\[|\]$/g,'');
  if(ipaddr.isValid(host)){requireValue(publicIP(host),'PRIVATE_ADDRESS_DENIED');return [host];}
  const results=await Promise.all(['A','AAAA'].map(async type=>{
    const res=await fetcher('https://cloudflare-dns.com/dns-query?'+new URLSearchParams({name:host,type}),{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(4000),redirect:'manual',cache:'no-store'});
    requireValue(res.ok,'DNS_FAILED');const data=JSON.parse(await bounded(res,64000));
    requireValue(data.Status===0,'DNS_FAILED');
    return (data.Answer??[]).filter((x:any)=>x.type===1||x.type===28).map((x:any)=>String(x.data));
  }));
  const ips=results.flat();requireValue(ips.length>0 && ips.length<=32 && ips.every(publicIP),'DNS_NOT_PUBLIC');return ips;
}
/** DNS preflight is deliberately not represented as DNS pinning.
 * A production deployment is gated until edge network/rebinding tests pass.
 * No VPC/Tunnel bindings, resolveOverride, cookies or incoming headers are forwarded.
 */
export async function retrieve(value:string,headersOrFetcher:Record<string,string>|typeof fetch={},testFetcher?:typeof fetch):Promise<string> {
  const fetcher=typeof headersOrFetcher==='function'?headersOrFetcher:(testFetcher||globalThis.fetch.bind(globalThis));
  const extra=typeof headersOrFetcher==='function'?{}:headersOrFetcher;
  let u=validateURL(value);const origin=u.origin,deadline=Date.now()+12000;
  for(let count=0;count<=3;count++){
    await publicDNS(u.hostname,fetcher);
    const time=deadline-Date.now();requireValue(time>0,'UPSTREAM_TIMEOUT');
    let res:Response;
    try {res=await fetcher(u.href,{method:'GET',redirect:'manual',cache:'no-store',signal:AbortSignal.timeout(time),headers:{'user-agent':'Clash.Meta/OpenClash-private-converter','accept':'application/yaml,text/plain,application/octet-stream','cache-control':'no-store',...(u.origin===origin?extra:{})}});}
    catch{throw new ConversionError('UPSTREAM_UNAVAILABLE',502);}
    if([301,302,303,307,308].includes(res.status)){
      const location=res.headers.get('location');await res.body?.cancel();
      requireValue(location && count<3,'TOO_MANY_REDIRECTS');
      const next=validateURL(new URL(location,u).href);
      requireValue(!(u.protocol==='https:' && next.protocol==='http:'),'INSECURE_REDIRECT');u=next;continue;
    }
    requireValue(res.ok,'UPSTREAM_BAD_STATUS');
    return await bounded(res);
  }
  throw new ConversionError('TOO_MANY_REDIRECTS');
}
