import React,{useEffect,useRef,useState} from 'react';
import {Film,Link2,Trash2,Upload,RefreshCw,Scissors,Play,Pause,Crop} from 'lucide-react';
import {MediaLinkForm,DriveShareLegacyNotice,pushMediaLinkError} from './MediaLinkForm';
import {MAX_VIDEO_CHARS,isDriveLink,resolveMediaLink,videoSafe,DRIVE_SHARE_REJECT,typedMediaFile,driveFileId,blobToDataUrl,dataUrlLength,maxBytesForChars,formatBytes} from '../question-types.js';
import {MediaClipEditor,editIsDefault,useClipPlayback,useVideoDims,frameFor,VideoFrame,probeMediaSrc,isEmbeddedMedia,fmtTime,fmtFine,type MediaEdit} from './MediaClipEditor';

const clamp=(v:number,a:number,b:number)=>Math.min(b,Math.max(a,v));

/** Quiz/preview player: 4:3 frame with blurred backdrop, crop/trim/fades applied, tap to play, drag the bar to seek. */
export function VideoPlayer({src,className='',label='Play video',edit}:{src:string;className?:string;label?:string;edit?:MediaEdit}){
 const video=useRef<HTMLVideoElement>(null),bar=useRef<HTMLDivElement>(null);
 const pb=useClipPlayback(video,src,edit);
 const dims=useVideoDims(video,src);
 if(isDriveLink(src))return <div className={`vp ${className}`.trim()}><DriveShareLegacyNotice kind="video"/></div>;
 const clip=pb.clip,sel=Math.max(0,clip.trimEnd-clip.trimStart),known=pb.duration>0,f=sel<10?fmtFine:fmtTime;
 const played=known?clamp((pb.at-clip.trimStart)/Math.max(0.1,sel),0,1):0;
 const edited=known&&!editIsDefault(edit,pb.duration);
 const seekAt=(x:number)=>{const r=bar.current?.getBoundingClientRect();if(!r||!known)return;pb.seek(clip.trimStart+clamp((x-r.left)/r.width,0,1)*sel);};
 return <div className={`vp ${className}`.trim()} data-failed={pb.failed||undefined} data-playing={pb.playing||undefined}>
  <VideoFrame ref={video} src={src} frame={frameFor(edit,dims.w,dims.h)} dims={dims} playing={pb.playing} onClick={pb.toggle}>
   <button type="button" className="vp-play" aria-label={pb.playing?'Pause':label} onClick={ev=>{ev.stopPropagation();pb.toggle();}}>{pb.playing?<Pause size={20} fill="currentColor"/>:<Play size={22} fill="currentColor"/>}</button>
   {known&&<span className="vp-badge">{f(clamp(pb.at-clip.trimStart,0,sel))} / {f(sel)}{edited&&<Crop size={11}/>}</span>}
   <div ref={bar} className="vp-bar" role="slider" aria-label="Seek" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(played*100)} tabIndex={known?0:-1}
    onClick={ev=>ev.stopPropagation()} onPointerDown={ev=>{ev.stopPropagation();if(!known)return;ev.preventDefault();try{ev.currentTarget.setPointerCapture(ev.pointerId);}catch{}seekAt(ev.clientX);}} onPointerMove={ev=>{if(ev.buttons&1)seekAt(ev.clientX);}}
    onKeyDown={ev=>{if(ev.key==='ArrowLeft'){ev.preventDefault();pb.seek(pb.at-1);}else if(ev.key==='ArrowRight'){ev.preventDefault();pb.seek(pb.at+1);}else if(ev.key===' '){ev.preventDefault();pb.toggle();}}}><i style={{width:`${played*100}%`}}/></div>
  </VideoFrame>
  {pb.failed&&<p className="vp-fallback">This video could not play.{!isEmbeddedMedia(src)&&<> <a href={src} target="_blank" rel="noreferrer">Open the link</a> to check it.</>}</p>}
 </div>;
}

