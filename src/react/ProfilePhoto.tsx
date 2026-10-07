import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {X,ZoomIn,ZoomOut,RotateCcw,RotateCw,FlipHorizontal2,Undo2,Sun,Contrast,Droplet,Crop,SlidersHorizontal} from 'lucide-react';
import {profilePhoto,onProfilePhoto,defaultEdit,clampEdit,drawPhoto,exportPhoto,MIN_ZOOM,MAX_ZOOM} from '../profile-photo.js';

export function useProfilePhoto(){
 const [photo,setPhoto]=useState(profilePhoto);
 useEffect(()=>onProfilePhoto(setPhoto),[]);
 return photo;
}

const ADJUST:[string,string,any][]=[['brightness','Brightness',Sun],['contrast','Contrast',Contrast],['saturation','Saturation',Droplet]];

export function PhotoEditor({image,onCancel,onSave}:{image:ImageBitmap,onCancel:()=>void,onSave:(url:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),stage=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [edit,setEditRaw]=useState(defaultEdit),[tab,setTab]=useState<'crop'|'adjust'>('crop'),[side,setSide]=useState(0),[saving,setSaving]=useState(false);
 const pointers=useRef(new Map<number,{x:number,y:number}>()),pinch=useRef(0);
 const setEdit=(fn:(e:any)=>any)=>setEditRaw(e=>clampEdit(image.width,image.height,fn(e)));
 const changed=JSON.stringify(edit)!==JSON.stringify(defaultEdit());

 useEffect(()=>{const focus=document.activeElement as HTMLElement|null;dialog.current?.showModal();return()=>{dialog.current?.close();focus?.focus();};},[]);
 useLayoutEffect(()=>{const el=stage.current;if(!el)return;const ro=new ResizeObserver(()=>setSide(el.clientWidth));ro.observe(el);setSide(el.clientWidth);return()=>ro.disconnect();},[]);
 useEffect(()=>{const c=canvas.current;if(!c||!side)return;const px=Math.round(side*Math.min(2,window.devicePixelRatio||1));if(c.width!==px){c.width=c.height=px;}drawPhoto(c.getContext('2d')!,image,edit,px);},[edit,side,image]);

 function down(e:React.PointerEvent){try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{}pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});pinch.current=0;}
 function move(e:React.PointerEvent){
  const p=pointers.current,prev=p.get(e.pointerId);if(!prev||!side)return;
  const next={x:e.clientX,y:e.clientY};p.set(e.pointerId,next);
  if(p.size>=2){const [a,b]=[...p.values()],dist=Math.hypot(a.x-b.x,a.y-b.y);if(pinch.current)setEdit(x=>({...x,zoom:x.zoom*dist/pinch.current}));pinch.current=dist;return;}
  setEdit(x=>({...x,x:x.x+(next.x-prev.x)/side,y:x.y+(next.y-prev.y)/side}));
 }
 function up(e:React.PointerEvent){pointers.current.delete(e.pointerId);pinch.current=0;}
 useEffect(()=>{const el=stage.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();setEdit(x=>({...x,zoom:x.zoom*Math.exp(-e.deltaY*.0015)}));};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel);},[]);
 function key(e:React.KeyboardEvent){
  const step=e.shiftKey?.05:.01,moves:Record<string,[number,number]>={ArrowLeft:[-step,0],ArrowRight:[step,0],ArrowUp:[0,-step],ArrowDown:[0,step]};
  if(moves[e.key]){e.preventDefault();const [dx,dy]=moves[e.key];setEdit(x=>({...x,x:x.x+dx,y:x.y+dy}));}
  else if(e.key==='+'||e.key==='='){e.preventDefault();setEdit(x=>({...x,zoom:x.zoom*1.1}));}
  else if(e.key==='-'){e.preventDefault();setEdit(x=>({...x,zoom:x.zoom/1.1}));}
 }
 const rotate=(by:number)=>setEdit(x=>({...x,rotate:(x.rotate+by+360)%360}));
 function save(){setSaving(true);try{onSave(exportPhoto(image,edit));}finally{setSaving(false);}}

 return <dialog ref={dialog} className="photo-editor" aria-labelledby="photo-editor-title" onCancel={e=>{e.preventDefault();onCancel();}}>
  <header className="photo-editor-head"><h2 id="photo-editor-title">Edit picture</h2><button type="button" className="photo-editor-close" aria-label="Close without saving" onClick={onCancel}><X size={19}/></button></header>
  <div ref={stage} className="photo-editor-stage" tabIndex={0} role="application" aria-roledescription="picture cropper" aria-label="Picture position. Drag or use the arrow keys to move it, plus and minus to zoom." onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}>
   <canvas ref={canvas} aria-hidden="true"/>
   <span className="photo-editor-ring" aria-hidden="true"/>
  </div>
  <p className="photo-editor-hint">Drag to move · pinch or scroll to zoom</p>
  <div className="photo-editor-tabs" role="tablist" aria-label="Editing tools">
   <button type="button" role="tab" aria-selected={tab==='crop'} onClick={()=>setTab('crop')}><Crop size={15}/>Crop</button>
   <button type="button" role="tab" aria-selected={tab==='adjust'} onClick={()=>setTab('adjust')}><SlidersHorizontal size={15}/>Adjust</button>
  </div>
  {tab==='crop'?<div className="photo-editor-panel" role="tabpanel" aria-label="Crop">
   <div className="photo-editor-zoom"><button type="button" aria-label="Zoom out" onClick={()=>setEdit(x=>({...x,zoom:x.zoom/1.2}))} disabled={edit.zoom<=MIN_ZOOM}><ZoomOut size={17}/></button><input type="range" aria-label="Zoom" min={MIN_ZOOM} max={MAX_ZOOM} step={.01} value={edit.zoom} onChange={e=>{const zoom=Number(e.target.value);setEdit(x=>({...x,zoom}));}}/><button type="button" aria-label="Zoom in" onClick={()=>setEdit(x=>({...x,zoom:x.zoom*1.2}))} disabled={edit.zoom>=MAX_ZOOM}><ZoomIn size={17}/></button></div>
   <div className="photo-editor-tools"><button type="button" onClick={()=>rotate(-90)}><RotateCcw size={17}/>Left</button><button type="button" onClick={()=>rotate(90)}><RotateCw size={17}/>Right</button><button type="button" aria-pressed={edit.flip} onClick={()=>setEdit(x=>({...x,flip:!x.flip}))}><FlipHorizontal2 size={17}/>Mirror</button></div>
  </div>:<div className="photo-editor-panel" role="tabpanel" aria-label="Adjust">
   {ADJUST.map(([k,label,Icon])=><label key={k} className="photo-editor-slider"><span><Icon size={15} aria-hidden="true"/>{label}<b>{Math.round(((edit as any)[k]-1)*100)>0?'+':''}{Math.round(((edit as any)[k]-1)*100)}</b></span><input type="range" min={.5} max={1.5} step={.01} value={(edit as any)[k]} onChange={e=>{const v=Number(e.target.value);setEdit(x=>({...x,[k]:Math.abs(v-1)<.02?1:v}));}} onDoubleClick={()=>setEdit(x=>({...x,[k]:1}))}/></label>)}
  </div>}
  <footer className="photo-editor-actions">
   <button type="button" className="photo-editor-reset" onClick={()=>setEditRaw(defaultEdit())} disabled={!changed}><Undo2 size={16}/>Reset</button>
   <span/>
   <button type="button" className="photo-editor-cancel" onClick={onCancel}>Cancel</button>
   <button type="button" className="photo-editor-save" onClick={save} disabled={saving}>Save picture</button>
  </footer>
 </dialog>;
}
