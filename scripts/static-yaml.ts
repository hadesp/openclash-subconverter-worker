import fs from 'node:fs';
import {stringify} from 'yaml';
import {parseINI,generate} from '../src/ini.ts';
import {HIGH_FILTER} from '../src/multiplier.ts';
const root=new URL('../',import.meta.url),t=parseINI(fs.readFileSync(new URL('templates/Full.ini',root),'utf8'));
const {config}=generate(t,[{name:'STATIC_EXAMPLE_REMOVED',type:'ss',server:'example.com',port:443,cipher:'aes-128-gcm',password:'FAKE'}]);
const low='(?i)(低倍率|低倍|(^|[^0-9A-Za-z.])0?\\.[0-9]+\\s*(x|倍)($|[^A-Za-z0-9.])|倍率\\s*[:：=]?\\s*0?\\.[0-9]+($|[^0-9.]))';
const groups=config['proxy-groups'].map((g,i)=>{
  const parts=t.groups[i].split('`').slice(2),end=parts.findIndex(p=>/^https?:/.test(p));
  const selectors=(end<0?parts:parts.slice(0,end)).filter(p=>!p.startsWith('[]'));
  const clean=(r:string)=>r.replaceAll('(?<!尼|-)日','(^|[^尼-])日').replaceAll('(?<!白)','(^|[^白])');
  g.proxies=g.proxies.filter((p:string)=>p!=='STATIC_EXAMPLE_REMOVED'&&p!=='REJECT');
  if(selectors.length){g.use=['provider1'];if(selectors[0]!=='.*')g.filter=clean(selectors[0]);}
  if(g.name==='🐢 低倍率节点')g.filter=low;
  if(g.name==='🔥 高倍率节点'){g.use=['provider1'];g.filter=HIGH_FILTER;}
  if(g.name==='🌐 其他地区'){
    g.filter='.*';
    g['exclude-filter']=t.groups.filter(l=>/^custom_proxy_group=(🇭🇰|🇺🇸|🇯🇵|🇸🇬|🇼🇸|🇰🇷|🇨🇦|🇬🇧|🇫🇷|🇩🇪|🇳🇱|🇹🇷|🇷🇺|🏠)/u.test(l)).map(l=>clean(l.split('`')[2])).concat(low.replace('(?i)','')).join('|');
  }
  if(g.type!=='select')g.proxies.push('REJECT');
  if(!g.proxies.length)delete g.proxies;
  return g;
});
const output={'proxy-providers':{provider1:{type:'http',url:'https://example.invalid/placeholder',interval:3600,path:'./proxy_provider/provider1.yaml','health-check':{enable:true,url:'https://www.gstatic.com/generate_204',interval:300}}},'proxy-groups':groups,'rule-providers':config['rule-providers'],rules:config.rules};
const heading='# Modified hadesp Full companion YAML; CC BY-SA 4.0.\n# PUBLIC EXAMPLE ONLY: provider1 is a placeholder. Do not replace the router config or export existing subscriptions.\n# Use the INI through the private converter for strict materialized multiplier membership.\n';
fs.writeFileSync(new URL('../Custom_OpenClash_Rules/cfg/yaml/Custom_Clash_Full.yaml',root),heading+stringify(output));
