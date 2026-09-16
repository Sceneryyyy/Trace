export type DisplaySettings={targetEnabled:boolean;targetLufs:number;waveGain:number}
export const displaySettingsVersion=2
export const defaultDisplaySettings:DisplaySettings={targetEnabled:false,targetLufs:-23,waveGain:4}
export function validWindowSeconds(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=5&&value<=60}
export function validWaveGain(value:unknown):value is number{return typeof value==='number'&&Number.isFinite(value)&&value>=1&&value<=4}
export function validateDisplaySettings(value:unknown):DisplaySettings{
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('INVALID_DISPLAY_SETTINGS')
 const v=value as DisplaySettings
 if(Object.keys(v).sort().join(',')!=='targetEnabled,targetLufs,waveGain'||typeof v.targetEnabled!=='boolean'||!Number.isFinite(v.targetLufs)||v.targetLufs<-60||v.targetLufs>0||!validWaveGain(v.waveGain))throw Error('INVALID_DISPLAY_SETTINGS')
 return {targetEnabled:v.targetEnabled,targetLufs:v.targetLufs,waveGain:v.waveGain}
}
export function restoreDisplaySettings(value:unknown):DisplaySettings{
 if(value&&typeof value==='object'&&!Array.isArray(value)&&(value as DisplaySettings).waveGain===16)return validateDisplaySettings({...value,waveGain:4})
 return validateDisplaySettings(value)
}
