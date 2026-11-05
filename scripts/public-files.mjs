import fs from 'node:fs';
import path from 'node:path';
export function publicFiles(root){
 const files=[];const skip=new Set(['node_modules','.git','.wrangler','private','dist','test-results']);
 const walk=dir=>{for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  if(skip.has(item.name)||/^fake-.*-state$/.test(item.name))continue;
  const file=path.join(dir,item.name);
  if(item.isDirectory())walk(file);else files.push({path:path.relative(root,file).replaceAll('\\','/'),mode:'100644',type:'blob',content:fs.readFileSync(file,'utf8')});
 }};walk(root);return files;
}
if(process.argv[2])process.stdout.write(JSON.stringify(publicFiles(path.resolve(process.argv[2]))));
