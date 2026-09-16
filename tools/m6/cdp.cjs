const fs=require('fs'),path=require('path'),net=require('net'),{spawn}=require('child_process')
const delay=ms=>new Promise(r=>setTimeout(r,ms))
async function port(){const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const p=server.address().port;await new Promise(r=>server.close(r));return p}
class CDP {
 constructor(socket){this.socket=socket;this.pending=new Map();this.id=0;this.events=[];socket.addEventListener('message',event=>{const message=JSON.parse(String(event.data));if(message.id){const p=this.pending.get(message.id);if(p){this.pending.delete(message.id);clearTimeout(p.timer);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result)}}else this.events.push(message);if(this.events.length>2000)this.events.shift()})}
 send(method,params={}){return new Promise((resolve,reject)=>{const id=++this.id,timer=setTimeout(()=>{this.pending.delete(id);reject(Error('CDP timeout '+method))},20000);this.pending.set(id,{resolve,reject,timer});this.socket.send(JSON.stringify({id,method,params}))})}
 async evaluate(expression){const r=await this.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value}
 async state(){return (await this.evaluate("window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})")).state}
 async request(command,payload={}){for(let i=0;i<8;i++){const s=await this.state(),r=await this.evaluate('window.trace.request('+JSON.stringify({protocolVersion:1,requestId:command+Date.now()+i,expectedStateRevision:s.revision,command,payload})+')');if(r.ok)return r;if(r.error?.code!=='STALE_REQUEST')throw Error(JSON.stringify(r.error))}throw Error('Repeated stale request')}
 async click(selector){let point;for(const begin=Date.now();!point&&Date.now()-begin<10000;){point=await this.evaluate("(()=>{const e=document.querySelector("+JSON.stringify(selector)+");if(!e||e.disabled)return null;e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");if(!point)await delay(20)}if(!point)throw Error('Missing or disabled '+selector);await this.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await this.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point})}
 async key(code,key,virtual){await this.send('Input.dispatchKeyEvent',{type:'keyDown',code,key,windowsVirtualKeyCode:virtual});await this.send('Input.dispatchKeyEvent',{type:'keyUp',code,key,windowsVirtualKeyCode:virtual})}
 async screenshot(file){const image=await this.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync(file,Buffer.from(image.data,'base64'))}
 close(){this.socket.close()}
}
async function launch(executable,folder,{scale=1,userData,recordDirectory,bounds,args=[],visible=true}={}){
 fs.mkdirSync(folder,{recursive:true});const debugPort=await port(),working=path.join(folder,'empty-working-directory');fs.mkdirSync(working,{recursive:true})
 const env={...process.env,PATH:'C:\\Windows\\System32;C:\\Windows',TRACE_TEST_WINDOW_BOUNDS:bounds?JSON.stringify(bounds):undefined,TRACE_TEST_ROOT:folder,TRACE_TEST_USER_DATA:userData||path.join(folder,'user-data'),TRACE_RECORD_TEST_DIR:recordDirectory||path.join(folder,'takes')};delete env.ELECTRON_RUN_AS_NODE;delete env.Path
 const child=spawn(executable,['--trace-test',...(visible?['--trace-test-visible']:[]),...(process.env.TRACE_TEST_GPU==='1'?[]:['--disable-gpu','--disable-renderer-backgrounding']),'--remote-debugging-port='+debugPort,'--force-device-scale-factor='+scale,'--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost',...args],{cwd:working,env,windowsHide:!visible,stdio:['ignore','pipe','pipe']})
 child.stdout.on('data',b=>fs.appendFileSync(path.join(folder,'console.log'),b));child.stderr.on('data',b=>fs.appendFileSync(path.join(folder,'console.log'),b))
 let target
 for(const start=Date.now();Date.now()-start<30000;){if(child.exitCode!==null)throw Error('Trace exited '+child.exitCode);try{const pages=await(await fetch('http://127.0.0.1:'+debugPort+'/json/list')).json();target=pages.find(p=>p.type==='page'&&p.url.includes('out-trace'));if(target)break}catch{}await delay(50)}
 if(!target){child.kill();throw Error('Packaged renderer not available')}
 const socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true})})
 const cdp=new CDP(socket);await cdp.send('Runtime.enable');await cdp.send('Network.enable');await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0})
 let rendererReady=false
  for(const begin=Date.now();Date.now()-begin<30000;){
    if(child.exitCode!==null)throw Error('Trace exited before renderer ready '+child.exitCode)
    try{rendererReady=await cdp.evaluate("document.readyState==='complete'&&typeof window.trace?.request==='function'&&typeof crypto.randomUUID==='function'");if(rendererReady)break}catch(error){if(!/context|navigation/i.test(String(error)))throw error}
    await delay(30)
  }
  if(!rendererReady){cdp.close();child.kill();throw Error('Packaged renderer did not finish initialization')}
  return {child,cdp,folder,async close(){try{await cdp.request('app.quit')}catch{}for(const begin=Date.now();child.exitCode===null&&Date.now()-begin<30000;)await delay(50);if(child.exitCode===null){child.kill();throw Error('Trace did not finish closing')}cdp.close();if(child.exitCode!==0)throw Error('Trace exit '+child.exitCode)}}
}
module.exports={launch,delay}
