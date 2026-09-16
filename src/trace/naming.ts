export function localRecordingName(prefix:string,at=new Date()):string{
 const pad=(value:number)=>String(value).padStart(2,'0')
 return prefix+'-'+at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate())+'_'+pad(at.getHours())+'-'+pad(at.getMinutes())+'-'+pad(at.getSeconds())
}
export function validateTakeName(value:unknown):string{
 if(typeof value!=='string')throw Error('INVALID_TAKE_NAME')
 const name=value.trim()
 if(!name||name.length>120||/[<>:"/\\|?*\x00-\x1f]/.test(name)||/[. ]$/.test(name)||/^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name))throw Error('INVALID_TAKE_NAME')
 return name
}
