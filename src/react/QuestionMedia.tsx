import React,{useRef,useState} from 'react';
import {Image as ImageIcon,Film,Volume2,ChevronDown} from 'lucide-react';
import {ZoomableImage} from './ImageViewer';
import {SoundPlayer} from './QuestionSound';
import {VideoPlayer} from './QuestionVideo';

type Props={image?:string;imageAlt?:string;audio?:string;audioEdit?:any;displayName?:string;fileTitle?:string;video?:string;videoEdit?:any;videoClass?:string;preview?:boolean;kind?:'question'|'answer';className?:string;zoomClass?:string;imgClass?:string;soundBar?:boolean};

export function QuestionMedia({image,imageAlt,audio,audioEdit,displayName,fileTitle,video,videoEdit,videoClass='',preview=false,kind='question',className='',zoomClass='question-media-zoom',imgClass='question-media',soundBar=false}:Props){
 const [tab,setTab]=useState<'picture'|'video'>('picture');
 const root=useRef<HTMLDivElement>(null);
 const sound=audio?{src:audio,edit:audioEdit,displayName:displayName||(kind==='answer'?'Answer sound':undefined),fileTitle,label:`Play ${kind} sound`}:null;
 const picture=image?<ZoomableImage className={zoomClass} imgClassName={imgClass} src={image} alt={imageAlt||(kind==='answer'?'Answer illustration':'Question illustration')} label={`Enlarge ${kind} image`}/>:null;
 const clip=video?<VideoPlayer src={video} edit={videoEdit} className={`quiz-video ${videoClass}`.trim()} label={`${preview?'Preview':'Play'} ${kind} video`}/>:null;
 const bar=sound&&soundBar?<SoundPlayer {...sound} displayName={sound.displayName||'Listen'} variant="card" className="quiz-sound quiz-sound-bar"/>:null;
 const pictureBlock=picture&&sound?bar?<>{bar}{picture}</>:<div className="quiz-media-dock is-picture">{picture}<SoundPlayer {...sound} variant="overlay" className="quiz-sound-dock"/></div>:picture;
 if(!picture&&!sound&&!clip)return null;
 if(kind==='answer'&&picture&&sound&&!clip)return <div className={`answer-media-card ${className}`.trim()}>{picture}<SoundPlayer {...sound} variant="card" className="answer-media-sound"/></div>;
 if(picture&&clip){
  const showVideo=tab==='video';
  const choose=(next:'picture'|'video')=>{root.current?.querySelectorAll('video,audio').forEach(m=>(m as HTMLMediaElement).pause());setTab(next);};
  return <div ref={root} className={`quiz-media-tabs ${className}`.trim()} data-tab={tab}>
   <div className="quiz-media-switch" role="tablist" aria-label={`${kind==='answer'?'Answer':'Question'} media`}>
    <button type="button" role="tab" aria-selected={!showVideo} onClick={()=>choose('picture')}><ImageIcon size={14}/> Picture</button>
    <button type="button" role="tab" aria-selected={showVideo} onClick={()=>choose('video')}><Film size={14}/> Video</button>
   </div>
   <div className="quiz-media-panel" hidden={showVideo}>{pictureBlock}</div>
   <div className="quiz-media-panel" hidden={!showVideo}>{clip}</div>
  </div>;
 }
 if(!picture&&sound&&clip){
  const block=<div className="quiz-media-dock">{clip}<SoundPlayer {...sound} variant="overlay" className="quiz-sound-dock"/></div>;
  return className?<div className={`quiz-media-group ${className}`}>{block}</div>:block;
 }
 const parts=<>{pictureBlock}{!picture&&sound&&(bar||<SoundPlayer {...sound} variant={kind==='answer'?'card':'pulse'} className={kind==='answer'?'quiz-sound feedback-sound':'quiz-sound'}/>)}{clip}</>;
 return className?<div className={`quiz-media-group ${className}`}>{parts}</div>:parts;
}

type AnswerKind='picture'|'video'|'sound';
// Quiz feedback: answer media stays hidden until asked for, then shows in one small fixed frame.
export function AnswerMediaToggle({image,imageAlt,audio,audioEdit,video,videoEdit}:{image?:string;imageAlt?:string;audio?:string;audioEdit?:any;video?:string;videoEdit?:any}){
 const kinds=([image&&'picture',video&&'video',audio&&'sound'].filter(Boolean)) as AnswerKind[];
 const [open,setOpen]=useState(false),[tab,setTab]=useState<AnswerKind|undefined>(kinds[0]);
 if(!kinds.length)return null;
 const cur=tab&&kinds.includes(tab)?tab:kinds[0];
 const icons={picture:ImageIcon,video:Film,sound:Volume2},names={picture:'Picture',video:'Video',sound:'Sound'};
 return <div className="answer-media-toggle">
  <button type="button" className="amt-toggle" aria-expanded={open} onClick={()=>setOpen(o=>!o)}>{kinds.map(k=>{const I=icons[k];return <I key={k} size={15}/>;})}<span>{open?'Hide':'Show'} answer {kinds.length>1?'media':names[kinds[0]].toLowerCase()}</span><ChevronDown size={16}/></button>
  {open&&<div className="amt-frame">
   {kinds.length>1&&<div className="amt-tabs" role="tablist" aria-label="Answer media">{kinds.map(k=><button key={k} type="button" role="tab" aria-selected={cur===k} onClick={()=>setTab(k)}>{names[k]}</button>)}</div>}
   <div className="amt-panel" data-kind={cur}>
    {cur==='picture'&&<ZoomableImage className="amt-zoom" imgClassName="amt-img" src={image!} alt={imageAlt||'Answer illustration'} label="Enlarge answer image"/>}
    {cur==='video'&&<VideoPlayer src={video!} edit={videoEdit} className="quiz-video is-compact amt-video" label="Play answer video"/>}
    {cur==='sound'&&<SoundPlayer src={audio!} edit={audioEdit} displayName="Answer sound" variant="card" label="Play answer sound" className="amt-sound"/>}
   </div>
  </div>}
 </div>;
}
