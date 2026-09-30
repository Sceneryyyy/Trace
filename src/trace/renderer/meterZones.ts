// Display-only level zones for the peak meter (docs/71 §3.3, D2). These thresholds never enter metering.
export const METER_FLOOR_DB=-60
export const METER_NEAR_DB=-6
export const METER_OVER_DB=-1
/** Hold time of the OVER marker after the sample peak last entered the over zone. */
export const OVER_HOLD_MS=2000
/** Position of a dBFS value on the linear −60…0 dB meter scale, 0 (bottom) to 1 (top). */
export function meterFraction(db:number):number{return Math.max(0,Math.min(1,(db-METER_FLOOR_DB)/-METER_FLOOR_DB))}
export type MeterZone='safe'|'near'|'over'
export function meterZone(db:number|null|undefined):MeterZone|null{
 if(typeof db!=='number'||!Number.isFinite(db))return null
 return db>=METER_OVER_DB?'over':db>=METER_NEAR_DB?'near':'safe'
}
