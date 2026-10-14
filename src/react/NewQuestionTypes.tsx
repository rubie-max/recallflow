import React,{useEffect,useRef,useState} from 'react';
import {Music,Mic,Headphones,ListMusic,AudioLines,Image as ImageIcon,MapPin,Tags,Languages,SpellCheck,Layers,Timer,Shuffle,Flag,PersonStanding,Captions,BetweenHorizontalStart,CircleOff,Check,Upload,Trash2,Square,Play,Plus} from 'lucide-react';
import {questionTypeGroups,answerText,audioSafe} from '../question-types.js';
import {seededShuffle} from '../question-variants.js';

const ICONS:Record<string,any>={
 short_answer:Captions,fill_blank:BetweenHorizontalStart,single_choice:CircleOff,flashcard:Layers,true_false:Check,multi_select:Tags,numeric:Timer,matching:Shuffle,ordering:ListMusic,cloze:Captions,fill_blank_options:Layers,
 audio_name:Music,audio_voice:PersonStanding,dictation:Headphones,lyric:AudioLines,audio_choice:Flag,audio_order:ListMusic,
 image_tap:MapPin,image_label:Tags,odd_one_out:CircleOff,before_after:ImageIcon,
 categorize:Layers,timeline:Timer,build_answer:BetweenHorizontalStart,two_step:Shuffle,
 translate:Languages,spot_mistake:SpellCheck,
};
export function typeIcon(type:string){return ICONS[type]||CircleOff;}

export function TypeGallery({value,onChange,label='Question type'}:{value:string;onChange:(type:string)=>void;label?:string}){
 return <div className="type-gallery" role="radiogroup" aria-label={label}>{questionTypeGroups.map(([id,name,types])=><section key={id} className="type-gallery-group" aria-label={name}><h3>{name}</h3><div className="type-gallery-grid">{types.map(([type,title])=>{const Icon=typeIcon(type);return <button type="button" role="radio" key={type} aria-checked={value===type} data-group={id} onClick={()=>onChange(type)}><Icon size={16} aria-hidden="true"/><span>{title}</span></button>;})}</div></section>)}</div>;
}

function readAudio(file:File){return new Promise<string>((resolve,reject)=>{if(!file.type.startsWith('audio/')&&!/\.(mp3|wav|m4a|ogg|webm|aac)$/i.test(file.name)){reject(new Error('Choose a sound file, such as MP3 or M4A.'));return;}if(file.size>380000){reject(new Error('Keep the clip under about 20 seconds so it stays small enough to save.'));return;}const reader=new FileReader();reader.onload=()=>{const data=String(reader.result||'');if(!audioSafe(data))reject(new Error('This sound could not be saved. Try a shorter MP3.'));else resolve(data);};reader.onerror=()=>reject(new Error('Could not read that sound.'));reader.readAsDataURL(file);});}

export function SoundClip({src,label='Play clip',large=false}:{src?:string;label?:string;large?:boolean}){
 const audio=useRef<HTMLAudioElement|null>(null),[playing,setPlaying]=useState(false);
 useEffect(()=>()=>{audio.current?.pause();},[src]);
 if(!src)return null;
 function toggle(){if(!audio.current){audio.current=new Audio(src);audio.current.onended=()=>setPlaying(false);}if(playing){audio.current.pause();audio.current.currentTime=0;setPlaying(false);}else{audio.current.play().then(()=>setPlaying(true)).catch(()=>setPlaying(false));}}
 return <button type="button" className={`qt-play${large?' is-large':''}`} aria-pressed={playing} onClick={toggle}>{playing?<Square size={large?18:14}/>:<Play size={large?18:14} fill="currentColor"/>}{playing?'Stop':label}</button>;
}

