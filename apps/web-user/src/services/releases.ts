export type ReleasePlatform = 'android'|'ios'|'windows'|'macos';
export interface AppRelease { id:string; platform:ReleasePlatform; version:string; build_number:number; file_name:string; size_bytes:number; notes:string; created_at:number }
const API_BASE=(import.meta.env.VITE_API_BASE_URL||'').replace(/\/$/,'');
async function request<T>(path:string):Promise<T>{
  const response=await fetch(`${API_BASE}${path}`,{headers:{accept:'application/json'}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data?.error?.message||`Yêu cầu thất bại (${response.status})`);
  return data as T;
}
export const listActiveReleases=()=>request<{releases:AppRelease[]}>('/api/releases');
export const getDownloadTicket=(platform:ReleasePlatform)=>request<{release:AppRelease;downloadUrl:string;ticketExpiresIn:number}>(`/api/releases/${platform}/download-ticket`);
