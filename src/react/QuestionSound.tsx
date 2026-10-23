import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,Mic,Square,Upload,Trash2,RefreshCw,LoaderCircle,AudioLines,Link2,AlertCircle} from 'lucide-react';
import {MediaLinkForm,DriveShareLegacyNotice} from './MediaLinkForm';
import {MAX_AUDIO_CHARS,driveFileId,isDriveLink,resolveMediaLink,resolveMediaPlaybackSrc,DRIVE_SHARE_REJECT,DRIVE_SHARE_LEGACY_HINT,typedMediaFile} from '../question-types.js';
import {MediaClipEditor,normalizeEdit,type MediaEdit} from './MediaClipEditor';
import {Scissors} from 'lucide-react';
import {playPreset} from '../feedback-sounds.js';

const MAX_SECONDS=60,BITRATE=32000;
const time=(s:number)=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
const recorderType=()=>typeof MediaRecorder==='undefined'?'':['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported?.(t))||'';
const guessType=(name:string)=>({mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',webm:'audio/webm'} as any)[name.split('.').pop()?.toLowerCase()||'']||'';
function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).replace(/^data:([^,]*),/,(_,head)=>`data:${head.replace(/\s+/g,'')},`));r.onerror=()=>reject(new Error('Could not read this sound.'));r.readAsDataURL(blob);});}
const tooLong='Keep the sound to about 1 minute or less.';

function record(stream:MediaStream,type:string){
 const recorder=new MediaRecorder(stream,{...(type?{mimeType:type}:{}),audioBitsPerSecond:BITRATE}),chunks:Blob[]=[];
 recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
 const done=new Promise<Blob>(resolve=>{recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType||type||'audio/webm'}));});
 recorder.start(250);
 return {recorder,done};
}

// Large files are played through a recorder once, which shrinks them to a small voice-quality clip.
async function soundFromFile(file:File,progress:(pct:number)=>void){
 const typed=typedMediaFile(file,'audio') as File|Blob|null;
 if(!typed)throw new Error('Choose a sound file (MP3, M4A, WAV, OGG or WebM).');
 const type=typed.type||guessType((file as File).name);
 if(typed.size*1.37+64<=MAX_AUDIO_CHARS)return dataUrl(typed instanceof File&&typed.type?typed:new Blob([typed],{type}));
 if(typed.size>40*1024*1024)throw new Error('This file is too large. '+tooLong);
 const mime=recorderType();if(!mime)throw new Error('This sound is too large to store. '+tooLong);
 const ctx=new AudioContext();
 try{
  await ctx.resume().catch(()=>{});
  if(ctx.state!=='running')throw new Error('This sound is too large to store. '+tooLong);
  const buffer=await ctx.decodeAudioData(await typed.arrayBuffer()).catch(()=>{throw new Error('This sound file could not be opened.');});
  if(buffer.duration>MAX_SECONDS+5)throw new Error(`This clip is ${time(buffer.duration)} long. ${tooLong}`);
  const out=ctx.createMediaStreamDestination(),source=ctx.createBufferSource();source.buffer=buffer;source.connect(out);
  const {recorder,done}=record(out.stream,mime),started=ctx.currentTime;
  const tick=window.setInterval(()=>progress(Math.min(99,Math.round((ctx.currentTime-started)/buffer.duration*100))),250);
  source.onended=()=>{window.clearInterval(tick);recorder.state!=='inactive'&&recorder.stop();};
  source.start();
  const data=await dataUrl(await done);
  if(data.length>MAX_AUDIO_CHARS)throw new Error('This sound is still too large. '+tooLong);
  return data;
 }finally{ctx.close().catch(()=>{});}
}

