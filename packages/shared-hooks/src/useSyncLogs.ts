import { useEffect, useState } from 'react';
export function useSyncLogs(apiUrl:string, token:string) {
 const [logs,setLogs]=useState<any[]>([]); const [error,setError]=useState('');
 useEffect(()=>{let cancelled=false;fetch(`${apiUrl.replace(/\/$/,'')}/api/admin/audit`,{headers:{authorization:`Bearer ${token}`}}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d?.error?.message||'Load logs failed');if(!cancelled)setLogs(d.logs||[]);}).catch(e=>{if(!cancelled)setError(e.message);});return()=>{cancelled=true;}},[apiUrl,token]);return {logs,error};
}
