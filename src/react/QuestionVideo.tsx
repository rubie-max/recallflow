import React,{useEffect,useState} from 'react';
import {Film,Link2,Trash2,Upload,LoaderCircle} from 'lucide-react';
import {MediaLinkForm} from './MediaLinkForm';
import {MAX_VIDEO_CHARS,isDriveLink,drivePreviewUrl,resolveMediaLink,videoSafe} from '../question-types.js';
import {MediaClipEditor,normalizeEdit,type MediaEdit} from './MediaClipEditor';
import {Scissors} from 'lucide-react';

function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read this video.'));r.readAsDataURL(blob);});}

export function VideoPlayer({src,className='',label='Play video',edit}:{src:string;className?:string;label?:string;edit?:MediaEdit}){
 const drive=isDriveLink(src);
 const [failed,setFailed]=useState(false);
 const video=React.useRef<HTMLVideoElement>(null);
 const clipRef=React.useRef<MediaEdit|undefined>(edit);
 clipRef.current=edit;
 useEffect(()=>{setFailed(false);},[src]);
 useEffect(()=>{
  const el=video.current;if(!el||drive)return;
  const apply=()=>{const len=el.duration;if(!Number.isFinite(len)||len<=0)return;const clip=normalizeEdit(clipRef.current,len);el.muted=!!clip.muted;};
  const tick=()=>{const len=el.duration;if(!Number.isFinite(len))return;const clip=normalizeEdit(clipRef.current,len);if(clip&&el.currentTime>=clip.trimEnd-0.02&&!el.paused){el.pause();el.currentTime=clip.trimStart;}};
  el.addEventListener('loadedmetadata',apply);el.addEventListener('durationchange',apply);el.addEventListener('timeupdate',tick);
  apply();
  return()=>{el.removeEventListener('loadedmetadata',apply);el.removeEventListener('durationchange',apply);el.removeEventListener('timeupdate',tick);};
 },[src,drive,edit]);
 if(drive||failed&&src.includes('drive.google.com'))return <div className={`video-player is-embed ${className}`}><iframe title={label} src={drivePreviewUrl(src)} allow="autoplay; encrypted-media" allowFullScreen/></div>;
 return <div className={`video-player ${className}`}><video ref={video} controls playsInline preload="metadata" src={src} onError={()=>setFailed(true)} onPlay={e=>{const el=e.currentTarget;const len=el.duration;if(!Number.isFinite(len))return;const clip=normalizeEdit(clipRef.current,len);if(clip&&el.currentTime<clip.trimStart)el.currentTime=clip.trimStart;}}/>{failed&&<p className="video-fallback">This video could not play. Try opening the link in a new tab.</p>}</div>;
}

export function VideoField({video,edit,onEditChange,onChange,onError,onClearError,title='Question video',hint='Prefer an https or Google Drive link — large files fill browser storage quickly.'}:{video?:string;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string}){
 const [busy,setBusy]=useState(''),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false);
 const input=React.useRef<HTMLInputElement>(null);
 useEffect(()=>{if(video?.startsWith('https://'))setLinking(true);else if(!video)setLinking(false);},[video]);
 function applyLink(url:string){
  onError('');
  const resolved=resolveMediaLink(url.trim());
  if(!resolved){onChange(undefined);return true;}
  if(!videoSafe(resolved)){onError('Use an https or Google Drive video link, or a small video file.');return false;}
  onEditChange?.(undefined);onChange(resolved);
  return true;
 }
 async function upload(file?:File){
  if(!file)return;onError('');setBusy('Adding…');
  try{
   if(!file.type.startsWith('video/'))throw new Error('Choose a video file (MP4 or WebM).');
   const data=await dataUrl(file);
   if(data.length>MAX_VIDEO_CHARS)throw new Error('This video is too large to store. Use an https or Drive link instead.');
   if(!videoSafe(data))throw new Error('This video could not be saved.');
   onEditChange?.(undefined);onChange(data);
  }catch(e:any){onError(e.message||'This video could not be added.');}
  finally{setBusy('');}
 }
 return <div className={`editor-inline-image editor-video${video?' has-image':''}${linking?' is-linking':''}`}>
  <span className="editor-inline-icon"><Film size={18}/></span>
  <div className="editor-inline-copy"><strong>{title}</strong><small>{busy||(video?'Plays with the question':hint)}</small></div>
  {video&&<VideoPlayer src={video} className="is-compact" label={`Preview ${title.toLowerCase()}`}/>}
  <div className="editor-inline-actions">
   <button type="button" disabled={!!busy} onClick={()=>input.current?.click()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:video?<Upload size={14}/>:<Upload size={14}/>}{video?'Change file':'Upload'}</button>
   <button type="button" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} disabled={!!busy} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/>Link</button>
   {video&&!isDriveLink(video)&&<button type="button" aria-label={`Edit ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
   {video&&<button type="button" className="is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>{setLinking(false);onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={14}/></button>}
  </div>
  <input ref={input} type="file" hidden accept="video/*,.mp4,.webm,.mov" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>
  {linking&&<MediaLinkForm autoFocus label={`${title} link`} placeholder="https://…/clip.mp4 or Drive share link" submitLabel="Add" initialUrl={video?.startsWith('https://')?video:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={url=>{if(applyLink(url))setLinking(false);}}/>}
  {clipOpen&&video&&<MediaClipEditor kind="video" title={`Edit ${title.toLowerCase()}`} src={video} initial={edit} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>}
 </div>;
}
