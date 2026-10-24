import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Volume2,Pause,Film,X,ImagePlus,Check} from 'lucide-react';
import {useClipPlayback,playbackSrc} from './MediaClipEditor';
import {VideoPlayer} from './QuestionVideo';

// Sounds and videos attached to one answer item (a choice, word, pair side, step or group item).
export const itemMediaOf=(item:any,text:string)=>item?.optionMedia?.[String(text??'').trim()]||null;

let stopPlaying:(()=>void)|null=null;
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const halt=(e:React.SyntheticEvent)=>{e.stopPropagation();};

export function ItemSound({src,edit,label='Play sound'}:{src:string;edit?:any;label?:string}){
 const audio=useRef<HTMLAudioElement>(null),pb=useClipPlayback(audio,src,edit),pause=useRef(pb.pause);pause.current=pb.pause;
 const mine=useRef(()=>pause.current());
 useEffect(()=>()=>{if(stopPlaying===mine.current)stopPlaying=null;},[]);
 const sel=Math.max(.1,pb.clip.trimEnd-pb.clip.trimStart),p=pb.duration>0?clamp((pb.at-pb.clip.trimStart)/sel):0;
 function toggle(e:React.MouseEvent){e.preventDefault();e.stopPropagation();if(!pb.playing){if(stopPlaying&&stopPlaying!==mine.current)stopPlaying();stopPlaying=mine.current;}pb.toggle();}
 return <button type="button" className="im-sound" data-playing={pb.playing||undefined} data-failed={pb.failed||undefined} aria-label={pb.playing?'Pause sound':label} title={pb.failed?'This sound could not play':label} style={{['--p' as any]:p}} onClick={toggle} onPointerDown={halt}>
  {pb.playing?<Pause size={13} fill="currentColor"/>:<Volume2 size={14}/>}
  <audio ref={audio} src={playbackSrc(src)} preload="metadata" onError={()=>{}}/>
 </button>;
}

export function VideoLightbox({src,edit,title,onClose}:{src:string;edit?:any;title:string;onClose:()=>void}){
 useEffect(()=>{const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};document.addEventListener('keydown',key);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;};},[]);
 return createPortal(<div className="im-video-layer" role="dialog" aria-modal="true" aria-label={title} onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}} onClick={halt}>
  <div className="im-video-box">
   <header><span>{title}</span><button type="button" aria-label="Close video" onClick={onClose}><X size={18}/></button></header>
   <VideoPlayer src={src} edit={edit} className="im-video-player" label={`Play ${title}`}/>
  </div>
 </div>,document.body);
}

export function ItemVideo({src,edit,label}:{src:string;edit?:any;label:string}){
 const [open,setOpen]=useState(false);
 return <>
  <button type="button" className="im-video" aria-label={`Watch video for ${label}`} title="Watch video" onPointerDown={halt} onClick={e=>{e.preventDefault();e.stopPropagation();setOpen(true);}}><Film size={13}/></button>
  {open&&<VideoLightbox src={src} edit={edit} title={label} onClose={()=>setOpen(false)}/>}
 </>;
}

/** Small play buttons for an item's sound and video. Clicks stay here, so they never pick or drag the item. */
export function ItemExtras({item,text,className=''}:{item:any;text:string;className?:string}){
 const m=itemMediaOf(item,text);
 if(!m||(!m.audio&&!m.video))return null;
 return <span className={`im-extras ${className}`.trim()} onClick={halt} onPointerDown={halt} onKeyDown={halt}>
  {m.audio&&<ItemSound src={m.audio} edit={m.audioEdit} label={`Play sound for ${text}`}/>}
  {m.video&&<ItemVideo src={m.video} edit={m.videoEdit} label={text}/>}
 </span>;
}

/** Editor: one compact button per answer row. Shows what is attached and opens the media sheet. */
export function ItemMediaButton({label,image,media,disabled,onOpen}:{label:string;image?:string;media?:any;disabled?:boolean;onOpen:()=>void}){
 const sound=!!media?.audio,video=!!media?.video,count=[image,sound,video].filter(Boolean).length;
 return <button type="button" className="im-button" data-has={count||undefined} disabled={disabled} aria-label={count?`Media for ${label}: ${[image&&'picture',sound&&'sound',video&&'video'].filter(Boolean).join(', ')}`:`Add picture, sound or video for ${label}`} title={disabled?'Type the answer first':'Picture, sound or video'} onClick={onOpen}>
  {image?<img src={image} alt=""/>:<ImagePlus size={16}/>}
  {(sound||video)&&<span className="im-button-dots" aria-hidden="true">{sound&&<i><Volume2 size={9}/></i>}{video&&<i><Film size={9}/></i>}</span>}
 </button>;
}

/** Bottom sheet on phones, dialog on wider screens. */
export function ItemMediaSheet({title,hint,onClose,children}:{title:string;hint?:string;onClose:()=>void;children:React.ReactNode}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const back=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';panel.current?.focus();
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!document.querySelector('.me,.image-editor,.media-link-layer,.image-viewer')){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;back?.focus?.();};
 },[]);
 return createPortal(<div className="im-sheet-layer" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="im-sheet" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}>
   <div className="type-sheet-handle" aria-hidden="true"/>
   <div className="im-sheet-head"><div><h3>{title}</h3>{hint&&<p>{hint}</p>}</div><button type="button" className="type-sheet-close" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
   <div className="im-sheet-body asset-list editor-media-step">{children}</div>
   <div className="im-sheet-foot"><button type="button" className="im-sheet-done" onClick={onClose}><Check size={16}/>Done</button></div>
  </div>
 </div>,document.body);
}
