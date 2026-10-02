import {transform} from './spectralSurface'
/** Project a screen-size marker at the front time axis; it never modifies mesh
 * or measurement data. Out-of-view cursors have no marker. */
export function surfaceCursor(matrix:Float64Array,cursor:number|null,width:number,height:number):{x:number;y:number}|null{
 if(cursor===null||!Number.isFinite(cursor)||cursor<0||cursor>1||width<=0||height<=0)return null
 try{
  if(matrix[3]*(cursor*2-1)+matrix[11]+matrix[15]<=0)return null
  const q=transform(matrix,[cursor*2-1,0,1]),x=(q[0]+1)*width/2,y=(1-q[1])*height/2
  if(!q.every(Number.isFinite)||q[2]<-1||q[2]>1||x<0||x>width||y<0||y>height)return null
  return {x,y}
 }catch{return null}
}
export function drawSurfaceCursor(ctx:CanvasRenderingContext2D,point:{x:number;y:number}|null,color:string):void{
 if(!point)return
 const {x,y}=point;ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2
 ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x,y-11);ctx.stroke()
 ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-5,y-7);ctx.lineTo(x+5,y-7);ctx.closePath();ctx.fill();ctx.restore()
}
