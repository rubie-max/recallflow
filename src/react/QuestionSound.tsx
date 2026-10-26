import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Play,Pause,Mic,Square,Upload,Trash2,RefreshCw,LoaderCircle,AudioLines,Link2,AlertCircle,Scissors,RotateCcw} from 'lucide-react';
import {MediaLinkForm,DriveShareLegacyNotice,pushMediaLinkError} from './MediaLinkForm';
import {MAX_AUDIO_CHARS,MAX_AUDIO_SECONDS,driveFileId,isDriveLink,resolveMediaLink,DRIVE_SHARE_REJECT,DRIVE_SHARE_LEGACY_HINT,typedMediaFile,blobToDataUrl,dataUrlLength,formatBytes,audioSafe} from '../question-types.js';
import {MediaClipEditor,normalizeEdit,useClipPlayback,decodePeaks,probeMediaSrc,playbackSrc,fmtTime,fmtFine,type MediaEdit,type Peaks} from './MediaClipEditor';
import {playPreset} from '../feedback-sounds.js';

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));
const recorderType=()=>typeof MediaRecorder==='undefined'?'':['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
const guessType=(name:string)=>({mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',webm:'audio/webm'} as Record<string,string>)[name.split('.').pop()?.toLowerCase()||'']||'';
const tooLong=`Keep the sound to about ${fmtTime(MAX_AUDIO_SECONDS)} or less.`;

function record(stream:MediaStream,type:string){
 const recorder=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),audioBitsPerSecond:32000}),chunks:Blob[]=[];
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const done=new Promise<Blob>(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||type||'audio/webm'}));});
 recorder.start(250);
 return {recorder,done};
}

