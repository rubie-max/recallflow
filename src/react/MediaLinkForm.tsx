import React,{useEffect,useState} from 'react';
import {Link2,X,LoaderCircle,AlertCircle} from 'lucide-react';
import {resolveMediaLink,resolveImageLink} from '../question-types.js';

export function MediaLinkForm({label,placeholder='https://…',submitLabel='Add',initialUrl='',autoFocus=false,resolve=resolveMediaLink,onSubmit,onCancel,onClearError}:{
  label:string;placeholder?:string;submitLabel?:string;initialUrl?:string;autoFocus?:boolean;
  resolve?:(url:string)=>string;onSubmit:(url:string)=>void|Promise<void>;onCancel:()=>void;onClearError?:()=>void;
}){
  const [url,setUrl]=useState(initialUrl),[busy,setBusy]=useState(false);
  useEffect(()=>{setUrl(initialUrl);},[initialUrl]);
  const submit=async()=>{if(!url.trim()||busy)return;setBusy(true);try{await onSubmit(resolve(url.trim()));}finally{setBusy(false);}};
  const cancel=()=>{setUrl('');onClearError?.();onCancel();};
  return <div className="editor-media-link">
    <Link2 size={16} aria-hidden="true"/>
    <input type="url" inputMode="url" autoFocus={autoFocus} aria-label={label} placeholder={placeholder} value={url} disabled={busy} onChange={e=>{setUrl(e.target.value);onClearError?.();}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void submit();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancel();}}}/>
    <button type="button" className="editor-media-link-cancel" aria-label="Close link" disabled={busy} onClick={cancel}><X size={16}/></button>
    <button type="button" className="editor-media-link-add" disabled={!url.trim()||busy} onClick={()=>void submit()}>{busy?<LoaderCircle size={14} className="speech-spinner"/>:submitLabel}</button>
  </div>;
}

export function MediaErrorBanner({message,onDismiss}:{message:string;onDismiss:()=>void}){
  if(!message)return null;
  return <p className="editor-media-error" role="alert">
    <AlertCircle size={15} aria-hidden="true"/>
    <span>{message}</span>
    <button type="button" aria-label="Dismiss" onClick={onDismiss}><X size={14}/></button>
  </p>;
}
