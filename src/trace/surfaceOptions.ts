export type SurfaceOptions={mode:'2d'|'3d';yaw:number;pitch:number;zoom:number;height:number;detail:64|128|256}
export const defaultSurface:SurfaceOptions={mode:'2d',yaw:-35,pitch:38,zoom:1,height:1,detail:128}
export const surfacePresets={front:{yaw:0,pitch:25},side:{yaw:-80,pitch:30},diagonal:{yaw:-35,pitch:38},top:{yaw:0,pitch:85}} as const
export function validateSurface(v:unknown):SurfaceOptions {
 if(!v||typeof v!=='object'||Array.isArray(v))throw Error('INVALID_SURFACE_OPTIONS')
 const s=v as SurfaceOptions
 if(Object.keys(s).sort().join(',')!=='detail,height,mode,pitch,yaw,zoom'||!['2d','3d'].includes(s.mode)||![64,128,256].includes(s.detail)||
  ![s.yaw,s.pitch,s.zoom,s.height].every(Number.isFinite)||s.yaw< -180||s.yaw>180||s.pitch<10||s.pitch>85||s.zoom<.5||s.zoom>2||s.height<.25||s.height>2.5)throw Error('INVALID_SURFACE_OPTIONS')
 return {...s}
}
