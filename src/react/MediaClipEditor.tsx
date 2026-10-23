import React,{useEffect,useRef,useState} from 'react';
import {X,Check,Undo2,Redo2,Volume2,VolumeX,Download,ChevronDown,RotateCcw,Play,Pause,AudioLines,RotateCw,ArrowLeftToLine,ArrowRightToLine,Minus,Plus} from 'lucide-react';
import {Button} from './components/Button';
import {driveFileId,isDriveLink,resolveMediaPlaybackSrc} from '../question-types.js';
import {playPreset} from '../feedback-sounds.js';

export type MediaEdit={trimStart:number;trimEnd:number;muted:boolean;volume?:number};

const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const fine=(s:number)=>`${time(s)}.${Math.floor((s%1)*10)}`;
const SPEEDS=[0.5,0.75,1,1.25,1.5,2];
export const isEmbeddedMedia=(src:string)=>src.startsWith('data:');

export function defaultEdit(duration:number):MediaEdit{
 const d=Math.max(0,duration||0);
 return {trimStart:0,trimEnd:d||0,muted:false,volume:1};
}
export function normalizeEdit(edit:MediaEdit|undefined,duration:number):MediaEdit{
 const d=Math.max(0,duration||0);
 if(!d)return defaultEdit(0);
 if(!edit)return defaultEdit(d);
 let {trimStart,trimEnd,muted}=edit;
 trimStart=Math.max(0,Math.min(trimStart,d-0.05));
 trimEnd=Math.max(trimStart+0.05,Math.min(trimEnd,d));
 const volume=Number.isFinite(edit.volume)?Math.max(0,Math.min(1,Number(edit.volume))):1;
 return {trimStart,trimEnd,muted:!!muted,volume};
}
export function editIsDefault(edit:MediaEdit|undefined,duration:number){
 const n=normalizeEdit(edit,duration);
 return !n.muted&&n.volume===1&&n.trimStart<=0.01&&Math.abs(n.trimEnd-duration)<=0.05;
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
  const dest=ctx.createMediaStreamDestination(),gain=ctx.createGain();
  gain.gain.value=edit.muted?0:(edit.volume??1);
  slice.connect(gain).connect(dest);
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
 const [draft,setDraft]=useState<MediaEdit|null>(null);
 const [menu,setMenu]=useState(false);
 const [exporting,setExporting]=useState('');
 const [playing,setPlaying]=useState(false);
 const [speed,setSpeed]=useState(1);
 const base=defaultEdit(duration);
 const hist=useHistory(normalizeEdit(initial,duration||0));
 const edit=normalizeEdit(draft??hist.state,duration||0);
 const embedded=isEmbeddedMedia(src);
 const playback=resolveMediaPlaybackSrc(src);
 const drive=!!driveFileId(src)||isDriveLink(src);

 useEffect(()=>{
  const el=media.current;if(!el)return;
  const meta=()=>{const d=el.duration;if(Number.isFinite(d)&&d>0){setDuration(d);hist.reset(normalizeEdit(initial,d));}};
  el.addEventListener('loadedmetadata',meta);el.addEventListener('durationchange',meta);
  meta();
  return()=>{el.removeEventListener('loadedmetadata',meta);el.removeEventListener('durationchange',meta);};
 },[playback]);

 useEffect(()=>{const el=media.current;if(!el)return;el.muted=edit.muted;el.volume=edit.volume??1;},[edit.muted,edit.volume,src]);
 useEffect(()=>{const el=media.current;if(el)el.playbackRate=speed;},[speed,src]);

 useEffect(()=>{const el=media.current;if(!el)return;const p=()=>setPlaying(true),q=()=>setPlaying(false);el.addEventListener('play',p);el.addEventListener('pause',q);el.addEventListener('ended',q);return()=>{el.removeEventListener('play',p);el.removeEventListener('pause',q);el.removeEventListener('ended',q);};},[src]);

 function toggleSelection(){
  const el=media.current;if(!el)return;
  if(el.paused){if(el.currentTime<edit.trimStart||el.currentTime>=edit.trimEnd-0.02)el.currentTime=edit.trimStart;el.play().catch(()=>{});}
  else el.pause();
 }

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
 function commit(next:MediaEdit,sound=true){hist.set(normalizeEdit(next,duration));if(sound)playPreset('tick');}
 function setStart(t:number){commit({...edit,trimStart:Math.min(t,edit.trimEnd-0.05)});}
 function setEnd(t:number){commit({...edit,trimEnd:Math.max(t,edit.trimStart+0.05)});}
 function pointerDown(which:'start'|'end',e:React.PointerEvent){
  e.preventDefault();setDrag(which);setDraft(edit);(e.target as HTMLElement).setPointerCapture(e.pointerId);
 }
 function pointerMove(e:React.PointerEvent){
  if(!drag||!duration)return;
  const t=frac(e.clientX)*duration;
  setDraft(normalizeEdit(drag==='start'?{...edit,trimStart:Math.min(t,edit.trimEnd-0.05)}:{...edit,trimEnd:Math.max(t,edit.trimStart+0.05)},duration));
 }
 function pointerUp(e:React.PointerEvent){
  if(!drag)return;
  setDrag(null);try{(e.target as HTMLElement).releasePointerCapture(e.pointerId);}catch{}
  if(draft)commit(draft);setDraft(null);
 }
 function handleKey(which:'start'|'end',e:React.KeyboardEvent){
  const step=e.shiftKey?1:0.1,dir=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:e.key==='ArrowRight'||e.key==='ArrowUp'?1:0;
  if(!dir)return;e.preventDefault();e.stopPropagation();
  if(which==='start')setStart(edit.trimStart+dir*step);else setEnd(edit.trimEnd+dir*step);
 }
 function onKey(e:React.KeyboardEvent){
  const tag=(e.target as HTMLElement).tagName;
  if(tag==='INPUT'||tag==='SELECT')return;
  if(e.key==='Escape'){e.preventDefault();onCancel();}
  else if(e.key===' '&&tag!=='BUTTON'){e.preventDefault();toggleSelection();}
  else if(e.key==='ArrowLeft'){e.preventDefault();seekTo(at-(e.shiftKey?5:1));}
  else if(e.key==='ArrowRight'){e.preventDefault();seekTo(at+(e.shiftKey?5:1));}
  else if(e.key.toLowerCase()==='i')setStart(at);
  else if(e.key.toLowerCase()==='o')setEnd(at);
 }

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
  playPreset('go');
  onSave(editIsDefault(edit,duration)?undefined:edit);
 }

 const left=duration?edit.trimStart/duration*100:0;
 const width=duration?(edit.trimEnd-edit.trimStart)/duration*100:100;
 const vol=Math.round((edit.muted?0:edit.volume??1)*100);
 const nudge=(label:string,value:number,set:(t:number)=>void)=><span className="media-clip-time"><i>{label}</i><span className="media-clip-nudge"><button type="button" aria-label={`${label} earlier`} disabled={!duration} onClick={()=>set(value-0.1)}><Minus size={13}/></button><b>{fine(value)}</b><button type="button" aria-label={`${label} later`} disabled={!duration} onClick={()=>set(value+0.1)}><Plus size={13}/></button></span></span>;

 return <div className="media-clip-layer" role="presentation" onKeyDown={onKey}>
  <button type="button" className="question-tools-scrim" aria-label="Close editor" onClick={onCancel}/>
  <section className="media-clip-editor" role="dialog" aria-modal="true" aria-labelledby="media-clip-title" tabIndex={-1}>
   <header className="media-clip-head"><button type="button" aria-label="Cancel" onClick={onCancel}><X size={18}/></button><h2 id="media-clip-title">{title}</h2><Button size="sm" onClick={done}><Check size={15}/>Done</Button></header>
   <div className="media-clip-stage" data-kind={kind}>{kind==='video'?<video ref={media as React.RefObject<HTMLVideoElement>} src={playback} playsInline preload="metadata" onClick={toggleSelection}/>:<audio ref={media as React.RefObject<HTMLAudioElement>} src={playback} preload="metadata" hidden/>}{kind==='audio'&&<div className="media-clip-audio-face" aria-hidden="true" data-playing={playing||undefined}><AudioLines size={30}/><strong>{fine(Math.max(0,at-edit.trimStart))}</strong><span>of {fine(edit.trimEnd-edit.trimStart)} selected</span></div>}</div>
   <div className="media-clip-scrubber" ref={scrub} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onClick={e=>{if((e.target as HTMLElement).closest('.media-clip-handle'))return;seekTo(frac(e.clientX)*duration);}}>
    {duration>0&&<><span className="media-clip-cut" style={{left:0,width:`${left}%`}}/><span className="media-clip-cut" style={{left:`${left+width}%`,right:0}}/></>}
    {duration>0&&<span className="media-clip-range" style={{left:`${left}%`,width:`${width}%`}}/>}
    {duration>0&&<span className="media-clip-playhead" style={{left:`${Math.min(100,Math.max(0,at/duration*100))}%`}}/>}
    {duration>0&&<button type="button" className="media-clip-handle is-start" style={{left:`calc(${left}% - 9px)`}} aria-label={`Trim start ${fine(edit.trimStart)}. Use arrow keys to adjust`} onKeyDown={e=>handleKey('start',e)} onPointerDown={e=>pointerDown('start',e)}><b>{time(edit.trimStart)}</b></button>}
    {duration>0&&<button type="button" className="media-clip-handle is-end" style={{left:`calc(${left+width}% - 9px)`}} aria-label={`Trim end ${fine(edit.trimEnd)}. Use arrow keys to adjust`} onKeyDown={e=>handleKey('end',e)} onPointerDown={e=>pointerDown('end',e)}><b>{time(edit.trimEnd)}</b></button>}
   </div>
   <div className="media-clip-transport">
    <button type="button" className="media-clip-skip" disabled={!duration} aria-label="Back 5 seconds" onClick={()=>seekTo(at-5)}><RotateCcw size={16}/><small>5</small></button>
    <button type="button" className="media-clip-play" onClick={toggleSelection} disabled={!duration} aria-label={playing?'Pause':'Play selection'}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button>
    <button type="button" className="media-clip-skip" disabled={!duration} aria-label="Forward 5 seconds" onClick={()=>seekTo(at+5)}><RotateCw size={16}/><small>5</small></button>
    <span className="media-clip-clock"><b>{fine(at)}</b> / {fine(duration)}</span>
    <select className="media-clip-speed" aria-label="Preview speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{SPEEDS.map(s=><option key={s} value={s}>{s}×</option>)}</select>
   </div>
   <div className="media-clip-marks">
    <button type="button" disabled={!duration} onClick={()=>setStart(at)}><ArrowLeftToLine size={15}/>Set start here</button>
    <button type="button" disabled={!duration} onClick={()=>setEnd(at)}><ArrowRightToLine size={15}/>Set end here</button>
   </div>
   <div className="media-clip-times">{nudge('Start',edit.trimStart,setStart)}<span className="media-clip-time is-len"><i>Length</i><b>{fine(Math.max(0,edit.trimEnd-edit.trimStart))}</b></span>{nudge('End',edit.trimEnd,setEnd)}</div>
   <label className="media-clip-volume"><button type="button" aria-pressed={edit.muted} aria-label={edit.muted?'Unmute':'Mute'} onClick={()=>commit({...edit,muted:!edit.muted},false)}>{edit.muted||vol===0?<VolumeX size={17}/>:<Volume2 size={17}/>}</button><input type="range" min={0} max={100} step={5} value={vol} aria-label="Volume" onChange={e=>setDraft({...edit,muted:false,volume:Number(e.target.value)/100})} onPointerUp={()=>{if(draft){commit(draft,false);setDraft(null);}}} onKeyUp={()=>{if(draft){commit(draft,false);setDraft(null);}}}/><span>{vol}%</span></label>
   {!embedded&&<p className="media-clip-note">{drive?'Google Drive clip: trim and mute apply in the quiz. If nothing plays, confirm sharing is “Anyone with the link” (Viewer), or upload the file instead.':'Linked clips: trim, volume and mute apply in the quiz; exporting a trimmed file works only for uploaded clips.'}</p>}
   {exporting&&<p className="media-clip-note" role="status">{exporting}</p>}
   <div className="media-clip-toolbar">
    <button type="button" disabled={!hist.canUndo} onClick={hist.undo} aria-label="Undo"><Undo2 size={16}/>Undo</button>
    <button type="button" disabled={!hist.canRedo} onClick={hist.redo} aria-label="Redo"><Redo2 size={16}/>Redo</button>
    <button type="button" disabled={!duration||editIsDefault(edit,duration)} onClick={()=>commit(base,false)} aria-label="Reset all edits"><RotateCcw size={16}/>Reset</button>
    <span className="media-clip-download">
     <button type="button" aria-expanded={menu} onClick={()=>setMenu(v=>!v)}><Download size={16}/>Download<ChevronDown size={14}/></button>
     {menu&&<span className="media-clip-download-menu" role="menu">
      <button type="button" role="menuitem" onClick={()=>{setMenu(false);void downloadOriginal(src,kind==='video'?'video.mp4':'audio.webm');}}>Original file</button>
      <button type="button" role="menuitem" disabled={!embedded||kind!=='audio'||editIsDefault(edit,duration)} onClick={()=>{setMenu(false);void downloadEdited();}} title={embedded&&kind==='audio'?'':'Uploaded audio only'}>Edited clip</button>
     </span>}
    </span>
   </div>
   <p className="media-clip-keys">Space play · ←/→ seek · I / O set start / end</p>
  </section>
 </div>;
}
