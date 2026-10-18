export function SectionTabs<T extends string>({tabs,value,change,label,prefix}:{tabs:readonly {id:T;label:string}[];value:T;change:(id:T)=>void;label:string;prefix:string}){
 return <nav className="section-tabs" role="tablist" aria-label={label} onKeyDown={e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return
  e.preventDefault();e.stopPropagation()
  const index=tabs.findIndex(tab=>tab.id===value),next=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(index+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length]
  change(next.id);e.currentTarget.querySelector<HTMLButtonElement>('[data-section="'+next.id+'"]')?.focus()
 }}>
  {tabs.map(tab=><button type="button" role="tab" key={tab.id} id={prefix+'tab-'+tab.id} aria-controls={prefix+tab.id} aria-selected={value===tab.id} tabIndex={value===tab.id?0:-1} data-section={tab.id} onClick={()=>change(tab.id)}>{tab.label}</button>)}
 </nav>
}
