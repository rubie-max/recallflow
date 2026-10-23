import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,Mic,Square,Upload,Trash2,RefreshCw,LoaderCircle,AudioLines,Link2,AlertCircle} from 'lucide-react';
import {MediaLinkForm,DriveShareLegacyNotice} from './MediaLinkForm';
import {MAX_AUDIO_CHARS,driveFileId,isDriveLink,resolveMediaLink,resolveMediaPlaybackSrc,DRIVE_SHARE_REJECT,DRIVE_SHARE_LEGACY_HINT,typedMediaFile} from '../question-types.js';
import {MediaClipEditor,normalizeEdit,type MediaEdit} from './MediaClipEditor';
import {Scissors} from 'lucide-react';

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

export function soundDisplayName(src:string){
 if(!src)return '';
 if(src.startsWith('data:'))return 'Uploaded sound.webm';
 try{
  const path=decodeURIComponent(new URL(resolveMediaLink(src)).pathname);
  const file=path.split('/').filter(Boolean).pop();
  if(file&&file.length<=56)return file;
 }catch{}
 return 'Linked audio';
}
function soundSourceKind(src:string){return src.startsWith('https://')?'Linked':'Uploaded';}
function soundFileTypeLabel(src:string){
 if(src.startsWith('data:')){
  const mime=src.match(/^data:([^;,]+)/i)?.[1]?.toLowerCase()||'';
  if(mime.includes('mpeg'))return 'MP3';
  if(mime.includes('mp4'))return 'M4A';
  if(mime.includes('wav'))return 'WAV';
  if(mime.includes('ogg'))return 'OGG';
  if(mime.includes('webm'))return 'WEBM';
  return 'AUDIO';
 }
 const name=soundDisplayName(src),ext=name.includes('.')?name.split('.').pop()?.toUpperCase():'';
 if(ext&&ext.length<=5)return ext;
 return 'AUDIO';
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

export function SoundPlayer({src,label='Play sound',className='',variant='default',edit,displayName}:{src:string;label?:string;className?:string;variant?:'default'|'overlay'|'media'|'editor-e';edit?:MediaEdit;displayName?:string}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[at,setAt]=useState(0),[length,setLength]=useState(0),[failed,setFailed]=useState(false);
 const clip=length>0?normalizeEdit(edit,length):edit;
 useEffect(()=>{setPlaying(false);setAt(0);setLength(0);setFailed(false);return()=>audio.current?.pause();},[src]);
 useEffect(()=>{const a=audio.current;if(a)a.muted=!!clip?.muted;},[clip?.muted,src]);
 const known=Number.isFinite(length)&&length>0;
 const played=known?(clip?Math.max(0,Math.min(1,(at-clip.trimStart)/Math.max(0.05,clip.trimEnd-clip.trimStart))):at/length):(playing?1:0);
 const bars=30;
 const name=displayName||soundDisplayName(src);
 const sourceKind=soundSourceKind(src);
 const fileType=soundFileTypeLabel(src);
 function toggle(){const a=audio.current;if(!a)return;if(a.paused){setFailed(false);if(clip&&a.currentTime<clip.trimStart)a.currentTime=clip.trimStart;a.play().catch(()=>setFailed(true));}else a.pause();}
 function seek(e:React.MouseEvent<HTMLElement>){const a=audio.current;if(!a||!known)return;const r=e.currentTarget.getBoundingClientRect();const t=(e.clientX-r.left)/r.width*length;const next=clip?Math.min(clip.trimEnd,Math.max(clip.trimStart,t)):Math.min(length,Math.max(0,t));a.currentTime=next;setAt(next);}
 function onTime(){const a=audio.current;if(!a)return;setAt(a.currentTime);if(clip&&a.currentTime>=clip.trimEnd-0.02&&!a.paused){a.pause();a.currentTime=clip.trimStart;setAt(a.currentTime);setPlaying(false);}}
 if(isDriveLink(src))return <DriveShareLegacyNotice kind="sound"/>;
 const durationLabel=known?time(length):'0:00';
 const atLabel=known?time(at):playing||at?time(at):'0:00';
 const progressPct=known?played*100:playing?100:0;
 const audioEl=<audio ref={audio} src={src.startsWith('https://')?resolveMediaPlaybackSrc(src):src} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={e=>{setPlaying(false);const start=clip?.trimStart??0;e.currentTarget.currentTime=start;setAt(start);}} onTimeUpdate={onTime} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onDurationChange={e=>setLength(e.currentTarget.duration)} onError={()=>setFailed(true)}/>;
 if(variant==='editor-e'){
  const durationHint=known?`${Math.round(length)} sec`:durationLabel;
  return <div className={`sound-player is-editor-e ${className}`.trim()} data-playing={playing||undefined}>
   <div className="sound-e-player">
    <button type="button" className="sound-e-play" aria-label={playing?'Pause sound':label} aria-pressed={playing||undefined} onClick={toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
    <div className="sound-e-grow">
     <div className="sound-e-filename">{failed?'Could not play':name}</div>
     <div className="sound-e-filedetails">{sourceKind} <span>{durationHint}</span></div>
    </div>
    <span className="sound-e-filetype">{fileType}</span>
   </div>
   <div className="sound-e-track" role="presentation" onClick={seek}><span style={{width:`${progressPct}%`}}/></div>
   <div className="sound-e-times" aria-hidden="true"><span>{atLabel}</span><span>{durationLabel}</span></div>
   {audioEl}
  </div>;
 }
 return <div className={`sound-player ${variant==='overlay'?'is-overlay':variant==='media'?'is-media':''} ${className}`.trim()} data-playing={playing||undefined}>
  <button type="button" className="sound-play" aria-label={playing?'Pause sound':label} onClick={toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
  {variant==='media'
   ? <><span className="sound-wave" onClick={seek} role="presentation" aria-hidden="true">{Array.from({length:44},(_,i)=><i key={i} data-on={i/44<=played||undefined} style={{height:`${22+((i*19)%78)}%`}}/>)}</span><span className="sound-time" aria-hidden="true">{durationLabel}</span><span className="sound-filename">{failed?'Could not play':name}</span></>
   :variant==='overlay'
   ? <span className="sound-wave" onClick={seek} role="presentation">{Array.from({length:bars},(_,i)=><i key={i} data-on={i/bars<=played||undefined} style={{height:`${30+((i*37)%70)}%`}}/>)}</span>
   : <span className="sound-body"><span className="sound-title">{failed?'This sound could not play':playing?'Playing':'Listen'}</span><span className="sound-bar" onClick={seek}><i style={{width:`${known?at/length*100:playing?100:0}%`}} data-live={!known&&playing||undefined}/></span></span>}
  {variant!=='media'&&<span className="sound-time">{known?time(playing||at?at:length):at?time(at):''}</span>}
  {audioEl}
 </div>;
}

export function SoundField({audio,edit,onEditChange,onChange,onError,onClearError,title='Question sound',hint='Optional · record, upload, or paste an https audio file',assetLayout,linkLabel='Paste link',uploadEmptyLabel='Upload'}:{audio?:string;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string;assetLayout?:boolean;linkLabel?:string;uploadEmptyLabel?:string}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(''),[link,setLink]=useState(''),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false),[warn,setWarn]=useState('');
 const live=useRef<{recorder:MediaRecorder,stream:MediaStream,timer:number}|null>(null),input=useRef<HTMLInputElement>(null);
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
  if(!raw){onChange(undefined);return true;}
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
  return true;
 }
 async function start(){
  onError('');
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){onError('This browser cannot record sound. Upload a sound file instead.');return;}
  let stream:MediaStream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});}
  catch(e:any){onError(e?.name==='NotAllowedError'?'Allow the microphone to record, or upload a sound file instead.':'The microphone could not start.');return;}
  const {recorder,done}=record(stream,recorderType()),began=Date.now();
  const timer=window.setInterval(()=>{const s=(Date.now()-began)/1000;setSeconds(s);if(s>=MAX_SECONDS&&recorder.state==='recording')recorder.stop();},200);
  live.current={recorder,stream,timer};setSeconds(0);setRecording(true);
  const blob=await done;
  window.clearInterval(timer);stream.getTracks().forEach(t=>t.stop());live.current=null;setRecording(false);
  if(!blob.size){onError('Nothing was recorded. Try again.');return;}
  const data=await dataUrl(blob);
  if(data.length>MAX_AUDIO_CHARS){onError('This recording is too large. '+tooLong);return;}
  onEditChange?.(undefined);onChange(data);
 }
 function stop(){const r=live.current?.recorder;if(r&&r.state==='recording')r.stop();}
 async function upload(file?:File){
  if(!file)return;onError('');setBusy('Adding…');
  try{onEditChange?.(undefined);onChange(await soundFromFile(file,pct=>setBusy(`Shrinking… ${pct}%`)));}
  catch(e:any){onError(e.message||'This sound could not be added.');}
  finally{setBusy('');}
 }
 const caption=recording?`Recording… ${time(seconds)} of ${time(MAX_SECONDS)}`:busy||(assetLayout&&audio&&!recording?'':audio?.startsWith('https://')&&!isDriveLink(audio)?'Linked audio':audio&&!assetLayout?'Ready to preview':hint);
 const recordLabel='Record';
 const uploadLabel=busy?'Adding…':audio&&!audio.startsWith('https://')?'Upload':(uploadEmptyLabel||'Upload');
 const linkText=linkLabel==='Paste link'?'Link':linkLabel.replace(/^Add /,'');
 const inlineActions=recording?<button type="button" className="is-recording" aria-label="Stop recording" title="Stop recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop</button>:<>
  <button type="button" disabled={!!busy} aria-label={audio?'Re-record sound':'Record sound'} onClick={start}><Mic size={14}/><span className="editor-action-text">{recordLabel}</span></button>
  <button type="button" disabled={!!busy} aria-label={audio&&!audio.startsWith('https://')?'Change sound file':'Upload sound file'} onClick={()=>{setLinking(false);input.current?.click();}}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio&&!audio.startsWith('https://')?<RefreshCw size={14}/>:<Upload size={14}/>}<span className="editor-action-text">{audio&&!audio.startsWith('https://')?'Change':'Upload'}</span></button>
  {!recording&&<button type="button" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} aria-controls={linking?'question-sound-link':undefined} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/><span className="editor-action-text">Link</span></button>}
  {audio&&!recording&&!isDriveLink(audio)&&<button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/><span className="editor-action-text">Edit</span></button>}
  {audio&&<button type="button" className="is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>{setLinking(false);setLink('');setWarn('');onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={14}/></button>}
 </>;
 const mediaActions=recording?<nav className="sound-e-actions" aria-label={`${title} actions`}><button type="button" className="sound-e-action is-stop" aria-label="Stop recording" onClick={stop}><Square size={15} fill="currentColor"/><span>Stop</span></button></nav>:<>
  <button type="button" className="sound-e-action" disabled={!!busy} aria-label={audio?'Record again':'Record sound'} onClick={start}><Mic size={15}/><span>{recordLabel}</span></button>
  <button type="button" className="sound-e-action is-upload" disabled={!!busy} aria-label={audio&&!audio.startsWith('https://')?'Upload a replacement audio file':'Upload sound file'} onClick={()=>{setLinking(false);input.current?.click();}}>{busy?<LoaderCircle size={15} className="speech-spinner"/>:<Upload size={15}/>}<span>{uploadLabel}</span></button>
  {!recording&&<button type="button" className="sound-e-action" aria-label={`Paste an audio link`} aria-expanded={linking} aria-controls={linking?'question-sound-link':undefined} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={15}/><span>{linkText}</span></button>}
  {audio&&!recording&&!isDriveLink(audio)&&<button type="button" className="sound-e-action" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={15}/><span>Edit</span></button>}
  {audio&&<button type="button" className="sound-e-action is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>{setLinking(false);setLink('');setWarn('');onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={15}/><span>Remove</span></button>}
 </>;
 const actions=assetLayout?mediaActions:inlineActions;
 const player=audio&&!recording&&!isDriveLink(audio)&&(assetLayout?<SoundPlayer src={audio} edit={edit} variant="editor-e" displayName={soundDisplayName(audio)} label={`Play ${title.toLowerCase()}`} className="editor-sound-player"/>:<SoundPlayer src={audio} edit={edit} label={`Play ${title.toLowerCase()}`} className="quiz-sound editor-sound-player"/>);
 const legacy=audio&&!recording&&isDriveLink(audio)&&<DriveShareLegacyNotice kind="sound"/>;
 const warnEl=warn&&!recording&&<p className={assetLayout?'media-alert':'editor-inline-warn'} role="status"><AlertCircle size={14} aria-hidden="true"/><span>{assetLayout&&warn.includes('cannot play')?<><strong>Linked sound can’t play.</strong> Remove it, upload the file, or use a direct audio URL.</>:warn}</span></p>;
 const linkForm=!recording&&linking&&<MediaLinkForm autoFocus id="question-sound-link" label="Sound link" placeholder="https://example.com/sound.mp3" submitLabel="Add" initialUrl={audio?.startsWith('https://')&&!isDriveLink(audio)?audio:link} onClearError={onClearError} onCancel={()=>{setLink('');setLinking(false);onClearError?.();}} onSubmit={async url=>{setLink(url);if(await applyLink(url))setLinking(false);}}/>;
 const clip=clipOpen&&audio&&<MediaClipEditor kind="audio" title={`Edit ${title.toLowerCase()}`} src={audio} initial={edit} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>;
 const fileInput=<input ref={input} type="file" hidden aria-label={`Upload ${title.toLowerCase()}`} accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.opus" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>;
 if(assetLayout){
  const emptyActions=<nav className="sound-e-actions is-empty" aria-label={`${title} actions`}>{mediaActions}</nav>;
  if(!audio&&!recording)return <article className={`asset asset-sound-e is-empty-slot${linking?' is-linking':''}`}><header className="sound-e-head"><span className="sound-e-icon" aria-hidden="true"><AudioLines size={17}/></span><h3 className="sound-e-title">{title}</h3><span className="sound-e-ready is-empty">Not added</span></header><p className="sound-e-hint">{hint}</p>{emptyActions}{fileInput}{linkForm}{clip}</article>;
  const readyLabel=recording?'Recording':warn||isDriveLink(audio||'')?'Needs attention':'Ready';
  const readyClass=`sound-e-ready${recording?' is-recording':warn||isDriveLink(audio||'')?' is-attention':''}`;
  const actionRow=recording?actions:<nav className="sound-e-actions" aria-label={`${title} actions`}>{actions}</nav>;
  return <article className={`asset asset-sound-e${linking?' is-linking':''}`} data-recording={recording||undefined}>
   <header className="sound-e-head"><span className="sound-e-icon" aria-hidden="true"><AudioLines size={17}/></span><h3 className="sound-e-title">{title}</h3><span className={readyClass}>{readyLabel}</span></header>
   {recording?<p className="sound-e-hint is-recording" role="status">{caption}</p>:null}
   {!recording?player:null}
   {!recording?legacy:null}
   {!recording?warnEl:null}
   {actionRow}{fileInput}{linkForm}{clip}
  </article>;
 }
 return <div className={`editor-inline-image editor-sound${audio?' has-image':''}${linking?' is-linking':''}`} data-recording={recording||undefined}>
  <span className="editor-inline-icon">{recording?<span className="sound-rec-dot" aria-hidden="true"/>:<AudioLines size={18}/>}</span>
  <div className="editor-inline-copy"><strong>{title}</strong><small>{caption}</small></div>
  <div className="editor-inline-actions">{inlineActions}</div>
  {fileInput}{player}{legacy}{warnEl}{linkForm}{clip}
 </div>;
}
