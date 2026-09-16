export type Rectangle={x:number;y:number;width:number;height:number}
export function restoreWindowBounds(value:unknown,areas:Rectangle[]):Rectangle|undefined{
 if(!value||typeof value!=='object'||!areas.length)return
 const v=value as Rectangle
 if(![v.x,v.y,v.width,v.height].every(Number.isFinite)||v.width<300||v.height<200)return
 const overlap=(a:Rectangle)=>Math.max(0,Math.min(v.x+v.width,a.x+a.width)-Math.max(v.x,a.x))*Math.max(0,Math.min(v.y+v.height,a.y+a.height)-Math.max(v.y,a.y))
 const area=areas.reduce((best,a)=>overlap(a)>overlap(best)?a:best,areas[0])
 if(overlap(area)<10000)return
 const width=Math.min(Math.max(1024,Math.round(v.width)),area.width),height=Math.min(Math.max(700,Math.round(v.height)),area.height)
 return {x:Math.max(area.x,Math.min(Math.round(v.x),area.x+area.width-width)),y:Math.max(area.y,Math.min(Math.round(v.y),area.y+area.height-height)),width,height}
}
