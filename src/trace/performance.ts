/** Bounded observations, with no source paths, audio samples or identifiers. */
export class PerformanceWindow {
 private samples=new Float64Array(2048)
 private count=0
 private cursor=0
 private maximum=0
 observe(milliseconds:number):void {
  if(!Number.isFinite(milliseconds)||milliseconds<0)return
  this.samples[this.cursor++%this.samples.length]=milliseconds;this.count++;this.maximum=Math.max(this.maximum,milliseconds)
 }
 snapshot(){
  const n=Math.min(this.count,this.samples.length),sorted=Array.from(this.samples.subarray(0,n)).sort((a,b)=>a-b)
  const p=(q:number)=>n?sorted[Math.max(0,Math.ceil(n*q)-1)]:null
  return {count:this.count,windowCount:n,p50Ms:p(.5),p95Ms:p(.95),p99Ms:p(.99),maxMs:this.count?this.maximum:null}
 }
}
