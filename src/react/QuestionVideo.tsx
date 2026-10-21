import React,{useEffect,useState} from 'react';
import {Film,Link2,Trash2,Upload,LoaderCircle} from 'lucide-react';
import {MediaLinkForm} from './MediaLinkForm';
import {MAX_VIDEO_CHARS,isDriveLink,drivePreviewUrl,resolveMediaLink,videoSafe} from '../question-types.js';

function dataUrl(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read this video.'));r.readAsDataURL(blob);});}

export function VideoPlayer({src,className='',label='Play video'}:{src:string;className?:string;label?:string}){
 const drive=isDriveLink(src);
 const [failed,setFailed]=useState(false);
 useEffect(()=>{setFailed(false);},[src]);
 if(drive||failed&&src.includes('drive.google.com'))return <div className={`video-player is-embed ${className}`}><iframe title={label} src={drivePreviewUrl(src)} allow="autoplay; encrypted-media" allowFullScreen/></div>;
 return <div className={`video-player ${className}`}><video controls playsInline preload="metadata" src={src} onError={()=>setFailed(true)}/>{failed&&<p className="video-fallback">This video could not play. Try opening the link in a new tab.</p>}</div>;
}

export function VideoField({video,onChange,onError,onClearError,title='Question video',hint='Prefer an https or Google Drive link — large files fill browser storage quickly.'}:{video?:string;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string}){
 const [busy,setBusy]=useState(''),[linking,setLinking]=useState(false);
 const input=React.useRef<HTMLInputElement>(null);
 useEffect(()=>{if(video?.startsWith('https://'))setLinking(true);else if(!video)setLinking(false);},[video]);
 function applyLink(url:string){
  onError('');
  const resolved=resolveMediaLink(url.trim());
  if(!resolved){onChange(undefined);return true;}
  if(!videoSafe(resolved)){onError('Use an https or Google Drive video link, or a small video file.');return false;}
  onChange(resolved);
  return true;
 }
 async function upload(file?:File){
  if(!file)return;onError('');setBusy('Adding…');
  try{
   if(!file.type.startsWith('video/'))throw new Error('Choose a video file (MP4 or WebM).');
   const data=await dataUrl(file);
   if(data.length>MAX_VIDEO_CHARS)throw new Error('This video is too large to store. Use an https or Drive link instead.');
   if(!videoSafe(data))throw new Error('This video could not be saved.');
   onChange(data);
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
   {video&&<button type="button" className="is-remove" aria-label={`Remove ${title.toLowerCase()}`} disabled={!!busy} onClick={()=>{setLinking(false);onChange(undefined);}}><Trash2 size={14}/></button>}
  </div>
  <input ref={input} type="file" hidden accept="video/*,.mp4,.webm,.mov" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>
  {linking&&<MediaLinkForm autoFocus label={`${title} link`} placeholder="https://…/clip.mp4 or Drive share link" submitLabel="Add" initialUrl={video?.startsWith('https://')?video:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={url=>{if(applyLink(url))setLinking(false);}}/>}
 </div>;
}