const MIME_EXT:Record<string,string>={mpeg:'mp3',mp3:'mp3',mp4:'m4a','x-m4a':'m4a',wav:'wav',wave:'wav',ogg:'ogg',webm:'webm',aac:'aac',opus:'opus'};
function extFromDataUrl(src:string){
 const mime=src.match(/^data:audio\/([^;,]+)/i)?.[1]?.toLowerCase()||'';
 return MIME_EXT[mime.split('+')[0]]||mime.replace(/^x-/,'')||'webm';
}
function basenameFromUrl(src:string){
 try{
  const path=decodeURIComponent(new URL(resolveMediaLink(src)).pathname);
  return path.split('/').filter(Boolean).pop()||'';
 }catch{return '';}
}
export function formatSoundFileName(name:string,max=36){
 let base=(name||'').replace(/\\/g,'/').split('/').pop()?.trim()||String(name||'').trim();
 base=base.replace(/[\x00-\x1f<>:"|?*]/g,'').replace(/\s+/g,' ');
 if(!base)return 'audio';
 if(base.length<=max)return base;
 const dot=base.lastIndexOf('.');
 if(dot>0&&dot<base.length-1){
  const ext=base.slice(dot),stem=base.slice(0,dot),keep=Math.max(6,max-ext.length-1);
  return `${stem.slice(0,keep)}…${ext}`;
 }
 return `${base.slice(0,max-1)}…`;
}
export function soundFileTitle(src:string,stored?:string){
 const label=typeof stored==='string'?stored.trim():'';
 if(label)return label;
 if(!src)return '';
 if(src.startsWith('data:'))return `audio.${extFromDataUrl(src)}`;
 const file=basenameFromUrl(src);
 return file||'Linked audio';
}
export function soundDisplayName(src:string,stored?:string){
 const title=soundFileTitle(src,stored);
 return title?formatSoundFileName(title):'';
}
export function normalizeSoundFileName(name:string){const base=(name||'').replace(/\\/g,'/').split('/').pop()?.trim().replace(/[\x00-\x1f<>:"|?*]/g,'').replace(/\s+/g,' ')||'';return base.slice(0,120);}
async function waveformPeaks(src:string,bars:number){
 const playback=src.startsWith('https://')?resolveMediaPlaybackSrc(src):src;
 const flat=()=>Array.from({length:bars},()=>28);
 if(!playback)return flat();
 try{
  const res=await fetch(playback);
  if(!res.ok)return flat();
  const ctx=new AudioContext();
  try{
   const buf=await ctx.decodeAudioData(await res.arrayBuffer());
   const ch=buf.getChannelData(0),block=Math.max(1,Math.floor(ch.length/bars));
   return Array.from({length:bars},(_,i)=>{let sum=0;for(let j=0;j<block;j++)sum+=Math.abs(ch[i*block+j]??0);return Math.round(18+Math.min(78,sum/block*520));});
  }finally{await ctx.close().catch(()=>{});}
 }catch{return flat();}
}

function useSoundWaveHeights(audio:React.RefObject<HTMLAudioElement|null>,src:string,bars:number,playing:boolean){
 const [peaks,setPeaks]=useState<number[]>(()=>Array.from({length:bars},()=>28));
 const [live,setLive]=useState<number[]|null>(null);
 const graph=useRef<{el:HTMLAudioElement;ctx:AudioContext;analyser:AnalyserNode;raf:number}|null>(null);
 useEffect(()=>{let cancelled=false;setPeaks(Array.from({length:bars},()=>28));void waveformPeaks(src,bars).then(p=>{if(!cancelled)setPeaks(p);});return()=>{cancelled=true;};},[src,bars]);
 useEffect(()=>{
  const el=audio.current;
  if(!playing||!el){if(graph.current)cancelAnimationFrame(graph.current.raf);setLive(null);return;}
  let cancelled=false;
  const tick=()=>{
   if(cancelled||!graph.current)return;
   const data=new Uint8Array(graph.current.analyser.frequencyBinCount);
   graph.current.analyser.getByteFrequencyData(data);
   const step=Math.max(1,Math.floor(data.length/bars));
   setLive(Array.from({length:bars},(_,i)=>{let s=0;for(let j=0;j<step;j++)s+=data[i*step+j]??0;return Math.round(18+(s/step/255)*78);}));
   graph.current.raf=requestAnimationFrame(tick);
  };
  void (async()=>{
   try{
    if(!graph.current||graph.current.el!==el){
     const ctx=new AudioContext();await ctx.resume();
     const analyser=ctx.createAnalyser();analyser.fftSize=128;analyser.smoothingTimeConstant=.68;
     const node=ctx.createMediaElementSource(el);node.connect(analyser);analyser.connect(ctx.destination);
     graph.current={el,ctx,analyser,raf:0};
    }else await graph.current.ctx.resume();
    graph.current!.raf=requestAnimationFrame(tick);
   }catch{setLive(null);}
  })();
  return()=>{cancelled=true;if(graph.current)cancelAnimationFrame(graph.current.raf);setLive(null);};
 },[playing,bars,audio,src]);
 return live??peaks;
}

export function probeAudioLink(url:string){
 const playback=resolveMediaPlaybackSrc(resolveMediaLink(String(url||'').trim()));
 return new Promise<boolean>(resolve=>{
  const el=new Audio(),finish=(ok:boolean)=>{el.removeAttribute('src');el.load();resolve(ok);};
  const timer=window.setTimeout(()=>finish(false),15000);
  el.onloadedmetadata=()=>{window.clearTimeout(timer);finish(Number.isFinite(el.duration)&&el.duration>0);};
  el.onerror=()=>{window.clearTimeout(timer);finish(false);};
  el.src=playback;
 });
}

export function SoundPlayer({src,label='Play sound',className='',variant='default',edit,displayName,fileTitle}:{src:string;label?:string;className?:string;variant?:'default'|'overlay'|'media';edit?:MediaEdit;displayName?:string;fileTitle?:string}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[at,setAt]=useState(0),[length,setLength]=useState(0),[failed,setFailed]=useState(false);
 const clip=length>0?normalizeEdit(edit,length):edit;
 useEffect(()=>{setPlaying(false);setAt(0);setLength(0);setFailed(false);return()=>audio.current?.pause();},[src]);
 useEffect(()=>{const a=audio.current;if(a){a.muted=!!clip?.muted;a.volume=clip?.volume??1;}},[clip?.muted,clip?.volume,src]);
 const known=Number.isFinite(length)&&length>0;
 const played=known?(clip?Math.max(0,Math.min(1,(at-clip.trimStart)/Math.max(0.05,clip.trimEnd-clip.trimStart))):at/length):(playing?1:0);
 const bars=variant==='media'?40:30;
 const waveHeights=useSoundWaveHeights(audio,src,bars,playing&&variant==='overlay');
 const name=displayName||soundDisplayName(src);
 const tip=fileTitle||name;
 function toggle(){const a=audio.current;if(!a)return;if(a.paused){setFailed(false);if(clip&&a.currentTime<clip.trimStart)a.currentTime=clip.trimStart;a.play().catch(()=>setFailed(true));}else a.pause();}
 function seek(e:React.MouseEvent<HTMLSpanElement>){const a=audio.current;if(!a||!known)return;const r=e.currentTarget.getBoundingClientRect();const f=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),t=clip?clip.trimStart+f*(clip.trimEnd-clip.trimStart):f*length;const next=clip?Math.min(clip.trimEnd,Math.max(clip.trimStart,t)):Math.min(length,Math.max(0,t));a.currentTime=next;setAt(next);}
 function onTime(){const a=audio.current;if(!a)return;setAt(a.currentTime);if(clip&&a.currentTime>=clip.trimEnd-0.02&&!a.paused){a.pause();a.currentTime=clip.trimStart;setAt(a.currentTime);setPlaying(false);}}
 if(isDriveLink(src))return <DriveShareLegacyNotice kind="sound"/>;
 const durationLabel=known?time(clip?clip.trimEnd-clip.trimStart:length):'0:00';
 return <div className={`sound-player ${variant==='overlay'?'is-overlay':variant==='media'?'is-media':''} ${className}`.trim()} data-playing={playing||undefined}>
  <button type="button" className="sound-play" aria-label={playing?'Pause sound':label} onClick={toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
  {variant==='media'
   ? <span className="sound-media-body"><span className="sound-filename" title={failed||tip===name?undefined:tip}>{failed?'Could not play':name}</span><span className="sound-progress" onClick={seek} role="presentation" aria-hidden="true"><i style={{width:`${played*100}%`}}/></span><span className="sound-times" aria-hidden="true"><span>{known?time(clip?Math.max(0,at-clip.trimStart):at):'0:00'}</span><span>{durationLabel}</span></span></span>
   :variant==='overlay'
   ? <span className="sound-wave" onClick={seek} role="presentation">{Array.from({length:bars},(_,i)=><i key={i} data-on={i/bars<=played||undefined} style={{height:`${waveHeights[i]??28}%`}}/>)}</span>
   : <span className="sound-body"><span className="sound-title">{failed?'This sound could not play':playing?'Playing':'Listen'}</span><span className="sound-bar" onClick={seek}><i style={{width:`${known?at/length*100:playing?100:0}%`}} data-live={!known&&playing||undefined}/></span></span>}
  {variant!=='media'&&<span className="sound-time">{known?time(playing||at?at:length):at?time(at):''}</span>}
  <audio ref={audio} src={src.startsWith('https://')?resolveMediaPlaybackSrc(src):src} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={e=>{setPlaying(false);const start=clip?.trimStart??0;e.currentTarget.currentTime=start;setAt(start);}} onTimeUpdate={onTime} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onDurationChange={e=>setLength(e.currentTarget.duration)} onError={()=>setFailed(true)}/>
 </div>;
}

export function SoundField({audio,audioName,onAudioNameChange,edit,onEditChange,onChange,onError,onClearError,title='Question sound',hint='Optional · record, upload, or paste an https audio file',assetLayout,linkLabel='Paste link',uploadEmptyLabel='Upload'}:{audio?:string;audioName?:string;onAudioNameChange?:(value?:string)=>void;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string;assetLayout?:boolean;linkLabel?:string;uploadEmptyLabel?:string}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(''),[link,setLink]=useState(''),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false),[warn,setWarn]=useState('');
 const live=useRef<{recorder:MediaRecorder,stream:MediaStream,timer:number}|null>(null),input=useRef<HTMLInputElement>(null);
 const [countIn,setCountIn]=useState<number|null>(null),cancelCount=useRef(false);
 useEffect(()=>()=>{const l=live.current;if(l){window.clearInterval(l.timer);l.stream.getTracks().forEach(t=>t.stop());}},[]);
 useEffect(()=>{if(audio?.startsWith('https://'))setLink(audio);else if(!audio){setLink('');setLinking(false);}},[audio]);
 useEffect(()=>{
  setWarn('');
  if(!audio?.startsWith('https://'))return;
  if(isDriveLink(audio)){setWarn(DRIVE_SHARE_LEGACY_HINT);return;}
  let cancelled=false;
  void probeAudioLink(audio).then(ok=>{if(!cancelled&&!ok)setWarn('This linked sound cannot play. Remove it, then use a direct audio URL or upload the file.');});
  return()=>{cancelled=true;};
 },[audio]);
 async function applyLink(next?:string){
  onError('');
  const raw=(next??link).trim();
  if(!raw){onAudioNameChange?.(undefined);onChange(undefined);return true;}
  const url=resolveMediaLink(raw);
  if(driveFileId(raw)||isDriveLink(url)){onError(DRIVE_SHARE_REJECT);return false;}
  if(!/^https:\/\//i.test(url)){onError('Use an https link to the sound file, or upload the file.');return false;}
  if(url.length>2048){onError('That link is too long.');return false;}
  setBusy('Checking sound…');
  const ok=await probeAudioLink(raw);
  setBusy('');
  if(!ok){
   onError('No sound was found at this link. Paste a direct link to an audio file (MP3, WAV, OGG, …), or upload the file.');
   return false;
  }
  onEditChange?.(undefined);onChange(url);
  const linked=basenameFromUrl(url);
  onAudioNameChange?.(linked?normalizeSoundFileName(linked):undefined);
  return true;
 }
 function recordingFileName(mime:string){
  const sub=mime.split('/')[1]?.split(';')[0]?.toLowerCase()||'webm';
  const ext=MIME_EXT[sub]||sub.replace(/^x-/,'')||'webm';
  return normalizeSoundFileName(`Recording.${ext}`);
 }
 async function start(){
  onError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){onError('This browser cannot record sound. Upload a sound file instead.');return;}
  let stream:MediaStream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e:any){onError(e?.name==='NotAllowedError'?'Allow the microphone to record, or upload a sound file instead.':'The microphone could not start.');return;}
  cancelCount.current=false;
  for(const n of [3,2,1]){if(cancelCount.current)break;setCountIn(n);playPreset('tick');await new Promise(r=>window.setTimeout(r,1000));}
  setCountIn(null);
  if(cancelCount.current){stream.getTracks().forEach(t=>t.stop());return;}
  playPreset('go');await new Promise(r=>window.setTimeout(r,300));
  const {recorder,done}=record(stream,recorderType()),began=Date.now();
  const timer=window.setInterval(()=>{const s=(Date.now()-began)/1000;setSeconds(s);if(s>=MAX_SECONDS&&recorder.state==='recording')recorder.stop();},200);
  live.current={recorder,stream,timer};setSeconds(0);setRecording(true);
  const blob=await done;
  window.clearInterval(timer);stream.getTracks().forEach(t=>t.stop());live.current=null;setRecording(false);
  if(!blob.size){onError('Nothing was recorded. Try again.');return;}
  const data=await dataUrl(blob);
  if(data.length>MAX_AUDIO_CHARS){onError('This recording is too large. '+tooLong);return;}
  onEditChange?.(undefined);onChange(data);
  onAudioNameChange?.(recordingFileName(blob.type||recorderType()||'audio/webm'));
 }
 function stop(){const r=live.current?.recorder;if(r&&r.state==='recording')r.stop();}
 function clearAudio(){setLinking(false);setLink('');setWarn('');onEditChange?.(undefined);onAudioNameChange?.(undefined);onChange(undefined);}
 async function upload(file?:File){
  if(!file)return;onError('');setBusy('Adding…');
  try{onEditChange?.(undefined);onChange(await soundFromFile(file,pct=>setBusy(`Shrinking… ${pct}%`)));onAudioNameChange?.(normalizeSoundFileName(file.name));}
  catch(e:any){onError(e.message||'This sound could not be added.');}
  finally{setBusy('');}
 }
 const countBtn=(cls:string)=>countIn!==null&&<button type="button" className={cls} aria-label="Cancel recording" onClick={()=>{cancelCount.current=true;}}><span className="sound-count-num" aria-live="assertive">{countIn}</span>Starting… Cancel</button>;
 const caption=countIn!==null?`Recording starts in ${countIn}…`:recording?`Recording… ${time(seconds)} of ${time(MAX_SECONDS)}`:busy||(assetLayout&&audio&&!recording?'':audio?.startsWith('https://')&&!isDriveLink(audio)?'Linked audio':audio&&!assetLayout?'Ready to preview':hint);
 const recordLabel=audio?'Re-record':'Record';
 const uploadLabel=busy?'Adding…':audio&&!audio.startsWith('https://')?'Upload':(uploadEmptyLabel||'Upload');
 const assetActions=countIn!==null?countBtn('media-action is-recording'):recording?<button type="button" className="media-action is-recording" aria-label="Stop recording" title="Stop recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop recording</button>:<>
  <button type="button" className="media-action" disabled={!!busy} aria-label={audio?'Re-record sound':'Record sound'} onClick={start}><Mic size={14}/>{recordLabel}</button>
  <button type="button" className="media-action" disabled={!!busy} aria-label={audio&&!audio.startsWith('https://')?'Change sound file':'Upload sound file'} onClick={()=>{setLinking(false);input.current?.click();}}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio&&!audio.startsWith('https://')?<RefreshCw size={14}/>:<Upload size={14}/>}{uploadLabel}</button>
  {!recording&&<button type="button" className="media-action" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} aria-controls={linking?'question-sound-link':undefined} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/>{linkLabel}</button>}
  {audio&&!recording&&!isDriveLink(audio)&&<button type="button" className="media-action" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
  {audio&&<button type="button" className="media-action is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={clearAudio}><Trash2 size={14}/></button>}
 </>;
 const inlineActions=countIn!==null?countBtn('is-recording'):recording?<button type="button" className="is-recording" aria-label="Stop recording" title="Stop recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop</button>:<>
  <button type="button" disabled={!!busy} aria-label={audio?'Re-record sound':'Record sound'} onClick={start}><Mic size={14}/><span className="editor-action-text">{recordLabel}</span></button>
  <button type="button" disabled={!!busy} aria-label={audio&&!audio.startsWith('https://')?'Change sound file':'Upload sound file'} onClick={()=>{setLinking(false);input.current?.click();}}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio&&!audio.startsWith('https://')?<RefreshCw size={14}/>:<Upload size={14}/>}<span className="editor-action-text">{audio&&!audio.startsWith('https://')?'Change':'Upload'}</span></button>
  {!recording&&<button type="button" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} aria-controls={linking?'question-sound-link':undefined} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/><span className="editor-action-text">Link</span></button>}
  {audio&&!recording&&!isDriveLink(audio)&&<button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/><span className="editor-action-text">Edit</span></button>}
  {audio&&<button type="button" className="is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={clearAudio}><Trash2 size={14}/></button>}
 </>;
 const shownName=audio?soundDisplayName(audio,audioName):'';
 const fullName=audio?soundFileTitle(audio,audioName):'';
 const player=audio&&!recording&&!isDriveLink(audio)&&(assetLayout?<div className="asset-media-extra"><SoundPlayer src={audio} edit={edit} variant="media" displayName={shownName} fileTitle={fullName} label={`Play ${title.toLowerCase()}`} className="editor-sound-player"/></div>:<SoundPlayer src={audio} edit={edit} displayName={shownName} fileTitle={fullName} label={`Play ${title.toLowerCase()}`} className="quiz-sound editor-sound-player"/>);
 const legacy=audio&&!recording&&isDriveLink(audio)&&<DriveShareLegacyNotice kind="sound"/>;
 const warnEl=warn&&!recording&&<p className={assetLayout?'media-alert':'editor-inline-warn'} role="status"><AlertCircle size={14} aria-hidden="true"/><span>{assetLayout&&warn.includes('cannot play')?<><strong>Linked sound can’t play.</strong> Remove it, upload the file, or use a direct audio URL.</>:warn}</span></p>;
 const linkForm=!recording&&linking&&<MediaLinkForm autoFocus id="question-sound-link" label="Sound link" placeholder="https://example.com/sound.mp3" submitLabel="Add" initialUrl={audio?.startsWith('https://')&&!isDriveLink(audio)?audio:link} onClearError={onClearError} onCancel={()=>{setLink('');setLinking(false);onClearError?.();}} onSubmit={async url=>{setLink(url);if(await applyLink(url))setLinking(false);}}/>;
 const clip=clipOpen&&audio&&<MediaClipEditor kind="audio" title={`Edit ${title.toLowerCase()}`} src={audio} initial={edit} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>;
 const fileInput=<input ref={input} type="file" hidden aria-label={`Upload ${title.toLowerCase()}`} accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.opus" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>;
 if(assetLayout){
  const badge=recording?'Recording':!audio?'Not added':warn||isDriveLink(audio)?'Needs attention':'Added';
  const badgeClass=`asset-state${recording?' is-warn':!audio?' is-empty':warn||isDriveLink(audio)?' is-warn':' is-ok'}`;
  const desc=recording?caption:(audio&&!isDriveLink(audio)?'Tap play to preview':hint);
  const legacyExtra=legacy&&<div className="asset-media-extra">{legacy}</div>;
  return <article className={`asset${audio?' has-image':''}${linking?' is-linking':''}`} data-recording={recording||undefined}>
   <header className="media-head"><span className="media-ico" aria-hidden="true">{recording?<span className="sound-rec-dot"/>:<AudioLines size={17}/>}</span><div className="media-headmain"><div className="media-titlerow"><span className="asset-name">{title}</span><span className={badgeClass}>{badge}</span></div><small className="asset-caption">{desc}</small></div></header>
   {!recording?player:null}
   {!recording?legacyExtra:null}
   {!recording?warnEl:null}
   <div className="asset-actions">{assetActions}</div>
   {fileInput}{linkForm}{clip}
  </article>;
 }
 return <div className={`editor-inline-image editor-sound${audio?' has-image':''}${linking?' is-linking':''}`} data-recording={recording||undefined}>
  <span className="editor-inline-icon">{recording?<span className="sound-rec-dot" aria-hidden="true"/>:<AudioLines size={18}/>}</span>
  <div className="editor-inline-copy"><strong>{title}</strong><small>{caption}</small></div>
  <div className="editor-inline-actions">{inlineActions}</div>
  {fileInput}{player}{legacy}{warnEl}{linkForm}{clip}
 </div>;
}
