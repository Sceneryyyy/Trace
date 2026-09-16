import {validateExportPreset} from './mediaTypes'
import type {ExportPreset} from './mediaTypes'
import type {AssetFormat} from './assetFormat'
export const exportPreferencesVersion=1
export function initialExportPreset(saved?:ExportPreset,source?:AssetFormat):ExportPreset{
 if(saved)return validateExportPreset(saved)
 const sampleRate=[44100,48000,88200,96000].includes(source?.sampleRate||0)?source!.sampleRate as 44100|48000|88200|96000:48000
 return {format:'wav',sampleRate,encoding:source?.format==='wav'&&source.encoding?source.encoding:'pcm24'}
}
