/** Resize backing storage only when geometry changes; clear pixels without reallocating. */
export function canvasSurface(canvas:HTMLCanvasElement):{rect:DOMRect;context:CanvasRenderingContext2D}|null{
 const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1,width=Math.round(rect.width*ratio),height=Math.round(rect.height*ratio)
 if(canvas.width!==width)canvas.width=width
 if(canvas.height!==height)canvas.height=height
 const context=canvas.getContext('2d');if(!context)return null
 context.setTransform(ratio,0,0,ratio,0,0);context.clearRect(0,0,rect.width,rect.height);context.globalAlpha=1;context.setLineDash([])
 return {rect,context}
}
