import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const skip=new Set(['node_modules','.git','.wrangler','private','dist','test-results']);
const errors=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
 if(skip.has(item.name)||/^fake-.*-state$/.test(item.name))continue;
 const file=path.join(dir,item.name),relative=path.relative(root,file).replaceAll('\\','/');
 if(item.isDirectory()){walk(file);continue;}
 if(/(^|\/)\.env|\.dev\.vars|default\.toml|access-key|identity\.secret/.test(relative))errors.push(relative+': private file');
 if(/\.pem$/.test(file)&&relative!=='test/fake-ca.pem')errors.push(relative+': unexpected key/certificate');
 const text=fs.readFileSync(file,'utf8');
 if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|-----BEGIN (?:EC |RSA |OPENSSH )?PRIVATE KEY-----)/.test(text))errors.push(relative+': credential pattern');
 for(const match of text.matchAll(/https?:\/\/[^\s'"<>]+[?&](?:token|access_token|key|auth)=([^\s'"<>]+)/gi))if(!/FAKE|SECRET|EXAMPLE|\$|\{|encodeURIComponent/.test(match[1]))errors.push(relative+': non-fictional credential query');
}}
walk(root);if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Public-source scan passed; no private credential files or known real-secret patterns.');