function SoundField({src,onChange,onError,label}:{src?:string;onChange:(src:string)=>void;onError:(msg:string)=>void;label:string}){
 const input=useRef<HTMLInputElement>(null),[recording,setRecording]=useState(false),[secs,setSecs]=useState(0),rec=useRef<MediaRecorder|null>(null);
 useEffect(()=>()=>{rec.current?.stop();},[]);
 async function start(){
  onError('');
  try{
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});
   const mime=typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported?.('audio/webm')?'audio/webm':'';
   const media=new MediaRecorder(stream,mime?{mimeType:mime}:undefined);const chunks:Blob[]=[];
   media.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   media.onstop=()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:media.mimeType||'audio/webm'});if(blob.size>380000){onError('That recording is too long. Stop it sooner.');return;}const reader=new FileReader();reader.onload=()=>{const data=String(reader.result||'');if(audioSafe(data))onChange(data);else onError('The recording could not be saved. Try uploading a file instead.');};reader.readAsDataURL(blob);};
   rec.current=media;media.start();setRecording(true);setSecs(0);const t0=Date.now();const timer=window.setInterval(()=>{const s=Math.round((Date.now()-t0)/1000);setSecs(s);if(s>=20){window.clearInterval(timer);media.stop();setRecording(false);}},250);
   media.addEventListener('stop',()=>{window.clearInterval(timer);setRecording(false);rec.current=null;},{once:true});
  }catch{onError('Allow the microphone to record, or upload a sound file.');}
 }
 return <div className="qt-sound"><div className="qt-sound-row"><button type="button" onClick={()=>input.current?.click()}><Upload size={14}/>Upload</button><button type="button" aria-pressed={recording} onClick={()=>recording?rec.current?.stop():void start()}>{recording?<Square size={14}/>:<Mic size={14}/>}{recording?`Stop · ${secs}s`:'Record'}</button>{src&&<SoundClip src={src} label={label}/>}{src&&<button type="button" className="is-remove" aria-label={`Remove ${label}`} onClick={()=>onChange('')}><Trash2 size={14}/></button>}</div><small>{src?'Clip added. Play it to check.':'MP3, M4A or a short recording. About 20 seconds max.'}</small><input ref={input} hidden type="file" accept="audio/*,.mp3,.m4a,.wav,.ogg,.webm" aria-label={`Upload ${label}`} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)readAudio(file).then(onChange).catch((err:Error)=>onError(err.message));}}/></div>;
}

