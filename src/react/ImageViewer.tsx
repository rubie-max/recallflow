import React,{useEffect,useRef,useState} from 'react';
import {X,ZoomIn,ZoomOut,Maximize2} from 'lucide-react';

const EVENT='recallflow-zoom';
const MIN=1,MAX=5;
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

export function openZoom(src?:string|null,alt=''){if(src)window.dispatchEvent(new CustomEvent(EVENT,{detail:{src,alt}}));}

export function ImageViewer({src,alt='',onClose}:{src:string;alt?:string;onClose:()=>void}){
 const [view,setView]=useState({s:1,x:0,y:0});
 const stage=useRef<HTMLDivElement>(null),pointers=useRef(new Map<number,{x:number;y:number}>()),gesture=useRef<any>(null),lastTap=useRef(0),closeBtn=useRef<HTMLButtonElement>(null);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}else if(e.key==='+'||e.key==='=')zoomBy(1.4);else if(e.key==='-')zoomBy(1/1.4);else if(e.key==='0')setView({s:1,x:0,y:0});};window.addEventListener('keydown',key,true);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';closeBtn.current?.focus();return()=>{window.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;};},[]);
 function limit(v:{s:number;x:number;y:number}){const r=stage.current?.getBoundingClientRect(),s=clamp(v.s,MIN,MAX);if(!r||s===1)return {s,x:0,y:0};const mx=r.width*(s-1)/2,my=r.height*(s-1)/2;return {s,x:clamp(v.x,-mx,mx),y:clamp(v.y,-my,my)};}
 // Zoom keeping the point under (cx,cy) fixed; coordinates are relative to the stage centre.
 function zoomAt(factor:number,cx=0,cy=0){setView(v=>{const s=clamp(v.s*factor,MIN,MAX),k=s/v.s;return limit({s,x:cx-(cx-v.x)*k,y:cy-(cy-v.y)*k});});}
 function zoomBy(factor:number){zoomAt(factor);}
 function local(e:{clientX:number;clientY:number}){const r=stage.current!.getBoundingClientRect();return {x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2};}
 function down(e:React.PointerEvent){try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{}pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const pts=[...pointers.current.values()];if(pts.length===2){const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);gesture.current={type:'pinch',d,view};}else gesture.current={type:'pan',x:e.clientX,y:e.clientY,view,moved:false};}
 function move(e:React.PointerEvent){if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const g=gesture.current;if(!g)return;const pts=[...pointers.current.values()];if(g.type==='pinch'&&pts.length===2){const d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y),mid=local({clientX:(pts[0].x+pts[1].x)/2,clientY:(pts[0].y+pts[1].y)/2}),s=clamp(g.view.s*d/g.d,MIN,MAX),k=s/g.view.s;setView(limit({s,x:mid.x-(mid.x-g.view.x)*k,y:mid.y-(mid.y-g.view.y)*k}));}else if(g.type==='pan'){const dx=e.clientX-g.x,dy=e.clientY-g.y;if(Math.abs(dx)+Math.abs(dy)>4)g.moved=true;if(g.view.s>1)setView(limit({s:g.view.s,x:g.view.x+dx,y:g.view.y+dy}));}}
 function up(e:React.PointerEvent){const g=gesture.current;pointers.current.delete(e.pointerId);if(pointers.current.size===0){if(g?.type==='pan'&&!g.moved){const now=Date.now();if(now-lastTap.current<300){const p=local(e);setView(v=>v.s>1?{s:1,x:0,y:0}:limit({s:2.5,x:-p.x*1.5,y:-p.y*1.5}));lastTap.current=0;}else lastTap.current=now;}gesture.current=null;}else gesture.current=null;}
 function wheel(e:React.WheelEvent){const p=local(e);zoomAt(e.deltaY<0?1.15:1/1.15,p.x,p.y);}
 const pct=Math.round(view.s*100);
 return <div className="image-viewer" role="dialog" aria-modal="true" aria-label="Image viewer">
  <div className="image-viewer-bar"><span role="status" aria-live="polite">{pct}%</span><div><button type="button" aria-label="Zoom out" disabled={view.s<=MIN} onClick={()=>zoomBy(1/1.4)}><ZoomOut size={18}/></button><button type="button" aria-label="Fit to screen" disabled={view.s===1} onClick={()=>setView({s:1,x:0,y:0})}><Maximize2 size={17}/></button><button type="button" aria-label="Zoom in" disabled={view.s>=MAX} onClick={()=>zoomBy(1.4)}><ZoomIn size={18}/></button></div><button type="button" ref={closeBtn} className="image-viewer-close" aria-label="Close image viewer" onClick={onClose}><X size={20}/></button></div>
  <div className="image-viewer-stage" ref={stage} data-zoomed={view.s>1||undefined} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onClick={e=>{if(e.target===e.currentTarget&&view.s===1)onClose();}}>
   <img src={src} alt={alt||'Enlarged image'} draggable={false} style={{transform:`translate(${view.x}px,${view.y}px) scale(${view.s})`}}/>
  </div>
  <p className="image-viewer-hint">Pinch, scroll or double-tap to zoom · drag to move</p>
 </div>;
}

export function ZoomHost(){
 const [img,setImg]=useState<{src:string;alt:string}|null>(null);
 useEffect(()=>{const open=(e:any)=>setImg(e.detail);window.addEventListener(EVENT,open);return()=>window.removeEventListener(EVENT,open);},[]);
 return img?<ImageViewer src={img.src} alt={img.alt} onClose={()=>setImg(null)}/>:null;
}

export function ZoomButton({src,alt='',label='Enlarge image'}:{src:string;alt?:string;label?:string}){
 return <button type="button" className="zoomable-image-btn" aria-label={label} title={label} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.preventDefault();e.stopPropagation();openZoom(src,alt);}}><ZoomIn size={15}/></button>;
}

// tapImage=false keeps taps on the picture for the surrounding control (e.g. selecting a choice).
export function ZoomableImage({src,alt='',className='',imgClassName,label='Enlarge image',tapImage=true}:{src:string;alt?:string;className?:string;imgClassName?:string;label?:string;tapImage?:boolean}){
 return <span className={`zoomable-image ${className}`}><img className={imgClassName} src={src} alt={alt} draggable={false} onClick={tapImage?e=>{e.preventDefault();e.stopPropagation();openZoom(src,alt);}:undefined}/><ZoomButton src={src} alt={alt} label={label}/></span>;
}
