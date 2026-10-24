import React,{useCallback,useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {X,Check,Play,Pause,ArrowLeftToLine,ArrowRightToLine,Repeat,Download,Undo2,Volume2,VolumeX,Wand2,ZoomIn,ZoomOut,Shrink,Expand,FlipHorizontal2,FlipVertical2,Crop,Scissors,AudioLines,LoaderCircle,AlertCircle,ExternalLink,Save,FileAudio,FileVideo,ArrowLeft} from 'lucide-react';
import {driveFileId,isDriveLink,resolveMediaPlaybackSrc,saneDuration,blobToDataUrl} from '../question-types.js';
import {playPreset} from '../feedback-sounds.js';

/* ───────────────────────── model ───────────────────────── */
export type MediaFrame={k:number;x:number;y:number;fx?:boolean;fy?:boolean};
export type MediaEdit={trimStart:number;trimEnd:number;muted:boolean;volume?:number;fadeIn?:number;fadeOut?:number;gain?:number;frame?:MediaFrame};
export type Peaks={peaks:number[];duration:number;peak:number;channels:number;sampleRate:number};
type Norm=Required<Omit<MediaEdit,'frame'>>&{frame?:MediaFrame};

const MIN_LEN=0.1;
const clamp=(v:number,a:number,b:number)=>Math.min(Math.max(v,Math.min(a,b)),Math.max(a,b));
const num=(v:unknown,fb:number)=>typeof v==='number'&&Number.isFinite(v)?v:fb;
export const fmtTime=(s:number)=>{s=Math.max(0,num(s,0));return `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;};
export const fmtFine=(s:number)=>`${fmtTime(s)}.${Math.floor((Math.max(0,num(s,0))%1)*10)}`;
export const isEmbeddedMedia=(src:string)=>/^(data|blob):/i.test(src||'');
export const playbackSrc=(src:string)=>isEmbeddedMedia(src)?src:resolveMediaPlaybackSrc(src);
const AC=()=>(window.AudioContext||(window as any).webkitAudioContext) as typeof AudioContext|undefined;

export function defaultEdit(duration:number):Norm{const d=Math.max(0,num(duration,0));return {trimStart:0,trimEnd:d,muted:false,volume:1,fadeIn:0,fadeOut:0,gain:1};}
export function normalizeEdit(edit:MediaEdit|undefined|null,duration:number):Norm{
 const d=Math.max(0,num(duration,0));
 if(!d||!edit)return {...defaultEdit(d),frame:edit?.frame};
 const trimStart=clamp(num(edit.trimStart,0),0,Math.max(0,d-MIN_LEN));
 const trimEnd=clamp(num(edit.trimEnd,d),Math.min(d,trimStart+MIN_LEN),d);
 const len=Math.max(MIN_LEN,trimEnd-trimStart);
 return {trimStart,trimEnd,muted:!!edit.muted,volume:clamp(num(edit.volume,1),0,1),fadeIn:clamp(num(edit.fadeIn,0),0,len/2),fadeOut:clamp(num(edit.fadeOut,0),0,len/2),gain:clamp(num(edit.gain,1),0.25,4),frame:edit.frame};
}
export function editIsDefault(edit:MediaEdit|undefined|null,duration:number){
 const n=normalizeEdit(edit,duration);
 return !n.frame&&!n.muted&&n.volume===1&&n.gain===1&&n.fadeIn===0&&n.fadeOut===0&&n.trimStart<=0.01&&Math.abs(n.trimEnd-duration)<=0.05;
}
export function levelAt(e:MediaEdit,t:number){
 if(e.muted)return 0;
 let a=1;
 if(e.fadeIn&&e.fadeIn>0)a=Math.min(a,(t-e.trimStart)/e.fadeIn);
 if(e.fadeOut&&e.fadeOut>0)a=Math.min(a,(e.trimEnd-t)/e.fadeOut);
 return clamp(a,0,1)*num(e.volume,1)*num(e.gain,1);
}

/* ───────────────────────── 4:3 frame (same model as ImageEditor) ───────────────────────── */
export const FRAME_W=1200,FRAME_H=900;
export const fitK=(w:number,h:number)=>Math.min(FRAME_W/w,FRAME_H/h);
export const fillK=(w:number,h:number)=>Math.max(FRAME_W/w,FRAME_H/h);
const maxK=(w:number,h:number)=>fillK(w,h)*4;
export const centredFrame=(k:number,extra?:Partial<MediaFrame>):MediaFrame=>({k,x:FRAME_W/2,y:FRAME_H/2,...extra});
export function limitFrame(f:MediaFrame,w:number,h:number):MediaFrame{
 const k=clamp(num(f.k,1),fitK(w,h),maxK(w,h)),sw=w*k,sh=h*k;
 return {k,x:clamp(num(f.x,FRAME_W/2),sw/2,FRAME_W-sw/2),y:clamp(num(f.y,FRAME_H/2),sh/2,FRAME_H-sh/2),fx:!!f.fx||undefined,fy:!!f.fy||undefined};
}
export function frameFor(edit:MediaEdit|undefined|null,w:number,h:number):MediaFrame{
 if(!w||!h)return centredFrame(1);
 const f=edit?.frame;
 return f&&Number.isFinite(f.k)?limitFrame(f,w,h):centredFrame(fitK(w,h));
}
export function frameIsDefault(f:MediaFrame,w:number,h:number){return !f.fx&&!f.fy&&Math.abs(f.k-fitK(w,h))<1e-6&&Math.abs(f.x-FRAME_W/2)<0.5&&Math.abs(f.y-FRAME_H/2)<0.5;}
const zoomAround=(f:MediaFrame,k:number,ox:number,oy:number):MediaFrame=>{const r=k/f.k;return {...f,k,x:ox-(ox-f.x)*r,y:oy-(oy-f.y)*r};};
/** CSS placement of a <video> inside a 4:3 box, in percentages — no measuring needed. */
export function frameStyle(f:MediaFrame,w:number,h:number):React.CSSProperties{
 if(!w||!h)return {position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'contain'};
 const sw=w*f.k,sh=h*f.k;
 return {position:'absolute',left:`${(f.x-sw/2)/FRAME_W*100}%`,top:`${(f.y-sh/2)/FRAME_H*100}%`,width:`${sw/FRAME_W*100}%`,height:`${sh/FRAME_H*100}%`,maxWidth:'none',maxHeight:'none',transform:`scale(${f.fx?-1:1},${f.fy?-1:1})`};
}
export function useVideoDims(ref:React.RefObject<HTMLVideoElement|null>,src:string){
 const [dims,setDims]=useState({w:0,h:0});
 useEffect(()=>{
  const v=ref.current;setDims({w:0,h:0});if(!v)return;
  const read=()=>{if(v.videoWidth&&v.videoHeight)setDims({w:v.videoWidth,h:v.videoHeight});};
  v.addEventListener('loadedmetadata',read);v.addEventListener('loadeddata',read);read();
  return()=>{v.removeEventListener('loadedmetadata',read);v.removeEventListener('loadeddata',read);};
 },[src,ref]);
 return dims;
}
function useBackdrop(video:React.RefObject<HTMLVideoElement|null>,canvas:React.RefObject<HTMLCanvasElement|null>,src:string,playing:boolean){
 useEffect(()=>{
  const v=video.current,c=canvas.current;if(!v||!c)return;
  c.width=32;c.height=24;const g=c.getContext('2d');if(!g)return;
  const draw=()=>{if(v.readyState<2||!v.videoWidth)return;const k=Math.max(32/v.videoWidth,24/v.videoHeight),w=v.videoWidth*k,h=v.videoHeight*k;try{g.drawImage(v,(32-w)/2,(24-h)/2,w,h);}catch{}};
  let raf=0,last=0;const loop=(t:number)=>{if(t-last>120){draw();last=t;}raf=requestAnimationFrame(loop);};
  v.addEventListener('loadeddata',draw);v.addEventListener('seeked',draw);draw();
  if(playing)raf=requestAnimationFrame(loop);
  return()=>{cancelAnimationFrame(raf);v.removeEventListener('loadeddata',draw);v.removeEventListener('seeked',draw);};
 },[src,playing,video,canvas]);
}
/** A 4:3 box with a blurred backdrop and the video placed by `frame`. Used by the player and the editor. */
export const VideoFrame=React.forwardRef<HTMLVideoElement,{src:string;frame:MediaFrame;dims:{w:number;h:number};playing:boolean;className?:string;preload?:'metadata'|'auto';onClick?:()=>void;children?:React.ReactNode}>(function VideoFrame({src,frame,dims,playing,className='',preload='metadata',onClick,children},ref){
 const inner=useRef<HTMLVideoElement|null>(null),canvas=useRef<HTMLCanvasElement>(null);
 const setRef=useCallback((el:HTMLVideoElement|null)=>{inner.current=el;if(typeof ref==='function')ref(el);else if(ref)(ref as React.MutableRefObject<HTMLVideoElement|null>).current=el;},[ref]);
 useBackdrop(inner,canvas,src,playing);
 return <div className={`vf ${className}`.trim()} onClick={onClick}>
  <canvas ref={canvas} className="vf-backdrop" aria-hidden="true"/>
  <video key={src} ref={setRef} src={playbackSrc(src)} playsInline preload={preload} style={frameStyle(frame,dims.w,dims.h)}/>
  {children}
 </div>;
});

/* ───────────────────────── duration & probing ───────────────────────── */
function readDuration(el:HTMLMediaElement){
 const d=saneDuration(el.duration);if(d)return d;
 try{const s=el.seekable;if(s.length)return saneDuration(s.end(s.length-1));}catch{}
 return 0;
}
function isLocalMediaSrc(src:string){return /^(data|blob):/i.test(src||'');}
function probeHost(){
 let host=document.getElementById('rf-probe-host') as HTMLDivElement|null;
 if(!host){host=document.createElement('div');host.id='rf-probe-host';host.style.cssText='position:fixed;left:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;overflow:hidden';document.body.appendChild(host);}
 return host;
}
export function resolveMediaDuration(el:HTMLMediaElement,timeoutMs=15000):Promise<number>{
 return new Promise(resolve=>{
  let done=false,fixing=false;
  const local=isLocalMediaSrc(el.currentSrc||el.src);
  const evs=['loadedmetadata','durationchange','loadeddata','canplay'];
  const finish=(d:number)=>{if(done)return;done=true;window.clearTimeout(timer);window.clearTimeout(seekTimer);evs.forEach(ev=>el.removeEventListener(ev,check));el.removeEventListener('error',onErr);resolve(d);};
  let seekTimer=0;
  const check=()=>{
   const d=readDuration(el);if(d){finish(d);return;}
   if(!local&&el.readyState>=1&&!fixing&&!Number.isFinite(el.duration)){
    fixing=true;
    const back=()=>{el.removeEventListener('seeked',back);window.clearTimeout(seekTimer);const d2=readDuration(el);try{el.currentTime=0;}catch{}if(d2)finish(d2);else fixing=false;};
    el.addEventListener('seeked',back);
    seekTimer=window.setTimeout(()=>{el.removeEventListener('seeked',back);fixing=false;},4000);
    try{el.currentTime=1e101;}catch{el.removeEventListener('seeked',back);window.clearTimeout(seekTimer);fixing=false;}
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
/** Quick open check for uploads and links. Local blobs use metadata-only + a short timeout. */
export function probeMediaSrc(src:string,kind:'audio'|'video',timeoutMs?:number):Promise<{ok:boolean;duration:number}>{
 const local=isLocalMediaSrc(src);
 const ms=timeoutMs??(local?4500:12000);
 return new Promise(resolve=>{
  const el=document.createElement(kind);
  el.preload='metadata';
  el.muted=true;
  (el as HTMLVideoElement).playsInline=true;
  const host=probeHost();
  host.appendChild(el);
  let settled=false;
  const finish=(ok:boolean,duration:number)=>{
   if(settled)return;
   settled=true;
   try{el.pause();}catch{}
   el.removeAttribute('src');
   try{el.load();}catch{}
   el.remove();
   resolve({ok,duration});
  };
  el.addEventListener('error',()=>finish(false,0),{once:true});
  el.src=playbackSrc(src);
  try{el.load();}catch{}
  void resolveMediaDuration(el,ms).then(d=>{
   const ok=!el.error&&(d>0||(local?el.readyState>=1:el.readyState>=2));
   finish(ok,d);
  });
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
export function decodePeaks(src:string,bars=240):Promise<Peaks|null>{
 const key=cacheKey(src,bars);const hit=peakCache.get(key);if(hit)return hit;
 const p=decodeAudioFromSrc(src).then(b=>computePeaks(b,bars)).catch(()=>null);
 peakCache.set(key,p);if(peakCache.size>16)peakCache.delete(peakCache.keys().next().value as string);
 return p;
}
export function peakWithin(p:Peaks,from:number,to:number){
 const n=p.peaks.length,a=clamp(Math.floor(from*n),0,n-1),b=clamp(Math.ceil(to*n),a+1,n);let m=0;
 for(let i=a;i<b;i++)if(p.peaks[i]>m)m=p.peaks[i];return m*p.peak;
}
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
export async function exportTrimmedAudio(src:string,edit:MediaEdit,opts:{onProgress?:(p:number)=>void;signal?:AbortSignal}={}):Promise<Blob>{
 return encodeAudioBuffer(await renderEditedAudio(src,edit),{bitrate:64000,...opts});
}
export async function exportTrimmedWav(src:string,edit:MediaEdit):Promise<Blob>{return audioBufferToWav(await renderEditedAudio(src,edit));}
function paintVideoFrame(g:CanvasRenderingContext2D,v:HTMLVideoElement,f:MediaFrame,W:number,H:number,tmp:HTMLCanvasElement){
 const s=W/FRAME_W,vw=v.videoWidth,vh=v.videoHeight,w=vw*f.k*s,h=vh*f.k*s;
 const k=Math.max(32/vw,24/vh);tmp.getContext('2d')!.drawImage(v,(32-vw*k)/2,(24-vh*k)/2,vw*k,vh*k);
 g.save();if('filter' in g)(g as any).filter='blur(8px)';g.drawImage(tmp,-W*0.06,-H*0.06,W*1.12,H*1.12);g.restore();
 g.fillStyle='rgba(0,0,0,.15)';g.fillRect(0,0,W,H);
 g.save();g.translate(f.x*s,f.y*s);g.scale(f.fx?-1:1,f.fy?-1:1);g.drawImage(v,-w/2,-h/2,w,h);g.restore();
}
/** Real video export: selection + fades + volume + 4:3 crop frame → WebM via canvas.captureStream. Real time; uploaded clips only. */
export async function exportTrimmedVideo(src:string,edit:MediaEdit,opts:{onProgress?:(p:number)=>void;signal?:AbortSignal}={}):Promise<Blob>{
 if(typeof MediaRecorder==='undefined')throw new Error('This browser cannot export video.');
 if(!isEmbeddedMedia(src))throw new Error('Exporting an edited video needs an uploaded clip.');
 const v=document.createElement('video');v.src=playbackSrc(src);v.playsInline=true;v.preload='auto';v.muted=false;
 v.style.cssText='position:fixed;left:-9999px;width:2px;height:2px;opacity:0;pointer-events:none';document.body.appendChild(v);
 let ctx:AudioContext|null=null;
 try{
  const d=await resolveMediaDuration(v);if(!d)throw new Error('Could not read this video.');
  await new Promise<void>((res,rej)=>{if(v.readyState>=2)return res();v.addEventListener('loadeddata',()=>res(),{once:true});v.addEventListener('error',()=>rej(new Error('Could not read this video.')),{once:true});});
  const e=normalizeEdit(edit,d),len=Math.max(MIN_LEN,e.trimEnd-e.trimStart),f=frameFor(edit,v.videoWidth,v.videoHeight);
  const W=960,H=720,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
  const c2=canvas.getContext('2d');if(!c2)throw new Error('Canvas is not available.');
  const tmp=document.createElement('canvas');tmp.width=32;tmp.height=24;
  const stream=canvas.captureStream(30);
  let gain:GainNode|null=null;const Ctx=AC();
  if(!e.muted&&Ctx){ctx=new Ctx();await ctx.resume().catch(()=>{});const node=ctx.createMediaElementSource(v);gain=ctx.createGain();const dest=ctx.createMediaStreamDestination();node.connect(gain).connect(dest);dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t));}
  else v.muted=true;
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
  const rec=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:2500000});
  const chunks:Blob[]=[];rec.ondataavailable=ev=>{if(ev.data.size)chunks.push(ev.data);};
  const stopped=new Promise<Blob>(res=>{rec.onstop=()=>res(new Blob(chunks,{type:rec.mimeType||mime||'video/webm'}));});
  await seekElement(v,e.trimStart);
  paintVideoFrame(c2,v,f,W,H,tmp);
  rec.start(500);
  let raf=0,aborted=false;
  const finish=()=>{cancelAnimationFrame(raf);v.pause();if(rec.state!=='inactive')rec.stop();};
  const draw=()=>{
   const t=v.currentTime;paintVideoFrame(c2,v,f,W,H,tmp);
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

/* ───────────────────────── shared playback hook ───────────────────────── */
export type ClipPlayback={duration:number;at:number;playing:boolean;failed:boolean;ready:boolean;clip:Norm;seek:(t:number,free?:boolean)=>void;play:()=>void;pause:()=>void;toggle:()=>void;levels:(bars:number)=>number[]|null};
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
  const onErr=()=>{if(!cancelled&&el.error)setFailed(true);};
  const onReady=()=>{if(!cancelled)setReady(true);};
  el.addEventListener('error',onErr);el.addEventListener('loadeddata',onReady);
  if(el.readyState>=2)setReady(true);
  void resolveMediaDuration(el,embedded?8000:15000).then(d=>{if(!cancelled&&d)setDuration(d);});
  if(embedded&&el instanceof HTMLAudioElement){
   const run=()=>{void decodePeaks(src,160).then(m=>{if(!cancelled&&m?.duration)setDuration(prev=>prev||m.duration);});};
   if(typeof requestIdleCallback!=='undefined')requestIdleCallback(run,{timeout:2500});
   else window.setTimeout(run,120);
  }
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
  setFailed(false);
  if(d&&(el.currentTime<c.trimStart-0.01||el.currentTime>=c.trimEnd-0.05)){try{el.currentTime=c.trimStart;}catch{}}
  const g=ensureGraph();applyLevel(el.currentTime);
  const p=el.play();
  if(g&&g.ctx.state!=='running')void g.ctx.resume().catch(()=>{});
  if(p&&typeof p.catch==='function')p.catch((e:any)=>{if(e?.name!=='AbortError'&&e?.name!=='NotAllowedError')setFailed(true);});
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
   g.fillStyle='#a99cff';g.globalAlpha=video?0.85:1;
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
/** Big waveform for the audio stage: dim outside the selection, playhead on top. */
function useWaveStage(canvas:React.RefObject<HTMLCanvasElement|null>,peaks:number[]|null,duration:number,start:number,end:number,at:number){
 useEffect(()=>{
  const c=canvas.current;if(!c)return;
  const dpr=window.devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;if(!w||!h)return;
  const W=Math.round(w*dpr),H=Math.round(h*dpr);if(c.width!==W||c.height!==H){c.width=W;c.height=H;}
  const g=c.getContext('2d');if(!g)return;
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);
  const p=peaks&&peaks.length?peaks:Array.from({length:120},(_,i)=>0.2+0.1*Math.abs(Math.sin(i*0.7)));
  const n=p.length,bw=w/n,mid=h/2,amp=h*0.42,a=duration?start/duration:0,b=duration?end/duration:1;
  for(let i=0;i<n;i++){const f=(i+0.5)/n;g.fillStyle=f>=a&&f<=b?'#b5aaff':'#4c4870';const bh=Math.max(1.5,p[i]*amp);g.fillRect(i*bw+bw*0.2,mid-bh,Math.max(1,bw*0.6),bh*2);}
  if(duration){const x=clamp(at/duration,0,1)*w;g.fillStyle='#fff';g.fillRect(x-1,0,2,h);}
 },[canvas,peaks,duration,start,end,at]);
}

/* ───────────────────────── editor ───────────────────────── */
type Tab='crop'|'trim'|'sound'|'fades';
type DragKind='start'|'end'|'move'|'seek';
type Props={
 src:string;kind:'audio'|'video';title:string;initial?:MediaEdit;
 onSave:(edit:MediaEdit|undefined)=>void;onCancel:()=>void;
 onReplace?:(dataUrl:string,duration:number)=>void|Promise<void>;
 saveMode?:'edits'|'bake';maxSeconds?:number;fileName?:string;durationHint?:number;
};
const bubbleStyle=(pct:number):React.CSSProperties=>pct<9?{left:0,transform:'none'}:pct>91?{right:0,left:'auto',transform:'none'}:{left:`${pct}%`,transform:'translateX(-50%)'};

export function MediaClipEditor({src,kind,title,initial,onSave,onCancel,onReplace,saveMode='edits',maxSeconds,fileName,durationHint}:Props){
 const media=useRef<HTMLVideoElement|HTMLAudioElement|null>(null);
 const stageEl=useRef<HTMLDivElement>(null),frameEl=useRef<HTMLDivElement>(null),strip=useRef<HTMLCanvasElement>(null),waveStage=useRef<HTMLCanvasElement>(null),root=useRef<HTMLDivElement>(null);
 const [edit,setEdit]=useState<MediaEdit|undefined>(initial);
 const [tab,setTab]=useState<Tab>(kind==='video'?'crop':'trim');
 const [loop,setLoop]=useState(false),[dragging,setDragging]=useState<DragKind|null>(null),[menu,setMenu]=useState(false),[moving,setMoving]=useState(false),[slow,setSlow]=useState(false);
 const [size,setSize]=useState({w:0,h:0});
 const [job,setJob]=useState<{label:string;progress:number}|null>(null);const jobAbort=useRef<AbortController|null>(null);
 const [note,setNote]=useState<{text:string;kind:'info'|'error'}|null>(null);
 const [peaksInfo,setPeaksInfo]=useState<Peaks|null|undefined>(undefined);
 const pb=useClipPlayback(media,src,edit,{loop,durationHint});
 const {duration,at,playing,failed}=pb;
 const dims=useVideoDims(media as React.RefObject<HTMLVideoElement|null>,kind==='video'?src:'');
 const e=normalizeEdit(edit,duration);
 const frame=frameFor(edit,dims.w,dims.h);
 const embedded=isEmbeddedMedia(src),drive=!embedded&&(!!driveFileId(src)||isDriveLink(src));
 const len=Math.max(0,e.trimEnd-e.trimStart),tooLong=!!maxSeconds&&len>maxSeconds+0.5;
 const canBake=kind==='audio'&&embedded&&!!onReplace,bakeMode=saveMode==='bake'&&canBake;
 const canRender=!!peaksInfo,canExportVideo=embedded&&typeof MediaRecorder!=='undefined';
 const stem=(fileName||kind).replace(/\.[a-z0-9]+$/i,'')||'clip';
 const ratio=kind==='video'?FRAME_W/FRAME_H:2;

 useStrip(strip,src,kind,duration,peaksInfo?.peaks??null);
 useWaveStage(waveStage,kind==='audio'?(peaksInfo?.peaks??null):null,duration,e.trimStart,e.trimEnd,at);
 useEffect(()=>{
  let c=false;
  setPeaksInfo(undefined);
  if(kind==='video'){setPeaksInfo(null);return ()=>{c=true;};}
  const run=()=>{void decodePeaks(src,160).then(p=>{if(!c)setPeaksInfo(p);});};
  if(typeof requestIdleCallback!=='undefined'){const id=requestIdleCallback(run,{timeout:3000});return()=>{c=true;cancelIdleCallback(id);};}
  const t=window.setTimeout(run,150);
  return()=>{c=true;window.clearTimeout(t);};
 },[src,kind]);
 useEffect(()=>{setSlow(false);if(duration||failed||durationHint)return;const t=window.setTimeout(()=>setSlow(true),5000);return()=>window.clearTimeout(t);},[duration,failed,durationHint,src]);
 useEffect(()=>{const el=stageEl.current;if(!el)return;const measure=()=>{const b=el.getBoundingClientRect(),aw=Math.max(0,b.width-24),ah=Math.max(0,b.height-24),w=Math.min(aw,ah*ratio);setSize({w:Math.floor(w),h:Math.floor(w/ratio)});};measure();const o=new ResizeObserver(measure);o.observe(el);return()=>o.disconnect();},[ratio]);
 useEffect(()=>{if(!note)return;const t=window.setTimeout(()=>setNote(null),5000);return()=>window.clearTimeout(t);},[note]);
 const cancelRef=useRef(()=>{});cancelRef.current=()=>{jobAbort.current?.abort();onCancel();};
 useEffect(()=>{
  const prev=document.activeElement as HTMLElement|null,ov=document.body.style.overflow;document.body.style.overflow='hidden';root.current?.focus({preventScroll:true});
  try{history.pushState({rfClipEditor:true},'');}catch{}
  const onPop=()=>cancelRef.current();window.addEventListener('popstate',onPop);
  return()=>{window.removeEventListener('popstate',onPop);if(history.state?.rfClipEditor){try{history.back();}catch{}}document.body.style.overflow=ov;prev?.focus?.();};
 },[]);
 const flash=(text:string,k:'info'|'error'='info')=>setNote({text,kind:k});

 /* edits */
 const patch=(p:Partial<MediaEdit>,sound=false)=>{setEdit(prev=>({...normalizeEdit(prev,duration),...p}));if(sound)playPreset('tick');};
 const setStart=(t:number)=>patch({trimStart:clamp(t,0,e.trimEnd-MIN_LEN)},true);
 const setEnd=(t:number)=>patch({trimEnd:clamp(t,e.trimStart+MIN_LEN,duration)},true);
 const setFrame=(f:MediaFrame)=>{if(!dims.w)return;patch({frame:limitFrame(f,dims.w,dims.h)});};
 function normalize(){
  if(!peaksInfo||!duration)return;
  const pk=peakWithin(peaksInfo,e.trimStart/duration,e.trimEnd/duration);
  if(!pk){flash('This selection is silent.');return;}
  const g=Math.round(clamp(0.9/pk,0.25,4)*100)/100;
  patch({gain:g,volume:1,muted:false});
  flash(g>1.02?`Boosted ${g.toFixed(1)}×`:g<0.98?`Lowered to ${g.toFixed(1)}×`:'Already at a good level.');
 }
 const resetTab=()=>{
  if(tab==='crop')patch({frame:undefined});
  else if(tab==='trim')patch({trimStart:0,trimEnd:duration});
  else if(tab==='sound')patch({muted:false,volume:1,gain:1});
  else patch({fadeIn:0,fadeOut:0});
 };
 const tabIsDefault=tab==='crop'?(!dims.w||frameIsDefault(frame,dims.w,dims.h)):tab==='trim'?(e.trimStart<=0.01&&Math.abs(e.trimEnd-duration)<=0.05):tab==='sound'?(!e.muted&&e.volume===1&&e.gain===1):(e.fadeIn===0&&e.fadeOut===0);

 /* timeline interaction */
 const stripBox=useRef<HTMLDivElement>(null),drag=useRef<{kind:DragKind;x0:number;base:Norm}|null>(null);
 const tAt=(x:number)=>{const r=stripBox.current?.getBoundingClientRect();if(!r||!duration)return 0;return clamp((x-r.left)/r.width,0,1)*duration;};
 function tlDown(k:DragKind,ev:React.PointerEvent){
  if(!duration||(ev.button&&ev.button!==0))return;ev.preventDefault();ev.stopPropagation();
  try{(ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);}catch{}
  drag.current={kind:k,x0:ev.clientX,base:e};setDragging(k);
  if(k==='seek')pb.seek(tAt(ev.clientX),true);else{pb.pause();if(k!=='move')pb.seek(k==='start'?e.trimStart:e.trimEnd,true);}
 }
 function tlMove(ev:React.PointerEvent){
  const d=drag.current;if(!d)return;const t=tAt(ev.clientX);
  if(d.kind==='seek'){pb.seek(t,true);return;}
  let next:MediaEdit;
  if(d.kind==='start')next={...d.base,trimStart:Math.min(t,d.base.trimEnd-MIN_LEN)};
  else if(d.kind==='end')next={...d.base,trimEnd:Math.max(t,d.base.trimStart+MIN_LEN)};
  else{const w=stripBox.current?.getBoundingClientRect().width||1,dt=(ev.clientX-d.x0)/w*duration,l=d.base.trimEnd-d.base.trimStart,s=clamp(d.base.trimStart+dt,0,duration-l);next={...d.base,trimStart:s,trimEnd:s+l};}
  const n=normalizeEdit(next,duration);setEdit(n);pb.seek(d.kind==='end'?n.trimEnd:n.trimStart,true);
 }
 function tlUp(ev:React.PointerEvent){const d=drag.current;if(!d)return;drag.current=null;setDragging(null);try{(ev.target as HTMLElement).releasePointerCapture(ev.pointerId);}catch{}if(d.kind!=='seek')playPreset('tick');}
 function handleKey(which:'start'|'end',ev:React.KeyboardEvent){
  const step=ev.shiftKey?1:0.1,dir=ev.key==='ArrowLeft'||ev.key==='ArrowDown'?-1:ev.key==='ArrowRight'||ev.key==='ArrowUp'?1:0;
  if(!dir)return;ev.preventDefault();ev.stopPropagation();
  if(which==='start')setStart(e.trimStart+dir*step);else setEnd(e.trimEnd+dir*step);
 }

 /* crop gesture (same maths as ImageEditor) */
 const pointers=useRef(new Map<number,{x:number;y:number}>()),gesture=useRef<{f:MediaFrame;x:number;y:number;dist:number}|null>(null),movedRef=useRef(false);
 const toOutput=(cx:number,cy:number)=>{const b=frameEl.current!.getBoundingClientRect();return {x:(cx-b.left)*FRAME_W/b.width,y:(cy-b.top)*FRAME_H/b.height};};
 function startGesture(){const pts=[...pointers.current.values()];if(!pts.length){gesture.current=null;return;}const x=pts.reduce((s,p)=>s+p.x,0)/pts.length,y=pts.reduce((s,p)=>s+p.y,0)/pts.length;gesture.current={f:frame,x,y,dist:pts.length>1?Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y):0};}
 function cropDown(ev:React.PointerEvent){if(tab!=='crop'||!dims.w)return;ev.preventDefault();try{(ev.currentTarget as Element).setPointerCapture(ev.pointerId);}catch{}pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});movedRef.current=false;startGesture();setMoving(true);}
 function cropMove(ev:React.PointerEvent){
  const g=gesture.current;if(!g||!dims.w||!pointers.current.has(ev.pointerId))return;
  pointers.current.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  const pts=[...pointers.current.values()],b=frameEl.current!.getBoundingClientRect(),scale=FRAME_W/b.width;
  const mx=pts.reduce((s,p)=>s+p.x,0)/pts.length,my=pts.reduce((s,p)=>s+p.y,0)/pts.length;
  if(Math.abs(mx-g.x)+Math.abs(my-g.y)>3)movedRef.current=true;
  let next={...g.f,x:g.f.x+(mx-g.x)*scale,y:g.f.y+(my-g.y)*scale};
  if(pts.length>1&&g.dist){const k=clamp(g.f.k*Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)/g.dist,fitK(dims.w,dims.h),maxK(dims.w,dims.h)),o=toOutput(mx,my);next=zoomAround(next,k,o.x,o.y);}
  setFrame(next);
 }
 function cropUp(ev:React.PointerEvent){pointers.current.delete(ev.pointerId);startGesture();if(!pointers.current.size){setMoving(false);if(!movedRef.current)pb.toggle();}}
 function wheel(ev:React.WheelEvent){if(tab!=='crop'||!dims.w)return;const o=toOutput(ev.clientX,ev.clientY);setFrame(zoomAround(frame,clamp(frame.k*Math.exp(-ev.deltaY*.0015),fitK(dims.w,dims.h),maxK(dims.w,dims.h)),o.x,o.y));}
 const zoomTo=(k:number)=>{if(!dims.w)return;setFrame(zoomAround(frame,clamp(k,fitK(dims.w,dims.h),maxK(dims.w,dims.h)),FRAME_W/2,FRAME_H/2));};
 const lo=dims.w?fitK(dims.w,dims.h):1,hi=dims.w?maxK(dims.w,dims.h):1,level=dims.w&&hi>lo?Math.log(frame.k/lo)/Math.log(hi/lo):0;
 const mode=dims.w?(Math.abs(frame.k-lo)<1e-6?'fit':Math.abs(frame.k-fillK(dims.w,dims.h))<1e-6?'fill':''):'';

 function onKey(ev:React.KeyboardEvent){
  const tag=(ev.target as HTMLElement).tagName;
  if(ev.key==='Escape'){ev.preventDefault();cancel();return;}
  if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA')return;
  if(ev.key===' '&&tag!=='BUTTON'){ev.preventDefault();pb.toggle();}
  else if(ev.key==='ArrowLeft'&&tab!=='crop'){ev.preventDefault();pb.seek(at-(ev.shiftKey?5:1),true);}
  else if(ev.key==='ArrowRight'&&tab!=='crop'){ev.preventDefault();pb.seek(at+(ev.shiftKey?5:1),true);}
  else if(ev.key.toLowerCase()==='i'&&duration)setStart(at);
  else if(ev.key.toLowerCase()==='o'&&duration)setEnd(at);
  else if(ev.key.toLowerCase()==='l')setLoop(v=>!v);
 }

 /* jobs */
 async function run(label:string,fn:(signal:AbortSignal,progress:(p:number)=>void)=>Promise<void>){
  if(job)return;const ac=new AbortController();jobAbort.current=ac;setJob({label,progress:0});pb.pause();setMenu(false);
  try{await fn(ac.signal,p=>setJob(j=>j&&{...j,progress:p}));}
  catch(err:any){if(!ac.signal.aborted)flash(err?.message||'That did not work.','error');}
  finally{setJob(null);jobAbort.current=null;}
 }
 const exportWav=()=>run('Rendering…',async()=>{saveBlob(await exportTrimmedWav(src,e),`${stem}-edited.wav`);flash('WAV saved.');});
 const exportWebm=()=>run('Compressing…',async(signal,progress)=>{const blob=await exportTrimmedAudio(src,e,{onProgress:progress,signal});saveBlob(blob,`${stem}-edited.${extFor(blob.type,'audio')}`);flash('Edited clip saved.');});
 const exportVideo=()=>run('Exporting video… keep this tab visible',async(signal,progress)=>{const blob=await exportTrimmedVideo(src,edit,{onProgress:progress,signal});saveBlob(blob,`${stem}-edited.${extFor(blob.type,'video')}`);flash('Edited video saved.');});
 const bake=()=>{
  if(!onReplace)return;
  if(tooLong){flash(`Keep the selection under ${fmtTime(maxSeconds!)}.`,'error');return;}
  void run('Compressing…',async(signal,progress)=>{
   const buf=await renderEditedAudio(src,e,{mono:true,sampleRate:24000});
   const blob=await encodeAudioBuffer(buf,{bitrate:40000,onProgress:progress,signal});
   await onReplace(await blobToDataUrl(blob),buf.duration);playPreset('go');
  });
 };
 function done(){
  if(job)return;if(bakeMode){bake();return;}
  playPreset('go');
  const out:MediaEdit={...e};
  if(!out.frame||!dims.w||frameIsDefault(frameFor(out,dims.w,dims.h),dims.w,dims.h))delete out.frame;else out.frame=frameFor(out,dims.w,dims.h);
  onSave(editIsDefault(out,duration)?undefined:out);
 }
 function cancel(){jobAbort.current?.abort();onCancel();}

 /* render */
 const left=duration?e.trimStart/duration*100:0,right=duration?e.trimEnd/duration*100:100;
 const showStartBubble=dragging==='start'||dragging==='move'||e.trimStart>0.05,showEndBubble=dragging==='end'||dragging==='move'||(duration>0&&e.trimEnd<duration-0.05);
 const vol=Math.round((e.muted?0:e.volume)*100),maxFade=Math.max(0.1,Math.min(10,len/2));
 const selFmt=len<10?fmtFine:fmtTime;
 const tabs:{id:Tab;label:string;icon:React.ReactNode}[]=[...(kind==='video'?[{id:'crop' as Tab,label:'Crop',icon:<Crop size={14}/>}]:[]),{id:'trim',label:'Trim',icon:<Scissors size={14}/>},{id:'sound',label:'Sound',icon:<Volume2 size={14}/>},{id:'fades',label:'Fades',icon:<AudioLines size={14}/>}];
 const hint=job?'':bakeMode?`Pick up to ${fmtTime(maxSeconds||60)} — only the selection is kept`:tab==='crop'?'Drag to move · pinch or slide to zoom · tap to play':tab==='trim'?(dragging?`Release to set ${dragging==='start'?'the start':dragging==='end'?'the end':'the selection'}`:'Drag the handles to trim · tap to play'):tab==='sound'?(e.gain!==1?`${e.gain>1?'Boosted':'Lowered'} ${e.gain.toFixed(1)}× · applies to uploaded clips and exports`:'Volume applies when the question plays'):'Fades are shown on the timeline';
 const sq=(icon:React.ReactNode,label:string,onClick:()=>void,o:{disabled?:boolean;on?:boolean;aria?:string}={})=><button type="button" disabled={o.disabled} aria-pressed={o.on} aria-label={o.aria} onClick={onClick}>{icon}<span>{label}</span></button>;

 return createPortal(<div ref={root} className="me" role="dialog" aria-modal="true" aria-labelledby="me-title" data-kind={kind} tabIndex={-1} onKeyDown={onKey}>
  <header className="me-head">
   <button type="button" aria-label="Cancel" onClick={cancel}><X size={20}/></button>
   <h2 id="me-title">{kind==='video'?<Crop size={17}/>:<AudioLines size={17}/>}{title}</h2>
   <button type="button" className="me-done" disabled={!!job||(bakeMode&&(!duration||tooLong))} onClick={done}>{job?<LoaderCircle size={16} className="speech-spinner"/>:bakeMode?<Save size={16}/>:<Check size={16}/>}{bakeMode?'Use clip':'Done'}</button>
  </header>

  <div className="me-stage" ref={stageEl}>
   {size.w>0&&<div ref={frameEl} className={`me-frame${moving?' is-moving':''}${tab==='crop'?' is-crop':''}`} style={{width:size.w,height:size.h}} role="application" aria-label={kind==='video'?'Video frame. Drag to move, pinch or use the slider to zoom':'Waveform'}
    onPointerDown={kind==='video'?cropDown:undefined} onPointerMove={kind==='video'?cropMove:undefined} onPointerUp={kind==='video'?cropUp:undefined} onPointerCancel={kind==='video'?cropUp:undefined} onWheel={kind==='video'?wheel:undefined} onDoubleClick={()=>{if(tab==='crop'&&dims.w)setFrame(centredFrame(mode==='fill'?lo:fillK(dims.w,dims.h)));}}>
    {kind==='video'
     ?<VideoFrame ref={media as React.Ref<HTMLVideoElement>} src={src} frame={frame} dims={dims} playing={playing} preload={embedded?'auto':'metadata'}>{tab==='crop'&&<span className="me-grid" aria-hidden="true"/>}</VideoFrame>
     :<><audio key={src} ref={media as React.RefObject<HTMLAudioElement>} src={playbackSrc(src)} preload={embedded?'auto':'metadata'} hidden/><canvas ref={waveStage} className="me-wave" onClick={pb.toggle} aria-hidden="true"/></>}
    {!playing&&duration>0&&!failed&&<button type="button" className="me-playbig" aria-label="Play selection" onClick={ev=>{ev.stopPropagation();pb.play();}} onPointerDown={ev=>ev.stopPropagation()}><Play size={22} fill="currentColor"/></button>}
    {playing&&<button type="button" className="me-playbig is-pause" aria-label="Pause" onClick={ev=>{ev.stopPropagation();pb.pause();}} onPointerDown={ev=>ev.stopPropagation()}><Pause size={20} fill="currentColor"/></button>}
    {duration>0&&<span className="me-badge">{selFmt(clamp(at-e.trimStart,0,len))} / {selFmt(len)}</span>}
    {!duration&&!failed&&<div className="me-state"><LoaderCircle size={22} className="speech-spinner"/><span>{slow?'Still loading — large file or slow link…':'Loading clip…'}</span></div>}
    {failed&&<div className="me-state is-error"><AlertCircle size={20}/><span>This clip could not be loaded.{drive?' Google Drive links need "Anyone with the link" sharing — or upload the file instead.':''}</span>{!embedded&&<a href={src} target="_blank" rel="noreferrer"><ExternalLink size={14}/>Open link</a>}</div>}
   </div>}
  </div>

  <div className="me-tools">
   {tab==='crop'&&<>
    <div className="me-zoom"><button type="button" aria-label="Zoom out" disabled={!dims.w||frame.k<=lo+1e-6} onClick={()=>zoomTo(frame.k/1.25)}><ZoomOut size={18}/></button><input type="range" min={0} max={1000} step={1} aria-label="Zoom" disabled={!dims.w||hi<=lo} value={Math.round(level*1000)} onChange={ev=>zoomTo(lo*Math.exp(Number(ev.target.value)/1000*Math.log(hi/lo)))}/><button type="button" aria-label="Zoom in" disabled={!dims.w||frame.k>=hi-1e-6} onClick={()=>zoomTo(frame.k*1.25)}><ZoomIn size={18}/></button></div>
    <div className="me-pills" role="radiogroup" aria-label="Video size"><button type="button" role="radio" aria-checked={mode==='fit'} disabled={!dims.w} onClick={()=>setFrame(centredFrame(lo,{fx:frame.fx,fy:frame.fy}))}><Shrink size={15}/>Whole video</button><button type="button" role="radio" aria-checked={mode==='fill'} disabled={!dims.w} onClick={()=>dims.w&&setFrame(centredFrame(fillK(dims.w,dims.h),{fx:frame.fx,fy:frame.fy}))}><Expand size={15}/>Fill frame</button></div>
   </>}
   {tab==='trim'&&<div className="me-timeline">
    <div ref={stripBox} className={`me-strip${dragging?' is-dragging':''}${!duration&&!failed?' is-loading':''}`} onPointerMove={tlMove} onPointerUp={tlUp} onPointerCancel={tlUp}>
     <canvas ref={strip} className="me-strip-canvas" aria-hidden="true"/>
     {duration>0&&<>
      <div className="me-track" onPointerDown={ev=>tlDown('seek',ev)}/>
      <span className="me-cut" style={{left:0,width:`${left}%`}}/><span className="me-cut" style={{left:`${right}%`,right:0}}/>
      <div className="me-range" style={{left:`${left}%`,width:`${right-left}%`}} onPointerDown={ev=>tlDown('move',ev)}>
       {e.fadeIn>0&&<span className="me-fade is-in" style={{width:`${e.fadeIn/len*100}%`}}/>}
       {e.fadeOut>0&&<span className="me-fade is-out" style={{width:`${e.fadeOut/len*100}%`}}/>}
      </div>
      <span className="me-playhead" style={{left:`${clamp(at/duration*100,0,100)}%`}}/>
      <button type="button" className={`me-handle${dragging==='start'?' is-active':''}`} style={{left:`${left}%`}} aria-label={`Trim start ${fmtFine(e.trimStart)}. Arrow keys adjust`} onKeyDown={ev=>handleKey('start',ev)} onPointerDown={ev=>tlDown('start',ev)}/>
      <button type="button" className={`me-handle${dragging==='end'?' is-active':''}`} style={{left:`${right}%`}} aria-label={`Trim end ${fmtFine(e.trimEnd)}. Arrow keys adjust`} onKeyDown={ev=>handleKey('end',ev)} onPointerDown={ev=>tlDown('end',ev)}/>
      {showStartBubble&&<b className={`me-bubble${dragging==='start'?' is-active':''}`} style={{...bubbleStyle(left),...(showEndBubble&&right-left<14?{bottom:'calc(100% + 26px)'}:{})}}>{fmtFine(e.trimStart)}</b>}
      {showEndBubble&&<b className={`me-bubble${dragging==='end'?' is-active':''}`} style={bubbleStyle(right)}>{fmtFine(e.trimEnd)}</b>}
     </>}
    </div>
    <div className="me-ruler" aria-hidden="true"><span>0:00</span><span>{duration?(duration<10?fmtFine(duration):fmtTime(duration)):'–:––'}</span></div>
   </div>}
   {tab==='sound'&&<div className="me-row"><button type="button" className="me-mute" aria-pressed={e.muted} aria-label={e.muted?'Unmute':'Mute'} onClick={()=>patch({muted:!e.muted})}>{e.muted||vol===0?<VolumeX size={18}/>:<Volume2 size={18}/>}</button><input type="range" min={0} max={100} step={5} value={vol} aria-label="Volume" onChange={ev=>patch({volume:Number(ev.target.value)/100,muted:false})}/><span className="me-val">{vol}%</span></div>}
   {tab==='fades'&&<>
    <label className="me-row"><span className="me-lab">In</span><input type="range" min={0} max={maxFade} step={0.1} value={e.fadeIn} disabled={!duration} aria-label="Fade in" onChange={ev=>patch({fadeIn:Number(ev.target.value)})}/><span className="me-val">{e.fadeIn.toFixed(1)} s</span></label>
    <label className="me-row"><span className="me-lab">Out</span><input type="range" min={0} max={maxFade} step={0.1} value={e.fadeOut} disabled={!duration} aria-label="Fade out" onChange={ev=>patch({fadeOut:Number(ev.target.value)})}/><span className="me-val">{e.fadeOut.toFixed(1)} s</span></label>
   </>}

   <div className="me-pills is-tabs" role="tablist">{tabs.map(t=><button key={t.id} type="button" role="tab" aria-selected={tab===t.id} onClick={()=>{setTab(t.id);setMenu(false);}}>{t.icon}{t.label}</button>)}</div>

   {menu?<div className="me-menu" role="menu">
    <button type="button" role="menuitem" onClick={()=>{setMenu(false);void downloadOriginal(src,`${stem}.${kind==='audio'?'webm':'mp4'}`);}}>{kind==='audio'?<FileAudio size={16}/>:<FileVideo size={16}/>}<span>Original file</span></button>
    {kind==='audio'?<>
     <button type="button" role="menuitem" disabled={!canRender||!duration} onClick={exportWav}><Download size={16}/><span>Edited clip · WAV <small>instant, larger file</small></span></button>
     <button type="button" role="menuitem" disabled={!canRender||!duration} onClick={exportWebm}><Download size={16}/><span>Edited clip · compressed <small>takes about {fmtTime(len)}</small></span></button>
     {canBake&&!bakeMode&&<button type="button" role="menuitem" disabled={!canRender||!duration} onClick={bake}><Save size={16}/><span>Save as new clip in this question <small>smaller file, edits become permanent</small></span></button>}
    </>:<button type="button" role="menuitem" disabled={!canExportVideo||!duration} onClick={exportVideo}><Download size={16}/><span>Edited clip · WebM <small>{canExportVideo?`re-encodes in real time (~${fmtTime(len)})`:'uploaded videos only'}</small></span></button>}
    <button type="button" role="menuitem" className="is-close" onClick={()=>setMenu(false)}><ArrowLeft size={16}/><span>Back</span></button>
   </div>
   :<div className="me-actions">
    {tab==='crop'&&<>{sq(<FlipHorizontal2 size={18}/>,'Mirror',()=>setFrame({...frame,fx:!frame.fx}),{disabled:!dims.w,on:!!frame.fx})}{sq(<FlipVertical2 size={18}/>,'Flip',()=>setFrame({...frame,fy:!frame.fy}),{disabled:!dims.w,on:!!frame.fy})}</>}
    {tab==='trim'&&<>{sq(<ArrowLeftToLine size={18}/>,'Start',()=>setStart(at),{disabled:!duration,aria:'Set start here'})}{sq(<ArrowRightToLine size={18}/>,'End',()=>setEnd(at),{disabled:!duration,aria:'Set end here'})}{sq(<Repeat size={18}/>,'Loop',()=>setLoop(v=>!v),{on:loop})}{sq(<Download size={18}/>,'Export',()=>setMenu(true),{disabled:!!job})}</>}
    {tab==='sound'&&<>{sq(<Wand2 size={18}/>,'Normalize',normalize,{disabled:!canRender||!duration})}{e.gain!==1&&sq(<Undo2 size={18}/>,'No boost',()=>patch({gain:1}))}</>}
    {sq(<Undo2 size={18}/>,'Reset',resetTab,{disabled:tabIsDefault,aria:`Reset ${tab}`})}
   </div>}

   {job&&<div className="me-job" role="status" aria-live="polite"><div className="me-jobbar"><i style={{width:`${Math.round(job.progress*100)}%`}}/></div><span>{job.label} {Math.round(job.progress*100)}%</span><button type="button" onClick={()=>jobAbort.current?.abort()}>Cancel</button></div>}
   {note&&<p className={`me-note is-${note.kind}`} role="status">{note.text}</p>}
   {!note&&peaksInfo===null&&tab==='sound'&&<p className="me-note">{embedded?'This file could not be analysed, so normalize and export are off.':'Normalize and export need an uploaded clip.'}</p>}
   {hint&&<small className="me-hint">{hint}</small>}
  </div>
 </div>,document.body);
}