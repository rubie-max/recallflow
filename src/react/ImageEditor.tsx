import React,{useEffect,useRef,useState} from 'react';
import {X,RotateCcw,RotateCw,FlipHorizontal2,FlipVertical2,Undo2,Check,LoaderCircle,Crop,ZoomIn,ZoomOut,Shrink,Expand} from 'lucide-react';

// Every stored picture uses this shape so cards, options and thumbnails line up.
export const IMAGE_W=1200,IMAGE_H=900;
type View={k:number;x:number;y:number};
const SOURCE_MAX=2400;

function loadImage(src:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image();
  if(/^https?:/i.test(src)&&!src.startsWith(location.origin))img.crossOrigin='anonymous';
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error(/^https?:/i.test(src)?'This linked image cannot be edited because its site blocks it. Upload the file instead.':'This image could not be opened. Try a PNG, JPEG or WebP file.'));
  img.src=src;
 });
}
function canvasFrom(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d');if(!ctx)throw new Error('This browser cannot edit images.');
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
 draw(ctx);return c;
}
function rotate(src:HTMLCanvasElement,dir:1|-1){
 return canvasFrom(src.height,src.width,ctx=>{ctx.translate(src.height/2,src.width/2);ctx.rotate(dir*Math.PI/2);ctx.drawImage(src,-src.width/2,-src.height/2);});
}
function flip(src:HTMLCanvasElement,horizontal:boolean){
 return canvasFrom(src.width,src.height,ctx=>{ctx.translate(horizontal?src.width:0,horizontal?0:src.height);ctx.scale(horizontal?-1:1,horizontal?1:-1);ctx.drawImage(src,0,0);});
}
const clamp=(v:number,a:number,b:number)=>Math.min(Math.max(v,Math.min(a,b)),Math.max(a,b));
const fitK=(c:HTMLCanvasElement)=>Math.min(IMAGE_W/c.width,IMAGE_H/c.height);
const fillK=(c:HTMLCanvasElement)=>Math.max(IMAGE_W/c.width,IMAGE_H/c.height);
const maxK=(c:HTMLCanvasElement)=>Math.max(fillK(c),fitK(c))*4;
const centred=(k:number):View=>({k,x:IMAGE_W/2,y:IMAGE_H/2});
// A picture smaller than the frame can slide around inside it; a larger one must keep the frame covered.
function limit(v:View,c:HTMLCanvasElement):View{
 const k=clamp(v.k,fitK(c),maxK(c)),w=c.width*k,h=c.height*k;
 return {k,x:clamp(v.x,w/2,IMAGE_W-w/2),y:clamp(v.y,h/2,IMAGE_H-h/2)};
}
function zoomAround(v:View,k:number,ox:number,oy:number):View{const r=k/v.k;return {k,x:ox-(ox-v.x)*r,y:oy-(oy-v.y)*r};}
// Any part of the frame the picture doesn't reach shows a soft, blurred copy of the same picture instead of white.
const backdrops=new WeakMap<HTMLCanvasElement,HTMLCanvasElement>();
function backdrop(c:HTMLCanvasElement){
 let b=backdrops.get(c);if(b)return b;
 const tiny=canvasFrom(32,24,ctx=>{const k=Math.max(32/c.width,24/c.height),w=c.width*k,h=c.height*k;ctx.drawImage(c,(32-w)/2,(24-h)/2,w,h);});
 b=canvasFrom(320,240,ctx=>{
  ctx.drawImage(tiny,0,0,320,240);
  if('filter' in ctx){ctx.filter='blur(6px)';ctx.drawImage(ctx.canvas,-12,-12,344,264);ctx.filter='none';}
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(0,0,320,240);
 });
 backdrops.set(c,b);return b;
}
function paint(ctx:CanvasRenderingContext2D,c:HTMLCanvasElement,v:View,W:number,H:number){
 const s=W/IMAGE_W,w=c.width*v.k*s,h=c.height*v.k*s;
 ctx.drawImage(backdrop(c),0,0,W,H);
 ctx.drawImage(c,v.x*s-w/2,v.y*s-h/2,w,h);
}
// Same size budget as before: each stored image must stay small enough to sync quickly.
function exportView(c:HTMLCanvasElement,v:View){
 for(const [w,q] of [[1200,.85],[1024,.8],[800,.75],[640,.7]]){
  const h=Math.round(w*IMAGE_H/IMAGE_W),out=canvasFrom(w,h,ctx=>paint(ctx,c,v,w,h));
  let data=out.toDataURL('image/webp',q);
  if(!data.startsWith('data:image/webp'))data=out.toDataURL('image/jpeg',q);
  if(data.length<=450000)return data;
 }
 throw new Error('This image is too detailed to store. Zoom in a little and try again.');
}

