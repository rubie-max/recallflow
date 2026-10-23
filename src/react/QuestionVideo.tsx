import React,{useEffect,useRef,useState} from 'react';
import {Film,Link2,Trash2,Upload,RefreshCw,Scissors} from 'lucide-react';
import {MediaLinkForm,DriveShareLegacyNotice,pushMediaLinkError} from './MediaLinkForm';
import {MAX_VIDEO_CHARS,isDriveLink,resolveMediaLink,videoSafe,DRIVE_SHARE_REJECT,typedMediaFile,driveFileId,blobToDataUrl,dataUrlLength,maxBytesForChars,formatBytes} from '../question-types.js';
import {MediaClipEditor,normalizeEdit,editIsDefault,useClipPlayback,probeMediaSrc,playbackSrc,isEmbeddedMedia,fmtTime,type MediaEdit} from './MediaClipEditor';

export function VideoPlayer({src,className='',label='Play video',edit}:{src:string;className?:string;label?:string;edit?:MediaEdit}){
 const video=useRef<HTMLVideoElement>(null);
 const pb=useClipPlayback(video,src,edit);
 if(isDriveLink(src))return <div className={`vp ${className}`.trim()}><DriveShareLegacyNotice kind="video"/></div>;
 const clip=normalizeEdit(edit,pb.duration),trimmed=pb.duration>0&&!editIsDefault(edit,pb.duration);
 return <div className={`vp ${className}`.trim()} data-failed={pb.failed||undefined}>
  <video key={src} ref={video} controls playsInline preload="metadata" src={playbackSrc(src)} aria-label={label}/>
  {trimmed&&<span className="vp-badge"><Scissors size={11}/>{fmtTime(clip.trimEnd-clip.trimStart)}</span>}
  {pb.failed&&<p className="vp-fallback">This video could not play.{!isEmbeddedMedia(src)&&<> <a href={src} target="_blank" rel="noreferrer">Open the link</a> to check it.</>}</p>}
 </div>;
}

