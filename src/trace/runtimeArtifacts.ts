import {join} from 'node:path'

export type RuntimeArtifacts={
 nativePath:string
 ffmpeg:string
 ffprobe:string
 encoderLockPath:string
 platformBuild:'win32-x64'|'darwin-arm64'
}

export function runtimeArtifacts(platform:string,arch:string,packaged:boolean,root:string,resourcesPath:string):RuntimeArtifacts{
 const platformBuild=platform==='win32'&&arch==='x64'?'win32-x64':
  platform==='darwin'&&arch==='arm64'?'darwin-arm64':null
 if(!platformBuild)throw Error('UNSUPPORTED_TRACE_PLATFORM: '+platform+'-'+arch)
 const windows=platformBuild==='win32-x64'
 const ffmpegRoot=packaged?join(resourcesPath,'ffmpeg'):
  windows?join(root,'.tools','ffmpeg','bin'):join(root,'.tools','ffmpeg-macos-arm64','bin')
 return {
  nativePath:packaged?join(resourcesPath,'native','trace_engine.node'):
   windows?join(root,'build','trace-engine','Release','trace_engine.node'):join(root,'build','trace-engine','trace_engine.node'),
  ffmpeg:join(ffmpegRoot,windows?'ffmpeg.exe':'ffmpeg'),
  ffprobe:join(ffmpegRoot,windows?'ffprobe.exe':'ffprobe'),
  encoderLockPath:packaged?join(resourcesPath,'ffmpeg.lock.json'):
   join(root,windows?'ffmpeg.lock.json':'ffmpeg.macos-arm64.lock.json'),
  platformBuild,
 }
}

export function encoderLockHashes(value:unknown,expectedPlatform:RuntimeArtifacts['platformBuild']):{ffmpegSha256:string;ffprobeSha256:string}{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('ENCODER_BUILD_CHANGED')
 const lock=value as Record<string,unknown>
 if(lock.platform!==expectedPlatform||typeof lock.ffmpegSha256!=='string'||typeof lock.ffprobeSha256!=='string'||
  !/^[0-9a-f]{64}$/.test(lock.ffmpegSha256)||!/^[0-9a-f]{64}$/.test(lock.ffprobeSha256))throw Error('ENCODER_BUILD_CHANGED')
 return {ffmpegSha256:lock.ffmpegSha256,ffprobeSha256:lock.ffprobeSha256}
}
