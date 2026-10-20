import React,{useEffect,useRef,useState} from 'react';
import {Play,Pause,Mic,Square,Upload,Trash2,RefreshCw,LoaderCircle,AudioLines} from 'lucide-react';
import {MediaLinkForm} from './MediaLinkForm';
import {MAX_AUDIO_CHARS} from '../question-types.js';

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

export function SoundPlayer({src,label='Play sound',className=''}:{src:string,label?:string,className?:string}){
 const audio=useRef<HTMLAudioElement>(null),[playing,setPlaying]=useState(false),[at,setAt]=useState(0),[length,setLength]=useState(0),[failed,setFailed]=useState(false);
 useEffect(()=>{setPlaying(false);setAt(0);setLength(0);setFailed(false);return()=>audio.current?.pause();},[src]);
 const known=Number.isFinite(length)&&length>0;
 function toggle(){const a=audio.current;if(!a)return;if(a.paused){setFailed(false);a.play().catch(()=>setFailed(true));}else a.pause();}
 function seek(e:React.MouseEvent<HTMLSpanElement>){const a=audio.current;if(!a||!known)return;const r=e.currentTarget.getBoundingClientRect();a.currentTime=Math.min(length,Math.max(0,(e.clientX-r.left)/r.width*length));setAt(a.currentTime);}
 return <div className={`sound-player ${className}`} data-playing={playing||undefined}>
  <button type="button" className="sound-play" aria-label={playing?'Pause sound':label} onClick={toggle}>{playing?<Pause size={18} fill="currentColor"/>:<Play size={18} fill="currentColor"/>}</button>
  <span className="sound-body"><span className="sound-title">{failed?'This sound could not play':playing?'Playing':'Listen'}</span><span className="sound-bar" onClick={seek}><i style={{width:`${known?at/length*100:playing?100:0}%`}} data-live={!known&&playing||undefined}/></span></span>
  <span className="sound-time">{known?time(playing||at?at:length):at?time(at):''}</span>
  <audio ref={audio} src={src} preload="metadata" onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)} onEnded={e=>{setPlaying(false);setAt(0);e.currentTarget.currentTime=0;}} onTimeUpdate={e=>setAt(e.currentTarget.currentTime)} onLoadedMetadata={e=>setLength(e.currentTarget.duration)} onDurationChange={e=>setLength(e.currentTarget.duration)} onError={()=>setFailed(true)}/>
 </div>;
}

export function SoundField({audio,onChange,onError,onClearError}:{audio?:string,onChange:(value?:string)=>void,onError:(message:string)=>void,onClearError?:()=>void}){
 const [recording,setRecording]=useState(false),[seconds,setSeconds]=useState(0),[busy,setBusy]=useState(''),[link,setLink]=useState('');
 const live=useRef<{recorder:MediaRecorder,stream:MediaStream,timer:number}|null>(null),input=useRef<HTMLInputElement>(null);
 useEffect(()=>()=>{const l=live.current;if(l){window.clearInterval(l.timer);l.stream.getTracks().forEach(t=>t.stop());}},[]);
 useEffect(()=>{if(audio?.startsWith('https://'))setLink(audio);else if(!audio)setLink('');},[audio]);
 function applyLink(next?:string){
  onError('');
  const url=(next??link).trim();
  if(!url){onChange(undefined);return;}
  if(!/^https:\/\//i.test(url)){onError('Use an https link to the sound file.');return;}
  if(url.length>2048){onError('That link is too long.');return;}
  onChange(url);
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
  onChange(data);
 }
 function stop(){const r=live.current?.recorder;if(r&&r.state==='recording')r.stop();}
 async function upload(file?:File){
  if(!file)return;onError('');setBusy('Adding…');
  try{onChange(await soundFromFile(file,pct=>setBusy(`Shrinking… ${pct}%`)));}
  catch(e:any){onError(e.message||'This sound could not be added.');}
  finally{setBusy('');}
 }
 return <div className={`editor-inline-image editor-sound${audio?' has-image':''}`} data-recording={recording||undefined}>
  <span className="editor-inline-icon">{recording?<span className="sound-rec-dot" aria-hidden="true"/>:<AudioLines size={18}/>}</span>
  <div className="editor-inline-copy"><strong>Question sound</strong><small>{recording?`Recording… ${time(seconds)} of ${time(MAX_SECONDS)}`:busy||(audio?.startsWith('https://')?'Plays from a link':audio?'Plays with the question':'Optional · record, upload, or paste an https link')}</small></div>
  {audio&&!recording&&<SoundPlayer src={audio} label="Play question sound" className="is-compact"/>}
  <div className="editor-inline-actions">
   {recording?<button type="button" className="is-recording" onClick={stop}><Square size={13} fill="currentColor"/>Stop</button>:<>
    <button type="button" disabled={!!busy} onClick={start}><Mic size={14}/>{audio?'Re-record':'Record'}</button>
    <button type="button" disabled={!!busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:audio?<RefreshCw size={14}/>:<Upload size={14}/>}{audio?'Change':'Upload'}</button>
    {audio&&<button type="button" className="is-remove" aria-label="Remove question sound" disabled={!!busy} onClick={()=>onChange(undefined)}><Trash2 size={14}/></button>}
   </>}
  </div>
  <input ref={input} type="file" hidden aria-label="Upload question sound" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm,.aac,.opus" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>
  {!recording&&<MediaLinkForm label="Sound link" placeholder="https://example.com/sound.mp3" submitLabel="Add" initialUrl={audio?.startsWith('https://')?audio:link} onClearError={onClearError} onCancel={()=>{setLink('');onClearError?.();}} onSubmit={url=>{setLink(url);applyLink(url);}}/>}
 </div>;
}
