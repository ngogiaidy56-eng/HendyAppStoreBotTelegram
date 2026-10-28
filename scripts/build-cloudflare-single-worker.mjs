import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const publicDir=path.join(root,'public');
const apps=[
 {name:'Storefront',pkg:'@hendy/web-user',dist:'apps/web-user/dist',base:'/',target:''},
 {name:'Admin',pkg:'@hendy/web-admin',dist:'apps/web-admin/dist',base:'/admin/',target:'admin'},
 {name:'Telegram Mini App',pkg:'@hendy/mini-app',dist:'apps/mini-app/dist',base:'/miniapp/',target:'miniapp'}
];
for(const app of apps){
 console.log('Building '+app.name+' ('+app.pkg+')');
 const result=spawnSync('pnpm',['--filter',app.pkg,'build'],{cwd:root,env:{...process.env,VITE_BASE_PATH:app.base},stdio:'inherit',shell:process.platform==='win32'});
 if(result.error)throw new Error('Cannot start pnpm: '+result.error.message);
 if(result.status!==0)throw new Error(app.name+' build failed with exit code '+result.status);
}
await rm(publicDir,{recursive:true,force:true});
await mkdir(publicDir,{recursive:true});
for(const app of apps){
 const source=path.join(root,app.dist), target=path.join(publicDir,app.target);
 await mkdir(target,{recursive:true});
 if(app.target) await cp(source,target,{recursive:true});
 else for(const entry of await readdir(source,{withFileTypes:true})) await cp(path.join(source,entry.name),path.join(target,entry.name),{recursive:true});
 console.log('Copied '+app.name+' to '+path.relative(root,target));
}
for(const file of ['index.html','admin/index.html','miniapp/index.html']) await (await import('node:fs/promises')).access(path.join(publicDir,file));
console.log('Unified Worker assets verified in public/.');
