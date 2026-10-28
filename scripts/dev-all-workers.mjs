import { spawn } from 'node:child_process';

const targets=['platform-api','queue-processor','edge-router','self-healing-bot'];
const children=[];
let stopping=false;
const command=process.execPath;
for(const target of targets){
  const child=spawn(command,['scripts/dev-worker.mjs',target],{stdio:'inherit',windowsHide:true});
  children.push({target,child});
  child.on('exit',(code,signal)=>{
    if(stopping)return;
    if(code!==0){
      console.error('[dev:all-workers] '+target+' exited (code='+code+', signal='+signal+'); stopping remaining workers.');
      stop(code||1);
    }
  });
}
function stop(code=0){
  if(stopping)return;
  stopping=true;
  for(const {child} of children){if(child.exitCode===null)try{child.kill('SIGTERM')}catch{}}
  setTimeout(()=>{
    for(const {child} of children){if(child.exitCode===null)try{child.kill('SIGKILL')}catch{}}
    process.exit(code);
  },1200);
}
process.on('SIGINT',()=>stop(130));
process.on('SIGTERM',()=>stop(143));
console.log('Started all four local Wrangler dev processes. Default ports: API 8787, Queue 8788, Edge 8789, Self-healing 8790.');
console.log('Press Ctrl+C to stop every local Worker. Local service bindings and local secrets may still need explicit configuration.');
