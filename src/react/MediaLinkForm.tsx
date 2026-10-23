import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link2,X,LoaderCircle,AlertCircle,Film,ImageIcon,ClipboardPaste} from 'lucide-react';
import {resolveMediaLink,isDriveLink,driveFileId,DRIVE_SHARE_LEGACY_HINT} from '../question-types.js';

export const ERROR_EVENT='recallflow:media-error';
export function pushMediaLinkError(message:string){if(message)window.dispatchEvent(new CustomEvent(ERROR_EVENT,{detail:message}));}
export function linkFieldError(onError:(message:string)=>void,message:string){onError(message);pushMediaLinkError(message);}

export function DriveShareLegacyNotice({kind='media'}:{kind?:'sound'|'video'|'media'}){
 const what=kind==='sound'?'Sound':kind==='video'?'Video':'Media';
 return <p className="media-drive-legacy" role="status"><strong>{what} needs updating.</strong> {DRIVE_SHARE_LEGACY_HINT}</p>;
}

function bandTitle(label:string){const t=label.replace(/\s*link$/i,'').trim()||'Media';return /^add\s/i.test(t)?t:`Add ${t.toLowerCase()} link`;}
function linkHint(label:string){
 const l=label.toLowerCase();
 if(l.includes('image')||l.includes('picture'))return 'Paste a direct https link to an image file (PNG, JPEG, WebP, GIF).';
 if(l.includes('video'))return 'Paste a direct https link to a video file (MP4, WebM). Google Drive and YouTube pages will not play.';
 return 'Paste a direct https link to an audio file (MP3, WAV, OGG, …). Google Drive share pages will not play.';
}
function bandIcon(label:string){const l=label.toLowerCase();return l.includes('image')||l.includes('picture')?ImageIcon:l.includes('video')?Film:Link2;}
function liveHint(url:string){
 const u=url.trim();if(!u)return '';
 if(driveFileId(u)||isDriveLink(u))return 'Google Drive links do not play here. Download the file from Drive and upload it instead.';
 if(/^http:\/\//i.test(u))return 'Links must start with https://';
 if(!/^https:\/\//i.test(u))return 'That does not look like a link yet.';
 return '';
}

export function MediaLinkForm({id,label,placeholder='https://…',submitLabel='Add',initialUrl='',autoFocus=false,resolve=resolveMediaLink,onSubmit,onCancel,onClearError}:{
 id?:string;label:string;placeholder?:string;submitLabel?:string;initialUrl?:string;autoFocus?:boolean;
 resolve?:(url:string)=>string;onSubmit:(url:string)=>void|Promise<void|boolean>;onCancel:()=>void;onClearError?:()=>void;
}){
 const [url,setUrl]=useState(initialUrl),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const Icon=bandIcon(label),hint=liveHint(url),canPaste=typeof navigator!=='undefined'&&!!navigator.clipboard?.readText;
 useEffect(()=>{setUrl(initialUrl);},[initialUrl]);
 useEffect(()=>{const on=(e:Event)=>setError(String((e as CustomEvent).detail||''));window.addEventListener(ERROR_EVENT,on);return()=>window.removeEventListener(ERROR_EVENT,on);},[]);
 useEffect(()=>{const ov=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=ov;};},[]);
 const clearInput=()=>{if(busy)return;setUrl('');setError('');onClearError?.();};
 const submit=async()=>{if(!url.trim()||busy||hint)return;setBusy(true);setError('');onClearError?.();try{await onSubmit(resolve(url.trim()));}catch(e:any){const msg=e?.message||'That link could not be added.';setError(msg);pushMediaLinkError(msg);}finally{setBusy(false);}};
 const cancel=()=>{if(busy)return;setUrl('');setError('');onClearError?.();onCancel();};
 const paste=async()=>{try{const t=(await navigator.clipboard.readText()).trim();if(t){setUrl(t);setError('');}}catch{setError('Clipboard access was blocked — paste with Ctrl/Cmd+V instead.');}};
 const titleId=`${id||'media-link'}-title`;
 return createPortal(<div className="media-link-layer" onMouseDown={e=>{if(e.target===e.currentTarget)cancel();}}>
  <section className="media-link-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} id={id}>
   <div className="media-link-band"><Icon size={18} aria-hidden="true"/><h3 id={titleId}>{bandTitle(label)}</h3><button type="button" className="media-link-close" aria-label="Close" disabled={busy} onClick={cancel}><X size={18}/></button></div>
   <div className="media-link-body">

    <p className="media-link-hint">{linkHint(label)}</p>
    <div className="media-link-input-wrap">
     <input type="url" inputMode="url" autoFocus={autoFocus} aria-label={label} aria-invalid={!!error||!!hint} placeholder={placeholder} value={url} disabled={busy}
      onChange={e=>{setUrl(e.target.value);setError('');onClearError?.();}}
      onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}/>
     {url.trim()?<button type="button" className="media-link-input-clear" aria-label="Clear link" disabled={busy} onClick={clearInput}><X size={16}/></button>
      :canPaste&&<button type="button" className="media-link-input-paste" aria-label="Paste from clipboard" disabled={busy} onClick={()=>void paste()}><ClipboardPaste size={16}/></button>}
    </div>
    {hint&&!error&&<p className="media-link-live" role="status"><AlertCircle size={14} aria-hidden="true"/><span>{hint}</span></p>}
    {error&&<p className="media-link-error" role="alert"><AlertCircle size={15} aria-hidden="true"/><span>{error}</span></p>}
    <footer><button type="button" className="media-link-cancel" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="media-link-add" disabled={!url.trim()||busy||!!hint} onClick={()=>void submit()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:submitLabel}</button></footer>
   </div>
  </section>
 </div>,document.body);
}

export function MediaErrorBanner({message,onDismiss}:{message:string;onDismiss:()=>void}){
 useEffect(()=>{pushMediaLinkError(message);},[message]);
 if(!message)return null;
 return <p className="editor-media-error" role="alert"><AlertCircle size={15} aria-hidden="true"/><span>{message}</span><button type="button" aria-label="Dismiss" onClick={onDismiss}><X size={14}/></button></p>;
}
