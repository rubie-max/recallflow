import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Link2,X,LoaderCircle,AlertCircle} from 'lucide-react';
import {resolveMediaLink,resolveImageLink,DRIVE_SHARE_LEGACY_HINT} from '../question-types.js';

const ERROR_EVENT='recallflow:media-error';

export function DriveShareLegacyNotice({kind='media'}:{kind?:'sound'|'video'|'media'}){
 const what=kind==='sound'?'Sound':kind==='video'?'Video':'Media';
 return <p className="media-drive-legacy" role="status"><strong>{what} needs updating.</strong> {DRIVE_SHARE_LEGACY_HINT}</p>;
}

export function MediaLinkForm({id,label,placeholder='https://…',submitLabel='Add',initialUrl='',autoFocus=false,resolve=resolveMediaLink,onSubmit,onCancel,onClearError}:{
  id?:string;label:string;placeholder?:string;submitLabel?:string;initialUrl?:string;autoFocus?:boolean;
  resolve?:(url:string)=>string;onSubmit:(url:string)=>void|Promise<void>;onCancel:()=>void;onClearError?:()=>void;
}){
  const [url,setUrl]=useState(initialUrl),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{setUrl(initialUrl);},[initialUrl]);
  useEffect(()=>{const on=(e:Event)=>setError(String((e as CustomEvent).detail||''));window.addEventListener(ERROR_EVENT,on);return()=>window.removeEventListener(ERROR_EVENT,on);},[]);
  const submit=async()=>{if(!url.trim()||busy)return;setBusy(true);setError('');try{await onSubmit(resolve(url.trim()));}finally{setBusy(false);}};
  const cancel=()=>{if(busy)return;setUrl('');onClearError?.();onCancel();};
  const title=label.replace(/\s*link$/i,'')||'Media';
  return createPortal(<div className="media-link-layer" onMouseDown={e=>{if(e.target===e.currentTarget)cancel();}}>
    <section className="media-link-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id||'media-link'}-title`} id={id}>
      <header><span className="media-link-ico" aria-hidden="true"><Link2 size={18}/></span><div><h3 id={`${id||'media-link'}-title`}>Add {title.toLowerCase()} from a link</h3><p>Paste a direct https link to the file.</p></div><button type="button" className="media-link-close" aria-label="Close link" disabled={busy} onClick={cancel}><X size={18}/></button></header>
      <input type="url" inputMode="url" autoFocus={autoFocus} aria-label={label} placeholder={placeholder} value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);setError('');onClearError?.();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}/>
      {error&&<p className="media-link-error" role="alert"><AlertCircle size={15} aria-hidden="true"/><span>{error}</span></p>}
      <footer><button type="button" className="media-link-cancel" disabled={busy} onClick={cancel}>Cancel</button><button type="button" className="media-link-add" disabled={!url.trim()||busy} onClick={()=>void submit()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:submitLabel}</button></footer>
    </section>
  </div>,document.body);
}

export function MediaErrorBanner({message,onDismiss}:{message:string;onDismiss:()=>void}){
  useEffect(()=>{window.dispatchEvent(new CustomEvent(ERROR_EVENT,{detail:message}));},[message]);
  if(!message)return null;
  return <p className="editor-media-error" role="alert">
    <AlertCircle size={15} aria-hidden="true"/>
    <span>{message}</span>
    <button type="button" aria-label="Dismiss" onClick={onDismiss}><X size={14}/></button>
  </p>;
}
