import {Component,useEffect,useState,type ReactNode} from 'react'
import type {Command,TraceState} from '../shared'
import {SupportPanel} from './SupportPanel'

async function request(command:Command,payload:Record<string,unknown>={}){
 for(let i=0;i<3;i++){
  const s=await window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}})
  const r=await window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:s.state.revision,command,payload})
  if(r.ok)return r.data;if(r.error?.code!=='STALE_REQUEST')throw Error('SUPPORT_ACTION_FAILED')
 }
 throw Error('SUPPORT_ACTION_FAILED')
}
function RecoveryScreen(){
 const [state,setState]=useState<TraceState>(),[error,setError]=useState('')
 useEffect(()=>{const unsub=window.trace.onState(setState);void window.trace.request({protocolVersion:1,requestId:crypto.randomUUID(),expectedStateRevision:0,command:'state.get',payload:{}}).then(r=>setState(r.state)).catch(()=>setError('无法读取后台状态。'));return unsub},[])
 const act=(command:Command)=>void request(command).catch(()=>setError('操作未完成，请重试。'))
 return <main className="recovery-screen"><section><h1>界面遇到问题</h1><p>{state?state.currentRecord?'录音任务仍在后台处理，请恢复界面查看状态。':'可以恢复界面后继续操作。':'正在检查后台状态…'}</p>
  <div className="support-actions"><button onClick={()=>act('app.reloadUI')}>恢复界面</button><button onClick={()=>act('app.quit')}>{state?.currentRecord?'结束录音并退出':'退出 Trace'}</button></div>
  {error&&<p role="status">{error}</p>}<SupportPanel request={request} loggingAvailable={state?.support?.loggingAvailable}/></section></main>
}
export class RecoveryBoundary extends Component<{children:ReactNode},{failed:boolean}> {
 state={failed:false}
 static getDerivedStateFromError(){return {failed:true}}
 componentDidCatch(){void request('app.rendererFault',{kind:'react'}).catch(()=>{})}
 private fail=(kind:'script'|'promise')=>{this.setState({failed:true});void request('app.rendererFault',{kind}).catch(()=>{})}
 private script=()=>this.fail('script')
 private promise=()=>this.fail('promise')
 componentDidMount(){window.addEventListener('error',this.script);window.addEventListener('unhandledrejection',this.promise)}
 componentWillUnmount(){window.removeEventListener('error',this.script);window.removeEventListener('unhandledrejection',this.promise)}
 render(){return this.state.failed?<RecoveryScreen/>:this.props.children}
}
