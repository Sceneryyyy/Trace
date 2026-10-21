import type {SpectrogramView} from '../spectrogramView'
import {validateSurface,type SurfaceOptions} from '../surfaceOptions'
export {defaultSurface,validateSurface,surfacePresets,type SurfaceOptions} from '../surfaceOptions'
export type SurfaceMesh={width:number;height:number;vertices:Float32Array;indices:Uint16Array;decibels:Float32Array;valid:Uint8Array;bytes:number}
/** One vertex per displayed time/frequency bucket. Original bins remain in the shared M9 source. */
export function buildSurface(view:SpectrogramView,options:SurfaceOptions,minDb:number,maxDb:number):SurfaceMesh {
 validateSurface(options)
 if(!Number.isInteger(view?.width)||!Number.isInteger(view?.height)||view.width<1||view.width>1024||view.height<1||view.height>512||view.decibels.length!==view.width*view.height||view.status.length!==view.width||view.coverage.length!==view.width)throw Error('INVALID_SURFACE_DATA')
 if(!Number.isFinite(minDb)||!Number.isFinite(maxDb)||maxDb<=minDb)throw Error('INVALID_SURFACE_SCALE')
 const width=Math.max(1,Math.min(options.detail,view.width)),height=Math.max(1,Math.min(options.detail/2,view.height))
 const vertices=new Float32Array(width*height*4),decibels=new Float32Array(width*height).fill(-Infinity),valid=new Uint8Array(width*height),indices:number[]=[]
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const left=Math.floor(x*view.width/width),right=Math.floor((x+1)*view.width/width),bottom=Math.floor(y*view.height/height),top=Math.floor((y+1)*view.height/height)
  let db=-Infinity,complete=true
  for(let col=left;col<right;col++){
   if(view.status[col]!==2||view.coverage[col]<.999999)complete=false
   for(let row=bottom;row<top;row++)db=Math.max(db,view.decibels[row*view.width+col])
  }
  if(!Number.isFinite(db)&&db!==-Infinity)throw Error('INVALID_SURFACE_DATA')
  const id=y*width+x,level=db===-Infinity?0:Math.max(0,Math.min(1,(db-minDb)/(maxDb-minDb)))
  decibels[id]=db;valid[id]=complete?1:0
  vertices.set([(left+right)/view.width-1,level*options.height,1-(bottom+top)/view.height,level],id*4)
 }
 for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++){
  const a=y*width+x,b=a+1,c=a+width,d=c+1
  if(valid[a]&&valid[b]&&valid[c])indices.push(a,c,b)
  if(valid[b]&&valid[c]&&valid[d])indices.push(b,c,d)
 }
 const faces=Uint16Array.from(indices)
 return {width,height,vertices,indices:faces,decibels,valid,bytes:vertices.byteLength+faces.byteLength+decibels.byteLength+valid.byteLength}
}
export type Vec3=[number,number,number]
const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]]
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2]
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]
const norm=(a:Vec3):Vec3=>{const n=Math.hypot(...a);if(n<1e-12)throw Error('INVALID_CAMERA_VECTOR');return [a[0]/n,a[1]/n,a[2]/n]}
export function multiply(a:Float64Array,b:Float64Array):Float64Array {
 const out=new Float64Array(16)
 for(let col=0;col<4;col++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)out[col*4+row]+=a[k*4+row]*b[col*4+k]
 return out
}
export function cameraMatrix(s:SurfaceOptions,aspect:number):Float64Array {
 validateSurface(s);if(!Number.isFinite(aspect)||aspect<=0)throw Error('INVALID_CAMERA_ASPECT')
 // Keep perspective independent of user zoom, then fit the full plotting box.
 // Time/frequency/amplitude axes can expand with each viewport dimension.
 const yaw=s.yaw*Math.PI/180,pitch=s.pitch*Math.PI/180,d=6,target:Vec3=[0,s.height*.5,0],eye:Vec3=[d*Math.cos(pitch)*Math.sin(yaw),target[1]+d*Math.sin(pitch),d*Math.cos(pitch)*Math.cos(yaw)]
 const z=norm(sub(eye,target)),x=norm(cross([0,1,0],z)),y=cross(z,x)
 const view=new Float64Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1])
 const f=1/Math.tan(Math.PI/8),near=.05,far=30,p=new Float64Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)/(near-far),-1,0,0,2*far*near/(near-far),0]),base=multiply(p,view)
 let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity
 for(const x of [-1,1])for(const y of [0,s.height])for(const z of [-1,1]){
  const q=transform(base,[x,y,z]);left=Math.min(left,q[0]);right=Math.max(right,q[0]);bottom=Math.min(bottom,q[1]);top=Math.max(top,q[1])
 }
 // Screen-space fit: 82% width, 78% height at zoom=1, including peaks.
 // Fixed envelope prevents pumping when the audio level changes. Zoom stays
 // relative to this fit, so rotating/resizing never changes saved preferences.
 const sx=1.64/(right-left)*s.zoom,sy=1.56/(top-bottom)*s.zoom
 const fit=new Float64Array([sx,0,0,0,0,sy,0,0,0,0,1,0,-(left+right)*sx/2,-(bottom+top)*sy/2,0,1])
 return multiply(fit,base)
}
export function inverse(matrix:Float64Array):Float64Array {
 const rows=Array.from({length:4},(_,r)=>[...Array.from({length:4},(_,c)=>matrix[c*4+r]),...Array.from({length:4},(_,c)=>r===c?1:0)])
 for(let col=0;col<4;col++){
  let pivot=col;for(let r=col+1;r<4;r++)if(Math.abs(rows[r][col])>Math.abs(rows[pivot][col]))pivot=r
  if(Math.abs(rows[pivot][col])<1e-12)throw Error('SINGULAR_CAMERA')
  ;[rows[col],rows[pivot]]=[rows[pivot],rows[col]];const divisor=rows[col][col]
  for(let k=0;k<8;k++)rows[col][k]/=divisor
  for(let r=0;r<4;r++)if(r!==col){const factor=rows[r][col];for(let k=0;k<8;k++)rows[r][k]-=factor*rows[col][k]}
 }
 const out=new Float64Array(16);for(let r=0;r<4;r++)for(let c=0;c<4;c++)out[c*4+r]=rows[r][c+4];return out
}
export function transform(m:Float64Array,v:Vec3):Vec3 {
 const w=m[3]*v[0]+m[7]*v[1]+m[11]*v[2]+m[15]
 if(Math.abs(w)<1e-12)throw Error('INVALID_PROJECTED_POINT')
 return [0,1,2].map(r=>(m[r]*v[0]+m[4+r]*v[1]+m[8+r]*v[2]+m[12+r])/w) as Vec3
}
/** Nearest visible triangle, with an explicit floor fallback for missing surface data. */
export function pickSurface(mesh:SurfaceMesh,matrix:Float64Array,nx:number,ny:number):{time:number;frequency:number;surface:boolean}|null {
 const inv=inverse(matrix),origin=transform(inv,[nx,ny,-1]),direction=norm(sub(transform(inv,[nx,ny,1]),origin)),v=mesh.vertices
 let closest=Infinity,px=0,pz=0
 for(let i=0;i<mesh.indices.length;i+=3){
  const a=mesh.indices[i]*4,b=mesh.indices[i+1]*4,c=mesh.indices[i+2]*4
  const e1x=v[b]-v[a],e1y=v[b+1]-v[a+1],e1z=v[b+2]-v[a+2],e2x=v[c]-v[a],e2y=v[c+1]-v[a+1],e2z=v[c+2]-v[a+2]
  const hx=direction[1]*e2z-direction[2]*e2y,hy=direction[2]*e2x-direction[0]*e2z,hz=direction[0]*e2y-direction[1]*e2x,det=e1x*hx+e1y*hy+e1z*hz
  if(Math.abs(det)<1e-9)continue
  const sx=origin[0]-v[a],sy=origin[1]-v[a+1],sz=origin[2]-v[a+2],u=(sx*hx+sy*hy+sz*hz)/det;if(u<0||u>1)continue
  const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,w=(direction[0]*qx+direction[1]*qy+direction[2]*qz)/det;if(w<0||u+w>1)continue
  const distance=(e2x*qx+e2y*qy+e2z*qz)/det
  if(distance>=0&&distance<closest){closest=distance;px=origin[0]+direction[0]*distance;pz=origin[2]+direction[2]*distance}
 }
 const surface=Number.isFinite(closest)
 if(!surface){if(Math.abs(direction[1])<1e-9)return null;const d=-origin[1]/direction[1];if(d<0)return null;px=origin[0]+direction[0]*d;pz=origin[2]+direction[2]*d}
 if(px< -1||px>1||pz< -1||pz>1)return null
 return {time:(px+1)/2,frequency:(1-pz)/2,surface}
}
