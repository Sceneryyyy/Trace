import {useEffect,useId,useRef,useState} from 'react'
import {createPortal} from 'react-dom'

export type MenuAction={label:string;disabled?:boolean;danger?:boolean;attributes?:Record<string,string>;onSelect:()=>void}

/** One keyboard-accessible action surface, outside clipped instrument/side panels. */
export function ActionMenu({label,items,className='',text='⋯'}:{label:string;items:MenuAction[];className?:string;text?:string}){
 const [point,setPoint]=useState<{left:number;top:number}|null>(null)
 const trigger=useRef<HTMLButtonElement>(null),menu=useRef<HTMLDivElement>(null),id=useId()
 const close=(restore=false)=>{setPoint(null);if(restore&&trigger.current?.isConnected)trigger.current.focus()}
 useEffect(()=>{
  if(!point)return
  const el=menu.current
  if(el){const rect=el.getBoundingClientRect();el.style.top=Math.max(4,Math.min(point.top,innerHeight-rect.height-4))+'px';el.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()}
  const outside=(e:PointerEvent)=>{if(!menu.current?.contains(e.target as Node)&&!trigger.current?.contains(e.target as Node))close()}
  const dismiss=()=>close(true)
  document.addEventListener('pointerdown',outside);window.addEventListener('resize',dismiss);window.addEventListener('blur',dismiss)
  return()=>{document.removeEventListener('pointerdown',outside);window.removeEventListener('resize',dismiss);window.removeEventListener('blur',dismiss)}
 },[point])
 const open=()=>{const rect=trigger.current!.getBoundingClientRect();setPoint({left:Math.max(4,Math.min(rect.right-210,innerWidth-214)),top:rect.bottom+4})}
 return <><button type="button" ref={trigger} className={'action-menu-trigger '+className} aria-label={label} aria-haspopup="menu" aria-controls={point?id:undefined} aria-expanded={Boolean(point)} onClick={()=>point?close(true):open()} onKeyDown={e=>{e.stopPropagation();if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();open()}}}>{text}</button>
 {point&&createPortal(<div id={id} ref={menu} className="action-menu" role="menu" aria-label={label} style={point} onKeyDown={e=>{
  e.stopPropagation()
  if(e.key==='Escape'){e.preventDefault();close(true)}
  if(e.key==='Tab'){close(true)}
  if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const buttons=Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')),index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus()}
 }}>
  {items.map((item,index)=><button key={index} type="button" role="menuitem" className={item.danger?'danger-action':undefined} disabled={item.disabled} {...item.attributes} onClick={()=>{close(true);item.onSelect()}}>{item.label}</button>)}
 </div>,document.body)}</>
}
