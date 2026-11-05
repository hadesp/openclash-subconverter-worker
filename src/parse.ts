import { parseDocument } from 'yaml';
import { ConversionError, requireValue } from './errors.ts';

export type Proxy = Record<string, any> & {name: string; type: string};
// Generated from the target Mihomo adapter switch, rather than treating protocol names as proof.
export const TYPES = new Set(['ss','ssr','socks5','http','vmess','vless','snell','trojan',
  'hysteria','hysteria2','wireguard','tuic','shadowquic','gost-relay','direct','dns','reject',
  'rematch','ssh','mieru','anytls','sudoku','masque','trusttunnel','openvpn','tailscale','easytier','zerotier']);

export function base64(s: string): string {
  try {
    s = s.replace(/\s/g,'').replace(/-/g,'+').replace(/_/g,'/');
    requireValue(/^[A-Za-z0-9+/]*={0,2}$/.test(s), 'INVALID_BASE64');
    return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s), c=>c.charCodeAt(0)));
  } catch { throw new ConversionError('INVALID_BASE64'); }
}
const dec = (s: string) => decodeURIComponent(s);
function boolean(s: string): boolean {
  requireValue(/^(true|false|0|1)$/i.test(s),'INVALID_BOOLEAN');
  return /^(true|1)$/i.test(s);
}
export function parseYAML(text: string): any {
  try {
    const doc = parseDocument(text, {uniqueKeys:true, maxAliasCount:0} as any);
    requireValue(!doc.errors.length,'INVALID_YAML');
    return doc.toJS({maxAliasCount:0});
  } catch { throw new ConversionError('INVALID_YAML'); }
}
export function parseSubscription(text: string, depth=0): Proxy[] {
  requireValue(depth < 3 && text.length <= 2_000_000,'SUBSCRIPTION_TOO_LARGE');
  text = text.trim().replace(/^\uFEFF/,'');
  const first=text.split(/\r?\n/).find(l=>l.trim()&&!l.trim().startsWith('#')&&l.trim()!=='---')?.trim()||'';
  if ((first.startsWith('{')||/^[\w'"-]+\s*:/.test(first)) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(first)) {
    const doc = parseYAML(text);
    requireValue(doc && Array.isArray(doc.proxies),'YAML_PROXIES_REQUIRED');
    requireValue(!Object.keys(doc['proxy-providers'] ?? {}).length, 'NESTED_PROXY_PROVIDERS_UNSUPPORTED');
    requireValue(doc.proxies.length > 0 && doc.proxies.length <= 2000,'INVALID_PROXY_COUNT');
    return doc.proxies.map(validateProxy);
  }
  if (!text.includes('://')) return parseSubscription(base64(text.split(/\r?\n/).filter(l=>!l.trim().startsWith('#')).join('')),depth+1);
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(s=>s && !s.startsWith('#'));
  requireValue(lines.length > 0 && lines.length <= 2000,'INVALID_PROXY_COUNT');
  return lines.flatMap(line => {
    try { const result=parseURI(line); return (Array.isArray(result)?result:[result]).map(validateProxy); }
    catch(e) { if(e instanceof ConversionError) throw e; throw new ConversionError('INVALID_URI'); }
  });
}
export function validateProxy(p: any): Proxy {
  requireValue(p && typeof p==='object' && !Array.isArray(p),'INVALID_PROXY');
  requireValue(typeof p.type==='string' && TYPES.has(p.type),'UNSUPPORTED_PROXY_TYPE');
  requireValue(typeof p.name==='string' && p.name.length > 0 && p.name.length<=256 && !/[\x00-\x1f]/.test(p.name),'INVALID_PROXY_NAME');
  const special=['direct','dns','reject','rematch','tailscale','zerotier','easytier'];
  if(!special.includes(p.type)){
    requireValue(typeof p.server==='string'&&p.server.length>0&&!/[\s\x00-\x1f]/.test(p.server),'INVALID_PROXY_SERVER');
    requireValue((Number.isInteger(Number(p.port))&&Number(p.port)>=1&&Number(p.port)<=65535)||(['hysteria','hysteria2','mieru'].includes(p.type)&&(p.ports||p['port-range'])),'INVALID_PROXY_PORT');
  }
  if(['vless','vmess'].includes(p.type))requireValue(typeof p.uuid==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.uuid),'INVALID_PROXY_UUID');
  if(['ss','ssr','trojan','anytls','hysteria2'].includes(p.type))requireValue(p.password!=null&&String(p.password).length>0,'MISSING_PROXY_PASSWORD');
  if(p.type==='tuic')requireValue((p.token&&!p.uuid&&!p.password)||(!p.token&&p.uuid&&p.password),'INVALID_TUIC_VERSION_CREDENTIALS');
  // Do not reconstruct native nodes: every unknown/nested field remains intact.
  return structuredClone(p);
}

function parseURI(line: string): Proxy|Proxy[] {
  const scheme=line.slice(0,line.indexOf('://')).toLowerCase();
  if(scheme==='vmess') {
    const v=JSON.parse(base64(line.slice(8)));
    for(const k of Object.keys(v))requireValue(['v','ps','add','port','id','aid','scy','net','type','host','path','tls','sni','fp','alpn'].includes(k),'UNSUPPORTED_VMESS_JSON_PARAMETER');
    const p: Proxy={name:String(v.ps||'VMess'),type:'vmess',server:v.add,port:Number(v.port),uuid:v.id,alterId:Number(v.aid||0),cipher:v.scy||'auto'};
    const q=new URLSearchParams();
    for(const [k,x] of Object.entries({type:v.net,headerType:v.type,host:v.host,path:v.path,security:v.tls==='tls'?'tls':'none',sni:v.sni,fp:v.fp,alpn:v.alpn,serviceName:v.path})) if(x) q.set(k,String(x));
    transport(p,q); return p;
  }
  if(scheme==='ssr') {
    const raw=base64(line.slice(6)), [main, qs='']=raw.split('/?');
    const m=main.match(/^(.+):(\d+):([^:]+):([^:]+):([^:]+):([^:]+)$/);
    requireValue(m,'INVALID_SSR'); const q=new URLSearchParams(qs);
    const allowed=new Set(['remarks','group','obfsparam','protoparam','udpport','uot']);
    for(const key of q.keys()) requireValue(allowed.has(key),'UNSUPPORTED_URI_PARAMETER');
    requireValue(!q.has('udpport')&&!q.has('uot'),'UNSUPPORTED_SSR_EXTENSION');
    return {name:q.has('remarks')?base64(q.get('remarks')!):'SSR',type:'ssr',server:m[1].replace(/^\[|\]$/g,''),port:Number(m[2]),protocol:m[3],cipher:m[4],obfs:m[5],password:base64(m[6]),'obfs-param':q.has('obfsparam')?base64(q.get('obfsparam')!):'','protocol-param':q.has('protoparam')?base64(q.get('protoparam')!):''};
  }
  if(scheme==='ss') {
    let body=line.slice(5), suffix='';
    if(!body.includes('@')) {
      const cut=body.search(/[?#]/); if(cut>=0){suffix=body.slice(cut);body=body.slice(0,cut);}
      body=base64(body)+suffix;
    }
    const u=new URL('ss://'+body),q=u.searchParams;
    let auth=dec(u.username)+(u.password?':'+dec(u.password):'');
    if(!auth.includes(':'))auth=base64(auth);
    const at=auth.indexOf(':'); requireValue(at>0,'INVALID_SS_AUTH');
    const p: Proxy={name:dec(u.hash.slice(1))||'SS',type:'ss',server:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port),cipher:auth.slice(0,at),password:auth.slice(at+1)};
    for(const key of q.keys())requireValue(['plugin','uot','udp'].includes(key),'UNSUPPORTED_URI_PARAMETER');
    if(q.has('udp'))p.udp=boolean(q.get('udp')!);
    if(q.has('uot'))p['udp-over-tcp']=boolean(q.get('uot')!);
    if(q.has('plugin')) {
      const [plugin,...parts]=q.get('plugin')!.split(';');
      requireValue(['obfs-local','simple-obfs','v2ray-plugin'].includes(plugin),'UNSUPPORTED_SS_PLUGIN');
      p.plugin=plugin==='v2ray-plugin'?plugin:'obfs'; const opts:Record<string,any>={};
      for(const part of parts){ const i=part.indexOf('=');const k=i<0?part:part.slice(0,i),v=i<0?true:part.slice(i+1);opts[k.replace(/^obfs-?/,'')||'mode']=v; }
      if(opts.obfs){opts.mode=opts.obfs;delete opts.obfs;}p['plugin-opts']=opts;
    }
    return p;
  }
  // HY2 permits a port range in the authority; URL itself does not.
  let ports='';
  if(['hy2','hysteria2','hysteria'].includes(scheme)) line=line.replace(/(\]:|[^/:]:)(\d+(?:[-,]\d+)+)(?=[/?#]|$)/,(_s,p,r)=>{ports=r;return p+r.split(/[-,]/)[0];});
  const u=new URL(line),q=u.searchParams;
  if(scheme==='mierus'){
    for(const k of q.keys())requireValue(['port','protocol','profile','multiplexing','handshake-mode','traffic-pattern'].includes(k),'UNSUPPORTED_URI_PARAMETER');
    const ports=q.getAll('port'),protocols=q.getAll('protocol');requireValue(ports.length>0&&ports.length===protocols.length,'INVALID_MIERUS_PORTS');
    return ports.map((port,i)=>{
      requireValue(/^(\d+)(-\d+)?$/.test(port)&&['TCP','UDP'].includes(protocols[i]),'INVALID_MIERUS_PORTS');
      const node:Proxy={name:(dec(u.hash.slice(1))||q.get('profile')||u.hostname)+':'+port+'/'+protocols[i],type:'mieru',server:u.hostname,username:dec(u.username),password:dec(u.password),transport:protocols[i],udp:true};
      if(port.includes('-'))node['port-range']=port;else node.port=Number(port);
      for(const k of ['multiplexing','handshake-mode','traffic-pattern'])if(q.has(k))node[k]=q.get(k);
      return node;
    });
  }
  const type=({hy2:'hysteria2',https:'http',socks:'socks5',socks5h:'socks5'} as Record<string,string>)[scheme]||scheme;
  requireValue(['vless','trojan','hysteria','hysteria2','tuic','anytls','http','socks5','ssh','snell','wireguard','mierus'].includes(type),'UNSUPPORTED_URI_SCHEME_USE_NATIVE_YAML');
  const p:Proxy={name:dec(u.hash.slice(1))||type,type,server:u.hostname.replace(/^\[|\]$/g,''),port:Number(u.port||(['ssh'].includes(type)?22:443))};
  let user=dec(u.username),pass=dec(u.password);
  if(['http','socks5'].includes(type)&&user&&!pass){try{const pair=base64(user);const colon=pair.indexOf(':');if(colon>0){user=pair.slice(0,colon);pass=pair.slice(colon+1);}}catch{/* Literal username is also valid. */}}
  if(type==='vless') p.uuid=user;
  if(['trojan','anytls','hysteria2'].includes(type))p.password=user+(u.password?':'+pass:'');
  if(type==='tuic') {if(u.password){p.uuid=user;p.password=pass;}else p.token=user;}
  if(['http','socks5','ssh'].includes(type)){if(user)p.username=user;if(pass)p.password=pass;}
  if(type==='snell')p.psk=user+(u.password?':'+pass:'');
  if(type==='wireguard')p['private-key']=user;
  if(type==='mierus')throw new ConversionError('MIERUS_USE_NATIVE_YAML');
  if(scheme==='https')p.tls=true;
  if(ports)p.ports=ports;
  applyQuery(p,q);
  return p;
}

const transportKeys=new Set(['type','network','security','sni','peer','servername','fp','client-fingerprint','alpn','pbk','sid','flow','encryption','packetEncoding','packet-encoding','host','path','serviceName','service-name','mode','headerType','ed','eh','headers','xhttp-extra','allowInsecure','insecure','skip-cert-verify']);
function transport(p: Proxy,q:URLSearchParams) {
  const get=(...keys:string[])=>keys.map(k=>q.get(k)).find(v=>v!==null);
  const tls=get('security');
  if(tls && tls!=='none') {requireValue(['tls','reality'].includes(tls),'UNSUPPORTED_SECURITY');p.tls=true;}
  const sn=get('sni','peer','servername'); if(sn)p[['vless','vmess'].includes(p.type)?'servername':'sni']=sn;
  const fp=get('fp','client-fingerprint');if(fp)p['client-fingerprint']=fp;
  if(q.has('alpn'))p.alpn=q.get('alpn')!.split(',');
  if(tls==='reality'||q.has('pbk')){requireValue(q.get('pbk'),'REALITY_PUBLIC_KEY_REQUIRED');p['reality-opts']={'public-key':q.get('pbk'),'short-id':q.get('sid')||''};}
  for(const k of ['flow','encryption'])if(q.has(k))p[k]=q.get(k);
  const packet=get('packetEncoding','packet-encoding');if(packet)p['packet-encoding']=packet;
  const skip=get('allowInsecure','insecure','skip-cert-verify');if(skip!=null)p['skip-cert-verify']=boolean(skip);
  let network=get('type','network')||'tcp';
  if(network==='httpupgrade'){network='ws';p['ws-opts']={'v2ray-http-upgrade':true};}
  requireValue(['tcp','ws','grpc','h2','http','xhttp'].includes(network),'UNSUPPORTED_TRANSPORT');
  if(network==='tcp'&&q.get('headerType')==='http')network='http';
  if(q.has('headerType'))requireValue(['none','http'].includes(q.get('headerType')!),'UNSUPPORTED_HEADER_TYPE');
  if(['vless','vmess','trojan'].includes(p.type)) p.network=network;
  const path=q.get('path')||'/',host=q.get('host');
  if(network==='ws'){
    const opts=p['ws-opts']??{};opts.path=path;
    if(host)opts.headers={Host:host};
    if(q.has('headers'))opts.headers={...opts.headers,...JSON.parse(q.get('headers')!)};
    if(q.has('ed'))opts['max-early-data']=Number(q.get('ed'));
    if(q.has('eh'))opts['early-data-header-name']=q.get('eh');
    p['ws-opts']=opts;
  }
  if(network==='grpc')p['grpc-opts']={'grpc-service-name':get('serviceName','service-name')||''};
  if(network==='h2')p['h2-opts']={path,...(host?{host:host.split(',')}:{})};
  if(network==='http')p['http-opts']={path:path.split(','),...(host?{headers:{Host:host.split(',')}}:{})};
  if(network==='xhttp')p['xhttp-opts']={...(q.has('xhttp-extra')?JSON.parse(q.get('xhttp-extra')!):{}),path,...(host?{host}:{}),mode:q.get('mode')||'auto'};
}
function applyQuery(p:Proxy,q:URLSearchParams) {
  transport(p,q);
  const aliases:Record<string,string>={auth:'auth-str',upmbps:'up',downmbps:'down',obfsParam:'obfs-password',obfsparam:'obfs-password',mport:'ports',hopInterval:'hop-interval',congestion_control:'congestion-controller',udp_relay_mode:'udp-relay-mode',disable_sni:'disable-sni',allow_insecure:'skip-cert-verify',publickey:'public-key',privatekey:'private-key',reserved:'reserved',keepalive:'persistent-keepalive',address:'ip',version:'version',psk:'psk',token:'token'};
  const strings=new Set(['up','down','auth','auth-str','obfs','obfs-password','protocol','ports','hop-interval','congestion-controller','udp-relay-mode','fingerprint','certificate','private-key','public-key','ip','ipv6','preshared-key','token','psk']);
  const bools=new Set(['udp','tfo','fast-open','reduce-rtt','disable-sni','disable-mtu-discovery','udp-over-stream','skip-cert-verify']);
  const nums=new Set(['heartbeat-interval','request-timeout','max-open-streams','recv-window-conn','recv-window','initial-stream-receive-window','max-stream-receive-window','initial-connection-receive-window','max-connection-receive-window','cwnd','version','persistent-keepalive','mtu']);
  for(const [raw,v] of q){
    if(transportKeys.has(raw))continue;
    const key=aliases[raw]||raw;
    if(strings.has(key))p[key]=key==='hop-interval'&&p.type==='hysteria2'?v.replace(/s$/,''):v;
    else if(bools.has(key))p[key]=boolean(v);
    else if(nums.has(key)){requireValue(/^\d+$/.test(v),'INVALID_NUMBER');p[key]=Number(v);}
    else if(key==='reserved')p[key]=/^\d+,\d+,\d+$/.test(v)?v.split(',').map(Number):v;
    else throw new ConversionError('UNSUPPORTED_URI_PARAMETER_USE_NATIVE_YAML');
  }
}
