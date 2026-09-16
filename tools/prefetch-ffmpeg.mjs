import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const lock = JSON.parse(readFileSync(join(root, 'ffmpeg.lock.json'), 'utf8'))
const folder = join(root, '.tools/ffmpeg')
mkdirSync(folder, { recursive: true })
const archive = join(folder, 'ffmpeg-' + lock.version + '-essentials.zip')
async function hashFile(file) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}
if (existsSync(archive)) {
  if (await hashFile(archive) !== lock.archiveSha256) throw Error('Existing FFmpeg cache does not match the lock')
  console.log('FFMPEG_ARCHIVE_ALREADY_VERIFIED')
} else {
  const response = await fetch(lock.archiveUrl, { signal: AbortSignal.timeout(240000) })
  if (!response.ok || !response.body) throw Error('FFmpeg download failed: ' + response.status)
  const hash = createHash('sha256')
  let bytes = 0, reported = 0
  const tap = new Transform({ transform(chunk, _encoding, callback) {
    bytes += chunk.length
    hash.update(chunk)
    if (bytes - reported > 16 * 1024 * 1024) { reported = bytes; console.log('FFMPEG_DOWNLOAD_MB', Math.round(bytes / 1024 / 1024)) }
    callback(null, chunk)
  } })
  const partial = archive + '.partial'
  await pipeline(Readable.fromWeb(response.body), tap, createWriteStream(partial))
  const digest = hash.digest('hex')
  if (digest !== lock.archiveSha256 || bytes !== lock.archiveBytes) throw Error('FFmpeg archive integrity mismatch')
  renameSync(partial, archive)
  console.log('FFMPEG_ARCHIVE_VERIFIED', digest, bytes)
}

if(process.platform!=='win32'||process.arch!=='x64')throw Error('FFmpeg lock supports Windows x64 only')
const executables=[['bin/ffmpeg.exe',lock.ffmpegSha256],['bin/ffprobe.exe',lock.ffprobeSha256]]
let verified=existsSync(join(folder,'LICENSE'))&&existsSync(join(folder,'README.txt'))
for(const [relative,hash]of executables)verified=verified&&existsSync(join(folder,relative))&&await hashFile(join(folder,relative))===hash
if(!verified){
 const {spawnSync}=await import('node:child_process')
 const staging=join(folder,'stage-'+process.pid+'-'+Date.now())
 mkdirSync(staging,{recursive:true})
 const unpack=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',join(root,'tools/extract-ffmpeg.ps1'),
  '-ArchivePath',archive,'-OutputDirectory',staging],{windowsHide:true,stdio:'inherit'})
 if(unpack.error||unpack.status!==0)throw unpack.error||Error('FFmpeg extraction failed: '+unpack.status)
 for(const [relative,hash]of executables)if(await hashFile(join(staging,relative))!==hash)throw Error('FFmpeg binary integrity mismatch: '+relative)
 mkdirSync(join(folder,'bin'),{recursive:true})
 const {copyFile}=await import('node:fs/promises')
 for(const relative of [...executables.map(([file])=>file),'LICENSE','README.txt'])await copyFile(join(staging,relative),join(folder,relative))
}
console.log('FFMPEG_RUNTIME_VERIFIED',lock.version,'ffmpeg + ffprobe; no ffplay or installer')
