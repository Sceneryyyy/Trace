import type {SpectrogramTile} from './spectrogramTile'
export type SpectralRows={key:string;map:Uint16Array;first:number[];last:number[]}
export function spectralRows(first:Uint32Array,last:Uint32Array):SpectralRows {
 const ids=new Map<string,number>(),map=new Uint16Array(first.length),a:number[]=[],b:number[]=[]
 for(let y=0;y<first.length;y++){const key=first[y]+':'+last[y];let id=ids.get(key);if(id===undefined){id=a.length;ids.set(key,id);a.push(first[y]);b.push(last[y])}map[y]=id}
 return {key:a.map((v,i)=>v+':'+b[i]).join(','),map,first:a,last:b}
}
export type SpectralProjection={base:number;rows:number;tree:Float32Array;counts:Uint8Array[];bytes:number}
function project(tile:SpectrogramTile,plan:SpectralRows):SpectralProjection {
 let base=1;while(base<tile.columns)base*=2
 const rows=plan.first.length,tree=new Float32Array(base*2*rows).fill(-Infinity),counts=Array.from({length:4},()=>new Uint8Array(tile.columns+1))
 for(let col=0;col<tile.columns;col++){
  for(let s=0;s<4;s++)counts[s][col+1]=counts[s][col]+(tile.status[col]===s?1:0)
  if(tile.status[col]!==1)continue
  for(let y=0;y<rows;y++){let peak=-Infinity;for(let bin=plan.first[y];bin<=plan.last[y];bin++)peak=Math.max(peak,tile.decibels[col*tile.bins+bin]);tree[(base+col)*rows+y]=peak}
 }
 for(let node=base-1;node>=1;node--)for(let y=0;y<rows;y++)tree[node*rows+y]=Math.max(tree[node*2*rows+y],tree[(node*2+1)*rows+y])
 return {base,rows,tree,counts,bytes:tree.byteLength+counts.reduce((n,a)=>n+a.byteLength,0)+256}
}
/** Entries own only derived arrays; weak tile keys cannot keep an evicted raw tile alive. */
export class SpectrogramProjectionCache {
 private lookup=new WeakMap<SpectrogramTile,{key:string;id:number}>()
 private entries=new Map<number,SpectralProjection>()
 private nextId=0
 bytes=0
 get(tile:SpectrogramTile,plan:SpectralRows,budget:number):SpectralProjection {
  const old=this.lookup.get(tile),cached=old?.key===plan.key?this.entries.get(old.id):undefined
  if(cached){this.entries.delete(old!.id);this.entries.set(old!.id,cached);this.trim(budget);return cached}
  if(old){const previous=this.entries.get(old.id);if(previous){this.entries.delete(old.id);this.bytes-=previous.bytes}}
  const p=project(tile,plan),id=++this.nextId;this.lookup.set(tile,{key:plan.key,id});this.entries.set(id,p);this.bytes+=p.bytes;this.trim(budget);return p
 }
 trim(budget:number):void {while(this.bytes>Math.max(0,budget)&&this.entries.size){const [id,p]=this.entries.entries().next().value!;this.entries.delete(id);this.bytes-=p.bytes}}
 clear():void {this.entries.clear();this.lookup=new WeakMap();this.bytes=0}
}
export function spectralMaximum(p:SpectralProjection,from:number,to:number,out:Float32Array,nodes:Uint16Array):void {
 let l=p.base+from,r=p.base+to,count=0
 while(l<r){if(l&1)nodes[count++]=l++;if(r&1)nodes[count++]=--r;l>>=1;r>>=1}
 for(let y=0;y<p.rows;y++){let value=-Infinity;for(let i=0;i<count;i++)value=Math.max(value,p.tree[nodes[i]*p.rows+y]);out[y]=value}
}
