import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {stringify} from 'yaml';
import {native,uriCases} from '../test/fixtures.ts';
import {parseSubscription} from '../src/parse.ts';
import {generate,parseINI,renameAndFilter} from '../src/ini.ts';
const root=path.resolve(import.meta.dirname,'..'),state=path.join(root,'test-results/mihomo');
fs.mkdirSync(state,{recursive:true});
const exe=process.env.MIHOMO_BIN||path.resolve(root,'../mihomo-bin/mihomo-windows-amd64-compatible.exe');
const t=parseINI(fs.readFileSync(path.join(root,'templates/Full.ini'),'utf8'));
const nodes=renameAndFilter([...native,...parseSubscription(uriCases.join('\n')),{...native[0],name:'香港 2.5x'},{...native[0],name:'美国 1x'}],t,new URLSearchParams());
const {config,available}=generate(t,nodes);
for(const [id,provider] of Object.entries(config['rule-providers'])){
  const filename=new URL(provider.url).pathname.split('/').at(-1)!;
  const local=filename==='Academic_Overseas_No_Google.yaml'?path.join(root,'templates/Academic.yaml'):filename==='Google_Scholar.yaml'?path.join(root,'templates/Scholar.yaml'):path.join(root,'../upstream-rules/rule',filename);
  const out=path.join(state,provider.path);fs.mkdirSync(path.dirname(out),{recursive:true});fs.copyFileSync(local,out);
}
for(const kind of ['geosite','geoip'])fs.copyFileSync(path.join(root,'../'+kind+'.dat'),path.join(state,kind==='geosite'?'geosite.dat':'GeoIP.dat'));
fs.writeFileSync(path.join(root,'test-results/generated.yaml'),stringify(config));
const full=path.join(state,'config.yaml');fs.writeFileSync(full,stringify({'geodata-mode':true,...config}));
const validation=spawnSync(exe,['-t','-d',state,'-f',full],{encoding:'utf8',timeout:120000});
fs.writeFileSync(path.join(root,'test-results/mihomo-full.log'),(validation.stdout||'')+(validation.stderr||''));
const matrix=[];
for(const node of nodes){
  const f=path.join(state,'one.yaml');fs.writeFileSync(f,stringify({proxies:[node],rules:['MATCH,DIRECT']}));
  const v=spawnSync(exe,['-t','-d',state,'-f',f],{encoding:'utf8',timeout:15000});
  matrix.push({name:node.name,type:node.type,source:node.name.startsWith('native-')||['HTTPS','TUIC4','TUIC5'].includes(node.name)?'native':'URI',preserved:true,mihomoConfigValid:v.status===0,detail:v.status===0?'configuration test passed':(v.stdout||'')+(v.stderr||''),connectivity:'not tested; fictional credentials'});
}
const result={target:spawnSync(exe,['-v'],{encoding:'utf8'}).stdout.trim(),fullConfigValid:validation.status===0,fullExit:validation.status,groups:config['proxy-groups'].length,rules:config.rules.length,available,protocols:matrix};
fs.writeFileSync(path.join(root,'test-results/compatibility.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({target:result.target,fullConfigValid:result.fullConfigValid,groups:result.groups,rules:result.rules,fixtures:matrix.length,passed:matrix.filter(x=>x.mihomoConfigValid).length,failed:matrix.filter(x=>!x.mihomoConfigValid).map(x=>({name:x.name,detail:x.detail}))},null,2));
if(!result.fullConfigValid||matrix.some(x=>!x.mihomoConfigValid))process.exitCode=1;
