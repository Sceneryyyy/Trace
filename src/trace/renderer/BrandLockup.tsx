import mark from '../../../resources/trace/branding/leomoon-trace-v1.png'
export function BrandLockup(){
 return <div className="brand" aria-label="LeoMoon · Trace 声迹">
  <img className="brand-mark" src={mark} width="36" height="36" alt="" draggable={false}/>
  <div className="brand-type"><span className="series-name">LeoMoon</span><span className="product-name">TRACE</span></div>
  <small>Audio Recorder &amp; Analyzer</small>
 </div>
}
