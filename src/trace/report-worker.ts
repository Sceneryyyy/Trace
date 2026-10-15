// Async work must not outlive its owner; Windows Job Objects also stop blocked native work.
process.once('disconnect',()=>process.exit(1))
import {buildReport} from './reportBuilder'
import type {ReportRequest} from './reportTypes'
let cancelled=false,started=false
process.on('message',async(raw:unknown)=>{
 const message=raw as {kind:string;request:ReportRequest}
 if(message?.kind==='cancel'){cancelled=true;return}
 if(started||message?.kind!=='report')return;started=true
 try{const result=await buildReport(message.request,p=>process.send?.({type:'progress',...p,memory:{rss:process.memoryUsage().rss,heapUsed:process.memoryUsage().heapUsed}}),()=>cancelled);process.send?.({ok:true,result},()=>process.exit(0))}
 catch(error){process.send?.({ok:false,error:String(error)},()=>process.exit(1))}
})
