export async function processOtaBuild(job:any, env:any) {
 if(!env.GITHUB_TOKEN||!env.GITHUB_OWNER||!env.GITHUB_REPO) throw new Error('GitHub workflow dispatch is not configured');
 const allowed=new Set(['matrix-build.yml']); const workflow=String(job.workflow||'matrix-build.yml');
 if(!allowed.has(workflow)) throw new Error('unsupported job workflow');
 const res=await fetch(`https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/${workflow}/dispatches`,{method:'POST',headers:{authorization:`Bearer ${env.GITHUB_TOKEN}`,accept:'application/vnd.github+json','x-github-api-version':'2022-11-28','content-type':'application/json'},body:JSON.stringify({ref:'main'})});
 if(!res.ok) throw new Error(`GitHub dispatch failed: ${res.status}`); return {dispatched:true,workflow};
}
