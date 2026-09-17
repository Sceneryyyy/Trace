import {validateTargetSettings} from './targetSettings'
import {validateSpectrogramQuery,validateSpectrogramSettings} from './spectrogramProtocol'
import {validateInstrumentSettings} from './instrumentTypes'
import {validateWorkspace} from './workspace'
import {validateTakeName} from './naming'
import { validateRecordSettings } from './recording'
import {validateExportPreset} from './mediaTypes'
import {validateDisplaySettings,validWindowSeconds,validWaveGain} from './displaySettings'
import type { Command, Request } from './shared'
const commands = new Set<Command>(['app.exportDiagnostics','app.feedback','app.rendererFault','app.reloadUI','support.testFault','reference.set','reference.clear','reference.activate','reference.range','reference.configure','reference.retry','imports.removeExport','imports.choose','imports.refresh','imports.cancel','imports.prepare','imports.relocate','imports.clearCache','imports.remove','imports.rename','imports.openSource','imports.openFolder','imports.openRoot','targets.configure','report.prepare','report.get','report.cancel','report.retry','report.export','report.open','report.jump','preferences.retry','spectrogram.configure','spectrogram.query','spectrogram.point','spectrogram.cancel','test.window','instrument.configure','workspace.configure','cache.save','export.openDeliveryFolder','app.configure','app.diagnostics','app.copyDiagnostics','library.storage','library.clearCache','library.pruneMissing','library.rename','export.configure','export.describe','record.capacity','playback.clearSelection','playback.retryAnalysis','view.inspect','view.live','devices.select','view.gain','live.replay','library.refresh','library.remove','app.info','app.quit','retention.retry','view.settings','export.start','export.retry','export.openFolder','export.saveCopy','file.open','file.close','playback.play','playback.pause','playback.seek','playback.volume','playback.selection','playback.window','playback.follow','state.get', 'devices.list', 'live.start', 'live.stop', 'live.reset', 'view.window', 'record.configure', 'record.chooseDirectory', 'record.start', 'record.stop', 'record.openFolder', 'record.recover', 'analysis.start', 'job.cancel', 'metrics.query', 'timeline.query'])
function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}
export function validateRequest(value: unknown): Request {
  if (!plain(value)) throw Error('INVALID_REQUEST')
  const r = value as Request
  if (r.protocolVersion !== 1 || typeof r.requestId !== 'string' || r.requestId.length < 1 || r.requestId.length > 100 ||
      !Number.isSafeInteger(r.expectedStateRevision) || r.expectedStateRevision < 0 || !commands.has(r.command) ||
      !plain(r.payload)) throw Error('INVALID_REQUEST')
  const keys = Object.keys(r.payload)
  const textId=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=128&&!v.includes('\0')
  const frameId=(v:unknown)=>typeof v==='string'&&/^[0-9]{1,20}$/.test(v)&&BigInt(v)<=0xffffffffffffffffn
  if(r.command==='app.rendererFault'){if(keys.length!==1||keys[0]!=='kind'||!['react','script','promise'].includes(r.payload.kind as string))throw Error('INVALID_RENDERER_FAULT')
  }else if(r.command==='support.testFault'){if(keys.length!==1||keys[0]!=='kind'||!['renderer','main','worker'].includes(r.payload.kind as string))throw Error('INVALID_TEST_FAULT')
  }else if(['reference.clear','reference.retry'].includes(r.command)){if(keys.length)throw Error('INVALID_REFERENCE_REQUEST')
  }else if(r.command==='reference.activate'){if(!['slot','atStart,slot'].includes(keys.sort().join(','))||!['a','b'].includes(r.payload.slot as string)||('atStart' in r.payload&&typeof r.payload.atStart!=='boolean'))throw Error('INVALID_REFERENCE_REQUEST')
  }else if(r.command==='reference.configure'){if(keys.sort().join(',')!=='linked,offsetNs'||typeof r.payload.linked!=='boolean'||typeof r.payload.offsetNs!=='string'||!/^(-?[1-9][0-9]{0,13}|0)$/.test(r.payload.offsetNs)||BigInt(r.payload.offsetNs)<-86400000000000n||BigInt(r.payload.offsetNs)>86400000000000n)throw Error('INVALID_REFERENCE_REQUEST')
  }else if(r.command==='reference.range'){if(keys.sort().join(',')!=='endFrame,slot,startFrame'||!['a','b'].includes(r.payload.slot as string)||!frameId(r.payload.startFrame)||!frameId(r.payload.endFrame)||BigInt(r.payload.startFrame as string)>=BigInt(r.payload.endFrame as string))throw Error('INVALID_REFERENCE_REQUEST')
  }else if(r.command==='reference.set'){if(keys.some(k=>!['takeId','role','regionId','exportId'].includes(k))||!textId(r.payload.takeId)||!['source','deliverable','recovered','session','export'].includes(r.payload.role as string)||('regionId' in r.payload&&!textId(r.payload.regionId))||(r.payload.role==='export'?!textId(r.payload.exportId):'exportId' in r.payload))throw Error('INVALID_REFERENCE_REQUEST')
  }else if(['imports.choose','imports.refresh','imports.openRoot'].includes(r.command)){if(keys.length)throw Error('INVALID_IMPORT_REQUEST')
  }else if(r.command.startsWith('imports.')){
    if(!textId(r.payload.assetId)||keys.sort().join(',')!==(r.command==='imports.prepare'?'acceptChanged,assetId':r.command==='imports.rename'?'assetId,name':r.command==='imports.removeExport'?'assetId,exportId':'assetId'))throw Error('INVALID_IMPORT_REQUEST')
    if(r.command==='imports.prepare'&&typeof r.payload.acceptChanged!=='boolean')throw Error('INVALID_IMPORT_REQUEST')
    if(r.command==='imports.rename')validateTakeName(r.payload.name)
    if(r.command==='imports.removeExport'&&!textId(r.payload.exportId))throw Error('INVALID_IMPORT_REQUEST')
  }else if(r.command==='targets.configure'){
    if(keys.join(',')!=='settings')throw Error('INVALID_TARGET_SETTINGS');validateTargetSettings(r.payload.settings)
  }else if(r.command==='report.prepare'){
    if(keys.sort().join(',')!=='playbackId,scope'||!textId(r.payload.playbackId)||!['whole','selection'].includes(r.payload.scope as string))throw Error('INVALID_REPORT_SCOPE')
  }else if(r.command.startsWith('report.')){
    if(!textId(r.payload.reportId)||keys.sort().join(',')!==(r.command==='report.jump'?'index,reportId':'reportId')||r.command==='report.jump'&&(!Number.isInteger(r.payload.index)||Number(r.payload.index)<0||Number(r.payload.index)>=1000))throw Error('INVALID_REPORT_REQUEST')
  }else if(r.command==='spectrogram.configure'){
    if(keys.join(',')!=='settings')throw Error('INVALID_SPECTROGRAM_SETTINGS');validateSpectrogramSettings(r.payload.settings)
  }else if(r.command==='spectrogram.query'){validateSpectrogramQuery(r.payload)
  }else if(r.command==='spectrogram.cancel'){
    if(keys.join(',')!=='queryId'||!textId(r.payload.queryId))throw Error('INVALID_SPECTROGRAM_QUERY')
  }else if(r.command==='spectrogram.point'){
    if(keys.sort().join(',')!=='frequency,positionFrame,queryId'||!textId(r.payload.queryId)||!frameId(r.payload.positionFrame)||typeof r.payload.frequency!=='number'||!Number.isFinite(r.payload.frequency)||r.payload.frequency<0||r.payload.frequency>48000)throw Error('INVALID_SPECTROGRAM_POINT')
  }else if(r.command==='test.window'){
    if(keys.join(',')!=='mode'||!['show','hide','minimize','restore'].includes(r.payload.mode as string))throw Error('INVALID_TEST_WINDOW')
  }else if(r.command==='instrument.configure'){
    if(keys.join(',')!=='settings')throw Error('INVALID_INSTRUMENT_SETTINGS');validateInstrumentSettings(r.payload.settings)
  }else if(r.command==='workspace.configure'){
    if(keys.join(',')!=='workspace')throw Error('INVALID_WORKSPACE')
    validateWorkspace(r.payload.workspace)
  }else if(r.command==='cache.save'){
    if(keys.sort().join(',')!=='playbackId,useSelection'||!textId(r.payload.playbackId)||typeof r.payload.useSelection!=='boolean')throw Error('INVALID_REPLAY_SAVE')
  }else if(r.command==='app.configure'){
    if(keys.join(',')!=='confirmExitWhileRecording'||typeof r.payload.confirmExitWhileRecording!=='boolean')throw Error('INVALID_APP_SETTINGS')
  }else if(r.command==='library.clearCache'){
    if(keys.length!==1||!textId(r.payload.takeId))throw Error('INVALID_LIBRARY_REQUEST')
  }else if(r.command==='library.rename'){
    if(keys.sort().join(',')!=='name,takeId'||!textId(r.payload.takeId))throw Error('INVALID_LIBRARY_REQUEST')
    validateTakeName(r.payload.name)
  }else if(r.command==='export.configure'){validateExportPreset(r.payload)}else if(r.command==='view.inspect'){
     if(keys.some(k=>!['sourceKind','sourceId','epochId','measurementEpoch','positionFrame','startFrame','endFrame','selectionEndFrame'].includes(k))||
       !['live','take'].includes(r.payload.sourceKind as string)||typeof r.payload.sourceId!=='string'||!r.payload.sourceId||r.payload.sourceId.length>1024||
       !frameId(r.payload.epochId)||!frameId(r.payload.measurementEpoch)||!frameId(r.payload.positionFrame)||!frameId(r.payload.startFrame)||!frameId(r.payload.endFrame)||
       BigInt(r.payload.endFrame as string)<=BigInt(r.payload.startFrame as string)||('selectionEndFrame' in r.payload&&!frameId(r.payload.selectionEndFrame)))throw Error('INVALID_INSPECTION')
   }else if(r.command==='view.gain'){if(keys.length!==1||keys[0]!=='gain'||!validWaveGain(r.payload.gain))throw Error('INVALID_DISPLAY_SETTINGS')}else if(r.command==='library.remove'){if(keys.some(k=>!['takeId','exportId'].includes(k))||!textId(r.payload.takeId)||('exportId' in r.payload&&!textId(r.payload.exportId)))throw Error('INVALID_LIBRARY_REQUEST')}else if(r.command==='retention.retry'){if(keys.length!==1||keys[0]!=='takeId'||!textId(r.payload.takeId))throw Error('INVALID_TAKE_ID')}else if(r.command==='view.settings'){validateDisplaySettings(r.payload)}else if(r.command==='analysis.start'||r.command==='file.open'||r.command==='export.start'||r.command==='export.describe'){
    const allowed=['takeId','role','regionId','exportId',...(r.command==='export.start'?['preset','range','saveCopy']:[])]
    if(keys.some(k=>!allowed.includes(k))||!textId(r.payload.takeId)||!['source','deliverable','recovered','session','export'].includes(r.payload.role as string)||
      ('regionId' in r.payload&&(!textId(r.payload.regionId)||!['source','recovered'].includes(r.payload.role as string)))||
      (r.payload.role==='export'?(!textId(r.payload.exportId)||'regionId' in r.payload):'exportId' in r.payload))throw Error('INVALID_ANALYSIS_SOURCE')
    if(r.command==='export.start'){
      validateExportPreset(r.payload.preset)
      if('saveCopy' in r.payload&&typeof r.payload.saveCopy!=='boolean')throw Error('INVALID_EXPORT_DELIVERY')
      if(r.payload.range!==undefined){
        if(!plain(r.payload.range)||Object.keys(r.payload.range).sort().join(',')!=='endFrame,startFrame'||!frameId(r.payload.range.startFrame)||!frameId(r.payload.range.endFrame)||BigInt(r.payload.range.endFrame as string)<=BigInt(r.payload.range.startFrame as string))throw Error('INVALID_EXPORT_RANGE')
      }
    }
  }else if(r.command==='export.retry'||r.command==='export.openFolder'||r.command==='export.saveCopy'||r.command==='export.openDeliveryFolder'){
    if(keys.length!==1||keys[0]!=='exportId'||!textId(r.payload.exportId))throw Error('INVALID_EXPORT_ID')
  }else if(r.command.startsWith('playback.')){
    if(!textId(r.payload.playbackId))throw Error('INVALID_PLAYBACK_ID')
    const sorted=keys.sort().join(',')
    if(['playback.play','playback.pause','playback.clearSelection','playback.retryAnalysis'].includes(r.command)){
      if(sorted!=='playbackId')throw Error('INVALID_PLAYBACK_PAYLOAD')
    }else if(r.command==='playback.seek'){
      if(sorted!=='playbackId,positionFrame,resume'||!frameId(r.payload.positionFrame)||typeof r.payload.resume!=='boolean')throw Error('INVALID_PLAYBACK_SEEK')
    }else if(r.command==='playback.follow'){
      if(sorted!=='enabled,playbackId'||typeof r.payload.enabled!=='boolean')throw Error('INVALID_PLAYBACK_FOLLOW')
    }else if(r.command==='playback.volume'){
      if(sorted!=='gain,playbackId'||typeof r.payload.gain!=='number'||!Number.isFinite(r.payload.gain)||r.payload.gain<0||r.payload.gain>1)throw Error('INVALID_PLAYBACK_GAIN')
    }else{
      const selection=r.command==='playback.selection'
      if(sorted!==(selection?'endFrame,loop,playbackId,startFrame':'endFrame,pixelWidth,playbackId,startFrame')||
        !frameId(r.payload.startFrame)||!frameId(r.payload.endFrame)||BigInt(r.payload.endFrame as string)<=BigInt(r.payload.startFrame as string)||
        (selection?typeof r.payload.loop!=='boolean':(!Number.isInteger(r.payload.pixelWidth)||(r.payload.pixelWidth as number)<1||(r.payload.pixelWidth as number)>2400)))throw Error('INVALID_PLAYBACK_RANGE')
    }
  }else if(r.command==='job.cancel'){
    if(keys.length!==1||keys[0]!=='jobId'||!textId(r.payload.jobId))throw Error('INVALID_JOB_ID')
  }else if(r.command==='metrics.query'||r.command==='timeline.query'){
    if(!textId(r.payload.analysisId)||!Number.isSafeInteger(r.payload.requestGeneration)||(r.payload.requestGeneration as number)<0)throw Error('INVALID_QUERY_ID')
    if(r.command==='metrics.query'){
      if(keys.sort().join(',')!=='analysisId,positionFrame,requestGeneration'||!frameId(r.payload.positionFrame))throw Error('INVALID_FILE_POSITION')
    }else if(keys.sort().join(',')!=='analysisId,endFrame,pixelWidth,requestGeneration,startFrame'||!frameId(r.payload.startFrame)||!frameId(r.payload.endFrame)||
      BigInt(r.payload.endFrame as string)<BigInt(r.payload.startFrame as string)||!Number.isInteger(r.payload.pixelWidth)||(r.payload.pixelWidth as number)<1||(r.payload.pixelWidth as number)>2400)throw Error('INVALID_TIMELINE_RANGE')
  }
  else if (r.command === 'record.configure') { validateRecordSettings(r.payload) }
  else if ((r.command === 'record.openFolder' || r.command === 'record.recover')) { if (keys.length !== 1 || keys[0] !== 'takeId' || typeof r.payload.takeId !== 'string' || r.payload.takeId.length > 128) throw Error('INVALID_TAKE_ID') }
  else if ((r.command === 'live.start'||r.command === 'devices.select')) {
    if (keys.length !== 1 || keys[0] !== 'deviceId' || typeof r.payload.deviceId !== 'string' || !r.payload.deviceId || r.payload.deviceId.includes('\0') || r.payload.deviceId.length > 1024) throw Error('INVALID_DEVICE_ID')
  } else if (r.command === 'view.window') {
    if (keys.length !== 1 || keys[0] !== 'seconds' || !validWindowSeconds(r.payload.seconds)) throw Error('INVALID_WINDOW')
  } else if (keys.length) throw Error('INVALID_PAYLOAD')
  return r
}
export function isMutation(command: Command): boolean { return !['app.rendererFault','app.exportDiagnostics','app.feedback','app.reloadUI','imports.cancel','imports.refresh','report.get','report.cancel','spectrogram.query','spectrogram.point','spectrogram.cancel','app.info','app.diagnostics','library.storage','export.describe','state.get', 'devices.list', 'metrics.query', 'timeline.query'].includes(command) }