/* ───────── names ───────── */
const MIME_EXT:Record<string,string>={mpeg:'mp3',mp3:'mp3',mp4:'m4a','x-m4a':'m4a',wav:'wav',wave:'wav',ogg:'ogg',webm:'webm',aac:'aac',opus:'opus'};
function extFromDataUrl(src:string){const mime=src.match(/^data:audio\/([^;,]+)/i)?.[1]?.toLowerCase()||'';return MIME_EXT[mime.split('+')[0]]||mime.replace(/^x-/,'')||'webm';}
function basenameFromUrl(src:string){try{const path=decodeURIComponent(new URL(resolveMediaLink(src)).pathname);return path.split('/').filter(Boolean).pop()||'';}catch{return '';}}
export function formatSoundFileName(name:string,max=36){
 let base=(name||'').replace(/\\/g,'/').split('/').pop()?.trim()||String(name||'').trim();
 base=base.replace(/[\x00-\x1f<>:"|?*]/g,'').replace(/\s+/g,' ');
 if(!base)return 'audio';
 if(base.length<=max)return base;
 const dot=base.lastIndexOf('.');
 if(dot>0&&dot<base.length-1){const ext=base.slice(dot),stem=base.slice(0,dot),keep=Math.max(6,max-ext.length-1);return `${stem.slice(0,keep)}…${ext}`;}
 return `${base.slice(0,max-1)}…`;
}
export function soundFileTitle(src:string,stored?:string){
 const label=typeof stored==='string'?stored.trim():'';
 if(label)return label;if(!src)return '';
 if(src.startsWith('data:'))return `audio.${extFromDataUrl(src)}`;
 return basenameFromUrl(src)||'Linked audio';
}
export function soundDisplayName(src:string,stored?:string){const t=soundFileTitle(src,stored);return t?formatSoundFileName(t):'';}
export function normalizeSoundFileName(name:string){const base=(name||'').replace(/\\/g,'/').split('/').pop()?.trim().replace(/[\x00-\x1f<>:"|?*]/g,'').replace(/\s+/g,' ')||'';return base.slice(0,120);}
export function probeAudioLink(url:string){return probeMediaSrc(resolveMediaLink(String(url||'').trim()),'audio').then(m=>m.ok);}

/* ───────── waveform data ───────── */
function useWaveform(src:string,bars:number,start:number,end:number){
 const [raw,setRaw]=useState<Peaks|null>(null);
 useEffect(()=>{let c=false;setRaw(null);void decodePeaks(src).then(p=>{if(!c)setRaw(p);});return()=>{c=true;};},[src]);
 return useMemo(()=>{
  if(!raw)return Array.from({length:bars},(_,i)=>0.22+0.12*Math.abs(Math.sin(i*0.9)));
  const d=raw.duration||1,n=raw.peaks.length,a=clamp((end>start?start:0)/d,0,1)*n,b=Math.max(a+1,clamp((end>start?end:d)/d,0,1)*n);
  return Array.from({length:bars},(_,i)=>{const s=Math.floor(a+(i/bars)*(b-a)),e=Math.max(s+1,Math.floor(a+((i+1)/bars)*(b-a)));let m=0;for(let j=s;j<e&&j<n;j++)if(raw.peaks[j]>m)m=raw.peaks[j];return m;});
 },[raw,bars,start,end]);
}
function useLiveLevels(levels:(bars:number)=>number[]|null,bars:number,on:boolean){
 const [lv,setLv]=useState<number[]|null>(null);const fn=useRef(levels);fn.current=levels;
 useEffect(()=>{if(!on){setLv(null);return;}let raf=0;const tick=()=>{setLv(fn.current(bars));raf=requestAnimationFrame(tick);};raf=requestAnimationFrame(tick);return()=>cancelAnimationFrame(raf);},[on,bars]);
 return lv;
}

/* ───────── player ───────── */
export function SoundPlayer({src,label='Play sound',className='',variant='default',edit,displayName,fileTitle,durationHint,title,extra}:{src:string;label?:string;className?:string;variant?:'default'|'overlay'|'media'|'card'|'pulse'|'icon'|'now';edit?:MediaEdit;displayName?:string;fileTitle?:string;durationHint?:number;title?:React.ReactNode;extra?:React.ReactNode}){
 const audio=useRef<HTMLAudioElement>(null),wave=useRef<HTMLDivElement>(null),bar=useRef<HTMLDivElement>(null);
 const [drag,setDrag]=useState<number|null>(null),dragging=useRef(false);
 const livePlayer=variant==='overlay'||variant==='now';
 const pb=useClipPlayback(audio,src,edit,{durationHint,analyser:livePlayer});
 const {duration,at,playing,failed}=pb;
 const known=duration>0,clip=normalizeEdit(edit,duration),selLen=known?clip.trimEnd-clip.trimStart:0;
 const played=known?clamp((at-clip.trimStart)/Math.max(0.1,selLen),0,1):0;
 const bars=variant==='media'?48:variant==='overlay'?30:variant==='now'?5:36;
 const peaks=useWaveform(src,bars,known?clip.trimStart:0,known?clip.trimEnd:0);
 const live=useLiveLevels(pb.levels,bars,playing&&livePlayer);
 const heights=live??peaks;
 const name=displayName||soundDisplayName(src),tip=fileTitle||name;
 if(isDriveLink(src))return <DriveShareLegacyNotice kind="sound"/>;
 const f=selLen>0&&selLen<10?fmtFine:fmtTime;
 const cur=known?f(Math.max(0,at-clip.trimStart)):'0:00',total=known?f(selLen):'–:––';
 if(variant==='icon')return <div className={`sp sp-icon ${className}`.trim()} data-playing={playing||undefined} data-failed={failed||undefined}>
  <span className="sp-icon-waves" aria-hidden="true"><i/><i/><i/></span>
  <button type="button" className="sp-icon-play" aria-label={failed?'This sound could not play':playing?'Pause sound':label} onClick={pb.toggle}>{playing?<Pause size={24} fill="currentColor"/>:<Play size={24} fill="currentColor"/>}</button>
  <span className="sp-icon-waves is-right" aria-hidden="true"><i/><i/><i/></span>
  <audio key={src} ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
 </div>;
 if(variant==='pulse'||variant==='now'){
  const ratio=(x:number)=>{const r=bar.current?.getBoundingClientRect();return r&&r.width?clamp((x-r.left)/r.width,0,1):0;};
  const shown=drag??played,secs=(v:number)=>fmtTime(Math.round(v));
  const nowAt=known?secs((drag!==null?drag*selLen:Math.max(0,at-clip.trimStart))):'0:00',len=known?secs(selLen):'–:––';
  const end=(e:React.PointerEvent)=>{if(!dragging.current)return;dragging.current=false;pb.seek(clip.trimStart+ratio(e.clientX)*selLen);setDrag(null);};
  const replay=()=>{pb.seek(clip.trimStart);if(!playing)pb.play();};
  const seekBar=(cls:string)=><div ref={bar} className={cls} role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(shown*100)} tabIndex={known?0:-1} data-dragging={drag!==null||undefined}
     onPointerDown={e=>{if(!known)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}dragging.current=true;setDrag(ratio(e.clientX));}}
     onPointerMove={e=>{if(dragging.current)setDrag(ratio(e.clientX));}} onPointerUp={end} onPointerCancel={()=>{dragging.current=false;setDrag(null);}}
     onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();pb.seek(at-1);}else if(e.key==='ArrowRight'){e.preventDefault();pb.seek(at+1);}else if(e.key===' '){e.preventDefault();pb.toggle();}}}>
     <i style={{width:`${shown*100}%`}}/><b style={{left:`${shown*100}%`}}/>
    </div>;
  if(variant==='now')return <div className={`sp sp-now ${className}`.trim()} data-playing={playing||undefined} data-failed={failed||undefined} data-live={live?true:undefined}>
   <div className="sp-now-head">
    <button type="button" className="sp-now-tile" aria-label={failed?'This sound could not play':playing?'Pause sound':label} onClick={pb.toggle}>{Array.from({length:5},(_,i)=><i key={i} style={live?{height:`${Math.round(18+(live[i]||0)*82)}%`}:undefined}/>)}</button>
    <div className="sp-now-copy"><span className="sp-now-label">{failed?'Sound could not play':playing?'Playing':'Listen first'}</span>{title}</div>
   </div>
   <div className="sp-now-controls">
    <button type="button" className="sp-now-play" aria-label={playing?'Pause sound':label} onClick={pb.toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
    {seekBar('sp-now-bar sp-pulse-bar')}
    <span className="sp-now-time">{nowAt} / {len}</span>
    <button type="button" className="sp-now-replay" aria-label="Replay from the start" disabled={!known} onClick={replay}><RotateCcw size={15}/></button>
    {extra}
   </div>
   <audio key={src} ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
  </div>;
  return <div className={`sp sp-pulse ${className}`.trim()} data-playing={playing||undefined} data-failed={failed||undefined}>
   <div className="sp-pulse-orb">
    <span className="sp-pulse-ring" aria-hidden="true"/><span className="sp-pulse-ring" aria-hidden="true"/><span className="sp-pulse-ring" aria-hidden="true"/>
    <button type="button" className="sp-pulse-play" aria-label={playing?'Pause sound':label} onClick={pb.toggle}>{playing?<Pause size={20} fill="currentColor"/>:<Play size={20} fill="currentColor"/>}</button>
   </div>
   <div className="sp-pulse-body">
    <div className="sp-pulse-top"><span className="sp-pulse-title">{failed?'This sound could not play':'Listen carefully'}</span></div>
    {seekBar('sp-pulse-bar')}
    <div className="sp-pulse-actions"><button type="button" className="sp-pulse-replay" disabled={!known} onClick={replay}><RotateCcw size={13}/>Replay</button><span className="sp-pulse-time">{nowAt} / {len}</span></div>
   </div>
   <audio key={src} ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
  </div>;
 }
 if(variant==='card'||variant==='media'){
  const seekAt=(x:number)=>{const r=bar.current?.getBoundingClientRect();if(!r||!known)return;pb.seek(clip.trimStart+clamp((x-r.left)/r.width,0,1)*selLen);};
  const title=failed?'This sound could not play':(displayName||'Question sound');
  return <div className={`sp sp-card ${className}`.trim()} data-playing={playing||undefined} data-failed={failed||undefined}>
   <button type="button" className="sp-card-play" aria-label={playing?'Pause sound':label} onClick={pb.toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
   <div className="sp-card-body">
    <div className="sp-card-top"><span className="sp-card-name" title={tip||title}>{title}</span><span className="sp-card-time">{cur} / {total}</span></div>
    <div ref={bar} className="sp-card-bar" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(played*100)} tabIndex={known?0:-1}
     onPointerDown={e=>{if(!known)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}seekAt(e.clientX);}} onPointerMove={e=>{if(e.buttons&1)seekAt(e.clientX);}}
     onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();pb.seek(at-1);}else if(e.key==='ArrowRight'){e.preventDefault();pb.seek(at+1);}else if(e.key===' '){e.preventDefault();pb.toggle();}}}>
     <i style={{width:`${played*100}%`}}/><b style={{left:`${played*100}%`}}/>
    </div>
   </div>
   <audio key={src} ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
  </div>;
 }
 const seekAt=(x:number)=>{const r=wave.current?.getBoundingClientRect();if(!r||!known)return;pb.seek(clip.trimStart+clamp((x-r.left)/r.width,0,1)*selLen);};
 return <div className={`sp sp-${variant} ${className}`.trim()} data-playing={playing||undefined} data-failed={failed||undefined}>
  <button type="button" className="sp-play" aria-label={playing?'Pause sound':label} onClick={pb.toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
  <div className="sp-body">
   <div ref={wave} className="sp-wave" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(played*100)} tabIndex={known?0:-1}
    onPointerDown={e=>{if(!known)return;e.preventDefault();try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}seekAt(e.clientX);}} onPointerMove={e=>{if(e.buttons&1)seekAt(e.clientX);}}
    onKeyDown={e=>{if(e.key==='ArrowLeft'){e.preventDefault();pb.seek(at-1);}else if(e.key==='ArrowRight'){e.preventDefault();pb.seek(at+1);}else if(e.key===' '){e.preventDefault();pb.toggle();}}}>
    {heights.map((h,i)=><i key={i} data-on={i/bars<=played||undefined} style={{height:`${Math.round(14+h*86)}%`}}/>)}
   </div>
  </div>
  <span className="sp-time">{failed?'!':known?(playing||at>clip.trimStart+0.1?cur:total):''}</span>
  <audio key={src} ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
 </div>;
}

