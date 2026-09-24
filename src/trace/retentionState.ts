import type {SessionDocument} from './sessionStore'

/** A persisted delete intent is not proof that its source files were deleted. */
export function restoreInterruptedRetention(document:SessionDocument):boolean {
 const pending=document.assets.filter(asset=>asset.state==='removing')
 if(!pending.length)return false
 for(const asset of pending)delete asset.state
 document.retention={phase:'error',error:'RETENTION_INTERRUPTED_REVIEW_SOURCE'}
 return true
}
