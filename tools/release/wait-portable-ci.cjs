// Windows builds run alongside the Linux gates. A candidate may only be packed
// after GitHub reports the mandatory portable job succeeded in this exact run.
const fs=require('node:fs'),path=require('node:path')
const {performance}=require('node:perf_hooks')
const pollMs=45000,maxWaitMs=50*60*1000

function portableOutcome(run,jobs,expected){
 if(run?.id!==expected.runId)throw Error('PORTABLE_CI_RUN_MISMATCH')
 if(run.head_sha!==expected.headSha)throw Error('PORTABLE_CI_HEAD_MISMATCH')
 if(run.run_attempt!==expected.attempt)throw Error('PORTABLE_CI_ATTEMPT_MISMATCH')
 if(!['queued','in_progress','completed','waiting','pending','requested'].includes(run.status))throw Error('PORTABLE_CI_RUN_METADATA_MISSING')
 if(run.status==='completed'&&run.conclusion!=='success')throw Error('PORTABLE_CI_RUN_FAILED')
 if(!Number.isSafeInteger(jobs?.total_count)||!Array.isArray(jobs.jobs)||jobs.total_count!==jobs.jobs.length)throw Error('PORTABLE_CI_JOB_METADATA_MISSING')
 // A reusable Trace workflow prefixes the job name, e.g. "candidate / portable".
 const matches=jobs.jobs.filter(job=>typeof job.name==='string'&&/(^| \/ )portable$/.test(job.name))
 if(matches.length!==1)throw Error('PORTABLE_CI_JOB_METADATA_MISSING')
 const job=matches[0]
 if(job.run_id!==expected.runId||job.head_sha!==expected.headSha||job.run_attempt!==expected.attempt)throw Error('PORTABLE_CI_JOB_IDENTITY_MISMATCH')
 if(!Number.isSafeInteger(job.id)||job.id<1||!['queued','in_progress','completed','waiting','pending','requested'].includes(job.status))throw Error('PORTABLE_CI_JOB_METADATA_MISSING')
 if(job.status==='completed'){
  if(job.conclusion!=='success')throw Error('PORTABLE_CI_FAILED: '+(job.conclusion||'missing conclusion'))
  return {status:'pass',jobId:job.id,conclusion:job.conclusion}
 }
 return {status:'pending',jobId:job.id,conclusion:job.conclusion??null}
}

function expectedFromEnvironment(env){
 const integer=value=>typeof value==='string'&&/^[1-9][0-9]*$/.test(value)&&Number.isSafeInteger(Number(value))?Number(value):null
 const runId=integer(env.GITHUB_RUN_ID),attempt=integer(env.GITHUB_RUN_ATTEMPT)
 if(!runId||!attempt||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY||''))throw Error('CURRENT_GITHUB_RUN_REQUIRED')
 if(!env.GITHUB_TOKEN)throw Error('GITHUB_ACTIONS_READ_TOKEN_REQUIRED')
 if(env.GITHUB_API_URL&&env.GITHUB_API_URL!=='https://api.github.com')throw Error('UNSUPPORTED_GITHUB_API')
 return {runId,attempt,headSha:env.GITHUB_SHA,repository:env.GITHUB_REPOSITORY}
}

async function main(){
 const folder=path.resolve(__dirname,'../../artifacts/release'),file=path.join(folder,'portable-ci-gate.json')
 fs.mkdirSync(folder,{recursive:true})
 const report={schemaVersion:1,status:'running',scope:'GitHub current-run portable gate; no hardware or release acceptance',startedAt:new Date().toISOString()}
 const save=()=>fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n')
 save()
 try{
  const expected=expectedFromEnvironment(process.env);Object.assign(report,expected);save()
  const started=performance.now(),base='https://api.github.com/repos/'+expected.repository+'/actions/runs/'+expected.runId
  const request=async suffix=>{
   const remaining=maxWaitMs-(performance.now()-started)
   if(remaining<=0)throw Error('PORTABLE_CI_TIMEOUT')
   let response
   try{response=await fetch(base+suffix,{headers:{accept:'application/vnd.github+json',authorization:'Bearer '+process.env.GITHUB_TOKEN,'X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(Math.ceil(Math.min(20000,remaining)))})}
   catch{throw Error('GITHUB_CI_REQUEST_FAILED')}
   if(!response.ok)throw Error('GITHUB_CI_HTTP_'+response.status)
   try{return await response.json()}catch{throw Error('GITHUB_CI_RESPONSE_INVALID')}
  }
  while(true){
   const pollStart=performance.now(),run=await request(''),jobs=await request('/jobs?filter=latest&per_page=100')
   if(performance.now()-started>=maxWaitMs)throw Error('PORTABLE_CI_TIMEOUT')
   const result=portableOutcome(run,jobs,expected);Object.assign(report,result,{checkedAt:new Date().toISOString()});save()
   if(result.status==='pass'){console.log('TRACE_PORTABLE_CI_GATE_PASS',expected.runId,expected.headSha,result.jobId);return}
   console.log('TRACE_PORTABLE_CI_GATE_PENDING',expected.runId,result.jobId)
   const remaining=maxWaitMs-(performance.now()-started)
   if(remaining<=0)throw Error('PORTABLE_CI_TIMEOUT')
   await new Promise(resolve=>setTimeout(resolve,Math.min(remaining,Math.max(0,pollMs-(performance.now()-pollStart)))))
  }
 }catch(error){report.status='fail';report.error=error.message;report.checkedAt=new Date().toISOString();save();throw error}
}

module.exports={portableOutcome,expectedFromEnvironment}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1})
