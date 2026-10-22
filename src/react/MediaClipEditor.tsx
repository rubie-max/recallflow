import React,{useEffect,useRef,useState} from 'react';
import {X,Check,Undo2,Redo2,Volume2,VolumeX,Download,ChevronDown,RotateCcw} from 'lucide-react';
import {Button} from './components/Button';
import {driveFileId,isDriveLink,resolveMediaPlaybackSrc} from '../question-types.js';

export type MediaEdit={trimStart:number;trimEnd:number;muted:boolean};

const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export const isEmbeddedMedia=(src:string)=>src.startsWith('data:');

export function defaultEdit(duration:number):MediaEdit{
 const d=Math.max(0,duration||0);
 return {trimStart:0,trimEnd:d||0,muted:false};
}
export function normalizeEdit(edit:MediaEdit|undefined,duration:number):MediaEdit{
 const d=Math.max(0,duration||0);
 if(!d)return defaultEdit(0);
 if(!edit)return defaultEdit(d);
 let {trimStart,trimEnd,muted}=edit;
 trimStart=Math.max(0,Math.min(trimStart,d-0.05));
 trimEnd=Math.max(trimStart+0.05,Math.min(trimEnd,d));
 return {trimStart,trimEnd,muted:!!muted};
}
export function editIsDefault(edit:MediaEdit|undefined,duration:number){
 const n=normalizeEdit(edit,duration);
 return !n.muted&&n.trimStart<=0.01&&Math.abs(n.trimEnd-duration)<=0.05;
}

function useHistory<T>(initial:T){
 const [past,setPast]=useState<T[]>([]);
 const [present,setPresent]=useState(initial);
 const [future,setFuture]=useState<T[]>([]);
 const set=(next:T)=>{setPast(p=>[...p,present]);setPresent(next);setFuture([]);};
 const undo=()=>{setPast(p=>{if(!p.length)return p;const prev=p[p.length-1];setFuture(f=>[present,...f]);setPresent(prev);return p.slice(0,-1);});};
 const redo=()=>{setFuture(f=>{if(!f.length)return f;const nxt=f[0];setPast(p=>[...p,present]);setPresent(nxt);return f.slice(1);});};
 const reset=(v:T)=>{setPast([]);setFuture([]);setPresent(v);};
 return {state:present,set,undo,redo,reset,canUndo:past.length>0,canRedo:future.length>0};
}

async function downloadOriginal(src:string,name:string){
 try{
  const blob=src.startsWith('data:')?await (await fetch(src)).blob():await (await fetch(src,{mode:'cors'})).blob();
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }catch{window.open(src,'_blank');}
}

