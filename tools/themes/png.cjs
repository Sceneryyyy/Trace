// Minimal PNG decoder/comparator for Trace UI screenshots (8-bit RGB/RGBA, non-interlaced).
const fs=require('fs'),zlib=require('zlib')
function decode(buffer){
 if(buffer.readUInt32BE(0)!==0x89504e47)throw Error('NOT_PNG')
 let offset=8,width=0,height=0,type=0,depth=0,interlace=0;const chunks=[]
 while(offset<buffer.length){const length=buffer.readUInt32BE(offset),name=buffer.toString('ascii',offset+4,offset+8),data=buffer.subarray(offset+8,offset+8+length);offset+=12+length
  if(name==='IHDR'){width=data.readUInt32BE(0);height=data.readUInt32BE(4);depth=data[8];type=data[9];interlace=data[12]}else if(name==='IDAT')chunks.push(data);else if(name==='IEND')break}
 if(depth!==8||![2,6].includes(type)||interlace)throw Error('UNSUPPORTED_PNG '+depth+'/'+type+'/'+interlace)
 const channels=type===6?4:3,stride=width*channels,raw=zlib.inflateSync(Buffer.concat(chunks)),out=Buffer.alloc(width*height*4)
 let previous=Buffer.alloc(stride)
 for(let y=0;y<height;y++){const filter=raw[y*(stride+1)],line=Buffer.from(raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)))
  for(let x=0;x<stride;x++){const a=x>=channels?line[x-channels]:0,b=previous[x],c=x>=channels?previous[x-channels]:0
   if(filter===1)line[x]=line[x]+a&255;else if(filter===2)line[x]=line[x]+b&255;else if(filter===3)line[x]=line[x]+(a+b>>1)&255
   else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);line[x]=line[x]+(pa<=pb&&pa<=pc?a:pb<=pc?b:c)&255}}
  for(let x=0;x<width;x++)for(let k=0;k<4;k++)out[(y*width+x)*4+k]=k<channels?line[x*channels+k]:255
  previous=line}
 return {width,height,data:out}
}
/** Pixels whose max channel difference exceeds `tolerance` count as changed. */
function compare(fileA,fileB,tolerance=0){
 const a=decode(fs.readFileSync(fileA)),b=decode(fs.readFileSync(fileB))
 if(a.width!==b.width||a.height!==b.height)return {sizeMismatch:true,a:[a.width,a.height],b:[b.width,b.height]}
 let changed=0,maxDelta=0,box=null
 for(let i=0,p=0;i<a.data.length;i+=4,p++){const d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));if(d>maxDelta)maxDelta=d
  if(d>tolerance){changed++;const x=p%a.width,y=Math.floor(p/a.width);box=box?[Math.min(box[0],x),Math.min(box[1],y),Math.max(box[2],x),Math.max(box[3],y)]:[x,y,x,y]}}
 return {changed,total:a.width*a.height,maxDelta,box}
}
/** Distinct opaque colours in an RGB box, used to detect leftover default-theme greens. */
function colours(file){const img=decode(fs.readFileSync(file)),seen=new Map();for(let i=0;i<img.data.length;i+=4){const key=(img.data[i]<<16|img.data[i+1]<<8|img.data[i+2]);seen.set(key,(seen.get(key)||0)+1)}return {img,seen}}
module.exports={decode,compare,colours}