type Busy={label:string;progress?:number};
export function VideoField({video,edit,onEditChange,onChange,onError,onClearError,title='Question video',hint='Prefer a short upload — large files fill browser storage quickly.',assetLayout,emptyHint,linkLabel='Add link',uploadEmptyLabel='Upload video'}:{video?:string;edit?:MediaEdit;onEditChange?:(value?:MediaEdit)=>void;onChange:(value?:string)=>void;onError:(message:string)=>void;onClearError?:()=>void;title?:string;hint?:string;assetLayout?:boolean;emptyHint?:string;linkLabel?:string;uploadEmptyLabel?:string}){
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
  onEditChange?.(undefined);onChange(resolved);setMeta(null);return true;
 }
 async function upload(file?:File){
  if(!file||busy)return;onError('');
  const typed=typedMediaFile(file,'video');
  if(!typed){onError('Choose a video file (MP4, WebM or MOV).');return;}
  const blob=typed instanceof File?typed:new File([typed],file.name||'video.mp4',{type:typed.type});
  if(dataUrlLength(blob.size,blob.type)>MAX_VIDEO_CHARS){onError(`Video is ${formatBytes(blob.size)}. Limit is about ${formatBytes(maxBytesForChars(MAX_VIDEO_CHARS))}. Trim it, or add a link.`);return;}
  setBusy({label:'Adding video…'});
  try{
   const url=URL.createObjectURL(blob);
   const [probe,data]=await Promise.all([
    probeMediaSrc(url,'video',5000),
    blobToDataUrl(blob,p=>setBusy({label:'Adding video…',progress:p})),
   ]);
   URL.revokeObjectURL(url);
   const ok=probe.ok||blob.size>0;
   if(!ok)throw new Error('This video could not be opened in your browser. MP4 (H.264) plays everywhere.');
   if(!videoSafe(data))throw new Error('This video could not be saved.');
   onEditChange?.(undefined);onChange(data);setMeta({duration:probe.duration||0,size:blob.size});
   setClipOpen(true);
  }catch(err:any){onError(err?.message||'This video could not be added.');}
  finally{setBusy(null);}
 }

 const badge=!video?{text:'Not added',cls:'is-empty'}:drive?{text:'Needs attention',cls:'is-warn'}:{text:'Added',cls:'is-ok'};
 const caption=busy?busy.label:video?(drive?'This link needs attention':linked?'Linked video · plays in the quiz':[meta&&fmtTime(meta.duration),meta&&formatBytes(meta.size),edit?'edited':null].filter(Boolean).join(' · ')||'Tap to preview'):(emptyHint||hint);
 const openLink=()=>{onClearError?.();setLinking(v=>!v);};
 const pickFile=()=>{setLinking(false);input.current?.click();};
 const drop={
  onDragOver:(ev:React.DragEvent)=>{if(ev.dataTransfer.types.includes('Files')){ev.preventDefault();setDragOver(true);}},
  onDragLeave:()=>setDragOver(false),
  onDrop:(ev:React.DragEvent)=>{ev.preventDefault();setDragOver(false);void upload(ev.dataTransfer.files?.[0]);},
 };
 const body=busy
  ?<div className="mf-progress" role="status" aria-live="polite"><div className={`mf-progress-bar${busy.progress===undefined?' is-indeterminate':''}`}><i style={busy.progress!==undefined?{width:`${Math.round(busy.progress*100)}%`}:undefined}/></div><div className="mf-progress-row"><span>{busy.label}{busy.progress!==undefined?` ${Math.round(busy.progress*100)}%`:''}</span></div></div>
  :video?(drive?<DriveShareLegacyNotice kind="video"/>:<VideoPlayer src={video} edit={edit} className="is-compact" label={`Preview ${title.toLowerCase()}`}/>):null;
 const actions=!busy&&(video
  ?<div className="mf-actions">
   {!drive&&<button type="button" className="mf-action is-primary" aria-label={`Edit ${title.toLowerCase()}`} onClick={()=>setClipOpen(true)}><Scissors size={14}/>Edit</button>}
   <button type="button" className="mf-action" aria-label="Replace video file" onClick={pickFile}><RefreshCw size={14}/>Replace</button>
   <button type="button" className="mf-action" aria-label={`Add ${title.toLowerCase()} from a link`} aria-expanded={linking} onClick={openLink}><Link2 size={14}/>{linkLabel}</button>
   <button type="button" className="mf-action is-remove" aria-label={`Remove ${title.toLowerCase()}`} onClick={()=>{setLinking(false);onEditChange?.(undefined);onChange(undefined);}}><Trash2 size={14}/></button>
  </div>
  :<div className="mf-actions is-empty">
   <button type="button" className="mf-action" onClick={pickFile}><Upload size={14}/>{uploadEmptyLabel}</button>
   <button type="button" className="mf-action" aria-expanded={linking} onClick={openLink}><Link2 size={14}/>{linkLabel}</button>
  </div>);
 const fileInput=<input ref={input} type="file" hidden accept="video/*,.mp4,.webm,.mov,.m4v" onChange={ev=>{const f=ev.currentTarget.files?.[0];ev.currentTarget.value='';void upload(f);}}/>;
 const linkForm=linking&&<MediaLinkForm autoFocus label={`${title} link`} placeholder="https://…/clip.mp4" submitLabel="Add" initialUrl={linked&&!drive?video!:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={url=>{if(applyLink(url))setLinking(false);}}/>;
 const clip=clipOpen&&video&&!drive&&<MediaClipEditor kind="video" title="Adjust video" src={video} initial={edit} durationHint={meta?.duration} onCancel={()=>setClipOpen(false)} onSave={next=>{onEditChange?.(next);setClipOpen(false);}}/>;

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