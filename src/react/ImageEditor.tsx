import React,{useEffect,useRef,useState} from 'react';
import {X,RotateCcw,RotateCw,FlipHorizontal2,FlipVertical2,Undo2,Check,LoaderCircle,Crop} from 'lucide-react';

type Rect={x:number;y:number;w:number;h:number};
type Mode='move'|'nw'|'ne'|'sw'|'se';
const full:Rect={x:0,y:0,w:1,h:1};
const MIN=0.05;
const ratios:[string,string,number][]=[['free','Free',0],['1:1','Square',1],['4:3','4:3',4/3],['3:4','3:4',3/4],['16:9','16:9',16/9]];

function loadImage(src:string){
 return new Promise<HTMLImageElement>((resolve,reject)=>{
  const img=new Image();
  if(!src.startsWith('data:'))img.crossOrigin='anonymous';
  img.onload=()=>resolve(img);
  img.onerror=()=>reject(new Error(src.startsWith('data:')?'This image could not be opened.':'This linked image cannot be edited because its site blocks it. Upload the file instead.'));
  img.src=src;
 });
}
function canvasFrom(source:CanvasImageSource,w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void){
 const c=document.createElement('canvas');c.width=w;c.height=h;
 const ctx=c.getContext('2d');if(!ctx)throw new Error('This browser cannot edit images.');
 draw(ctx);return c;
}
function rotate(src:HTMLCanvasElement,dir:1|-1){
 return canvasFrom(src,src.height,src.width,ctx=>{ctx.translate(src.height/2,src.width/2);ctx.rotate(dir*Math.PI/2);ctx.drawImage(src,-src.width/2,-src.height/2);});
}
function flip(src:HTMLCanvasElement,horizontal:boolean){
 return canvasFrom(src,src.width,src.height,ctx=>{ctx.translate(horizontal?src.width:0,horizontal?0:src.height);ctx.scale(horizontal?-1:1,horizontal?1:-1);ctx.drawImage(src,0,0);});
}
// Same size budget as compressImage: each stored image must stay small for localStorage.
function exportCrop(src:HTMLCanvasElement,r:Rect){
 const sx=Math.round(r.x*src.width),sy=Math.round(r.y*src.height),sw=Math.max(1,Math.round(r.w*src.width)),sh=Math.max(1,Math.round(r.h*src.height));
 for(const [max,quality] of [[1280,.82],[1024,.78],[800,.72],[640,.65]]){
  const scale=Math.min(1,max/Math.max(sw,sh));
  const out=canvasFrom(src,Math.max(1,Math.round(sw*scale)),Math.max(1,Math.round(sh*scale)),ctx=>ctx.drawImage(src,sx,sy,sw,sh,0,0,Math.round(sw*scale),Math.round(sh*scale)));
  let data=out.toDataURL('image/webp',quality);
  if(!data.startsWith('data:image/webp')){const ctx=out.getContext('2d')!;ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);data=out.toDataURL('image/jpeg',quality);}
  if(data.length<=450000)return data;
 }
 throw new Error('This image is too detailed to store. Crop it smaller.');
}
// Ratio in normalised units: w/h of the rect when the picture is W×H pixels.
const unitRatio=(ratio:number,c:HTMLCanvasElement)=>ratio*c.height/c.width;
function fitRatio(ratio:number,c:HTMLCanvasElement,inside:Rect=full):Rect{
 if(!ratio)return inside;
 const ar=unitRatio(ratio,c);let w=inside.w,h=w/ar;
 if(h>inside.h){h=inside.h;w=h*ar;}
 return {x:inside.x+(inside.w-w)/2,y:inside.y+(inside.h-h)/2,w,h};
}

