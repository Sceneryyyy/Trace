import {statfs} from 'node:fs/promises'
export {recordingCapacity} from './capacityModel'
export type {RecordingCapacity} from './capacityModel'
export async function freeSpace(directory:string):Promise<bigint|null>{
 if(!directory)return null
 try{const info=await statfs(directory,{bigint:true});return info.bavail*info.bsize}catch{return null}
}