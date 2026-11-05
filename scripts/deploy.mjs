import {spawnSync} from 'node:child_process';
const release=process.env.WORKERS_CI_COMMIT_SHA||process.env.RELEASE_SHA||'0.1.0-unaccepted';
if(!/^(?:[0-9a-f]{40}|0\.1\.0-unaccepted)$/.test(release))throw Error('Invalid release identifier');
const command=new URL('../node_modules/wrangler/bin/wrangler.js',import.meta.url);
const result=spawnSync(process.execPath,[command.pathname.replace(/^\/([A-Za-z]:)/,'$1'),'deploy','--keep-vars','--var','RELEASE:'+release],{stdio:'inherit',env:process.env});
process.exitCode=result.status??1;
