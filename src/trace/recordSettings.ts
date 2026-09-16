import {validateExportPreset} from './mediaTypes'
import type {WavEncoding} from './mediaTypes'
import type {RecordSettings,WavRecordSettings} from './shared'
export const recordSettingsVersion=3
export const defaultRecordSettings:RecordSettings={encoding:'pcm24',sampleRate:'source',namePrefix:'Trace'}
export function validateRecordSettings(value:unknown):RecordSettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_RECORD_SETTINGS')
 const v=value as Record<string,unknown>
 if(typeof v.namePrefix!=='string'||!/^[\p{L}\p{N} _-]{1,48}$/u.test(v.namePrefix))throw Error('INVALID_RECORD_SETTINGS')
 if(v.keepOriginal!==undefined&&typeof v.keepOriginal!=='boolean')throw Error('INVALID_RECORD_SETTINGS')
 const keep=v.keepOriginal===undefined?{}:{keepOriginal:v.keepOriginal as boolean}
 const keys=Object.keys(v).filter(k=>k!=='keepOriginal').sort().join(',')
 const namePrefix=v.namePrefix.trim()||'Trace'
 if(v.format===undefined||v.format==='wav'){
  if(!['encoding,namePrefix,sampleRate','encoding,format,namePrefix,sampleRate'].includes(keys)||
   !['pcm16','pcm24','float32'].includes(v.encoding as string)||!['source',44100,48000,88200,96000].includes(v.sampleRate as string|number))throw Error('INVALID_RECORD_SETTINGS')
  return {encoding:v.encoding as WavEncoding,sampleRate:v.sampleRate as WavRecordSettings['sampleRate'],namePrefix,...keep}
 }
 const {namePrefix:ignored,keepOriginal:ignoredKeep,...raw}=v;void ignored;void ignoredKeep
 const preset=validateExportPreset(raw)
 if(preset.format==='wav')throw Error('INVALID_RECORD_SETTINGS')
 return {...preset,namePrefix,...keep}
}
export function recordingEncoding(preset:RecordSettings,sourceRate:number):WavEncoding{
 if(preset.format)return 'float32'
 return preset.sampleRate!=='source'&&preset.sampleRate!==sourceRate?'float32':preset.encoding
}
export function recordingLabel(preset?:RecordSettings):string{
 if(!preset)return 'WAV · 24-bit'
 if(preset.format==='mp3')return 'MP3 · '+preset.bitrate+' kbps'
 if(preset.format==='aac')return 'AAC '+preset.container.toUpperCase()+' · '+preset.bitrate+' kbps'
 return 'WAV · '+(preset.encoding==='float32'?'32f':preset.encoding==='pcm16'?'16-bit':'24-bit')
}

export function sessionWavePreset(preset:RecordSettings):WavRecordSettings{return preset.format?{encoding:"float32",sampleRate:preset.sampleRate,namePrefix:preset.namePrefix}:preset as WavRecordSettings}
