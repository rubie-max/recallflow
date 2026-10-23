import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Check,Undo2,Redo2,Volume2,VolumeX,Download,ChevronDown,RotateCcw,RotateCw,Play,Pause,AudioLines,ArrowLeftToLine,ArrowRightToLine,Minus,Plus,Repeat,Wand2,AlertCircle,ExternalLink,LoaderCircle,Save} from 'lucide-react';
import {Button} from './components/Button';
import {driveFileId,isDriveLink,resolveMediaPlaybackSrc,saneDuration,blobToDataUrl} from '../question-types.js';
import {playPreset} from '../feedback-sounds.js';

/* ───────────────────────── model ───────────────────────── */
export type MediaEdit={trimStart:number;trimEnd:number;muted:boolean;volume?:number;fadeIn?:number;fadeOut?:number;gain?:number};
export type Peaks={peaks:number[];duration:number;peak:number;channels:number;sampleRate:number};
type Norm=Required<MediaEdit>;

const MIN_LEN=0.1,SPEEDS=[0.5,0.75,1,1.25,1.5,2];
const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const num=(v:unknown,fb:number)=>typeof v==='number'&&Number.isFinite(v)?v:fb;
export const fmtTime=(s:number)=>{s=Math.max(0,num(s,0));return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
export const fmtFine=(s:number)=>`${fmtTime(s)}.${Math.floor((Math.max(0,num(s,0))%1)*10)}`;
export const isEmbeddedMedia=(src:string)=>/^(data|blob):/i.test(src||'');
export const playbackSrc=(src:string)=>isEmbeddedMedia(src)?src:resolveMediaPlaybackSrc(src);
const AC=()=>(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;

export function defaultEdit(duration:number):Norm{const d=Math.max(0,num(duration,0));return {trimStart:0,trimEnd:d,muted:false,volume:1,fadeIn:0,fadeOut:0,gain:1};}
export function normalizeEdit(edit:MediaEdit|undefined|null,duration:number):Norm{
 const d=Math.max(0,num(duration,0));
 if(!d||!edit)return defaultEdit(d);
 const trimStart=clamp(num(edit.trimStart,0),0,Math.max(0,d-MIN_LEN));
 const trimEnd=clamp(num(edit.trimEnd,d),Math.min(d,trimStart+MIN_LEN),d);
 const len=Math.max(MIN_LEN,trimEnd-trimStart);
 return {trimStart,trimEnd,muted:!!edit.muted,volume:clamp(num(edit.volume,1),0,1),fadeIn:clamp(num(edit.fadeIn,0),0,len/2),fadeOut:clamp(num(edit.fadeOut,0),0,len/2),gain:clamp(num(edit.gain,1),0.25,4)};
}
export function editIsDefault(edit:MediaEdit|undefined|null,duration:number){
 const n=normalizeEdit(edit,duration);
 return !n.muted&&n.volume===1&&n.gain===1&&n.fadeIn===0&&n.fadeOut===0&&n.trimStart<=0.01&&Math.abs(n.trimEnd-duration)<=0.05;
}
/** Linear gain the clip should play at time t (0 = silent). Includes mute, volume, boost and fades. */
export function levelAt(e:MediaEdit,t:number){
 if(e.muted)return 0;
 let a=1;
 if(e.fadeIn&&e.fadeIn>0)a=Math.min(a,(t-e.trimStart)/e.fadeIn);
 if(e.fadeOut&&e.fadeOut>0)a=Math.min(a,(e.trimEnd-t)/e.fadeOut);
 return clamp(a,0,1)*num(e.volume,1)*num(e.gain,1);
}

/* ───────────────────────── duration & probing ───────────────────────── */
function readDuration(el:HTMLMediaElement){
 const d=saneDuration(el.duration);if(d)return d;
 try{const s=el.seekable;if(s.length)return saneDuration(s.end(s.length-1));}catch{}
 return 0;
}
/** Real duration of a media element. Fixes MediaRecorder WebM (Infinity/NaN) by seeking to the end once. */
export function resolveMediaDuration(el:HTMLMediaElement,timeoutMs=15000):Promise<number>{
 return new Promise(resolve=>{
  let done=false,fixing=false;
  const evs=['loadedmetadata','durationchange','loadeddata','canplay'];
  const finish=(d:number)=>{if(done)return;done=true;window.clearTimeout(timer);evs.forEach(ev=>el.removeEventListener(ev,check));el.removeEventListener('error',onErr);resolve(d);};
  const check=()=>{
   const d=readDuration(el);if(d){finish(d);return;}
   if(el.readyState>=1&&!fixing&&!Number.isFinite(el.duration)){
    fixing=true;
    const back=()=>{el.removeEventListener('seeked',back);const d2=readDuration(el);try{el.currentTime=0;}catch{}if(d2)finish(d2);};
    el.addEventListener('seeked',back);
    try{el.currentTime=1e101;}catch{el.removeEventListener('seeked',back);fixing=false;}
   }
  };
  const onErr=()=>finish(0);
  const timer=window.setTimeout(()=>finish(readDuration(el)),timeoutMs);
  evs.forEach(ev=>el.addEventListener(ev,check));el.addEventListener('error',onErr);
  check();
 });
}
export function seekElement(el:HTMLMediaElement,t:number){
 return new Promise<void>(resolve=>{let timer=0;const done=()=>{el.removeEventListener('seeked',done);window.clearTimeout(timer);resolve();};el.addEventListener('seeked',done);timer=window.setTimeout(done,3000);try{el.currentTime=t;}catch{done();}});
}
/** Can this browser play the URL, and how long is it? Works for data:, blob: and https. */
export function probeMediaSrc(src:string,kind:'audio'|'video',timeoutMs=15000):Promise<{ok:boolean;duration:number}>{
 return new Promise(resolve=>{
  const el=document.createElement(kind);el.preload='auto';el.muted=true;(el as HTMLVideoElement).playsInline=true;
  let settled=false;
  const finish=(ok:boolean,duration:number)=>{if(settled)return;settled=true;el.removeAttribute('src');el.load();resolve({ok,duration});};
  el.addEventListener('error',()=>finish(false,0),{once:true});
  el.src=playbackSrc(src);
  void resolveMediaDuration(el,timeoutMs).then(d=>finish(!el.error&&(d>0||el.readyState>=1),d));
 });
}

/* ───────────────────────── decoding, peaks, rendering ───────────────────────── */
export async function decodeAudioFromSrc(src:string):Promise<AudioBuffer>{
 const res=await fetch(playbackSrc(src),isEmbeddedMedia(src)?undefined:{mode:'cors'});
 if(!res.ok)throw new Error('Could not fetch this clip.');
 const ab=await res.arrayBuffer();const Ctx=AC();if(!Ctx)throw new Error('Web Audio is not available in this browser.');
 const ctx=new Ctx();
 try{return await ctx.decodeAudioData(ab);}finally{ctx.close().catch(()=>{});}
}
export function computePeaks(buf:AudioBuffer,bars:number):Peaks{
 const n=buf.length,block=Math.max(1,Math.floor(n/bars)),chs=buf.numberOfChannels,peaks=new Array<number>(bars).fill(0);let peak=0;
 for(let c=0;c<chs;c++){const d=buf.getChannelData(c);for(let i=0;i<bars;i++){const s=i*block,e=Math.min(n,s+block);let m=0;for(let j=s;j<e;j++){const v=d[j]<0?-d[j]:d[j];if(v>m)m=v;}if(m>peaks[i])peaks[i]=m;if(m>peak)peak=m;}}
 return {peaks:peaks.map(v=>peak?v/peak:0),duration:buf.duration,peak,channels:chs,sampleRate:buf.sampleRate};
}
const peakCache=new Map<string,Promise<Peaks|null>>();
const cacheKey=(src:string,bars:number)=>`${bars}:${src.length}:${src.slice(0,96)}:${src.slice(-96)}`;
/** Normalised peaks for a waveform. Cached. Resolves null when the file can't be decoded (e.g. CORS-blocked link). */
export function decodePeaks(src:string,bars=240):Promise<Peaks|null>{
 const key=cacheKey(src,bars);const hit=peakCache.get(key);if(hit)return hit;
 const p=decodeAudioFromSrc(src).then(b=>computePeaks(b,bars)).catch(()=>null);
 peakCache.set(key,p);if(peakCache.size>16)peakCache.delete(peakCache.keys().next().value as string);
 return p;
}
/** Absolute peak (0–1) between two fractions of the file. */
export function peakWithin(p:Peaks,from:number,to:number){
 const n=p.peaks.length,a=clamp(Math.floor(from*n),0,n-1),b=clamp(Math.ceil(to*n),a+1,n);let m=0;
 for(let i=a;i<b;i++)if(p.peaks[i]>m)m=p.peaks[i];return m*p.peak;
}
/** Offline render of the selection with volume, boost and fades applied. Instant (no realtime playback). */
export async function renderEditedAudio(src:string,edit:MediaEdit|undefined,opts:{mono?:boolean;sampleRate?:number}={}):Promise<AudioBuffer>{
 const buf=await decodeAudioFromSrc(src);
 const e=normalizeEdit(edit,buf.duration),len=Math.max(MIN_LEN,e.trimEnd-e.trimStart);
 const sr=opts.sampleRate||buf.sampleRate,chs=opts.mono?1:buf.numberOfChannels;
 const Off=(window.OfflineAudioContext||(window as any).webkitOfflineAudioContext) as typeof OfflineAudioContext;
 const off=new Off(chs,Math.ceil(len*sr),sr);
 const s=off.createBufferSource();s.buffer=buf;const g=off.createGain();
 const base=e.muted?0:e.volume*e.gain;
 g.gain.setValueAtTime(e.fadeIn>0?0:base,0);
 if(e.fadeIn>0)g.gain.linearRampToValueAtTime(base,e.fadeIn);
 if(e.fadeOut>0){g.gain.setValueAtTime(base,Math.max(e.fadeIn,len-e.fadeOut));g.gain.linearRampToValueAtTime(0,len);}
 s.connect(g).connect(off.destination);s.start(0,e.trimStart,len);
 return off.startRendering();
}
export function audioBufferToWav(buf:AudioBuffer):Blob{
 const chs=buf.numberOfChannels,sr=buf.sampleRate,n=buf.length,bytes=44+n*chs*2;
 const ab=new ArrayBuffer(bytes),dv=new DataView(ab);
 const str=(o:number,s:string)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
 str(0,'RIFF');dv.setUint32(4,bytes-8,true);str(8,'WAVE');str(12,'fmt ');dv.setUint32(16,16,true);dv.setUint16(20,1,true);dv.setUint16(22,chs,true);dv.setUint32(24,sr,true);dv.setUint32(28,sr*chs*2,true);dv.setUint16(32,chs*2,true);dv.setUint16(34,16,true);str(36,'data');dv.setUint32(40,n*chs*2,true);
 const data=Array.from({length:chs},(_,c)=>buf.getChannelData(c));
 let o=44;for(let i=0;i<n;i++)for(let c=0;c<chs;c++){const v=clamp(data[c][i],-1,1);dv.setInt16(o,v<0?v*0x8000:v*0x7fff,true);o+=2;}
 return new Blob([ab],{type:'audio/wav'});
}
/** Compress an AudioBuffer with MediaRecorder. Runs in real time (browsers have no offline Opus encoder) — pass onProgress/signal. */
export async function encodeAudioBuffer(buf:AudioBuffer,{bitrate=48000,onProgress,signal}:{bitrate?:number;onProgress?:(p:number)=>void;signal?:AbortSignal}={}):Promise<Blob>{
 if(typeof MediaRecorder==='undefined')throw new Error('This browser cannot compress audio.');
 const Ctx=AC();if(!Ctx)throw new Error('Web Audio is not available in this browser.');
 const ctx=new Ctx();
 try{
  await ctx.resume().catch(()=>{});
  if(ctx.state!=='running')throw new Error('Audio is blocked until you interact with the page. Tap anywhere, then try again.');
  const dest=ctx.createMediaStreamDestination(),s=ctx.createBufferSource();s.buffer=buf;s.connect(dest);
  const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const rec=new MediaRecorder(dest.stream,{...(mime?{mimeType:mime}:{}),audioBitsPerSecond:bitrate});
  const chunks:Blob[]=[];rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise<Blob>(res=>{rec.onstop=()=>res(new Blob(chunks,{type:rec.mimeType||mime||'audio/webm'}));});
  const t0=ctx.currentTime;let aborted=false;
  const tick=window.setInterval(()=>onProgress?.(clamp((ctx.currentTime-t0)/buf.duration,0,0.99)),200);
  const stop=()=>{window.clearInterval(tick);if(rec.state!=='inactive')rec.stop();};
  s.onended=stop;
  signal?.addEventListener('abort',()=>{aborted=true;try{s.stop();}catch{}stop();},{once:true});
  rec.start(250);s.start();
  const blob=await done;
  if(aborted)throw new Error('Cancelled.');
  onProgress?.(1);
  return blob;
 }finally{ctx.close().catch(()=>{});}
}
/** Compressed (WebM/Opus) export of the edited selection. Kept for API compatibility. */
export async function exportTrimmedAudio(src:string,edit:MediaEdit,opts:{onProgress?:(p:number)=>void;signal?:AbortSignal}={}):Promise<Blob>{
 return encodeAudioBuffer(await renderEditedAudio(src,edit),{bitrate:64000,...opts});
}
export async function exportTrimmedWav(src:string,edit:MediaEdit):Promise<Blob>{return audioBufferToWav(await renderEditedAudio(src,edit));}
/** Real video export: plays the selection through a canvas + Web Audio graph into MediaRecorder. Real time; uploaded clips only. */
export async function exportTrimmedVideo(src:string,edit:MediaEdit,opts:{onProgress?:(p:number)=>void;signal?:AbortSignal}={}):Promise<Blob>{
 if(typeof MediaRecorder==='undefined')throw new Error('This browser cannot export video.');
 if(!isEmbeddedMedia(src))throw new Error('Exporting an edited video needs an uploaded clip.');
 const v=document.createElement('video');v.src=playbackSrc(src);v.playsInline=true;v.preload='auto';v.muted=false;
 v.style.cssText='position:fixed;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none';document.body.appendChild(v);
 let ctx:AudioContext|null=null;
 try{
  const d=await resolveMediaDuration(v);if(!d)throw new Error('Could not read this video.');
  const e=normalizeEdit(edit,d),len=Math.max(MIN_LEN,e.trimEnd-e.trimStart);
  await new Promise<void>((res,rej)=>{if(v.readyState>=2)return res();v.addEventListener('loadeddata',()=>res(),{once:true});v.addEventListener('error',()=>rej(new Error('Could not read this video.')),{once:true});});
  const w=v.videoWidth||640,h=v.videoHeight||360,scale=Math.min(1,1280/Math.max(w,h));
  const canvas=document.createElement('canvas');canvas.width=Math.max(2,Math.round(w*scale)&~1);canvas.height=Math.max(2,Math.round(h*scale)&~1);
  const c2=canvas.getContext('2d');if(!c2)throw new Error('Canvas is not available.');
  const stream=canvas.captureStream(30);
  let gain:GainNode|null=null;const Ctx=AC();
  if(!e.muted&&Ctx){ctx=new Ctx();await ctx.resume().catch(()=>{});const node=ctx.createMediaElementSource(v);gain=ctx.createGain();const dest=ctx.createMediaStreamDestination();node.connect(gain).connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}
  else v.muted=true;
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const rec=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:2500000});
  const chunks:Blob[]=[];rec.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};
  const stopped=new Promise<Blob>(res=>{rec.onstop=()=>res(new Blob(chunks,{type:rec.mimeType||mime||'video/webm'}));});
  await seekElement(v,e.trimStart);
  c2.drawImage(v,0,0,canvas.width,canvas.height);
  rec.start(500);
  let raf=0,aborted=false;
  const finish=()=>{cancelAnimationFrame(raf);v.pause();if(rec.state!=='inactive')rec.stop();};
  const draw=()=>{
   const t=v.currentTime;c2.drawImage(v,0,0,canvas.width,canvas.height);
   if(gain&&ctx)gain.gain.setTargetAtTime(levelAt(e,t),ctx.currentTime,0.01);
   opts.onProgress?.(clamp((t-e.trimStart)/len,0,1));
   if(t>=e.trimEnd-0.02||v.ended){finish();return;}
   raf=requestAnimationFrame(draw);
  };
  opts.signal?.addEventListener('abort',()=>{aborted=true;finish();},{once:true});
  await v.play();
  raf=requestAnimationFrame(draw);
  const blob=await stopped;
  if(aborted)throw new Error('Cancelled.');
  return blob;
 }finally{v.pause();v.removeAttribute('src');v.load();v.remove();ctx?.close().catch(()=>{});}
}
export function saveBlob(blob:Blob,name:string){
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
async function downloadOriginal(src:string,name:string){
 try{const blob=await (await fetch(playbackSrc(src),isEmbeddedMedia(src)?undefined:{mode:'cors'})).blob();saveBlob(blob,name);}
 catch{window.open(src,'_blank','noopener');}
}
const extFor=(mime:string,kind:'audio'|'video')=>/mp4/.test(mime)?(kind==='audio'?'m4a':'mp4'):/ogg/.test(mime)?'ogg':/wav/.test(mime)?'wav':'webm';

/* ───────────────────────── shared playback hook (editor + players) ───────────────────────── */
export type ClipPlayback={duration:number;at:number;playing:boolean;failed:boolean;ready:boolean;clip:Norm;seek:(t:number,free?:boolean)=>void;play:()=>void;pause:()=>void;toggle:()=>void;levels:(bars:number)=>number[]|null};
/**
 * Applies a MediaEdit to a media element: trim loop, mute, volume, boost and fades.
 * Uses a Web Audio graph for data:/blob: sources (allows gain > 1 and live levels); plain element volume for links.
 * Render the element with key={src} so a fresh element is created when the source changes.
 */
export function useClipPlayback(ref:React.RefObject<HTMLMediaElement|null>,src:string,edit:MediaEdit|undefined|null,opts:{durationHint?:number;loop?:boolean;analyser?:boolean}={}):ClipPlayback{
 const [duration,setDuration]=useState(0),[at,setAt]=useState(0),[playing,setPlaying]=useState(false),[failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 const graph=useRef<{el:HTMLMediaElement;ctx:AudioContext;gain:GainNode;analyser?:AnalyserNode;data?:Uint8Array}|null>(null);
 const clip=normalizeEdit(edit,duration);
 const clipRef=useRef(clip);clipRef.current=clip;
 const durRef=useRef(duration);durRef.current=duration;
 const loopRef=useRef(!!opts.loop);loopRef.current=!!opts.loop;
 const embedded=isEmbeddedMedia(src);const embeddedRef=useRef(embedded);embeddedRef.current=embedded;
 const wantAnalyser=useRef(!!opts.analyser);

 useEffect(()=>{
  const el=ref.current;
  setAt(0);setPlaying(false);setFailed(false);setReady(false);setDuration(opts.durationHint||0);
  if(!el)return;
  let cancelled=false;
  const onErr=()=>{if(!cancelled)setFailed(true);};
  const onReady=()=>{if(!cancelled)setReady(true);};
  el.addEventListener('error',onErr);el.addEventListener('loadeddata',onReady);
  if(el.readyState>=2)setReady(true);
  void resolveMediaDuration(el).then(d=>{if(!cancelled&&d)setDuration(d);});
  if(embedded)void decodePeaks(src).then(m=>{if(!cancelled&&m?.duration)setDuration(prev=>prev||m.duration);});
  return()=>{cancelled=true;el.removeEventListener('error',onErr);el.removeEventListener('loadeddata',onReady);el.pause();};
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[src]);
 useEffect(()=>{if(opts.durationHint)setDuration(p=>p||opts.durationHint!);},[opts.durationHint]);
 useEffect(()=>()=>{graph.current?.ctx.close().catch(()=>{});graph.current=null;},[]);

 const ensureGraph=useCallback(()=>{
  const el=ref.current;if(!el||!embeddedRef.current)return null;
  if(graph.current&&graph.current.el!==el){graph.current.ctx.close().catch(()=>{});graph.current=null;}
  if(graph.current)return graph.current;
  try{
   const Ctx=AC();if(!Ctx)return null;
   const ctx=new Ctx(),node=ctx.createMediaElementSource(el),gain=ctx.createGain();
   let analyser:AnalyserNode|undefined;
   if(wantAnalyser.current){analyser=ctx.createAnalyser();analyser.fftSize=128;analyser.smoothingTimeConstant=0.7;}
   node.connect(gain);if(analyser){gain.connect(analyser);analyser.connect(ctx.destination);}else gain.connect(ctx.destination);
   el.volume=1;el.muted=false;
   graph.current={el,ctx,gain,analyser};
  }catch{graph.current=null;}
  return graph.current;
 },[ref]);
 const applyLevel=useCallback((t:number)=>{
  const el=ref.current;if(!el)return;const c=clipRef.current,lvl=levelAt(c,t),g=graph.current;
  if(g&&g.el===el){g.gain.gain.setTargetAtTime(lvl,g.ctx.currentTime,0.015);el.muted=false;el.volume=1;}
  else{el.muted=c.muted;try{el.volume=clamp(lvl,0,1);}catch{}}
 },[ref]);
 useEffect(()=>{const el=ref.current;if(el)applyLevel(el.currentTime);},[clip.muted,clip.volume,clip.gain,clip.fadeIn,clip.fadeOut,clip.trimStart,clip.trimEnd,applyLevel,ref]);

 useEffect(()=>{
  const el=ref.current;if(!el)return;
  let raf=0,last=-1;
  const step=()=>{
   const c=clipRef.current,t=el.currentTime;
   if(Math.abs(t-last)>0.03){last=t;setAt(t);}
   applyLevel(t);
   if(durRef.current&&t>=c.trimEnd-0.03){
    if(loopRef.current){el.currentTime=c.trimStart;}
    else{el.pause();el.currentTime=c.trimStart;setAt(c.trimStart);return;}
   }
   if(!el.paused)raf=requestAnimationFrame(step);
  };
  const onPlay=()=>{const c=clipRef.current;if(durRef.current&&el.currentTime<c.trimStart-0.01)el.currentTime=c.trimStart;setPlaying(true);cancelAnimationFrame(raf);raf=requestAnimationFrame(step);};
  const onPause=()=>{setPlaying(false);cancelAnimationFrame(raf);setAt(el.currentTime);};
  const onEnded=()=>{setPlaying(false);cancelAnimationFrame(raf);const c=clipRef.current;el.currentTime=c.trimStart;setAt(c.trimStart);};
  const onTime=()=>{if(el.paused)setAt(el.currentTime);};
  el.addEventListener('play',onPlay);el.addEventListener('pause',onPause);el.addEventListener('ended',onEnded);el.addEventListener('timeupdate',onTime);
  if(!el.paused)onPlay();
  return()=>{cancelAnimationFrame(raf);el.removeEventListener('play',onPlay);el.removeEventListener('pause',onPause);el.removeEventListener('ended',onEnded);el.removeEventListener('timeupdate',onTime);};
 },[src,applyLevel,ref]);

 const seek=useCallback((t:number,free=false)=>{
  const el=ref.current;if(!el)return;const c=clipRef.current,d=durRef.current;
  const next=d?(free?clamp(t,0,d):clamp(t,c.trimStart,c.trimEnd)):Math.max(0,t);
  try{el.currentTime=next;}catch{}setAt(next);applyLevel(next);
 },[applyLevel,ref]);
 const play=useCallback(()=>{
  const el=ref.current;if(!el)return;const c=clipRef.current,d=durRef.current;
  if(d&&(el.currentTime<c.trimStart-0.01||el.currentTime>=c.trimEnd-0.05)){try{el.currentTime=c.trimStart;}catch{}}
  const g=ensureGraph();applyLevel(el.currentTime);
  const p=el.play();
  if(g&&g.ctx.state!=='running')void g.ctx.resume().catch(()=>{});
  if(p&&typeof p.catch==='function')p.catch(()=>setFailed(true));
 },[applyLevel,ensureGraph,ref]);
 const pause=useCallback(()=>{ref.current?.pause();},[ref]);
 const toggle=useCallback(()=>{const el=ref.current;if(!el)return;if(el.paused)play();else el.pause();},[play,ref]);
 const levels=useCallback((bars:number)=>{
  const g=graph.current;if(!g?.analyser)return null;
  const data=g.data||(g.data=new Uint8Array(g.analyser.frequencyBinCount));g.analyser.getByteFrequencyData(data);
  const step=Math.max(1,Math.floor(data.length/bars));
  return Array.from({length:bars},(_,i)=>{let s=0;for(let j=0;j<step;j++)s+=data[i*step+j]||0;return s/step/255;});
 },[]);
 return {duration,at,playing,failed,ready,clip,seek,play,pause,toggle,levels};
}

/* ───────────────────────── timeline strip (waveform / filmstrip) ───────────────────────── */
async function extractFrames(src:string,duration:number,count:number,height:number,signal:AbortSignal,onFrame:(c:HTMLCanvasElement)=>void){
 const v=document.createElement('video');v.src=playbackSrc(src);v.muted=true;v.playsInline=true;v.preload='auto';
 try{
  await new Promise<void>((res,rej)=>{const t=window.setTimeout(()=>rej(new Error('timeout')),15000);v.addEventListener('loadeddata',()=>{window.clearTimeout(t);res();},{once:true});v.addEventListener('error',()=>{window.clearTimeout(t);rej(new Error('error'));},{once:true});});
  const ratio=v.videoWidth&&v.videoHeight?v.videoWidth/v.videoHeight:16/9,w=Math.max(8,Math.round(height*ratio));
  for(let i=0;i<count&&!signal.aborted;i++){
   await seekElement(v,Math.min(Math.max(0,duration-0.05),(i+0.5)/count*duration));
   if(signal.aborted)break;
   const c=document.createElement('canvas');c.width=w;c.height=height;
   c.getContext('2d')?.drawImage(v,0,0,w,height);onFrame(c);
  }
 }catch{}
 finally{v.removeAttribute('src');v.load();}
}
function useStrip(canvas:React.RefObject<HTMLCanvasElement|null>,src:string,kind:'audio'|'video',duration:number,peaks:number[]|null){
 const frames=useRef<HTMLCanvasElement[]>([]);
 const drawRef=useRef(()=>{});
 drawRef.current=()=>{
  const c=canvas.current;if(!c)return;
  const dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);if(c.width!==W||c.height!==H){c.width=W;c.height=H;}
  const g=c.getContext('2d');if(!g)return;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const fr=frames.current;
  if(fr.length){const fw=w/fr.length;fr.forEach((f,i)=>g.drawImage(f,i*fw,0,fw+0.5,h));}
  if(peaks&&peaks.length){
   const n=peaks.length,bw=w/n,video=kind==='video',mid=video?h*0.78:h/2,amp=video?h*0.2:h*0.46;
   g.fillStyle=getComputedStyle(c).getPropertyValue('--mc-wave').trim()||'#a99cff';g.globalAlpha=video?0.85:1;
   for(let i=0;i<n;i++){const bh=Math.max(1,peaks[i]*amp);g.fillRect(i*bw+bw*0.2,mid-bh,Math.max(1,bw*0.6),bh*2);}
   g.globalAlpha=1;
  }
 };
 useEffect(()=>{
  frames.current=[];drawRef.current();
  if(kind!=='video'||!duration)return;
  const ac=new AbortController();
  void extractFrames(src,duration,10,56,ac.signal,f=>{frames.current=[...frames.current,f];drawRef.current();});
  return()=>ac.abort();
 },[src,kind,duration]);
 useEffect(()=>{
  drawRef.current();
  const c=canvas.current;if(!c||typeof ResizeObserver==='undefined')return;
  const ro=new ResizeObserver(()=>drawRef.current());ro.observe(c);return()=>ro.disconnect();
 },[peaks,kind,canvas]);
}

/* ───────────────────────── history ───────────────────────── */
function useHistory<T>(initial:T){
 const [h,setH]=useState({past:[] as T[],present:initial,future:[] as T[]});
 const set=useCallback((next:T)=>setH(s=>({past:[...s.past.slice(-60),s.present],present:next,future:[]})),[]);
 const undo=useCallback(()=>setH(s=>s.past.length?{past:s.past.slice(0,-1),present:s.past[s.past.length-1],future:[s.present,...s.future]}:s),[]);
 const redo=useCallback(()=>setH(s=>s.future.length?{past:[...s.past,s.present],present:s.future[0],future:s.future.slice(1)}:s),[]);
 return {state:h.present,set,undo,redo,canUndo:h.past.length>0,canRedo:h.future.length>0};
}

/* ───────────────────────── editor ───────────────────────── */
type DragKind='start'|'end'|'move'|'seek';
type Props={
 src:string;kind:'audio'|'video';title:string;initial?:MediaEdit;
 onSave:(edit:MediaEdit|undefined)=>void;onCancel:()=>void;
 /** Audio only. Renders + compresses the selection and hands back a data: URL (bakes the edits, frees storage). Throw to show an error. */
 onReplace?:(dataUrl:string,duration:number)=>void|Promise<void>;
 /** 'bake': the Done button renders the selection and calls onReplace (used when importing a file that is too big to store). */
 saveMode?:'edits'|'bake';
 /** Longest allowed selection (bake mode shows a warning when exceeded). */
 maxSeconds?:number;
 fileName?:string;
};

export function MediaClipEditor({src,kind,title,initial,onSave,onCancel,onReplace,saveMode='edits',maxSeconds,fileName}:Props){
 const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
 const scrub=useRef<HTMLDivElement>(null),strip=useRef<HTMLCanvasElement>(null),dialog=useRef<HTMLElement>(null),menuRef=useRef<HTMLSpanElement>(null);
 const hist=useHistory<MediaEdit|null>(initial??null);
 const [draft,setDraft]=useState<MediaEdit|null>(null);const draftRef=useRef<MediaEdit|null>(null);draftRef.current=draft;
 const [loop,setLoop]=useState(false),[speed,setSpeed]=useState(1),[dragging,setDragging]=useState<DragKind|null>(null),[menu,setMenu]=useState(false),[slow,setSlow]=useState(false);
 const [job,setJob]=useState<{label:string;progress:number}|null>(null);const jobAbort=useRef<AbortController|null>(null);
 const [note,setNote]=useState<{text:string;kind:'info'|'error'}|null>(null);
 const [peaksInfo,setPeaksInfo]=useState<Peaks|null|undefined>(undefined);
 const raw=draft??hist.state??undefined;
 const pb=useClipPlayback(media,src,raw,{loop});
 const {duration,at,playing,failed}=pb;
 const edit=normalizeEdit(raw,duration);
 const embedded=isEmbeddedMedia(src),drive=!embedded&&(!!driveFileId(src)||isDriveLink(src)),playback=playbackSrc(src);
 const len=Math.max(0,edit.trimEnd-edit.trimStart);
 const tooLong=!!maxSeconds&&len>maxSeconds+0.5;
 const canBake=kind==='audio'&&embedded&&!!onReplace,bakeMode=saveMode==='bake'&&canBake;
 const canRender=!!peaksInfo,canExportVideo=embedded&&typeof MediaRecorder!=='undefined';
 const stem=(fileName||(kind==='audio'?'audio':'video')).replace(/\.[a-z0-9]+$/i,'')||'clip';

 useStrip(strip,src,kind,duration,peaksInfo?.peaks??null);
 useEffect(()=>{let c=false;setPeaksInfo(undefined);void decodePeaks(src).then(p=>{if(!c)setPeaksInfo(p);});return()=>{c=true;};},[src]);
 useEffect(()=>{setSlow(false);if(duration||failed)return;const t=window.setTimeout(()=>setSlow(true),8000);return()=>window.clearTimeout(t);},[duration,failed,src]);
 useEffect(()=>{const el=media.current;if(el)el.playbackRate=speed;},[speed,src]);
 useEffect(()=>{
  const prev=document.activeElement as HTMLElement|null,ov=document.body.style.overflow;
  document.body.style.overflow='hidden';dialog.current?.focus({preventScroll:true});
  return()=>{document.body.style.overflow=ov;prev?.focus?.();};
 },[]);
 useEffect(()=>{if(!menu)return;const on=(e:PointerEvent)=>{if(!menuRef.current?.contains(e.target as Node))setMenu(false);};document.addEventListener('pointerdown',on);return()=>document.removeEventListener('pointerdown',on);},[menu]);
 useEffect(()=>{if(!note)return;const t=window.setTimeout(()=>setNote(null),5000);return()=>window.clearTimeout(t);},[note]);
 const flash=(text:string,k:'info'|'error'='info')=>setNote({text,kind:k});

 /* edits */
 const commit=(next:MediaEdit,sound=true)=>{hist.set(normalizeEdit(next,duration));if(sound)playPreset('tick');};
 const commitDraft=()=>{const d=draftRef.current;if(d){commit(d,false);setDraft(null);}};
 const setStart=(t:number)=>commit({...edit,trimStart:clamp(t,0,edit.trimEnd-MIN_LEN)});
 const setEnd=(t:number)=>commit({...edit,trimEnd:clamp(t,edit.trimStart+MIN_LEN,duration)});
 const slider=(field:'volume'|'fadeIn'|'fadeOut')=>({
  onChange:(e:React.ChangeEvent<HTMLInputElement>)=>{const v=Number(e.target.value);setDraft({...edit,...(field==='volume'?{volume:v/100,muted:false}:{[field]:v})});},
  onPointerUp:commitDraft,onKeyUp:commitDraft,onBlur:commitDraft,
 });
 function normalize(){
  if(!peaksInfo||!duration)return;
  const pk=peakWithin(peaksInfo,edit.trimStart/duration,edit.trimEnd/duration);
  if(!pk){flash('This selection is silent.');return;}
  const g=Math.round(clamp(0.9/pk,0.25,4)*100)/100;
  commit({...edit,gain:g,volume:1,muted:false},false);
  flash(g>1.02?`Boosted ${g.toFixed(1)}× — applies to uploaded clips in the quiz, and to exports.`:g<0.98?`Lowered to ${g.toFixed(1)}×.`:'Already at a good level.');
 }

 /* timeline interaction */
 const drag=useRef<{kind:DragKind;x0:number;base:Norm}|null>(null);
 const tAt=(x:number)=>{const r=scrub.current?.getBoundingClientRect();if(!r||!duration)return 0;return clamp((x-r.left)/r.width,0,1)*duration;};
 function onPointerDown(kind:DragKind,e:React.PointerEvent){
  if(!duration||(e.button&&e.button!==0))return;
  e.preventDefault();e.stopPropagation();
  try{(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);}catch{}
  drag.current={kind,x0:e.clientX,base:edit};setDragging(kind);
  if(kind==='seek')pb.seek(tAt(e.clientX),true);
  else{pb.pause();if(kind!=='move')pb.seek(kind==='start'?edit.trimStart:edit.trimEnd,true);}
 }
 function onPointerMove(e:React.PointerEvent){
  const d=drag.current;if(!d)return;
  const t=tAt(e.clientX);
  if(d.kind==='seek'){pb.seek(t,true);return;}
  let next:MediaEdit;
  if(d.kind==='start')next={...d.base,trimStart:Math.min(t,d.base.trimEnd-MIN_LEN)};
  else if(d.kind==='end')next={...d.base,trimEnd:Math.max(t,d.base.trimStart+MIN_LEN)};
  else{const w=scrub.current?.getBoundingClientRect().width||1,dt=(e.clientX-d.x0)/w*duration,l=d.base.trimEnd-d.base.trimStart,s=clamp(d.base.trimStart+dt,0,duration-l);next={...d.base,trimStart:s,trimEnd:s+l};}
  const n=normalizeEdit(next,duration);setDraft(n);
  pb.seek(d.kind==='end'?n.trimEnd:n.trimStart,true);
 }
 function onPointerUp(e:React.PointerEvent){
  const d=drag.current;if(!d)return;drag.current=null;setDragging(null);
  try{(e.target as HTMLElement).releasePointerCapture(e.pointerId);}catch{}
  const cur=draftRef.current;if(d.kind!=='seek'&&cur)commit(cur);setDraft(null);
 }
 function handleKey(which:'start'|'end',e:React.KeyboardEvent){
  const step=e.shiftKey?1:0.1,dir=e.key==='ArrowLeft'||e.key==='ArrowDown'?-1:e.key==='ArrowRight'||e.key==='ArrowUp'?1:0;
  if(!dir)return;e.preventDefault();e.stopPropagation();
  if(which==='start')setStart(edit.trimStart+dir*step);else setEnd(edit.trimEnd+dir*step);
 }
 function onKey(e:React.KeyboardEvent){
  const tag=(e.target as HTMLElement).tagName;
  if(e.key==='Escape'){e.preventDefault();cancel();return;}
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
  if(e.key===' '&&tag!=='BUTTON'){e.preventDefault();pb.toggle();}
  else if(e.key==='ArrowLeft'){e.preventDefault();pb.seek(at-(e.shiftKey?5:1),true);}
  else if(e.key==='ArrowRight'){e.preventDefault();pb.seek(at+(e.shiftKey?5:1),true);}
  else if(e.key==='Home'){e.preventDefault();pb.seek(edit.trimStart);}
  else if(e.key==='End'){e.preventDefault();pb.seek(edit.trimEnd-0.1);}
  else if(e.key.toLowerCase()==='i'&&duration)setStart(at);
  else if(e.key.toLowerCase()==='o'&&duration)setEnd(at);
  else if(e.key.toLowerCase()==='l')setLoop(v=>!v);
 }

 /* jobs: export / bake */
 async function run(label:string,fn:(signal:AbortSignal,progress:(p:number)=>void)=>Promise<void>){
  if(job)return;const ac=new AbortController();jobAbort.current=ac;setJob({label,progress:0});pb.pause();
  try{await fn(ac.signal,p=>setJob(j=>j&&{...j,progress:p}));}
  catch(e:any){if(!ac.signal.aborted)flash(e?.message||'That did not work.','error');}
  finally{setJob(null);jobAbort.current=null;}
 }
 const exportWav=()=>run('Rendering…',async()=>{saveBlob(await exportTrimmedWav(src,edit),`${stem}-edited.wav`);flash('WAV saved.');});
 const exportWebm=()=>run('Compressing…',async(signal,progress)=>{const blob=await exportTrimmedAudio(src,edit,{onProgress:progress,signal});saveBlob(blob,`${stem}-edited.${extFor(blob.type,'audio')}`);flash('Edited clip saved.');});
 const exportVideo=()=>run('Exporting video… keep this tab visible',async(signal,progress)=>{const blob=await exportTrimmedVideo(src,edit,{onProgress:progress,signal});saveBlob(blob,`${stem}-edited.${extFor(blob.type,'video')}`);flash('Edited video saved.');});
 const bake=()=>{
  if(!onReplace)return;
  if(tooLong){flash(`Keep the selection under ${fmtTime(maxSeconds!)}.`,'error');return;}
  void run('Compressing…',async(signal,progress)=>{
   const buf=await renderEditedAudio(src,edit,{mono:true,sampleRate:24000});
   const blob=await encodeAudioBuffer(buf,{bitrate:40000,onProgress:progress,signal});
   await onReplace(await blobToDataUrl(blob),buf.duration);
   playPreset('go');
  });
 };
 function done(){if(job)return;if(bakeMode){bake();return;}playPreset('go');onSave(editIsDefault(edit,duration)?undefined:edit);}
 function cancel(){jobAbort.current?.abort();onCancel();}

 /* render */
 const left=duration?edit.trimStart/duration*100:0,right=duration?edit.trimEnd/duration*100:100;
 const vol=Math.round((edit.muted?0:edit.volume)*100),maxFade=Math.max(0.1,Math.min(10,len/2));
 const ruler=duration?[0,.25,.5,.75,1].map(f=>fmtTime(f*duration)):[];
 const chip=(label:string,value:number,set:(t:number)=>void)=><span className="mc-chip"><i>{label}</i><span className="mc-nudge"><button type="button" aria-label={`${label} 0.1 s earlier`} disabled={!duration} onClick={()=>set(value-0.1)}><Minus size={13}/></button><b>{fmtFine(value)}</b><button type="button" aria-label={`${label} 0.1 s later`} disabled={!duration} onClick={()=>set(value+0.1)}><Plus size={13}/></button></span></span>;

 return createPortal(<div className="mc-layer" role="presentation" onKeyDown={onKey}>
  <button type="button" className="mc-scrim" aria-label="Close editor" onClick={cancel}/>
  <section ref={dialog} className="mc" role="dialog" aria-modal="true" aria-labelledby="mc-title" tabIndex={-1} data-kind={kind}>
   <header className="mc-head">
    <button type="button" className="mc-iconbtn" aria-label="Cancel" onClick={cancel}><X size={18}/></button>
    <div className="mc-headtext"><h2 id="mc-title">{title}</h2>{fileName&&<small>{fileName}</small>}</div>
    <Button size="sm" onClick={done} disabled={!!job||(bakeMode&&(!duration||tooLong))}>{bakeMode?<><Save size={15}/>Use clip</>:<><Check size={15}/>Done</>}</Button>
   </header>

   <div className="mc-stage" data-kind={kind}>
    {kind==='video'
     ?<video key={playback} ref={media as React.RefObject<HTMLVideoElement>} src={playback} playsInline preload={embedded?'auto':'metadata'} onClick={pb.toggle}/>
     :<audio key={playback} ref={media as React.RefObject<HTMLAudioElement>} src={playback} preload={embedded?'auto':'metadata'} hidden/>}
    {kind==='audio'&&!failed&&<div className="mc-face" aria-hidden="true" data-playing={playing||undefined}><AudioLines size={28}/><strong>{fmtFine(clamp(at-edit.trimStart,0,len))}</strong><span>{duration?`of ${fmtFine(len)} selected`:slow?'Still loading — large file or slow link…':'Loading clip…'}</span></div>}
    {kind==='video'&&!duration&&!failed&&<div className="mc-state"><LoaderCircle size={20} className="mc-spin"/><span>{slow?'Still loading — large file or slow link…':'Loading clip…'}</span></div>}
    {failed&&<div className="mc-state is-error"><AlertCircle size={20}/><span>This clip could not be loaded.{drive?' Google Drive links need "Anyone with the link" sharing — or upload the file instead.':''}</span>{!embedded&&<a href={src} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open link</a>}</div>}
   </div>

   <div className="mc-timeline">
    <div className="mc-chips">
     {chip('Start',edit.trimStart,setStart)}
     <span className={`mc-chip is-len${tooLong?' is-bad':''}`}><i>Length</i><b>{fmtFine(len)}</b>{tooLong&&<small>max {fmtTime(maxSeconds!)}</small>}</span>
     {chip('End',edit.trimEnd,setEnd)}
    </div>
    <div ref={scrub} className={`mc-scrub${dragging?' is-dragging':''}${!duration&&!failed?' is-loading':''}`} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
     <canvas ref={strip} className="mc-strip" aria-hidden="true"/>
     {duration>0&&<>
      <div className="mc-track" onPointerDown={e=>onPointerDown('seek',e)}/>
      <span className="mc-cut" style={{left:0,width:`${left}%`}}/>
      <span className="mc-cut" style={{left:`${right}%`,right:0}}/>
      <div className="mc-range" style={{left:`${left}%`,width:`${right-left}%`}} onPointerDown={e=>onPointerDown('move',e)} title="Drag to move the selection">
       {edit.fadeIn>0&&<span className="mc-fade is-in" style={{width:`${edit.fadeIn/len*100}%`}}/>}
       {edit.fadeOut>0&&<span className="mc-fade is-out" style={{width:`${edit.fadeOut/len*100}%`}}/>}
      </div>
      <span className="mc-playhead" style={{left:`${clamp(at/duration*100,0,100)}%`}}/>
      <button type="button" className="mc-handle is-start" style={{left:`${left}%`}} aria-label={`Trim start ${fmtFine(edit.trimStart)}. Arrow keys adjust, Shift for 1 s`} onKeyDown={e=>handleKey('start',e)} onPointerDown={e=>onPointerDown('start',e)}><b>{fmtFine(edit.trimStart)}</b></button>
      <button type="button" className="mc-handle is-end" style={{left:`${right}%`}} aria-label={`Trim end ${fmtFine(edit.trimEnd)}. Arrow keys adjust, Shift for 1 s`} onKeyDown={e=>handleKey('end',e)} onPointerDown={e=>onPointerDown('end',e)}><b>{fmtFine(edit.trimEnd)}</b></button>
     </>}
    </div>
    <div className="mc-ruler" aria-hidden="true">{ruler.map((r,i)=><span key={i}>{r}</span>)}</div>
   </div>

   <div className="mc-transport">
    <button type="button" className="mc-skip" disabled={!duration} aria-label="Back 5 seconds" onClick={()=>pb.seek(at-5,true)}><RotateCcw size={16}/><small>5</small></button>
    <button type="button" className="mc-play" disabled={!duration} aria-label={playing?'Pause':'Play selection'} onClick={pb.toggle}>{playing?<Pause size={22} fill="currentColor"/>:<Play size={22} fill="currentColor"/>}</button>
    <button type="button" className="mc-skip" disabled={!duration} aria-label="Forward 5 seconds" onClick={()=>pb.seek(at+5,true)}><RotateCw size={16}/><small>5</small></button>
    <span className="mc-clock"><b>{fmtFine(at)}</b><span>/ {fmtFine(duration)}</span></span>
    <button type="button" className={`mc-iconbtn is-toggle${loop?' is-on':''}`} aria-pressed={loop} aria-label="Loop selection" title="Loop selection (L)" onClick={()=>setLoop(v=>!v)}><Repeat size={16}/></button>
    <select className="mc-speed" aria-label="Preview speed" value={speed} onChange={e=>setSpeed(Number(e.target.value))}>{SPEEDS.map(s=><option key={s} value={s}>{s}×</option>)}</select>
   </div>
   <div className="mc-marks">
    <button type="button" disabled={!duration} onClick={()=>setStart(at)}><ArrowLeftToLine size={15}/>Set start here</button>
    <button type="button" disabled={!duration} onClick={()=>setEnd(at)}><ArrowRightToLine size={15}/>Set end here</button>
   </div>

   <section className="mc-panel" aria-label="Sound">
    <header><Volume2 size={14}/><span>Sound</span>{edit.gain!==1&&<em>{edit.gain>1?'Boosted':'Lowered'} {edit.gain.toFixed(1)}×</em>}</header>
    <div className="mc-row">
     <button type="button" className="mc-mute" aria-pressed={edit.muted} aria-label={edit.muted?'Unmute':'Mute'} onClick={()=>commit({...edit,muted:!edit.muted},false)}>{edit.muted||vol===0?<VolumeX size={17}/>:<Volume2 size={17}/>}</button>
     <input type="range" min={0} max={100} step={5} value={vol} aria-label="Volume" {...slider('volume')}/>
     <span className="mc-val">{vol}%</span>
    </div>
    <div className="mc-row is-wrap">
     <button type="button" className="mc-chipbtn" disabled={!canRender||!duration||!!job} onClick={normalize} title="Sets the loudest point of the selection to 90%"><Wand2 size={14}/>{edit.gain!==1?'Re-normalize':'Normalize loudness'}</button>
     {edit.gain!==1&&<button type="button" className="mc-chipbtn is-quiet" onClick={()=>commit({...edit,gain:1},false)}>Remove boost</button>}
     {peaksInfo===null&&<small className="mc-hint">{embedded?'This file could not be analysed, so normalize and export are off.':'Normalize needs an uploaded clip (this link blocks cross-origin access).'}</small>}
    </div>
   </section>
   <section className="mc-panel" aria-label="Fades">
    <header><AudioLines size={14}/><span>Fades</span></header>
    <label className="mc-row"><span className="mc-lab">In</span><input type="range" min={0} max={maxFade} step={0.1} value={edit.fadeIn} disabled={!duration} aria-label="Fade in" {...slider('fadeIn')}/><span className="mc-val">{edit.fadeIn.toFixed(1)} s</span></label>
    <label className="mc-row"><span className="mc-lab">Out</span><input type="range" min={0} max={maxFade} step={0.1} value={edit.fadeOut} disabled={!duration} aria-label="Fade out" {...slider('fadeOut')}/><span className="mc-val">{edit.fadeOut.toFixed(1)} s</span></label>
   </section>

   {bakeMode&&<p className="mc-note is-info"><strong>This file is too big to store as-is.</strong> Pick up to {fmtTime(maxSeconds||60)}. When you tap <b>Use clip</b> only the selection is compressed into a small clip.</p>}
   {!embedded&&!failed&&<p className="mc-note">{drive?'Google Drive clip: edits apply when the question plays. If nothing plays, set sharing to "Anyone with the link" or upload the file instead.':'Linked clip: trim, fades and volume apply when the question plays. Exporting an edited file needs an uploaded clip.'}</p>}
   {note&&<p className={`mc-note is-${note.kind}`} role="status">{note.text}</p>}
   {job&&<div className="mc-job" role="status" aria-live="polite"><div className="mc-jobbar"><i style={{width:`${Math.round(job.progress*100)}%`}}/></div><span>{job.label} {Math.round(job.progress*100)}%</span><button type="button" onClick={()=>jobAbort.current?.abort()}>Cancel</button></div>}

   <div className="mc-toolbar">
    <button type="button" className="mc-tool" disabled={!hist.canUndo} onClick={hist.undo} aria-label="Undo"><Undo2 size={16}/>Undo</button>
    <button type="button" className="mc-tool" disabled={!hist.canRedo} onClick={hist.redo} aria-label="Redo"><Redo2 size={16}/>Redo</button>
    <button type="button" className="mc-tool" disabled={!duration||editIsDefault(edit,duration)} onClick={()=>commit(defaultEdit(duration),false)} aria-label="Reset all edits"><RotateCcw size={16}/>Reset</button>
    {canBake&&!bakeMode&&<button type="button" className="mc-tool" disabled={!!job||!duration||!canRender||editIsDefault(edit,duration)} onClick={bake} title="Re-encodes the selection into the question (smaller file, edits become permanent)"><Save size={16}/>Save as new clip</button>}
    <span className="mc-download" ref={menuRef}>
     <button type="button" className="mc-tool" aria-expanded={menu} aria-haspopup="menu" disabled={!!job} onClick={()=>setMenu(v=>!v)}><Download size={16}/>Export<ChevronDown size={14}/></button>
     {menu&&<span className="mc-menu" role="menu">
      <button type="button" role="menuitem" onClick={()=>{setMenu(false);void downloadOriginal(src,`${stem}.${kind==='audio'?'webm':'mp4'}`);}}>Original file</button>
      {kind==='audio'?<>
       <button type="button" role="menuitem" disabled={!canRender||!duration} onClick={()=>{setMenu(false);void exportWav();}}>Edited clip · WAV<small>Instant, lossless, larger file</small></button>
       <button type="button" role="menuitem" disabled={!canRender||!duration} onClick={()=>{setMenu(false);void exportWebm();}}>Edited clip · compressed<small>Takes about {fmtTime(len)} to encode</small></button>
      </>:<button type="button" role="menuitem" disabled={!canExportVideo||!duration} onClick={()=>{setMenu(false);void exportVideo();}}>Edited clip · WebM<small>{canExportVideo?`Re-encodes in real time (~${fmtTime(len)})`:'Uploaded videos only'}</small></button>}
     </span>}
    </span>
   </div>
   <p className="mc-keys">Space play · ← → seek · I / O set start / end · L loop · Shift = bigger steps</p>
  </section>
 </div>,document.body);
}