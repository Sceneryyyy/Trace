import {toNamespacedPath} from 'node:path'
/** Extend Windows paths only at native I/O boundaries; keep stored/cache identities unchanged. */
export function nativeFilePath(path:string):string{return toNamespacedPath(path)}