type Busy={label:string;progress?:number};
export function VideoField({video,edit,onEditChange,onChange,onError,onClearError,title='Question video',hint='Prefer a short upload — large files fill browser storage quickly.',assetLayout,emptyHint,linkLabel='Link',uploadEmptyLabel='Upload'}:{video?:string;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string;assetLayout?:boolean;emptyHint?:string;linkLabel?:string;uploadEmptyLabel?:string}){
 const [busy,setBusy]=useState<Busy|null>(null),[linking,setLinking]=useState(false),[clipOpen,setClipOpen]=useState(false),[dragOver,setDragOver]=useState(false),[meta,setMeta]=useState<{duration:number;size:number}|null>(null);
 const input=useRef<HTMLInputElement>(null);
 const drive=!!video&&isDriveLink(video),linked=!!video?.startsWith('https://');
 useEffect(()=>{if(!video){setLinking(false);setMeta(null);}},[video]);

 function applyLink(url:string){
  onError('');
  const resolved=resolveMediaLink(url.trim());
  if(!resolved){onChange(undefined);return true;}
  if(driveFileId(url)||isDriveLink(resolved)){pushMediaLinkError(DRIVE_SHARE_REJECT);return false;}
  if(!/^https:\/\//i.test(resolved)||!videoSafe(resolved)){pushMediaLinkError('Use an https link to a video file (MP4 or WebM), or upload a small video.');return false;}
  onEditChange?.(undefined);onChange(resolved);setMeta(null);
  return true;
 }
 async function upload(file?:File){
  if(!file||busy)return;onError('');
  const typed=typedMediaFile(file,'video');
  if(!typed){onError('Choose a video file (MP4, WebM or MOV).');return;}
  const blob=typed instanceof File?typed:new File([typed],file.name||'video.mp4',{type:typed.type});
  if(dataUrlLength(blob.size,blob.type)>MAX_VIDEO_CHARS){onError(`This video is ${formatBytes(blob.size)}; the limit is about ${formatBytes(maxBytesForChars(MAX_VIDEO_CHARS))}. Trim or compress it first, or paste an https link.`);return;}
  setBusy({label:'Checking video…'});
  try{
   const url=URL.createObjectURL(blob);
   const probe=await probeMediaSrc(url,'video');URL.revokeObjectURL(url);
   if(!probe.ok)throw new Error('This video could not be opened in your browser. MP4 (H.264) plays everywhere.');
   const data=await blobToDataUrl(blob,p=>setBusy({label:'Adding video…',progress:p}));
   if(!videoSafe(data))throw new Error('This video could not be saved.');
   onEditChange?.(undefined);onChange(data);setMeta({duration:probe.duration,size:blob.size});
  }catch(e:any){onError(e?.message||'This video could not be added.');}
  finally{setBusy(null);}
 }

 const badge=!video?{text:'Not added',cls:'is-empty'}:drive?{text:'Needs attention',cls:'is-warn'}:{text:'Added',cls:'is-ok'};
 const caption=busy?busy.label:video?(drive?'This link needs attention':linked?'Linked video · plays in the quiz':[meta&&fmtTime(meta.duration),meta&&formatBytes(meta.size),edit?'edited':null].filter(Boolean).join(' · ')||'Tap play to preview'):(emptyHint||hint);
 const openLink=()=>{onClearError?.();setLinking(v=>!v);};
 const pickFile=()=>{setLinking(false);input.current?.click();};
 const drop={
  onDragOver:(e:React.DragEvent)=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();setDragOver(true);}},
  onDragLeave:()=>setDragOver(false),
  onDrop:(e:React.DragEvent)=>{e.preventDefault();setDragOver(false);void upload(e.dataTransfer.files?.[0]);},
 };
 const body=busy
  ?<div className="mf-progress" role="status" aria-live="polite"><div className={`mf-progress-bar${busy.progress===undefined?' is-indeterminate':''}`}><i style={busy.progress!==undefined?{width:`${Math.round(busy.progress*100)}%`}:undefined}/></div><div className="mf-progress-row"><span>{busy.label}{busy.progress!==undefined?` ${Math.round(busy.progress*100)}%`:''}</span></div></div>
  :video
  ?(drive?<DriveShareLegacyNotice kind="video"/>:<VideoPlayer src={video} edit={edit} className="is-compact" label={`Preview ${title.toLowerCase()}`}/>)
  :<div className="mf-empty">
    <button type="button" className="mf-tile" onClick={pickFile}><Upload size={20}/>{uploadEmptyLabel}</button>
    <button type="button" className="mf-tile" aria-expanded={linking} onClick={openLink}><Link2 size={20}/>{linkLabel}</button>
   </div>;
 const actions=video&&!busy&&<div className="mf-actions">
  {!drive&&<button type="button" className="mf-action is-primary" aria-label={`Edit ${title.toLowerCase()}`} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
  <button type="button" className="mf-action" aria-label="Replace video file" onClick={pickFile}><RefreshCw size={14}/>Replace</button>
  <button type="button" className="mf-action" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} onClick={openLink}><Link2 size={14}/>{linkLabel}</button>
  <button type="button" className="mf-action is-remove" aria-label={`Remove ${title.toLowerCase()}`} onClick={()=>{setLinking(false);onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={14}/></button>
 </div>;
 const fileInput=<input ref={input} type="file" hidden accept="video/*,.mp4,.webm,.mov,.m4v" onChange={e=>{const f=e.currentTarget.files?.[0];e.currentTarget.value='';void upload(f);}}/>;
 const linkForm=linking&&<MediaLinkForm autoFocus label={`${title} link`} placeholder="https://…/clip.mp4" submitLabel="Add" initialUrl={linked&&!drive?video!:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={url=>{if(applyLink(url))setLinking(false);}}/>;
 const clip=clipOpen&&video&&<MediaClipEditor kind="video" title={`Edit ${title.toLowerCase()}`} src={video} initial={edit} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>;

 return <article className={`mf mf-video${video?' has-media':''}${assetLayout?' is-asset':''}${dragOver?' is-dragover':''}`} {...drop}>
  <header className="mf-head">
   <span className="mf-ico" aria-hidden="true"><Film size={18}/></span>
   <div className="mf-headmain"><div className="mf-titlerow"><strong>{title}</strong><span className={`mf-badge ${badge.cls}`}>{badge.text}</span></div><small className="mf-caption">{caption}</small></div>
  </header>
  {body}
  {actions}
  {fileInput}{linkForm}{clip}
 </article>;
}