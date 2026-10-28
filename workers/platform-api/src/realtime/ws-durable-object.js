import { ADMIN_STREAM_PROTOCOL, normalizeAdminEvent } from './ws-handler.js';
const MAX_EVENT_BYTES=16*1024;
export class AdminLiveSession {
  constructor(state,env){this.state=state;this.env=env;}
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/publish'&&request.method==='POST'){
      const raw=await request.text(); if(raw.length>MAX_EVENT_BYTES)return Response.json({error:'event_too_large'},{status:413});
      let input; try{input=JSON.parse(raw);}catch{return Response.json({error:'invalid_json'},{status:400});}
      let event; try{event=normalizeAdminEvent(input);}catch{return Response.json({error:'invalid_event'},{status:400});}
      const text=JSON.stringify(event); let delivered=0;
      for(const socket of this.state.getWebSockets()){try{socket.send(text);delivered++;}catch{try{socket.close(1011,'stream_send_failed');}catch{}}}
      return Response.json({ok:true,delivered});
    }
    if((request.headers.get('upgrade')||'').toLowerCase()!=='websocket'||(request.headers.get('sec-websocket-protocol')||'')!==ADMIN_STREAM_PROTOCOL) return Response.json({error:'websocket_upgrade_required'},{status:426});
    const pair=new WebSocketPair(); const client=pair[0]; const server=pair[1];
    this.state.acceptWebSocket(server); server.serializeAttachment({role:'admin-observer',connectedAt:Date.now()});
    server.send(JSON.stringify({type:'system',action:'live_stream_connected',status:'healthy',at:Math.floor(Date.now()/1000)}));
    return new Response(null,{status:101,webSocket:client,headers:{'Sec-WebSocket-Protocol':ADMIN_STREAM_PROTOCOL}});
  }
  webSocketMessage(socket){try{socket.send(JSON.stringify({type:'system',action:'read_only_stream',status:'warning',at:Math.floor(Date.now()/1000)}));}catch{}try{socket.close(1008,'read_only_stream');}catch{}}
  webSocketClose(socket,code,reason){try{socket.close(code||1000,reason||'closed');}catch{}}
  webSocketError(socket){try{socket.close(1011,'socket_error');}catch{}}
}