export function ImageEditor({src,onSave,onCancel}:{src:string;onSave:(image:string)=>void;onCancel:()=>void}){
 const original=useRef<HTMLCanvasElement|null>(null),view=useRef<HTMLCanvasElement>(null),stage=useRef<HTMLDivElement>(null);
 const [work,setWork]=useState<HTMLCanvasElement|null>(null),[rect,setRect]=useState<Rect>(full),[ratio,setRatio]=useState(0),[error,setError]=useState(''),[saving,setSaving]=useState(false),[changed,setChanged]=useState(false);
 const drag=useRef<{mode:Mode;start:Rect;px:number;py:number}|null>(null);

 useEffect(()=>{let live=true;loadImage(src).then(img=>{if(!live)return;const c=canvasFrom(img,img.naturalWidth,img.naturalHeight,ctx=>ctx.drawImage(img,0,0));try{c.getContext('2d')!.getImageData(0,0,1,1);}catch{throw new Error('This linked image cannot be edited because its site blocks it. Upload the file instead.');}original.current=c;setWork(c);}).catch(e=>live&&setError(e.message));return()=>{live=false;};},[src]);
 useEffect(()=>{const c=view.current;if(!c||!work)return;c.width=work.width;c.height=work.height;c.getContext('2d')!.drawImage(work,0,0);},[work]);
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();e.preventDefault();onCancel();}};window.addEventListener('keydown',key,true);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{window.removeEventListener('keydown',key,true);document.body.style.overflow=overflow;};},[]);

 function apply(next:HTMLCanvasElement,nextRect:Rect){setWork(next);setRect(ratio?fitRatio(ratio,next,nextRect):nextRect);setChanged(true);}
 function turn(dir:1|-1){if(!work)return;const r=rect;apply(rotate(work,dir),dir===1?{x:1-(r.y+r.h),y:r.x,w:r.h,h:r.w}:{x:r.y,y:1-(r.x+r.w),w:r.h,h:r.w});}
 function mirror(horizontal:boolean){if(!work)return;const r=rect;apply(flip(work,horizontal),horizontal?{...r,x:1-r.x-r.w}:{...r,y:1-r.y-r.h});}
 function chooseRatio(value:number){setRatio(value);if(work)setRect(value?fitRatio(value,work):rect);setChanged(true);}
 function reset(){if(!original.current)return;setWork(original.current);setRatio(0);setRect(full);setChanged(false);}

 function pointerDown(mode:Mode,e:React.PointerEvent){e.preventDefault();e.stopPropagation();try{(e.currentTarget as Element).setPointerCapture(e.pointerId);}catch{}drag.current={mode,start:rect,px:e.clientX,py:e.clientY};}
 function pointerMove(e:React.PointerEvent){
  const d=drag.current,box=stage.current?.getBoundingClientRect();if(!d||!box||!work)return;
  const s=d.start;
  if(d.mode==='move'){const dx=(e.clientX-d.px)/box.width,dy=(e.clientY-d.py)/box.height;setRect({...s,x:Math.min(1-s.w,Math.max(0,s.x+dx)),y:Math.min(1-s.h,Math.max(0,s.y+dy))});setChanged(true);return;}
  const left=d.mode.includes('w'),top=d.mode.includes('n');
  const ax=left?s.x+s.w:s.x,ay=top?s.y+s.h:s.y;
  const px=Math.min(1,Math.max(0,(e.clientX-box.left)/box.width)),py=Math.min(1,Math.max(0,(e.clientY-box.top)/box.height));
  let w=Math.min(Math.max(Math.abs(px-ax),MIN),left?ax:1-ax),h=Math.min(Math.max(Math.abs(py-ay),MIN),top?ay:1-ay);
  if(ratio){const ar=unitRatio(ratio,work);if(w/h>ar)w=h*ar;else h=w/ar;}
  setRect({x:left?ax-w:ax,y:top?ay-h:ay,w,h});setChanged(true);
 }
 function pointerUp(){drag.current=null;}
 function nudge(e:React.KeyboardEvent){
  const step=e.shiftKey?.05:.01,moves:any={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};const m=moves[e.key];if(!m)return;e.preventDefault();
  setRect(r=>({...r,x:Math.min(1-r.w,Math.max(0,r.x+m[0])),y:Math.min(1-r.h,Math.max(0,r.y+m[1]))}));setChanged(true);
 }
 async function save(){if(!work)return;setSaving(true);setError('');await new Promise(r=>setTimeout(r,20));try{onSave(exportCrop(work,rect));}catch(e:any){setError(e.message);setSaving(false);}}

 const px=work?`${Math.round(rect.w*work.width)} × ${Math.round(rect.h*work.height)}`:'';
 const pct=(v:number)=>`${v*100}%`;
 return <div className="image-editor" role="dialog" aria-modal="true" aria-labelledby="image-editor-title">
  <header className="image-editor-head"><button type="button" aria-label="Cancel editing" onClick={onCancel}><X size={20}/></button><h2 id="image-editor-title"><Crop size={17}/>Edit image</h2><button type="button" className="image-editor-done" disabled={!work||saving} onClick={save}>{saving?<LoaderCircle size={16} className="speech-spinner"/>:<Check size={16}/>}Done</button></header>
  <div className="image-editor-stage" onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp}>
   {!work&&!error&&<LoaderCircle size={28} className="speech-spinner"/>}
   {error&&!work&&<p className="image-editor-error" role="alert">{error}</p>}
   {work&&<div className="image-editor-canvas" ref={stage}>
    <canvas ref={view} aria-label="Image being edited"/>
    <div className="image-editor-crop" role="slider" tabIndex={0} aria-label="Crop area. Drag to move, use arrow keys to nudge" aria-valuetext={px} style={{left:pct(rect.x),top:pct(rect.y),width:pct(rect.w),height:pct(rect.h)}} onPointerDown={e=>pointerDown('move',e)} onKeyDown={nudge}>
     <span className="image-editor-grid" aria-hidden="true"/>
     {(['nw','ne','sw','se'] as Mode[]).map(m=><span key={m} className={`image-editor-handle is-${m}`} aria-hidden="true" onPointerDown={e=>pointerDown(m,e)}/>)}
    </div>
   </div>}
  </div>
  <div className="image-editor-tools">
   {error&&work&&<p className="image-editor-error" role="alert">{error}</p>}
   <div className="image-editor-ratios" role="radiogroup" aria-label="Crop shape">{ratios.map(([id,label,value])=><button type="button" role="radio" key={id} aria-checked={ratio===value} disabled={!work} onClick={()=>chooseRatio(value)}>{label}</button>)}</div>
   <div className="image-editor-actions">
    <button type="button" disabled={!work} onClick={()=>turn(-1)}><RotateCcw size={18}/><span>Left</span></button>
    <button type="button" disabled={!work} onClick={()=>turn(1)}><RotateCw size={18}/><span>Right</span></button>
    <button type="button" disabled={!work} onClick={()=>mirror(true)}><FlipHorizontal2 size={18}/><span>Mirror</span></button>
    <button type="button" disabled={!work} onClick={()=>mirror(false)}><FlipVertical2 size={18}/><span>Flip</span></button>
    <button type="button" disabled={!work||!changed} onClick={reset}><Undo2 size={18}/><span>Reset</span></button>
   </div>
   {work&&<small className="image-editor-size">{px} px</small>}
  </div>
 </div>;
}