function PinBoard({image,spots,onPlace,revealed=false}:{image:string;spots:{x:number;y:number;label?:string;mine?:boolean}[];onPlace?:(x:number,y:number)=>void;revealed?:boolean}){
 return <div className="qt-pinboard">{image?<button type="button" className="qt-pin-image" disabled={!onPlace||revealed} aria-label="Picture. Tap to mark a place." onClick={e=>{if(!onPlace)return;const r=e.currentTarget.getBoundingClientRect();onPlace((e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100);}}><img src={image} alt=""/><span className="qt-pins">{spots.map((s,i)=><i key={i} data-mine={s.mine||undefined} style={{left:`${s.x}%`,top:`${s.y}%`}}>{s.label||i+1}</i>)}</span></button>:<p className="qt-empty">Add a picture first.</p>}</div>;
}

export function ExtraTypeFields({draft,field,onError}:{draft:any;field:(key:string,value:any)=>void;onError:(msg:string)=>void}){
 const type=draft.type;
 const clips=draft.clips?.length?draft.clips:[{label:'',audio:''},{label:'',audio:''}];
 const groups=draft.groups?.length?draft.groups:[{name:'',items:''},{name:'',items:''}];
 const steps=draft.steps?.length?draft.steps:[{prompt:'',answer:''},{prompt:'',answer:''}];
 const setClip=(i:number,patch:any)=>field('clips',clips.map((c:any,n:number)=>n===i?{...c,...patch}:c));
 if(['audio_name','audio_voice','dictation','lyric'].includes(type))return <div className="qt-editor"><SoundField src={draft.audio} label="Play clip" onChange={src=>field('audio',src)} onError={onError}/><label>{type==='dictation'?'What the clip says':type==='lyric'?'The rest of the line':'Correct answer'}<textarea value={draft.answer} onChange={e=>field('answer',e.target.value)} placeholder={type==='audio_name'?'e.g. Jana Gana Mana':type==='audio_voice'?'e.g. French':type==='lyric'?'e.g. the next line':'Type the exact words'}/></label>{type==='dictation'&&<label className="editor-toggle"><input type="checkbox" checked={draft.fuzzy===true} onChange={e=>field('fuzzy',e.target.checked)}/><span>Accept minor typos<small>Leave this off for spelling practice.</small></span></label>}</div>;
 if(type==='audio_choice'||type==='audio_order')return <div className="qt-editor"><p className="editor-list-label">{type==='audio_choice'?'Clips':'Sounds in the right order'}<small>{type==='audio_choice'?'Mark the clip that is the answer.':'The quiz will mix these up.'}</small></p>{clips.map((clip:any,i:number)=><div className="qt-clip-row" key={i}>{type==='audio_choice'&&<input type="radio" name="qt-clip" aria-label={`Clip ${i+1} is correct`} checked={!!clip.label&&draft.answer===clip.label} onChange={()=>field('answer',clip.label)} disabled={!clip.label}/>}<input aria-label={`Clip ${i+1} name`} value={clip.label} placeholder={type==='audio_order'?`Sound ${i+1}`:`Clip ${i+1}`} onChange={e=>{const label=e.target.value;setClip(i,{label});if(draft.answer===clip.label)field('answer',label);}}/><SoundField src={clip.audio} label="Play" onChange={audio=>setClip(i,{audio})} onError={onError}/><button type="button" aria-label={`Remove clip ${i+1}`} disabled={clips.length<=2} onClick={()=>field('clips',clips.filter((_:any,n:number)=>n!==i))}><Trash2 size={14}/></button></div>)}<button type="button" className="editor-text-button" onClick={()=>field('clips',[...clips,{label:'',audio:''}])}><Plus size={14}/>Add clip</button></div>;
 if(type==='image_tap'||type==='image_label')return <div className="qt-editor"><p className="editor-list-label">{type==='image_tap'?'Mark the answer':'Markers'}<small>{type==='image_tap'?'Tap the picture once. Name the place if you want.':'Tap each place, then name it. Add at least two.'}</small></p><PinBoard image={draft.image} spots={draft.spots||[]} onPlace={(x,y)=>field('spots',type==='image_tap'?[{x,y,label:draft.spots?.[0]?.label||''}]:[...(draft.spots||[]),{x,y,label:''}])}/>{type==='image_tap'&&<label>Name of this place<small className="editor-optional">Optional</small><input value={draft.spots?.[0]?.label||''} placeholder="e.g. France" onChange={e=>field('spots',[{...(draft.spots?.[0]||{x:50,y:50}),label:e.target.value}])}/></label>}{type==='image_label'&&(draft.spots||[]).map((s:any,i:number)=><div className="qt-spot-row" key={i}><span>{i+1}</span><input aria-label={`Marker ${i+1}`} value={s.label} placeholder="e.g. Heart" onChange={e=>field('spots',draft.spots.map((row:any,n:number)=>n===i?{...row,label:e.target.value}:row))}/><button type="button" aria-label={`Remove marker ${i+1}`} onClick={()=>field('spots',draft.spots.filter((_:any,n:number)=>n!==i))}><Trash2 size={14}/></button></div>)}</div>;
 if(type==='before_after')return <div className="qt-editor"><p className="qt-hint">Use the question image as the before picture and the answer image as the after picture.</p><label>What changed?<textarea value={draft.answer} onChange={e=>field('answer',e.target.value)} placeholder="e.g. The flag was added"/></label></div>;
 if(type==='categorize')return <div className="qt-editor">{groups.map((g:any,i:number)=><div className="qt-group" key={i}><label>Group {i+1}<input value={g.name} placeholder="e.g. Europe" onChange={e=>field('groups',groups.map((row:any,n:number)=>n===i?{...row,name:e.target.value}:row))}/></label><label>Items<small>One per line</small><textarea value={g.items} placeholder={'France\nItaly'} onChange={e=>field('groups',groups.map((row:any,n:number)=>n===i?{...row,items:e.target.value}:row))}/></label><button type="button" aria-label={`Remove group ${i+1}`} disabled={groups.length<=2} onClick={()=>field('groups',groups.filter((_:any,n:number)=>n!==i))}><Trash2 size={14}/>Remove group</button></div>)}<button type="button" className="editor-text-button" onClick={()=>field('groups',[...groups,{name:'',items:''}])}><Plus size={14}/>Add group</button></div>;
 if(type==='timeline')return <div className="qt-editor"><p className="editor-list-label">Events in time order<small>Earliest first. The quiz will mix them up.</small></p>{String(draft.structured||'').split('\n').concat(String(draft.structured||'').includes('\n')?[]:['']).slice(0,Math.max(2,String(draft.structured||'').split('\n').length)).map((row:string,i:number,all:string[])=>{const [year,...rest]=row.split('|');return <div className="qt-time-row" key={i}><input aria-label={`Year ${i+1}`} value={rest.length?year:''} placeholder="Year" onChange={e=>{const rows=all.slice();const event=rest.length?rest.join('|'):row;rows[i]=`${e.target.value}|${event}`;field('structured',rows.join('\n'));}}/><input aria-label={`Event ${i+1}`} value={rest.length?rest.join('|'):row} placeholder="What happened" onChange={e=>{const rows=all.slice();rows[i]=rest.length?`${year}|${e.target.value}`:e.target.value;field('structured',rows.join('\n'));}}/></div>;})}<button type="button" className="editor-text-button" onClick={()=>field('structured',`${draft.structured||''}\n`)}><Plus size={14}/>Add event</button></div>;
 if(type==='build_answer')return <div className="qt-editor"><label>Words in the right order<small>One word or piece per line</small><textarea value={draft.structured} onChange={e=>field('structured',e.target.value)} placeholder={'Jana\nGana\nMana'}/></label><label>Extra words<small>Optional. One per line. These are wrong pieces mixed in.</small><textarea value={draft.options} onChange={e=>field('options',e.target.value)} placeholder={'Gama\nManaa'}/></label></div>;
 if(type==='translate')return <div className="qt-editor"><label>Translation<textarea value={draft.answer} onChange={e=>field('answer',e.target.value)} placeholder="Write the translation"/></label><label>Other accepted translations<textarea value={draft.accepted||''} onChange={e=>field('accepted',e.target.value)} placeholder="One per line"/></label></div>;
 if(type==='spot_mistake')return <div className="qt-editor"><p className="qt-hint">Write the sentence with the mistake in the question box. Put the corrected sentence here.</p><label>Corrected sentence<textarea value={draft.answer} onChange={e=>field('answer',e.target.value)} placeholder="The sentence with the mistake fixed"/></label></div>;
 if(type==='two_step')return <div className="qt-editor">{steps.slice(0,2).map((s:any,i:number)=><div className="qt-group" key={i}><label>Part {i+1} question<textarea value={s.prompt} onChange={e=>field('steps',steps.map((row:any,n:number)=>n===i?{...row,prompt:e.target.value}:row))} placeholder={i?'Which country sings it?':'What is the name of this anthem?'}/></label><label>Part {i+1} answer<input value={s.answer} onChange={e=>field('steps',steps.map((row:any,n:number)=>n===i?{...row,answer:e.target.value}:row))} placeholder="Answer"/></label></div>)}</div>;
 return null;
}

export function ExtraAnswer({item,revealed,onGrade}:{item:any;revealed:boolean;onGrade:(value:any)=>void}){
 const type=item.type;
 const [text,setText]=useState('');
 const [picked,setPicked]=useState('');
 const [order,setOrder]=useState<string[]>([]);
 const [labels,setLabels]=useState<string[]>([]);
 const [built,setBuilt]=useState<string[]>([]);
 const [groups,setGroups]=useState<Record<string,string>>({});
 const [part,setPart]=useState(0);
 const [answers,setAnswers]=useState<string[]>(['','']);
 const [tap,setTap]=useState<{x:number;y:number}|null>(null);
 useEffect(()=>{
  setText('');setPicked('');setLabels([]);setBuilt([]);setGroups({});setPart(0);setAnswers(['','']);setTap(null);
  if(type==='audio_order')setOrder(seededShuffle((item.clips||[]).map((c:any)=>c.label),item.id+'o'));
  else if(type==='timeline')setOrder(seededShuffle(item.sequence||[],item.id+'t'));
  else if(type==='image_label')setLabels((item.spots||[]).map(()=>''));
 },[item.id,type]);
 const tiles=type==='build_answer'?seededShuffle([...(item.sequence||[]),...(item.options||[])],item.id+'b'):[];
 const bank=type==='image_label'?seededShuffle((item.spots||[]).map((s:any)=>s.label),item.id+'l'):[];
 const catItems=type==='categorize'?seededShuffle((item.groups||[]).flatMap((g:any)=>g.items),item.id+'c'):[];
 function move(list:string[],i:number,dir:number){const n=[...list];const j=i+dir;if(j<0||j>=n.length)return list;[n[i],n[j]]=[n[j],n[i]];return n;}
 const check=<button type="button" className="qt-check" disabled={revealed} onClick={()=>onGrade(type==='audio_order'||type==='timeline'?order:type==='build_answer'?built:type==='image_label'?labels:type==='categorize'?catItems.map(name=>({item:name,group:groups[name]})):type==='two_step'?answers:type==='image_tap'?tap:type==='audio_choice'||type==='odd_one_out'?picked:text)}>Check answer</button>;
 return <div className="qt-answer">
  {item.audio&&<SoundClip src={item.audio} label="Play the clip" large/>}
  {type==='audio_choice'&&<div className="qt-choices">{(item.clips||[]).map((c:any)=><div key={c.label} className={`qt-choice${picked===c.label?' is-on':''}`}><button type="button" disabled={revealed} aria-pressed={picked===c.label} onClick={()=>setPicked(c.label)}><span>{c.label}</span></button><SoundClip src={c.audio} label="Play"/></div>)}{check}</div>}
  {type==='audio_order'&&<div className="qt-order">{order.map((label,i)=>{const clip=(item.clips||[]).find((c:any)=>c.label===label);return <div key={label} className="qt-order-row"><b>{i+1}</b><span>{label}</span><SoundClip src={clip?.audio} label="Play"/><button type="button" aria-label="Move up" disabled={revealed||i===0} onClick={()=>setOrder(move(order,i,-1))}>↑</button><button type="button" aria-label="Move down" disabled={revealed||i===order.length-1} onClick={()=>setOrder(move(order,i,1))}>↓</button></div>;})}{check}</div>}
  {type==='image_tap'&&<><PinBoard image={item.image} revealed={revealed} spots={[...(revealed?(item.spots||[]):[]),...(tap?[{...tap,label:'You',mine:true}]:[])]} onPlace={(x,y)=>setTap({x,y})}/>{check}</>}
  {type==='image_label'&&<><PinBoard image={item.image} spots={(item.spots||[]).map((s:any,i:number)=>({...s,label:labels[i]||String(i+1)}))}/>{(item.spots||[]).map((s:any,i:number)=><label key={i} className="qt-label-row">Marker {i+1}<select aria-label={`Marker ${i+1}`} value={labels[i]||''} disabled={revealed} onChange={e=>setLabels(rows=>{const n=[...rows];n[i]=e.target.value;return n;})}><option value="">Choose a label</option>{bank.map((name:string)=><option key={name}>{name}</option>)}</select></label>)}{check}</>}
  {type==='before_after'&&<div className="qt-pair">{item.image&&<figure><img src={item.image} alt="Before"/><figcaption>Before</figcaption></figure>}{item.answerImage&&<figure><img src={item.answerImage} alt="After"/><figcaption>After</figcaption></figure>}</div>}
  {type==='categorize'&&<div className="qt-sort">{(item.groups||[]).map((g:any)=><div key={g.name} className="qt-bucket"><b>{g.name}</b>{catItems.filter(name=>groups[name]===g.name).map(name=><button type="button" key={name} disabled={revealed} onClick={()=>setGroups(m=>{const n={...m};delete n[name];return n;})}>{name}</button>)}</div>)}<div className="qt-bank"><b>Items</b>{catItems.filter(name=>!groups[name]).map(name=><span key={name}>{name}{(item.groups||[]).map((g:any)=><button type="button" key={g.name} disabled={revealed} onClick={()=>setGroups(m=>({...m,[name]:g.name}))}>{g.name}</button>)}</span>)}</div>{check}</div>}
  {type==='timeline'&&<div className="qt-order">{order.map((row,i)=><div key={row} className="qt-order-row"><b>{i+1}</b><span>{row}</span><button type="button" aria-label="Move earlier" disabled={revealed||i===0} onClick={()=>setOrder(move(order,i,-1))}>↑</button><button type="button" aria-label="Move later" disabled={revealed||i===order.length-1} onClick={()=>setOrder(move(order,i,1))}>↓</button></div>)}{check}</div>}
  {type==='build_answer'&&<div className="qt-build"><div className="qt-built" aria-label="Your answer">{built.length?built.map((w,i)=><button type="button" key={`${w}-${i}`} disabled={revealed} onClick={()=>setBuilt(xs=>xs.filter((_,n)=>n!==i))}>{w}</button>):<span>Tap the pieces in order</span>}</div><div className="qt-tiles">{tiles.filter((w:string)=>built.filter(x=>x===w).length<tiles.filter((t:string)=>t===w).length).map((w:string,i:number)=><button type="button" key={`${w}-${i}`} disabled={revealed} onClick={()=>setBuilt(xs=>[...xs,w])}>{w}</button>)}</div>{check}</div>}
  {type==='two_step'&&<div className="qt-steps"><p className="qt-step-label">Part {part+1} of 2</p><h3>{item.steps?.[part]?.prompt}</h3><textarea aria-label={`Part ${part+1} answer`} value={answers[part]} disabled={revealed} onChange={e=>setAnswers(xs=>{const n=[...xs];n[part]=e.target.value;return n;})}/>{part===0?<button type="button" className="qt-check" disabled={!answers[0].trim()||revealed} onClick={()=>setPart(1)}>Next part</button>:check}</div>}
  {['audio_name','audio_voice','dictation','lyric','translate','spot_mistake','before_after'].includes(type)&&<div className="qt-write"><textarea aria-label="Your answer" value={text} disabled={revealed} placeholder={type==='dictation'?'Type what you hear…':'Your answer…'} onChange={e=>setText(e.target.value)}/>{check}</div>}
  {revealed&&<p className="qt-correct">Answer: {answerText(item)}</p>}
 </div>;
}
