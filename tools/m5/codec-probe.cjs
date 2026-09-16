const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process')
const root=path.resolve(__dirname,'../..'),folder=path.join(root,'artifacts/m5','codec-probe-'+Date.now());fs.mkdirSync(folder,{recursive:true})
const ffmpeg=path.join(root,'.tools/ffmpeg/bin/ffmpeg.exe'),ffprobe=path.join(root,'.tools/ffmpeg/bin/ffprobe.exe')
function run(program,args){const r=spawnSync(program,args,{encoding:'utf8',windowsHide:true,timeout:30000});if(r.error||r.status!==0)throw r.error||Error(r.stderr);return r.stdout}
function wave(file,rate){
 const frames=rate+137,out=Buffer.alloc(58+frames*4);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(18,16);out.writeUInt16LE(3,20);out.writeUInt16LE(1,22);out.writeUInt32LE(rate,24);out.writeUInt32LE(rate*4,28);out.writeUInt16LE(4,32);out.writeUInt16LE(32,34);out.write('fact',38);out.writeUInt32LE(4,42);out.writeUInt32LE(frames,46);out.write('data',50);out.writeUInt32LE(frames*4,54)
 for(let i=0;i<frames;i++){const t=i/rate;out.writeFloatLE(.1*Math.sin(2*Math.PI*(300*t+1700*t*t)),58+i*4)}fs.writeFileSync(file,out);return frames
}
const results=[]
for(const rate of [44100,48000]){
 const source=path.join(folder,'source-'+rate+'.wav'),frames=wave(source,rate)
 for(const format of ['mp3','m4a','aac']){
  const file=path.join(folder,'output-'+rate+'.'+format),decoded=path.join(folder,'decoded-'+rate+'-'+format+'.wav'),args=['-nostdin','-hide_banner','-loglevel','error','-n','-i',source,'-c:a',format==='mp3'?'libmp3lame':'aac','-b:a','192k']
  if(format!=='mp3')args.push('-profile:a','aac_low')
  args.push(file);run(ffmpeg,args);run(ffmpeg,['-nostdin','-hide_banner','-loglevel','error','-n','-i',file,'-c:a','pcm_f32le',decoded])
  const encoded=JSON.parse(run(ffprobe,['-v','error','-show_streams','-show_packets','-of','json',file]))
  const pcm=JSON.parse(run(ffprobe,['-v','error','-show_entries','stream=sample_rate,channels,duration_ts,time_base','-of','json',decoded]))
  const result={rate,format,sourceFrames:frames,decoded:pcm.streams[0],stream:encoded.streams[0],first:encoded.packets[0],last:encoded.packets.at(-1)};results.push(result);console.log(JSON.stringify(result))
 }
}
fs.writeFileSync(path.join(folder,'report.json'),JSON.stringify({folder,results},null,2));fs.writeFileSync(path.join(root,'artifacts/m5/codec-probe-latest.json'),JSON.stringify({folder,results},null,2))
