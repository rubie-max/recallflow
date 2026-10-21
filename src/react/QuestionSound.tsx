import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,Mic,Square,Upload,Trash2,RefreshCw,LoaderCircle,AudioLines,Link2} from 'lucide-react';
import {MediaLinkForm} from './MediaLinkForm';
import {MAX_AUDIO_CHARS,resolveMediaLink} from '../question-types.js';
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
 const type=file.type.startsWith('audio/')?file.type:guessType(file.name);
 if(!type)throw new Error('Choose a sound file (MP3, M4A, WAV, OGG or WebM).');
 if(file.size*1.37+64<=MAX_AUDIO_CHARS)return dataUrl(file.type?file:new Blob([file],{type}));
 if(file.size>40*1024*1024)throw new Error('This file is too large. '+tooLong);
 const mime=recorderType();if(!mime)throw new Error('This sound is too large to store. '+tooLong);
 const ctx=new AudioContext();
 try{
  await ctx.resume().catch(()=>{});
  if(ctx.state!=='running')throw new Error('This sound is too large to store. '+tooLong);
  const buffer=await ctx.decodeAudioData(await file.arrayBuffer()).catch(()=>{throw new Error('This sound file could not be opened.');});
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

export function SoundPlayer({src,label='Play sound',className='',variant='default',edit}:{src:string;label?:string;className?:string;variant?:'default'|'overlay';edit?:MediaEdit}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[at,setAt]=useState(0),[length,setLength]=useState(0),[failed,setFailed]=useState(false);
 const clip=length>0?normalizeEdit(edit,length):edit;
 useEffect(()=>{setPlaying(false);setAt(0);setLength(0);setFailed(false);return()=>audio.current?.pause();},[src]);
 useEffect(()=>{const a=audio.current;if(a)a.muted=!!clip?.muted;},[clip?.muted,src]);
 const known=Number.isFinite(length)&&length>0;
 const played=known?(clip?Math.max(0,Math.min(1,(at-clip.trimStart)/Math.max(0.05,clip.trimEnd-clip.trimStart))):at/length):(playing?1:0);
 const bars=30;
 function toggle(){const a=audio.current;if(!a)return;if(a.paused){setFailed(false);if(clip&&a.currentTime<clip.trimStart)a.currentTime=clip.trimStart;a.play().catch(()=>setFailed(true));}else a.pause();}
 function seek(e:React.MouseEvent<HTMLSpanElement>){const a=audio.current;if(!a||!known)return;const r=e.currentTarget.getBoundingClientRect();const t=(e.clientX-r.left)/r.width*length;const next=clip?Math.min(clip.trimEnd,Math.max(clip.trimStart,t)):Math.min(length,Math.max(0,t));a.currentTime=next;setAt(next);}
 function onTime(){const a=audio.current;if(!a)return;setAt(a.currentTime);if(clip&&a.currentTime>=clip.trimEnd-0.02&&!a.paused){a.pause();a.currentTime=clip.trimStart;setAt(a.currentTime);setPlaying(false);}}
 return <div className={`sound-player ${variant==='overlay'?'is-overlay':''} ${className}`.trim()} data-playing={playing||undefined}>
  <button type="button" className="sound-play" aria-label={playing?'Pause sound':label} onClick={toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
  {variant==='overlay'
   ? <span className="sound-wave" onClick={seek} role="presentation">{Array.from({length:bars},(_,i)=><i key={i} data-on={i/bars<=played||undefined} style={{height:`${30+((i*37)%70)}%`}}/>)}</span>
   : <span className="sound-body"><span className="sound-title">{failed?'This sound could not play':playing?'Playing':'Listen'}</span><span className="sound-bar" onClick={seek}><i style={{width:`${known?at/length*100:playing?100:0}%`}} data-live={!known&&playing||undefined}/></span></span>}
  <span className="sound-time">{known?time(playing||at?at:length):at?time(at):''}</span>
  <audio ref={audio} src={src} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={e=>{setPlaying(false);const start=clip?.trimStart??0;e.currentTarget.currentTime=start;setAt(start);}} onTimeUpdate={onTime} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onDurationChange={e=>setLength(e.currentTarget.duration)} onError={()=>setFailed(true)}/>
 </div>;
}

export function SoundField({audio,edit,onEditChange,onChange,onError,onClearError,title='Question sound',hint='Optional · record, upload, or paste an https / Drive link'}:{audio?:string;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(''),[link,setLink]=useState(''),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false);
 const live=useRef<{recorder:MediaRecorder,stream:MediaStream,timer:number}|null>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{const l=live.current;if(l){window.clearInterval(l.timer);l.stream.getTracks().forEach(t=>t.stop());}},[]);
 useEffect(()=>{if(audio?.startsWith('https://')){setLink(audio);setLinking(true);}else if(!audio){setLink('');setLinking(false);}},[audio]);
 function applyLink(next?:string){
  onError('');
  const url=resolveMediaLink((next??link).trim());
  if(!url){onChange(undefined);return true;}
  if(!/^https:\/\//i.test(url)){onError('Use an https or Google Drive link to the sound file.');return false;}
  if(url.length>2048){onError('That link is too long.');return false;}
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
 return <div className={`editor-inline-image editor-sound${audio?' has-image':''}${linking?' is-linking':''}`} data-recording={recording||undefined}>
  <span className="editor-inline-icon">{recording?<span className="sound-rec-dot" aria-hidden="true"/>:<AudioLines size={18}/>}</span>
  <div className="editor-inline-copy"><strong>{title}</strong><small>{recording?`Recording… ${time(seconds)} of ${time(MAX_SECONDS)}`:busy||(audio?.startsWith('https://')?'Plays from a link':audio?'Plays with the question':hint)}</small></div>
  {audio&&!recording&&<SoundPlayer src={audio} label={`Play ${title.toLowerCase()}`} className="is-compact"/>}
  <div className="editor-inline-actions">
   {recording?<button type="button" className="is-recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop</button>:<>
    <button type="button" disabled={!!busy} onClick={start}><Mic size={14}/>{audio?'Re-record':'Record'}</button>
    <button type="button" disabled={!!busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio&&!audio.startsWith('https://')?<RefreshCw size={14}/>:<Upload size={14}/>}{audio&&!audio.startsWith('https://')?'Change':'Upload'}</button>
    {!recording&&<button type="button" aria-label="Add question sound from a link" aria-expanded={linking} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/>Link</button>}
    {audio&&!recording&&<button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
    {audio&&<button type="button" className="is-remove" aria-label="Remove question sound" disabled={!!busy} onClick={()=>{setLinking(false);setLink('');onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={14}/></button>}
   </>}
  </div>
  <input ref={input} type="file" hidden aria-label="Upload question sound" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.opus" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>
  {!recording&&linking&&<MediaLinkForm autoFocus label="Sound link" placeholder="https://example.com/sound.mp3" submitLabel="Add" initialUrl={audio?.startsWith('https://')?audio:link} onClearError={onClearError} onCancel={()=>{setLink('');setLinking(false);onClearError?.();}} onSubmit={url=>{setLink(url);if(applyLink(url))setLinking(false);}}/>}
  {clipOpen&&audio&&<MediaClipEditor kind="audio" title={`Edit ${title.toLowerCase()}`} src={audio} initial={edit} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>}
 </div>;
}