export async function exportTrimmedAudio(src:string,edit:MediaEdit):Promise<Blob>{
 const ctx=new AudioContext();
 try{
  const buf=await ctx.decodeAudioData(await (await fetch(resolveMediaPlaybackSrc(src))).arrayBuffer());
  const slice=ctx.createBufferSource();
  slice.buffer=buf;
  const dest=ctx.createMediaStreamDestination();
  slice.connect(dest);
  const mime=['audio/webm;codecs=opus','audio/webm','audio/ogg'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const rec=new MediaRecorder(dest.stream,mime?{mimeType:mime}:undefined),chunks:Blob[]=[];
  rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise<Blob>(resolve=>{rec.onstop=()=>resolve(new Blob(chunks,{type:rec.mimeType||mime||'audio/webm'}));});
  const len=Math.max(0.05,edit.trimEnd-edit.trimStart);
  rec.start();
  slice.start(0,edit.trimStart,len);
  slice.onended=()=>{if(rec.state!=='inactive')rec.stop();};
  const out=await done;
  return out;
 }finally{await ctx.close().catch(()=>{});}
}

type Props={
 src:string;
 kind:'audio'|'video';
 title:string;
 initial?:MediaEdit;
 onSave:(edit:MediaEdit|undefined)=>void;
 onCancel:()=>void;
};

export function MediaClipEditor({src,kind,title,initial,onSave,onCancel}:Props){
 const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
 const scrub=useRef<HTMLDivElement>(null);
 const [duration,setDuration]=useState(0);
 const [at,setAt]=useState(0);
 const [drag,setDrag]=useState<'start'|'end'|null>(null);
 const [menu,setMenu]=useState(false);
 const [exporting,setExporting]=useState('');
 const base=defaultEdit(duration);
 const hist=useHistory(normalizeEdit(initial,duration||0));
 const edit=normalizeEdit(hist.state,duration||0);
 const embedded=isEmbeddedMedia(src);
 const playback=resolveMediaPlaybackSrc(src);
 const drive=!!driveFileId(src)||isDriveLink(src);

 useEffect(()=>{
  const el=media.current;if(!el)return;
  const meta=()=>{const d=el.duration;if(Number.isFinite(d)&&d>0){setDuration(d);hist.reset(normalizeEdit(initial,d));}};
  el.addEventListener('loadedmetadata',meta);el.addEventListener('durationchange',meta);
  meta();
  return()=>{el.removeEventListener('loadedmetadata',meta);el.removeEventListener('durationchange',meta);};
 },[playback,initial]);

 useEffect(()=>{const el=media.current;if(!el)return;el.muted=edit.muted;},[edit.muted,src]);

 useEffect(()=>{
  const el=media.current;if(!el)return;
  const tick=()=>setAt(el.currentTime);
  const end=()=>{if(el.currentTime>=edit.trimEnd-0.02){el.pause();el.currentTime=edit.trimStart;}};
  el.addEventListener('timeupdate',tick);el.addEventListener('timeupdate',end);
  return()=>{el.removeEventListener('timeupdate',tick);el.removeEventListener('timeupdate',end);};
 },[edit.trimStart,edit.trimEnd,src]);

 function frac(clientX:number){
  const r=scrub.current?.getBoundingClientRect();if(!r||!duration)return 0;
  return Math.min(1,Math.max(0,(clientX-r.left)/r.width));
 }
 function seekTo(t:number){
  const el=media.current;if(!el||!duration)return;
  el.currentTime=Math.min(edit.trimEnd,Math.max(edit.trimStart,t));
  setAt(el.currentTime);
 }
 function pointerDown(which:'start'|'end',e:React.PointerEvent){
  e.preventDefault();setDrag(which);(e.target as HTMLElement).setPointerCapture(e.pointerId);
 }
 function pointerMove(e:React.PointerEvent){
  if(!drag||!duration)return;
  const t=frac(e.clientX)*duration;
  if(drag==='start')hist.set(normalizeEdit({...edit,trimStart:Math.min(t,edit.trimEnd-0.05)},duration));
  else hist.set(normalizeEdit({...edit,trimEnd:Math.max(t,edit.trimStart+0.05)},duration));
 }
 function pointerUp(e:React.PointerEvent){if(drag){setDrag(null);try{(e.target as HTMLElement).releasePointerCapture(e.pointerId);}catch{}}}

 async function downloadEdited(){
  if(!embedded){window.open(src,'_blank');return;}
  setExporting('Preparing…');
  try{
   if(kind==='audio'){
    const blob=await exportTrimmedAudio(src,edit);
    const url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download='edited-clip.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   }else{
    setExporting('Trimmed video export needs a re-encoded copy — use Download original, or trim in a desktop editor for now.');
    window.setTimeout(()=>setExporting(''),4000);
    return;
   }
  }catch{setExporting('Export failed — try Download original.');window.setTimeout(()=>setExporting(''),3500);return;}
  setExporting('');
 }

 function done(){
  onSave(editIsDefault(edit,duration)?undefined:edit);
 }

 const left=duration?edit.trimStart/duration*100:0;
 const width=duration?(edit.trimEnd-edit.trimStart)/duration*100:100;

 return <div className="media-clip-layer" role="presentation">
  <button type="button" className="question-tools-scrim" aria-label="Close editor" onClick={onCancel}/>
  <section className="media-clip-editor" role="dialog" aria-modal="true" aria-labelledby="media-clip-title">
   <header className="media-clip-head"><button type="button" aria-label="Cancel" onClick={onCancel}><X size={18}/></button><h2 id="media-clip-title">{title}</h2><Button size="sm" onClick={done}><Check size={15}/>Done</Button></header>
   <div className="media-clip-stage">{kind==='video'?<video ref={media as React.RefObject<HTMLVideoElement>} src={playback} playsInline controls preload="metadata"/>:<audio ref={media as React.RefObject<HTMLAudioElement>} src={playback} controls preload="metadata"/>}</div>
   <div className="media-clip-scrubber" ref={scrub} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={e=>{if((e.target as HTMLElement).closest('.media-clip-handle'))return;seekTo(frac(e.clientX)*duration);}}>
    {duration>0&&<span className="media-clip-range" style={{left:`${left}%`,width:`${width}%`}}/>}
    {duration>0&&<button type="button" className="media-clip-handle is-start" style={{left:`calc(${left}% - 7px)`}} aria-label="Trim start" onPointerDown={e=>pointerDown('start',e)}/>}
    {duration>0&&<button type="button" className="media-clip-handle is-end" style={{left:`calc(${left+width}% - 7px)`}} aria-label="Trim end" onPointerDown={e=>pointerDown('end',e)}/>}
   </div>
   <p className="media-clip-times"><span>{time(edit.trimStart)}</span><span>{time(at)} playing</span><span>{time(edit.trimEnd)}</span><small>{time(duration)} total</small></p>
   {!embedded&&<p className="media-clip-note">{drive?'Google Drive clip: trim and mute apply in the quiz. If nothing plays, confirm sharing is “Anyone with the link” (Viewer), or upload the file instead.':'Linked clips: trim and mute apply in the quiz; export trimmed file is only for uploaded clips.'}</p>}
   {exporting&&<p className="media-clip-note" role="status">{exporting}</p>}
   <div className="media-clip-toolbar">
    <button type="button" disabled={!hist.canUndo} onClick={hist.undo} aria-label="Undo"><Undo2 size={16}/>Undo</button>
    <button type="button" disabled={!hist.canRedo} onClick={hist.redo} aria-label="Redo"><Redo2 size={16}/>Redo</button>
    <button type="button" disabled={!duration} onClick={()=>hist.reset(base)} aria-label="Reset trim"><RotateCcw size={16}/>Reset</button>
    <button type="button" aria-pressed={edit.muted} onClick={()=>hist.set({...edit,muted:!edit.muted})}>{edit.muted?<VolumeX size={16}/>:<Volume2 size={16}/>}{edit.muted?'Unmute':'Mute'}</button>
    <span className="media-clip-download">
     <button type="button" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Download size={16}/>Download<ChevronDown size={14}/></button>
     {menu&&<span className="media-clip-download-menu" role="menu">
      <button type="button" role="menuitem" onClick={()=>{setMenu(false);void downloadOriginal(src,kind==='video'?'video.mp4':'audio.webm');}}>Original file</button>
      <button type="button" role="menuitem" disabled={!embedded||kind!=='audio'||editIsDefault(edit,duration)} onClick={()=>{setMenu(false);void downloadEdited();}} title={embedded&&kind==='audio'?'':'Uploaded audio only'}>Edited trim</button>
     </span>}
    </span>
   </div>
  </section>
 </div>;
}