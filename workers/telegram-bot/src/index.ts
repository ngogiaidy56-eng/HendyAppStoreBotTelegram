import { dispatch } from './gateway/dispatcher';
function safeEqual(a:string,b:string){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
interface Env { BOT_TOKEN:string; BOT_WEBHOOK_SECRET:string; APP_URL:string; ADMIN_URL:string; ADMIN_TELEGRAM_IDS?:string; BOT_USERNAME?:string; DB:D1Database }
export default { async fetch(request:Request,env:Env) {
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET') return Response.json({ok:true,service:'hendy-telegram-bot'});
  if(url.pathname!=='/telegram/webhook'||request.method!=='POST') return Response.json({error:'not_found'},{status:404});
  if(!env.BOT_WEBHOOK_SECRET||!safeEqual(request.headers.get('x-telegram-bot-api-secret-token')||'',env.BOT_WEBHOOK_SECRET)) return Response.json({error:'unauthorized'},{status:401});
  const text=await request.text();if(text.length>1024*1024)return Response.json({error:'body_too_large'},{status:413});
  let update:any;try{update=JSON.parse(text)}catch{return Response.json({error:'invalid_json'},{status:400})}
  await dispatch(update,env);return Response.json({ok:true});
}};