export function ImageEditor({src,onSave,onCancel}:{src:string;onSave:(image:string)=>void;onCancel:()=>void}){
 const original=useRef<HTMLCanvasElement|null>(null),view=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null),frame=useRef<HTMLDivElement>(null);
 const [work,setWork]=useState<HTMLCanvasElement|null>(null),[pos,setPos]=useState<View>(centred(1)),[size,setSize]=useState({w:0,h:0});
 const [error,setError]=useState(''),[saving,setSaving]=useState(false),[changed,setChanged]=useState(false),[moving,setMoving]=useState(false);
 const pointers=useRef(new Map<number,{x:number;y:number}>()),gesture=useRef<{v:View;x:number;y:number;dist:number}|null>(null);

 useEffect(()=>{let live=true;loadImage(src).then(img=>{
  if(!live)return;
  const s=Math.min(1,SOURCE_MAX/Math.max(img.naturalWidth,img.naturalHeight));
  const c=canvasFrom(Math.max(1,Math.round(img.naturalWidth*s)),Math.max(1,Math.round(img.naturalHeight*s)),ctx=>ctx.drawImage(img,0,0,Math.round(img.naturalWidth*s),Math.round(img.naturalHeight*s)));
  try{c.getContext('2d')!.getImageData(0,0,1,1);}catch{throw new Error('This linked image cannot be edited because its site blocks it. Upload the file instead.');}
  original.current=c;setWork(c);setPos(centred(fillK(c)));
 }).catch(e=>live&&setError(e.message));return()=>{live=false;};},[src]);
 useEffect(()=>{const el=stage.current;if(!el)return;const measure=()=>{const b=el.getBoundingClientRect(),aw=Math.max(0,b.width-24),ah=Math.max(0,b.height-24),w=Math.min(aw,ah*IMAGE_W/IMAGE_H);setSize({w:Math.floor(w),h:Math.floor(w*IMAGE_H/IMAGE_W)});};measure();const o=new ResizeObserver(measure);o.observe(el);return()=>o.disconnect();},[]);
 useEffect(()=>{const c=view.current;if(!c||!work||!size.w)return;const dpr=Math.min(2,window.devicePixelRatio||1);c.width=Math.round(size.w*dpr);c.height=Math.round(size.h*dpr);const ctx=c.getContext('2d')!;ctx.imageSmoothingQuality='high';paint(ctx,work,pos,c.width,c.height);},[work,pos,size]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();onCancel();}};window.addEventListener('keydown',key,true);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;};},[]);

 const update=(next:View)=>{if(!work)return;setPos(limit(next,work));setChanged(true);};
 const toOutput=(cx:number,cy:number)=>{const b=frame.current!.getBoundingClientRect();return {x:(cx-b.left)*IMAGE_W/b.width,y:(cy-b.top)*IMAGE_H/b.height};};
 function startGesture(){const pts=[...pointers.current.values()];if(!pts.length){gesture.current=null;return;}const x=pts.reduce((s,p)=>s+p.x,0)/pts.length,y=pts.reduce((s,p)=>s+p.y,0)/pts.length;gesture.current={v:pos,x,y,dist:pts.length>1?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0};}
 function down(e:React.PointerEvent){if(!work)return;e.preventDefault();try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{}pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});startGesture();setMoving(true);}
 function move(e:React.PointerEvent){
  const g=gesture.current;if(!g||!work||!pointers.current.has(e.pointerId))return;
  pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});
  const pts=[...pointers.current.values()],b=frame.current!.getBoundingClientRect(),scale=IMAGE_W/b.width;
  const mx=pts.reduce((s,p)=>s+p.x,0)/pts.length,my=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  let next={...g.v,x:g.v.x+(mx-g.x)*scale,y:g.v.y+(my-g.y)*scale};
  if(pts.length>1&&g.dist){const k=clamp(g.v.k*Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)/g.dist,fitK(work),maxK(work)),o=toOutput(mx,my);next=zoomAround(next,k,o.x,o.y);}
  update(next);
 }
 function up(e:React.PointerEvent){pointers.current.delete(e.pointerId);startGesture();if(!pointers.current.size)setMoving(false);}
 function wheel(e:React.WheelEvent){if(!work)return;const o=toOutput(e.clientX,e.clientY);update(zoomAround(pos,clamp(pos.k*Math.exp(-e.deltaY*.0015),fitK(work),maxK(work)),o.x,o.y));}
 function zoomTo(k:number){if(!work)return;update(zoomAround(pos,clamp(k,fitK(work),maxK(work)),IMAGE_W/2,IMAGE_H/2));}
 function key(e:React.KeyboardEvent){
  const step=e.shiftKey?60:15,moves:any={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(moves[e.key]){e.preventDefault();update({...pos,x:pos.x+moves[e.key][0],y:pos.y+moves[e.key][1]});}
  else if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(pos.k*1.15);}
  else if(e.key==='-'){e.preventDefault();zoomTo(pos.k/1.15);}
 }
 function apply(next:HTMLCanvasElement,v:View){setWork(next);setPos(limit(v,next));setChanged(true);}
 function turn(dir:1|-1){if(!work)return;const next=rotate(work,dir);apply(next,centred(fillK(next)));}
 function mirror(horizontal:boolean){if(!work)return;apply(flip(work,horizontal),horizontal?{...pos,x:IMAGE_W-pos.x}:{...pos,y:IMAGE_H-pos.y});}
 function reset(){const c=original.current;if(!c)return;setWork(c);setPos(centred(fillK(c)));setChanged(false);}
 async function save(){if(!work)return;setSaving(true);setError('');await new Promise(r=>setTimeout(r,20));try{onSave(exportView(work,pos));}catch(e:any){setError(e.message);setSaving(false);}}

 const lo=work?fitK(work):1,hi=work?maxK(work):1,level=work&&hi>lo?Math.log(pos.k/lo)/Math.log(hi/lo):0;
 const mode=work?(Math.abs(pos.k-fitK(work))<1e-6?'fit':Math.abs(pos.k-fillK(work))<1e-6?'fill':''):'';
 return <div className="image-editor" role="dialog" aria-modal="true" aria-labelledby="image-editor-title">
  <header className="image-editor-head"><button type="button" aria-label="Cancel" onClick={onCancel}><X size={20}/></button><h2 id="image-editor-title"><Crop size={17}/>Adjust picture</h2><button type="button" className="image-editor-done" disabled={!work||saving} onClick={save}>{saving?<LoaderCircle size={16} className="speech-spinner"/>:<Check size={16}/>}Done</button></header>
  <div className="image-editor-stage" ref={stage}>
   {!work&&!error&&<LoaderCircle size={28} className="speech-spinner"/>}
   {error&&!work&&<p className="image-editor-error" role="alert">{error}</p>}
   {work&&size.w>0&&<div className={`image-editor-frame${moving?' is-moving':''}`} ref={frame} style={{width:size.w,height:size.h}} tabIndex={0} role="application" aria-label="Picture frame. Drag to move, pinch or use plus and minus to zoom" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onWheel={wheel} onKeyDown={key} onDoubleClick={()=>work&&update(centred(mode==='fill'?fitK(work):fillK(work)))}>
    <canvas ref={view} aria-hidden="true"/>
    <span className="image-editor-grid" aria-hidden="true"/>
   </div>}
  </div>
  <div className="image-editor-tools">
   {error&&work&&<p className="image-editor-error" role="alert">{error}</p>}
   <div className="image-editor-zoom"><button type="button" aria-label="Zoom out" disabled={!work||pos.k<=lo+1e-6} onClick={()=>zoomTo(pos.k/1.25)}><ZoomOut size={18}/></button><input type="range" min={0} max={1000} step={1} aria-label="Zoom" disabled={!work||hi<=lo} value={Math.round(level*1000)} onChange={e=>zoomTo(lo*Math.exp(Number(e.target.value)/1000*Math.log(hi/lo)))}/><button type="button" aria-label="Zoom in" disabled={!work||pos.k>=hi-1e-6} onClick={()=>zoomTo(pos.k*1.25)}><ZoomIn size={18}/></button></div>
   <div className="image-editor-ratios" role="radiogroup" aria-label="Picture size"><button type="button" role="radio" aria-checked={mode==='fit'} disabled={!work} onClick={()=>work&&update(centred(fitK(work)))}><Shrink size={15}/>Whole picture</button><button type="button" role="radio" aria-checked={mode==='fill'} disabled={!work} onClick={()=>work&&update(centred(fillK(work)))}><Expand size={15}/>Fill frame</button></div>
   <div className="image-editor-actions">
    <button type="button" disabled={!work} onClick={()=>turn(-1)}><RotateCcw size={18}/><span>Left</span></button>
    <button type="button" disabled={!work} onClick={()=>turn(1)}><RotateCw size={18}/><span>Right</span></button>
    <button type="button" disabled={!work} onClick={()=>mirror(true)}><FlipHorizontal2 size={18}/><span>Mirror</span></button>
    <button type="button" disabled={!work} onClick={()=>mirror(false)}><FlipVertical2 size={18}/><span>Flip</span></button>
    <button type="button" disabled={!work||!changed} onClick={reset}><Undo2 size={18}/><span>Reset</span></button>
   </div>
   <small className="image-editor-size">Drag to move · pinch or slide to zoom</small>
  </div>
 </div>;
}
