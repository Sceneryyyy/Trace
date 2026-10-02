const fs=require('node:fs/promises'),path=require('node:path'),http=require('node:http'),{spawn}=require('node:child_process')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function browserPage(folder,entry,work){
 const server=http.createServer(async(req,res)=>{
  try{const file=path.resolve(folder,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(folder+path.sep))throw Error('PATH');const bytes=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(bytes)}catch{res.writeHead(404);res.end()}
 })
 await new Promise(r=>server.listen(0,'127.0.0.1',r))
 const profile=path.join(folder,'profile');let child,ws
 try{
  child=spawn(process.env.TRACE_AUDIT_CHROMIUM||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']})
  let startupError;child.on('error',e=>startupError=e);child.stderr.resume()
  let port;for(let i=0;i<200;i++){if(startupError)throw startupError;try{port=Number((await fs.readFile(path.join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{}await delay(50)}
  if(!port)throw Error('CHROMIUM_NOT_READY')
  const pages=await fetch('http://127.0.0.1:'+port+'/json/list').then(r=>r.json());ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl)
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
  let id=0;const pending=new Map()
  ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id)}}
  const send=(method,params={})=>new Promise((r,j)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);j(Error('CDP_TIMEOUT '+method))},30000);pending.set(n,m=>{clearTimeout(t);m.error?j(Error(JSON.stringify(m.error))):r(m.result)});ws.send(JSON.stringify({id:n,method,params}))})
  const evaluate=async expression=>{const v=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(v.exceptionDetails)throw Error(JSON.stringify(v.exceptionDetails));return v.result.value}
  const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await delay(50)}throw Error('UI_TIMEOUT '+expression)}
  await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false})
  await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/'+entry})
  await wait("document.readyState==='complete'")
  return await work({send,evaluate,wait,delay})
 }finally{ws?.close();child?.kill('SIGTERM');await new Promise(r=>server.close(r))}
}
module.exports={browserPage}
