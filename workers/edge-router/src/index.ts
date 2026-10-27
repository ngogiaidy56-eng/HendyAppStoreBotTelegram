import { maintenanceResponse } from './maintenance-guard';
import { resolveLayout } from './layout-resolver';
interface Env { DB: D1Database; PLATFORM_API: Fetcher }
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/edge/health') return Response.json({ok:true,service:'hendy-edge-router',...resolveLayout(request)});
    const blocked = await maintenanceResponse(request, env);
    if (blocked) return blocked;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/downloads/') || url.pathname === '/health') return env.PLATFORM_API.fetch(request);
    return Response.json({error:{code:'NOT_FOUND',message:'Route not found'}},{status:404});
  }
};
