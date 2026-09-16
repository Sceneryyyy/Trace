export function zoomLabel(value:number,digits=1):string{return Number(value.toFixed(digits)).toString()}
export function wheelPixels(delta:number,mode:number):number{
 return Number.isFinite(delta)?Math.max(-10000,Math.min(10000,delta*(mode===1?16:mode===2?250:1))):0
}
export function wheelValue(value:number,delta:number,min:number,max:number,invert=false):number{
 return Math.max(min,Math.min(max,value*Math.exp(delta*.0015*(invert?-1:1))))
}
export function zoomRange(start:bigint,end:bigint,total:bigint,rate:number,anchor:bigint,delta:number):{start:string;end:string}{
 const old=end-start;if(old<=0n||total<=0n||rate<=0)throw Error('INVALID_ZOOM_RANGE')
 const minimum=BigInt(Math.min(Number(total),Math.max(1,Math.round(rate*5)))),maximum=BigInt(Math.min(Number(total),Math.max(1,Math.round(rate*60))))
 let span=BigInt(Math.round(wheelValue(Number(old),delta,Number(minimum),Number(maximum))))
 let next=anchor-(anchor-start)*span/old
 if(next<0n)next=0n;if(next+span>total)next=total-span
 return {start:next.toString(),end:(next+span).toString()}
}
