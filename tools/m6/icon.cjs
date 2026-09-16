const {app,BrowserWindow,nativeImage}=require('electron'),fs=require('fs'),path=require('path')
const root=path.resolve(__dirname,'../..')
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:256,height:256,show:false,frame:false,transparent:true,webPreferences:{offscreen:true}})
 const svg=fs.readFileSync(path.join(root,'resources/trace/icon.svg'),'utf8')
 await win.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent('<html><body style="margin:0;background:transparent;width:256px;height:256px">'+svg+'</body></html>'))
 const encoded=await win.webContents.executeJavaScript('('+String(async function(svg){const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);await image.decode();const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;canvas.getContext('2d').drawImage(image,0,0,256,256);return canvas.toDataURL('image/png')})+')('+JSON.stringify(svg)+')');
 const png=Buffer.from(encoded.split(',')[1],'base64');if(png.length<100||png.readUInt32BE(16)!==256||png.readUInt32BE(20)!==256)throw Error('Invalid icon render');fs.writeFileSync(path.join(root,'resources/trace/icon.png'),png)
 const source=nativeImage.createFromBuffer(png),sizes=[16,32,48,64,128,256],images=sizes.map(size=>source.resize({width:size,height:size,quality:'best'}).toPNG())
 const header=Buffer.alloc(6+images.length*16);header.writeUInt16LE(1,2);header.writeUInt16LE(images.length,4);let offset=header.length
 images.forEach((bytes,i)=>{const at=6+i*16;header[at]=sizes[i]===256?0:sizes[i];header[at+1]=header[at];header.writeUInt16LE(1,at+4);header.writeUInt16LE(32,at+6);header.writeUInt32LE(bytes.length,at+8);header.writeUInt32LE(offset,at+12);offset+=bytes.length})
 fs.writeFileSync(path.join(root,'resources/trace/icon.ico'),Buffer.concat([header,...images]));console.log('TRACE_ICON_READY');app.quit()
}).catch(error=>{console.error(error);app.exit(1)})
