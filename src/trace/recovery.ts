import { createReadStream } from 'node:fs'
import { readdir, realpath } from 'node:fs/promises'
import { createInterface } from 'node:readline'
import { join, sep, basename } from 'node:path'

const u64 = (v: unknown): v is string => typeof v === 'string' && /^\d{1,20}$/.test(v) && BigInt(v) <= 0xffffffffffffffffn
export type RecoveryInventory = {
  files: string[]
  confirmedFrames: string | null
  checkpointSegments: Array<{ file: string; frames: string }>
  captureStartFrame:string|null
  clock:{startQpc100ns:string|null;endQpc100ns:string|null;startEstimated:boolean;endEstimated:boolean}|null
  ignoredJournalLines: number
}
export async function inspectRecovery(directory: string, name: string, journalFile='journal.jsonl'): Promise<RecoveryInventory> {
  if(basename(journalFile)!==journalFile||!journalFile.endsWith('.jsonl'))throw Error('INVALID_JOURNAL_PATH')
  const base = await realpath(directory), audio = await realpath(join(base, 'audio'))
  if (!audio.toLowerCase().startsWith((base + sep).toLowerCase())) throw Error('INVALID_AUDIO_DIRECTORY')
  const prefix = name + '-'
  const candidates = (await readdir(audio, { withFileTypes: true })).filter(entry =>
    entry.name.startsWith(prefix) && /^\d+\.wav$/.test(entry.name.slice(prefix.length)))
  const entries = candidates.map(entry => ({ entry, index: Number(entry.name.slice(prefix.length, -4)) })).sort((a,b) => a.index-b.index)
  if (!entries.length) throw Error('RECOVERY_AUDIO_MISSING')
  if (entries.length > 10000) throw Error('RECOVERY_TOO_MANY_SEGMENTS')
  const files: string[] = []
  for (let i=0;i<entries.length;i++) {
    const { entry, index }=entries[i]
    if (index !== i+1) throw Error('RECOVERY_SEGMENT_MISSING: ' + prefix + (i+1) + '.wav')
    if (!entry.isFile() || entry.isSymbolicLink()) throw Error('RECOVERY_INVALID_SEGMENT: ' + entry.name)
    const source=await realpath(join(audio,entry.name))
    if (!source.toLowerCase().startsWith((audio+sep).toLowerCase())) throw Error('RECOVERY_INVALID_SEGMENT: ' + entry.name)
    files.push(entry.name)
  }
  const result: RecoveryInventory = { files, confirmedFrames:null, checkpointSegments:[], captureStartFrame:null,clock:null,ignoredJournalLines:0 }
  const stream = createReadStream(join(base,journalFile), { encoding:'utf8' })
  const lines = createInterface({ input:stream, crlfDelay:Infinity })
  try {
    for await (const line of lines) {
      if (!line.trim()) continue
      try {
        if(line.length>1000000)throw Error('OVERSIZE_JOURNAL_LINE')
        const event=JSON.parse(line)
        if(event.event==='begin'&&u64(event.captureStartFrame))result.captureStartFrame=event.captureStartFrame
        if(event.event==='checkpoint') {
          if(!u64(event.frames)||!Array.isArray(event.segments)||event.segments.length>10000)throw Error('INVALID_CHECKPOINT')
          let total=0n
          for(let i=0;i<event.segments.length;i++){
            const segment=event.segments[i]
            if(segment.file!==prefix+(i+1)+'.wav'||!u64(segment.frames))throw Error('INVALID_CHECKPOINT_SEGMENT')
            total+=BigInt(segment.frames)
          }
          if(total!==BigInt(event.frames))throw Error('CHECKPOINT_FRAME_MISMATCH')
          result.confirmedFrames=event.frames
          result.checkpointSegments=event.segments
        } else if(event.event==='close'&&u64(event.frames)) result.confirmedFrames=event.frames
        if(['checkpoint','close'].includes(event.event)&&(event.startQpc100ns===null||u64(event.startQpc100ns))&&(event.endQpc100ns===null||u64(event.endQpc100ns))){
          result.clock={startQpc100ns:event.startQpc100ns,endQpc100ns:event.endQpc100ns,startEstimated:event.startQpcEstimated===true,endEstimated:event.endQpcEstimated===true}
        }
      } catch { result.ignoredJournalLines++ }
    }
  } catch(error) {
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error
  } finally { lines.close();stream.destroy() }
  for(const segment of result.checkpointSegments)if(!files.includes(segment.file))throw Error('RECOVERY_SEGMENT_MISSING: '+segment.file)
  return result
}
