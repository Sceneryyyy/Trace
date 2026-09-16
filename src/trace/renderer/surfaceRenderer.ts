import {cameraMatrix,type SurfaceMesh,type SurfaceOptions} from './spectralSurface'
export type SurfaceScene={mesh:SurfaceMesh|null;options:SurfaceOptions;palette:'trace'|'heat';cursor:number|null;selection:[number,number]|null}
const vertex=`#version 300 es
precision highp float;
in vec3 position;
in float level;
uniform mat4 matrix;
uniform bool wire;
uniform float gridHeight;
out float intensity;
out vec3 world;
void main(){world=vec3(position.x,wire?position.y*gridHeight:position.y,position.z);intensity=level;gl_Position=matrix*vec4(world,1.0);}`
const fragment=`#version 300 es
precision highp float;
in float intensity;
in vec3 world;
uniform vec3 colors[5];
uniform vec4 selection;
uniform float cursor;
uniform bool wire;
out vec4 outputColor;
vec3 color(float t){float a=clamp(t,0.0,1.0)*4.0;int i=min(3,int(floor(a)));return mix(colors[i],colors[i+1],a-float(i));}
void main(){
 if(wire){outputColor=vec4(.24,.30,.36,1.0);return;}
 if(world.x< -1.0||world.x>1.0)discard;
 vec3 normal=normalize(cross(dFdx(world),dFdy(world)));
 float light=.8+.2*abs(dot(normal,normalize(vec3(.3,1.0,.5))));
 vec3 base=color(intensity)*light;
 if(selection.z>0.0&&world.x>=selection.x&&world.x<=selection.y)base=mix(base,vec3(.34,.83,.86),.22);
 if(cursor>=-1.0&&abs(world.x-cursor)<.008)base=vec3(.45,.94,.96);
 outputColor=vec4(base,1.0);
}`
const palettes={trace:new Float32Array([14,21,28,34,65,83,45,143,149,145,230,92,246,225,125].map(v=>v/255)),heat:new Float32Array([14,20,33,51,62,132,170,63,101,244,141,60,253,233,156].map(v=>v/255))}
/** One owned GL context and a fixed set of buffers. Source data never passes through GL for measurement. */
export class SurfaceRenderer {
 private gl:WebGL2RenderingContext
 private program:WebGLProgram|null=null
 private vertices:WebGLBuffer|null=null
 private indices:WebGLBuffer|null=null
 private grid:WebGLBuffer|null=null
 private vao:WebGLVertexArrayObject|null=null
 private lost=false
 private disposed=false
 private scene:SurfaceScene|null=null
 private vertexCapacity=0
 private indexCapacity=0
 private uploaded:SurfaceMesh|null=null
 private loss=(event:Event)=>{event.preventDefault();if(this.disposed)return;this.lost=true;this.uploaded=null;this.failure('3D 图形设备暂不可用')}
 private restore=()=>{if(this.disposed||!this.lost)return;try{this.lost=false;this.initialize();if(this.scene)this.draw(this.scene);this.recovered()}catch(e){this.clearResources();this.failure(String(e))}}
 constructor(private canvas:HTMLCanvasElement,private failure:(message:string)=>void,private recovered:()=>void=()=>{}) {
  const gl=canvas.getContext('webgl2',{alpha:false,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'})
  if(!gl)throw Error('WEBGL2_UNAVAILABLE')
  this.gl=gl;canvas.addEventListener('webglcontextlost',this.loss);canvas.addEventListener('webglcontextrestored',this.restore)
  try{this.initialize()}catch(e){this.dispose();throw e}
 }
 get resources(){return {buffers:this.disposed?0:3,programs:this.disposed?0:1,vertexBytes:this.vertexCapacity,indexBytes:this.indexCapacity,lost:this.lost}}
 private initialize():void {
  const gl=this.gl,shaders:WebGLShader[]=[]
  this.program=null;this.vertices=null;this.indices=null;this.grid=null;this.vao=null
  try{
   for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]] as const){const s=gl.createShader(type);if(!s)throw Error('GL_SHADER_ALLOCATION');shaders.push(s);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('GL_SHADER: '+gl.getShaderInfoLog(s))}
   this.program=gl.createProgram();if(!this.program)throw Error('GL_PROGRAM_ALLOCATION');for(const s of shaders)gl.attachShader(this.program,s);gl.linkProgram(this.program)
   if(!gl.getProgramParameter(this.program,gl.LINK_STATUS))throw Error('GL_LINK: '+gl.getProgramInfoLog(this.program))
   this.vertices=gl.createBuffer();this.indices=gl.createBuffer();this.grid=gl.createBuffer();this.vao=gl.createVertexArray();if(!this.vertices||!this.indices||!this.grid||!this.vao)throw Error('GL_BUFFER_ALLOCATION')
   this.vertexCapacity=this.indexCapacity=0;this.uploaded=null
   const points:number[]=[];for(let i=0;i<=8;i++){const n=-1+i/4;points.push(-1,0,n,0,1,0,n,0,n,0,-1,0,n,0,1,0)}
   points.push(-1,0,1,0,-1,1,1,0)
   gl.bindBuffer(gl.ARRAY_BUFFER,this.grid);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW)
  }finally{for(const s of shaders)gl.deleteShader(s)}
 }
 private attributes(buffer:WebGLBuffer):void {
  const gl=this.gl;gl.bindVertexArray(this.vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer)
  const p=gl.getAttribLocation(this.program!,'position'),l=gl.getAttribLocation(this.program!,'level');gl.enableVertexAttribArray(p);gl.vertexAttribPointer(p,3,gl.FLOAT,false,16,0);gl.enableVertexAttribArray(l);gl.vertexAttribPointer(l,1,gl.FLOAT,false,16,12)
 }
 draw(scene:SurfaceScene):void {
  if(this.disposed)return;this.scene=scene;if(this.lost||this.gl.isContextLost())return
  const gl=this.gl,r=this.canvas.getBoundingClientRect(),dpr=Math.min(3,window.devicePixelRatio||1),limit=gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number
  const scale=Math.min(dpr,Math.sqrt(4*1024*1024/Math.max(1,r.width*r.height)),limit/Math.max(1,r.width),limit/Math.max(1,r.height)),w=Math.max(1,Math.floor(r.width*scale)),h=Math.max(1,Math.floor(r.height*scale))
  if(this.canvas.width!==w)this.canvas.width=w;if(this.canvas.height!==h)this.canvas.height=h
  gl.viewport(0,0,w,h);gl.clearColor(14/255,21/255,28/255,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.useProgram(this.program)
  gl.uniformMatrix4fv(gl.getUniformLocation(this.program!,'matrix'),false,new Float32Array(cameraMatrix(scene.options,w/h)))
  gl.uniform1f(gl.getUniformLocation(this.program!,'gridHeight'),scene.options.height)
  gl.uniform3fv(gl.getUniformLocation(this.program!,'colors[0]'),palettes[scene.palette]);gl.uniform1f(gl.getUniformLocation(this.program!,'cursor'),scene.cursor===null?-10:scene.cursor*2-1)
  gl.uniform4f(gl.getUniformLocation(this.program!,'selection'),(scene.selection?.[0]||0)*2-1,(scene.selection?.[1]||0)*2-1,scene.selection?1:0,0)
  const mesh=scene.mesh
  if(mesh?.indices.length){
   this.attributes(this.vertices!);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,this.indices)
   if(this.uploaded!==mesh){
    if(mesh.vertices.byteLength>this.vertexCapacity){this.vertexCapacity=mesh.vertices.byteLength;gl.bufferData(gl.ARRAY_BUFFER,this.vertexCapacity,gl.DYNAMIC_DRAW)}
    gl.bufferSubData(gl.ARRAY_BUFFER,0,mesh.vertices)
    if(mesh.indices.byteLength>this.indexCapacity){this.indexCapacity=mesh.indices.byteLength;gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,this.indexCapacity,gl.DYNAMIC_DRAW)}
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER,0,mesh.indices);this.uploaded=mesh
   }
   gl.uniform1i(gl.getUniformLocation(this.program!,'wire'),0);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0)
  }
  this.attributes(this.grid!);gl.uniform1i(gl.getUniformLocation(this.program!,'wire'),1);gl.drawArrays(gl.LINES,0,38)
  gl.bindVertexArray(null)
  const error=gl.getError();if(error!==gl.NO_ERROR)throw Error('GL_DRAW_ERROR_'+error)
 }
 private clearResources():void {
  const gl=this.gl;gl.deleteBuffer(this.vertices);gl.deleteBuffer(this.indices);gl.deleteBuffer(this.grid);gl.deleteVertexArray(this.vao);gl.deleteProgram(this.program)
  this.vertices=null;this.indices=null;this.grid=null;this.vao=null;this.program=null;this.vertexCapacity=this.indexCapacity=0
 }
 dispose():void {
  if(this.disposed)return;this.disposed=true;this.canvas.removeEventListener('webglcontextlost',this.loss);this.canvas.removeEventListener('webglcontextrestored',this.restore)
  this.clearResources();this.scene=null;this.uploaded=null;this.gl.getExtension('WEBGL_lose_context')?.loseContext()
 }
}
