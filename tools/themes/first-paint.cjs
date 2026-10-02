const assert=require('node:assert/strict')
exports.assertThemeBeforeFirstPaint=({mark,paint})=>{
 assert(Number.isFinite(mark)&&mark>=0,'THEME_MARK_UNAVAILABLE')
 assert(Number.isFinite(paint)&&paint>=0,'FIRST_PAINT_UNAVAILABLE')
 assert(mark<paint,'THEME_APPLIED_AFTER_FIRST_PAINT')
}
