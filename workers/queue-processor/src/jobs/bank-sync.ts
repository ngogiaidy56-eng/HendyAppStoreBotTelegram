/** Provider adapter contract. Do not credit balances from a queue payload alone. */
export async function processBankSync(job:any, env:any) {
 if(!env.BANK_SYNC_URL || !env.BANK_SYNC_SECRET) throw new Error('bank-sync provider adapter not configured');
 const res=await fetch(env.BANK_SYNC_URL,{method:'POST',headers:{'content-type':'application/json','x-internal-signature':env.BANK_SYNC_SECRET},body:JSON.stringify(job)});
 if(!res.ok) throw new Error(`bank-sync provider returned ${res.status}`);
 return res.json();
}