/* ───────── field ───────── */
type Busy={label:string;progress?:number;cancel?:()=>void};
export function SoundField({audio,audioName,onAudioNameChange,edit,onEditChange,onChange,onError,onClearError,title='Question sound',hint='Record, upload, or paste a link to an audio file',assetLayout,linkLabel='Link',uploadEmptyLabel='Upload'}:{audio?:string;audioName?:string;onAudioNameChange?:(value?:string)=>void;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string;assetLayout?:boolean;linkLabel?:string;uploadEmptyLabel?:string}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[level,setLevel]=useState(0),[countIn,setCountIn]=useState<number|null>(null);
 const [busy,setBusy]=useState<Busy|null>(null),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false),[warn,setWarn]=useState(''),[durationHint,setDurationHint]=useState<number|undefined>(),[dragOver,setDragOver]=useState(false);
 const [pending,setPending]=useState<{url:string;name:string;size:number;duration:number}|null>(null);
 const live=useRef<{recorder:MediaRecorder;stream:MediaStream;timer:number;ctx?:AudioContext}|null>(null),input=useRef<HTMLInputElement>(null),cancelCount=useRef(false);
 const linked=!!audio?.startsWith('https://'),drive=!!audio&&isDriveLink(audio);

 useEffect(()=>()=>{const l=live.current;if(l){window.clearInterval(l.timer);l.stream.getTracks().forEach(t=>t.stop());l.ctx?.close().catch(()=>{});}},[]);
 useEffect(()=>{if(!audio){setLinking(false);setDurationHint(undefined);}},[audio]);
 useEffect(()=>{
  setWarn('');if(!linked)return;
  if(drive){setWarn(DRIVE_SHARE_LEGACY_HINT);return;}
  let cancelled=false;
  void probeAudioLink(audio!).then(ok=>{if(!cancelled&&!ok)setWarn('This linked sound cannot play. Remove it, then use a direct audio URL or upload the file.');});
  return()=>{cancelled=true;};
 },[audio,linked,drive]);

 function closePending(){if(pending)URL.revokeObjectURL(pending.url);setPending(null);setClipOpen(false);}
 function clearAudio(){setLinking(false);setWarn('');setDurationHint(undefined);onEditChange?.(undefined);onAudioNameChange?.(undefined);onChange(undefined);}
 function recordingFileName(mime:string){const sub=mime.split('/')[1]?.split(';')[0]?.toLowerCase()||'webm';return normalizeSoundFileName(`Recording.${MIME_EXT[sub]||sub.replace(/^x-/,'')||'webm'}`);}

 async function applyLink(next:string){
  onError('');
  const raw=next.trim();
  if(!raw){onAudioNameChange?.(undefined);onChange(undefined);return true;}
  const url=resolveMediaLink(raw);
  if(driveFileId(raw)||isDriveLink(url)){pushMediaLinkError(DRIVE_SHARE_REJECT);return false;}
  if(!/^https:\/\//i.test(url)){pushMediaLinkError('Use an https link to the sound file, or upload the file.');return false;}
  if(url.length>2048){pushMediaLinkError('That link is too long.');return false;}
  setBusy({label:'Checking sound…'});
  const ok=await probeAudioLink(raw);
  setBusy(null);
  if(!ok){pushMediaLinkError('No playable sound was found at this link. Paste a direct link to an audio file (MP3, WAV, OGG, …), or upload the file.');return false;}
  onEditChange?.(undefined);onChange(url);
  const base=basenameFromUrl(url);onAudioNameChange?.(base?normalizeSoundFileName(base):undefined);
  return true;
 }

 async function upload(file?:File){
  if(!file||busy||recording)return;onError('');
  const typed=typedMediaFile(file,'audio') as File|Blob|null;
  if(!typed){onError('Choose a sound file (MP3, M4A, WAV, OGG or WebM).');return;}
  const blob=typed.type?typed:new Blob([typed],{type:guessType(file.name)||'audio/mpeg'});
  if(blob.size>80*1024*1024){onError(`That file is ${formatBytes(blob.size)} — too large to open here.`);return;}
  const fits=dataUrlLength(blob.size,blob.type)<=MAX_AUDIO_CHARS;
  setBusy({label:fits?'Adding sound…':'Opening sound…'});
  try{
   const url=URL.createObjectURL(blob);
   let meta=await probeMediaSrc(url,'audio',5000);
   if(!meta.ok&&blob.size>0)meta={ok:true,duration:meta.duration};
   if(!meta.ok){URL.revokeObjectURL(url);throw new Error('This sound file could not be opened in your browser.');}
   if(fits&&(meta.duration<=MAX_AUDIO_SECONDS+5||meta.duration<=0)){
    const data=await blobToDataUrl(blob,p=>setBusy({label:'Adding sound…',progress:p}));
    URL.revokeObjectURL(url);
    if(!audioSafe(data))throw new Error('This sound could not be saved.');
    onEditChange?.(undefined);onChange(data);setDurationHint(meta.duration||undefined);onAudioNameChange?.(normalizeSoundFileName(file.name));
    return;
   }
   // Too big or too long: trim in the editor, then only the selection is compressed.
   setPending({url,name:file.name,size:blob.size,duration:meta.duration});setClipOpen(true);
  }catch(e:any){onError(e?.message||'This sound could not be added.');}
  finally{setBusy(null);}
 }
 async function acceptBaked(data:string,len:number,name?:string){
  if(data.length>MAX_AUDIO_CHARS)throw new Error(`Still too large (${formatBytes(Math.round(data.length*0.75))}). Choose a shorter section.`);
  if(!audioSafe(data))throw new Error('This sound could not be saved.');
  onEditChange?.(undefined);onChange(data);setDurationHint(len);
  if(name!==undefined)onAudioNameChange?.(normalizeSoundFileName(name));
  closePending();
 }

 async function start(){
  onError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){onError('This browser cannot record sound. Upload a sound file instead.');return;}
  let stream:MediaStream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e:any){onError(e?.name==='NotAllowedError'?'Allow the microphone to record, or upload a sound file instead.':'The microphone could not start.');return;}
  let ctx:AudioContext|undefined,analyser:AnalyserNode|undefined;
  try{const Ctx=window.AudioContext||(window as any).webkitAudioContext;ctx=new Ctx();analyser=ctx.createAnalyser();analyser.fftSize=256;ctx.createMediaStreamSource(stream).connect(analyser);}catch{}
  cancelCount.current=false;
  for(const n of [3,2,1]){if(cancelCount.current)break;setCountIn(n);playPreset('tick');await new Promise(r=>window.setTimeout(r,900));}
  setCountIn(null);
  if(cancelCount.current){stream.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});return;}
  playPreset('go');await new Promise(r=>window.setTimeout(r,250));
  const {recorder,done}=record(stream,recorderType()),began=Date.now(),buf=analyser?new Uint8Array(analyser.frequencyBinCount):null;
  const timer=window.setInterval(()=>{
   const s=(Date.now()-began)/1000;setSeconds(s);
   if(analyser&&buf){analyser.getByteTimeDomainData(buf);let m=0;for(let i=0;i<buf.length;i++)m=Math.max(m,Math.abs(buf[i]-128));setLevel(m/128);}
   if(s>=MAX_AUDIO_SECONDS&&recorder.state==='recording')recorder.stop();
  },100);
  live.current={recorder,stream,timer,ctx};setSeconds(0);setLevel(0);setRecording(true);
  const blob=await done,elapsed=(Date.now()-began)/1000;
  window.clearInterval(timer);stream.getTracks().forEach(t=>t.stop());ctx?.close().catch(()=>{});live.current=null;setRecording(false);
  if(!blob.size){onError('Nothing was recorded. Try again.');return;}
  const data=await blobToDataUrl(blob);
  if(data.length>MAX_AUDIO_CHARS){onError('This recording is too large. '+tooLong);return;}
  onEditChange?.(undefined);onChange(data);
  onAudioNameChange?.(recordingFileName(blob.type||recorderType()||'audio/webm'));
  setDurationHint(Math.max(0.5,elapsed));
 }
 function stop(){const r=live.current?.recorder;if(r&&r.state==='recording')r.stop();}

 const shownName=audio?soundDisplayName(audio,audioName):'',fullName=audio?soundFileTitle(audio,audioName):'';
 const openLink=()=>{onClearError?.();setLinking(v=>!v);};
 const pickFile=()=>{setLinking(false);input.current?.click();};
 const drop={
  onDragOver:(e:React.DragEvent)=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDragOver(true);}},
  onDragLeave:()=>setDragOver(false),
  onDrop:(e:React.DragEvent)=>{e.preventDefault();setDragOver(false);void upload(e.dataTransfer.files?.[0]);},
 };
 const recordLabel=audio?'Re-record':'Record';
 const uploadLabel=busy?busy.label:audio&&audio.startsWith('data:')?'Upload':(uploadEmptyLabel||'Upload');
 const countBtn=(cls:string)=>countIn!==null&&<button type="button" className={cls} aria-label="Cancel recording" onClick={()=>{cancelCount.current=true;}}><span className="sound-count-num" aria-live="assertive">{countIn}</span>Starting… Cancel</button>;
 const assetActions=countIn!==null?countBtn('media-action is-recording'):recording?<button type="button" className="media-action is-recording" aria-label="Stop recording" title="Stop recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop recording</button>:<>
  <button type="button" className="media-action" disabled={!!busy} aria-label={audio?'Re-record sound':'Record sound'} onClick={start}><Mic size={14}/>{recordLabel}</button>
  <button type="button" className="media-action" disabled={!!busy} aria-label={audio&&audio.startsWith('data:')?'Change sound file':'Upload sound file'} onClick={pickFile}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio&&audio.startsWith('data:')?<RefreshCw size={14}/>:<Upload size={14}/>}{uploadLabel}</button>
  {!recording&&<button type="button" className="media-action" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} aria-controls={linking?'question-sound-link':undefined} disabled={!!busy} onClick={openLink}><Link2 size={14}/>{linkLabel}</button>}
  {audio&&!recording&&!drive&&<button type="button" className="media-action" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
 </>;
 const removeBtn=audio&&!recording&&countIn===null&&<button type="button" className="media-action is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={clearAudio}><Trash2 size={14}/></button>;
 const player=audio&&!recording&&!drive&&<div className="asset-media-extra"><SoundPlayer key={JSON.stringify(edit??null)} src={audio} edit={edit} durationHint={durationHint} variant="card" displayName={shownName} fileTitle={fullName} label={`Play ${title.toLowerCase()}`} className="editor-sound-player"/></div>;
 const legacy=audio&&!recording&&drive&&<div className="asset-media-extra"><DriveShareLegacyNotice kind="sound"/></div>;
 const progress=busy&&!recording&&<div className="mf-progress" role="status" aria-live="polite"><div className={`mf-progress-bar${busy.progress===undefined?' is-indeterminate':''}`}><i style={busy.progress!==undefined?{width:`${Math.round(busy.progress*100)}%`}:undefined}/></div><div className="mf-progress-row"><span>{busy.label}{busy.progress!==undefined?` ${Math.round(busy.progress*100)}%`:''}</span></div></div>;
 const warnEl=warn&&!recording&&<p className="media-alert" role="status"><AlertCircle size={14} aria-hidden="true"/><span>{warn.includes('cannot play')?<><strong>Linked sound can’t play.</strong> Remove it, upload the file, or use a direct audio URL.</>:warn}</span></p>;
 const linkForm=!recording&&linking&&<MediaLinkForm autoFocus id="question-sound-link" label="Sound link" placeholder="https://example.com/sound.mp3" submitLabel="Add" initialUrl={linked&&!drive?audio!:''} onClearError={onClearError} onCancel={()=>{setLinking(false);onClearError?.();}} onSubmit={async url=>{if(await applyLink(url))setLinking(false);}}/>;
 const clip=clipOpen&&(pending
  ?<MediaClipEditor kind="audio" title="Trim before adding" fileName={pending.name} src={pending.url} durationHint={pending.duration} saveMode="bake" maxSeconds={MAX_AUDIO_SECONDS} onReplace={(data,len)=>acceptBaked(data,len,pending.name)} onSave={()=>closePending()} onCancel={closePending}/>
  :audio?<MediaClipEditor kind="audio" title="Adjust sound" fileName={fullName} src={audio} initial={edit} durationHint={durationHint} onReplace={audio.startsWith('data:')?(data,len)=>acceptBaked(data,len):undefined} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>:null);
 const fileInput=<input ref={input} type="file" hidden aria-label={`Upload ${title.toLowerCase()}`} accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.opus" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>;

 if(assetLayout){
  const badge=recording||countIn!==null?'Recording':!audio?'Not added':warn||drive?'Needs attention':'Added';
  const badgeClass=`asset-state${recording||countIn!==null?' is-warn':!audio?' is-empty':warn||drive?' is-warn':' is-ok'}`;
  const desc=recording||countIn!==null?(countIn!==null?`Recording starts in ${countIn}…`:`Recording… ${fmtTime(seconds)}`):busy?busy.label:(audio&&!drive?'Tap play to preview':hint);
  return <article className={`asset${audio?' has-image':''}${linking?' is-linking':''}${dragOver?' is-dragover':''}`} data-recording={recording||undefined} {...drop}>
   <header className="media-head"><span className="media-ico" aria-hidden="true">{recording||countIn!==null?<span className="sound-rec-dot"/>:<AudioLines size={17}/>}</span><div className="media-headmain"><div className="media-titlerow"><span className="asset-name">{title}</span><span className={badgeClass}>{badge}</span></div><small className="asset-caption">{desc}</small></div>{removeBtn}</header>
   {!recording&&progress}
   {!recording?player:null}
   {!recording?legacy:null}
   {!recording?warnEl:null}
   <div className="asset-actions">{assetActions}</div>
   {fileInput}{linkForm}{clip}
  </article>;
 }

 return <article className={`mf mf-sound${audio?' has-media':''}${dragOver?' is-dragover':''}`} data-recording={recording||undefined} {...drop}>
  <header className="mf-head"><span className="mf-ico" aria-hidden="true"><AudioLines size={18}/></span><div className="mf-headmain"><strong>{title}</strong><small className="mf-caption">{hint}</small></div></header>
  {!recording&&player}{progress}{warnEl}
  <div className="asset-actions">{assetActions}{removeBtn}</div>
  {fileInput}{linkForm}{clip}
 </article>;
}