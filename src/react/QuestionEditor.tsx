import React,{useState,useRef} from 'react';
import {Plus,Trash2,ArrowUp,ArrowDown,Check,Save,LoaderCircle,ImagePlus,Eye,Volume2,X,Maximize2,RefreshCw,Link2,Shuffle,Layers,Upload,Crop,Info,AlertCircle,CircleCheck,ScanEye,Lightbulb} from 'lucide-react';
import {MediaLinkForm,pushMediaLinkError} from './MediaLinkForm';
import {ImageEditor} from './ImageEditor';
import {ImageViewer,ZoomableImage} from './ImageViewer';
import {typeLabel,gradeQuestion,extraTypes,questionTypes,isMultiBlank,answerText,resolveImageLink,driveFileId,DRIVE_SHARE_REJECT,typedMediaFile} from '../question-types.js';
import {TypeField,TypeSheet} from './TypeSheet';
import {MAX_VARIANTS,emptyDraft,seededShuffle,imageTypes,pictureLabel,isPictureLabel,specFromDraft,draftTypeFields} from '../question-variants.js';
import {ExtraAnswer} from './ExtraAnswers';
import {ListRecallEditor,CategorizeEditor,HighlightEditor,ImageTapEditor,SliderEditor} from './ExtraEditors';
import {SoundField,SoundPlayer,soundDisplayName,soundFileTitle} from './QuestionSound';
import {VideoField,VideoPlayer} from './QuestionVideo';
import {QuestionMedia} from './QuestionMedia';
import {Button} from './components/Button';
import {SpeechButton} from './KokoroPanel';
import {storeImage} from '../sync.js';
import {ItemMediaButton,ItemMediaSheet,ItemExtras} from './ItemMedia';
import {InlineBlankAnswer,WordBankAnswer} from './QuestionInteractions';
import {StructuredAnswer} from './LearningFeatures';

// Pictures (optionImages) and sounds/videos (optionMedia) are keyed by item text; keep them with the item when it is renamed.
export function rekeyMedia(v:any,from:string,to:string){
 from=String(from??'').trim();to=String(to??'').trim();
 if(from===to)return v;
 const move=(map:any)=>{if(!map?.[from])return map;const next={...map};next[to]=next[from];delete next[from];return next;};
 return {...v,optionImages:move(v.optionImages),optionMedia:move(v.optionMedia)};
}
const dropMedia=(v:any,key:string)=>({...v,optionImages:Object.fromEntries(Object.entries(v.optionImages||{}).filter(([k,x])=>k!==key&&x)),optionMedia:Object.fromEntries(Object.entries(v.optionMedia||{}).filter(([k])=>k!==key))});
const help:any={short_answer:'Ask a direct question and write the answer you expect.',fill_blank:'Use ___ for each missing word. Add several blanks if you like.',single_choice:'Add choices, then select the one correct answer.',flashcard:'Write the front of the card and the answer on the back.',true_false:'Write a statement and choose whether it is true or false.',multi_select:'Add choices and mark every correct answer.',numeric:'Set the expected number and how much variation to accept.',matching:'Each row is a pair. Learners will connect the two sides.',ordering:'Write the steps in their correct order. The quiz will mix them up.',cloze:'Use ___ for each gap, then enter its answer below.',fill_blank_options:'Create gaps with ___ and give learners a word bank.',list_recall:'List the answers. Learners type them in any order.',categorize:'Make groups and add the items in each. Items can have pictures or sounds.',highlight:'Write a passage, then tap the words learners should find.',image_tap:'Add a picture or map, then mark the places learners find or name.',slider:'Set a range and the answer. Learners drag to their estimate.'};
const promptHints:any={matching:'Match each country to its capital.',list_recall:'Name the seven continents.',categorize:'Sort each food into its group.',highlight:'Tap every verb.',image_tap:'Find these states on the map.',slider:'In what year did World War II end?'};
const imageAccept='image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';
// Stored images live in localStorage (about 5 MB in total), so keep each one small.
export async function compressImage(file:File):Promise<string>{
 const typed=typedMediaFile(file,'image') as File|null;
 if(!typed||!String(typed.type||'').startsWith('image/'))throw new Error('Choose an image file (PNG, JPEG, WebP or GIF).');
 file=typed instanceof File?typed:new File([typed],'image.jpg',{type:(typed as Blob).type});
 if(file.size>25*1024*1024)throw new Error('Choose an image under 25 MB.');
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('This image could not be opened. Try a PNG, JPEG or WebP file.'));i.src=url;});
  const width=img.naturalWidth,height=img.naturalHeight;
  if(['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size<=250*1024&&Math.max(width,height)<=1280)return await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read this image.'));r.readAsDataURL(file);});
  for(const [max,quality] of [[1280,.82],[1024,.78],[800,.72],[640,.65]]){
   const scale=Math.min(1,max/Math.max(width,height)),canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot process images.');
   ctx.drawImage(img,0,0,canvas.width,canvas.height);
   let data=canvas.toDataURL('image/webp',quality);
   if(!data.startsWith('data:image/webp')){ctx.globalCompositeOperation='destination-over';ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);data=canvas.toDataURL('image/jpeg',quality);}
   if(data.length<=450000)return data;
  }
  throw new Error('This image is too detailed to store. Try cropping it first.');
 }finally{URL.revokeObjectURL(url);}
}
// Copies the picture into the question when the site allows it; otherwise keeps the https link.
export async function imageFromLink(link:string):Promise<{image:string;linked:boolean}>{
 const trimmed=link.trim();
 const resolved=resolveImageLink(trimmed);
 let url:URL;try{url=new URL(resolved);}catch{throw new Error('Paste a full image link that starts with https://');}
 if(!['https:','http:'].includes(url.protocol))throw new Error('Paste a full image link that starts with https://');
 if(driveFileId(trimmed)||driveFileId(resolved))throw new Error(DRIVE_SHARE_REJECT);
 try{
  const controller=new AbortController(),timer=window.setTimeout(()=>controller.abort(),10000);
  const response=await fetch(url.href,{mode:'cors',signal:controller.signal}).finally(()=>window.clearTimeout(timer));
  const blob=await response.blob();
  if(response.ok&&blob.type.startsWith('image/'))return {image:await compressImage(new File([blob],'linked-image',{type:blob.type})),linked:false};
 }catch{}
 if(url.protocol!=='https:')throw new Error('This site blocks copying the image. Use an https:// link or upload the file.');
 if(url.href.length>2048)throw new Error('This link is too long. Upload the image instead.');
 await new Promise<void>((resolve,reject)=>{const img=new Image(),timer=window.setTimeout(()=>reject(new Error('The image took too long to load.')),12000);img.onload=()=>{window.clearTimeout(timer);resolve();};img.onerror=()=>{window.clearTimeout(timer);reject(new Error(/drive\.google\.com/i.test(link)||driveFileId(link)?'No image was found at this Google Drive link. Sharing must be “Anyone with the link” (Viewer). If it already is, use Upload/Change and pick the file from your device instead of Link.':'No image was found at this link.'));};img.src=url.href;});
 return {image:url.href,linked:true};
}
export function ImageLightbox({src,onClose}:{src:string|null;onClose:()=>void}){
 return src?<ImageViewer src={src} alt="Enlarged preview" onClose={onClose}/>:null;
}
function mediaSlotCount(...values:(string|undefined)[]){return values.filter(Boolean).length}
function InlineImage({label,hint,image,onPick,onLink,onRemove,onView,onEdit,onClearError,assetLayout,required,linkLabel='Paste link',uploadEmptyLabel}:any){
 const input=useRef<HTMLInputElement>(null),[loading,setLoading]=useState(false),[linking,setLinking]=useState(false);
 const pick=async(file?:File)=>{if(!file)return;setLoading(true);try{await onPick(file);}finally{setLoading(false);}};
 const uploadLabel=loading?'Adding…':image?'Change image':(uploadEmptyLabel||'Upload image');
 const uploadBtn=<button type="button" className={assetLayout?'media-action':undefined} disabled={loading} aria-label={uploadLabel} title={uploadLabel} onClick={()=>{setLinking(false);input.current?.click();}}>{loading?<LoaderCircle size={14} className="speech-spinner"/>:image?<RefreshCw size={14}/>:<Upload size={14}/>}{assetLayout?uploadLabel:(loading?'Adding…':image?'Change':'Upload')}</button>;
 const linkBtn=<button type="button" className={assetLayout?'media-action':undefined} aria-label={image?`Replace ${label.toLowerCase()} with a link`:`Add ${label.toLowerCase()} from a link`} aria-expanded={linking} disabled={loading} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={14}/>{assetLayout?linkLabel:'Link'}</button>;
 const linkForm=linking&&<MediaLinkForm autoFocus resolve={resolveImageLink} label={`${label} link`} placeholder="https://…/picture.jpg" initialUrl={image?.startsWith('https://')?image:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={async(url:string)=>{if(await onLink(url))setLinking(false);}}/>;
 const fileInput=<input ref={input} type="file" hidden aria-label={`Upload ${label.toLowerCase()}`} accept={imageAccept} onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';void pick(file);}}/>;
 if(assetLayout){
  const badge=!image?(required?'Needed':'Not added'):'Added';
  const badgeClass=!image?`asset-state${required?' is-warn':' is-empty'}`:'asset-state is-ok';
  const caption=image?'Tap the preview to view it full size':hint;
  const actions=<div className="asset-actions">{image&&onEdit&&<button type="button" className="media-action" aria-label={`Edit ${label.toLowerCase()}`} disabled={loading} onClick={onEdit}><Crop size={14}/>Edit</button>}{uploadBtn}{linkBtn}{image&&<button type="button" className="media-action is-remove" aria-label={`Remove ${label.toLowerCase()}`} disabled={loading} onClick={onRemove}><Trash2 size={14}/></button>}</div>;
  return <article className={`asset${image?' has-image':''}${linking?' is-linking':''}`}>
   <header className="media-head"><span className="media-ico" aria-hidden="true"><ImagePlus size={17}/></span><div className="media-headmain"><div className="media-titlerow"><span className="asset-name">{label}</span><span className={badgeClass}>{badge}</span></div><small className="asset-caption">{caption}</small></div></header>
   {image&&<div className="asset-media-extra"><button type="button" className="media-banner" aria-label={`Preview ${label.toLowerCase()}`} onClick={()=>onView(image)}><img src={image} alt=""/></button></div>}
   {actions}{linkForm}{fileInput}
  </article>;
 }
 return <div className={`editor-inline-image${image?' has-image':''}${linking?' is-linking':''}`}>
  {image?<button type="button" className="editor-inline-thumb" aria-label={`Enlarge ${label.toLowerCase()}`} onClick={()=>onView(image)}><img src={image} alt=""/><span><Maximize2 size={13}/></span></button>:<span className="editor-inline-icon"><ImagePlus size={18}/></span>}
  <div className="editor-inline-copy"><strong>{label}</strong><small>{image?(image.startsWith('https:')?'Linked image · tap to preview':'Tap the image to preview it'):hint}</small></div>
  <div className="editor-inline-actions">{image&&onEdit&&<button type="button" aria-label={`Edit ${label.toLowerCase()}`} disabled={loading} onClick={onEdit}><Crop size={14}/>Edit</button>}{uploadBtn}{linkBtn}{image&&<button type="button" className="is-remove" aria-label={`Remove ${label.toLowerCase()}`} disabled={loading} onClick={onRemove}><Trash2 size={14}/></button>}</div>
  {linkForm}{fileInput}
 </div>;
}
function ChoiceImageButton({choice,image,onPick,onLink,onRemove,onView,onEdit,disabled}:any){
 const input=useRef<HTMLInputElement>(null),[loading,setLoading]=useState(false),[menu,setMenu]=useState<''|'menu'|'link'|'image'>(''),box=useRef<HTMLSpanElement>(null);
 React.useEffect(()=>{if(!menu)return;const close=(e:PointerEvent)=>{if(!box.current?.contains(e.target as Node))setMenu('');};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close);},[menu]);
 return <span className="editor-choice-image" ref={box}>
  {image?<button type="button" className="editor-choice-thumb" aria-label={`Image options for ${choice}`} aria-expanded={menu==='image'} onClick={()=>setMenu(m=>m?'':'image')}><img src={image} alt=""/></button>:<button type="button" className="editor-choice-add" aria-label={`Add image for ${choice||'this item'}`} aria-expanded={!!menu} title={disabled?'Type the choice first':'Add image'} disabled={disabled||loading} onClick={()=>setMenu(m=>m?'':'menu')}>{loading?<LoaderCircle size={15} className="speech-spinner"/>:<ImagePlus size={16}/>}</button>}
  {image&&<button type="button" className="editor-choice-image-remove" aria-label={`Remove image for ${choice}`} onClick={onRemove}><X size={11}/></button>}
  {menu&&<span className="editor-choice-image-menu" role="menu" onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setMenu('');}}}>{menu==='image'?<><button type="button" role="menuitem" onClick={()=>{setMenu('');onView(image);}}><Maximize2 size={15}/>Preview</button>{onEdit&&<button type="button" role="menuitem" onClick={()=>{setMenu('');onEdit();}}><Crop size={15}/>Edit image</button>}<button type="button" role="menuitem" onClick={()=>{setMenu('');input.current?.click();}}><RefreshCw size={15}/>Replace image</button></>:menu==='menu'?<><button type="button" role="menuitem" onClick={()=>{setMenu('');input.current?.click();}}><Upload size={15}/>Upload image</button><button type="button" role="menuitem" onClick={()=>setMenu('link')}><Link2 size={15}/>Use image link</button></>:<MediaLinkForm resolve={resolveImageLink} label={`Image link for ${choice}`} placeholder="https://…/picture.jpg" onCancel={()=>setMenu('')} onSubmit={async(url:string)=>{setLoading(true);try{if(await onLink(url))setMenu('');}finally{setLoading(false);}}}/>}</span>}
  <input ref={input} type="file" hidden accept={imageAccept} onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file){setLoading(true);try{await onPick(file);}finally{setLoading(false);}}}}/>
 </span>;
}
function ImageUpload({label,image,onPick,onLink,onRemove,onEdit,hint='PNG, JPEG, WebP or GIF · resized automatically',onClearError}:any){
 const input=useRef<HTMLInputElement>(null),[loading,setLoading]=useState(false),[linking,setLinking]=useState(false);
 return <div className="editor-image-upload"><div className={`editor-upload-preview ${image?'has-image':''}`}>
 {image?<img src={image} alt={`${label} preview`}/>:<><ImagePlus size={31}/><span>No image added</span></>}
 </div><div className="editor-upload-bottom"><div><strong>{label}</strong><small>{hint}</small></div><div className="editor-upload-buttons">{image&&onEdit&&<button type="button" className="editor-upload-choose is-secondary" disabled={loading} aria-label={`Edit ${label.toLowerCase()}`} onClick={onEdit}><Crop size={15}/>Edit</button>}<button type="button" className="editor-upload-choose" disabled={loading} aria-label={`${image?'Change':'Choose'} ${label.toLowerCase()}`} onClick={()=>{setLinking(false);input.current?.click();}}>{loading?<LoaderCircle size={15} className="speech-spinner"/>:<Upload size={15}/>}{loading?'Adding…':image?'Change':'Upload'}</button> <button type="button" className="editor-upload-choose is-secondary" aria-expanded={linking} disabled={loading} aria-label={image?`Replace ${label.toLowerCase()} with a link`:`Add ${label.toLowerCase()} from a link`} onClick={()=>{onClearError?.();setLinking(v=>!v);}}><Link2 size={15}/>Link</button>}</div></div>
 {linking&&<MediaLinkForm autoFocus resolve={resolveImageLink} label={`${label} link`} placeholder="https://…/picture.jpg" initialUrl={image?.startsWith('https://')?image:''} onClearError={onClearError} onCancel={()=>setLinking(false)} onSubmit={async(url:string)=>{if(await onLink(url))setLinking(false);}}/>}
 {image&&<button type="button" className="editor-upload-remove" aria-label={`Remove ${label.toLowerCase()}`} disabled={loading} onClick={onRemove}><Trash2 size={14}/>Remove image</button>}
 <input ref={input} type="file" aria-label={`Upload ${label.toLowerCase()}`} accept={imageAccept} onChange={async e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file){setLoading(true);try{await onPick(file);}finally{setLoading(false);}}}}/>
 </div>;
}
function PreviewQuestionMedia({draft}:{draft:any}){
 const audio=draft.audio;
 return <QuestionMedia preview image={draft.type!=='image_tap'?draft.image:undefined} audio={audio} audioEdit={draft.audioEdit} displayName={audio?soundDisplayName(audio,draft.audioName):undefined} fileTitle={audio?soundFileTitle(audio,draft.audioName):undefined} video={draft.video} videoEdit={draft.videoEdit} videoClass="is-compact"/>;
}

function FlashcardEditorPreview({draft}:any){
 const [showBack,setShowBack]=useState(false);
 return <div className="editor-question-preview"><small>Flashcard · tap to flip</small><PreviewQuestionMedia draft={draft}/><button type="button" className="editor-flashcard-preview" aria-pressed={showBack} aria-label={showBack?'Show flashcard front':'Show flashcard back'} onClick={()=>setShowBack(value=>!value)}><span className={`editor-flashcard-preview-inner${showBack?' is-back':''}`}><span className="editor-flashcard-preview-face editor-flashcard-front"><small>FRONT · QUESTION</small><strong>{draft.prompt||'Your question appears here'}</strong><em>Tap to reveal the answer</em></span><span className="editor-flashcard-preview-face editor-flashcard-back"><small>BACK · ANSWER</small>{draft.answerImage&&<img className="editor-flashcard-answer-image" src={draft.answerImage} alt=""/>}{draft.answerVideo&&<VideoPlayer src={draft.answerVideo} edit={draft.answerVideoEdit} className="is-compact" label="Preview answer video"/>}{draft.answerAudio&&<SoundPlayer src={draft.answerAudio} edit={draft.answerAudioEdit} className="is-compact" label="Preview answer sound"/>}<strong>{draft.answer||'Your answer appears here'}</strong><em>Tap to see the question</em></span></span></button></div>;
}

function AnswerMediaPreview({draft}:any){
 return <QuestionMedia preview kind="answer" className="feedback-media" zoomClass="feedback-answer-zoom" imgClass="feedback-answer-media" image={draft.answerImage} audio={draft.answerAudio} audioEdit={draft.answerAudioEdit} video={draft.answerVideo} videoEdit={draft.answerVideoEdit} videoClass="is-compact"/>;
}

// The preview uses the same answer components as the quiz, so pictures, sounds, videos and blanks look exactly as learners see them.
function QuestionTypePreview({draft}:any){
 if(draft.type==='flashcard')return <FlashcardEditorPreview draft={draft}/>;
 if(extraTypes.includes(draft.type))return <ExtraPreview draft={draft}/>;
 return <StandardPreview draft={draft}/>;
}

function StandardPreview({draft}:any){
 const type=draft.type,spec:any=specFromDraft(draft),gaps=(String(draft.prompt||'').match(/_{2,}/g)||[]).length;
 const padded=(list:string[]=[])=>Array.from({length:gaps},(_,i)=>list[i]||'');
 const item:any={...spec,id:'editor-preview',image:draft.image,answer:spec.answer||'',options:type==='true_false'?['True','False']:spec.options||[],numericTolerance:Number(draft.numericTolerance||0),optionImages:spec.optionImages||{},optionMedia:spec.optionMedia||{},blanks:spec.blanks?padded(spec.blanks):undefined};
 const multi=isMultiBlank(item),arrayValue=multi||['fill_blank_options','matching','ordering','multi_select'].includes(type);
 const [round,setRound]=useState(0),[value,setValue]=useState<any>(arrayValue?[]:''),[result,setResult]=useState<boolean|null>(null);
 const reset=()=>{setValue(arrayValue?[]:'');setResult(null);setRound(r=>r+1);};
 React.useEffect(reset,[type,draft.prompt,draft.answer,draft.options,draft.structured,arrayValue]);
 const grade=(given:any=value)=>{setValue(given);try{setResult(gradeQuestion(item,given));}catch{setResult(false);}};
 const revealed=result!==null,complete=Array.isArray(value)?value.length>0:String(value).trim().length>0;
 const options=item.options||[],answerList=String(draft.answer||'').split('\n').filter(Boolean);
 const check=!revealed&&['single_choice','true_false','multi_select','numeric','short_answer'].includes(type)&&<div className="editor-preview-actions"><button type="button" className="editor-preview-check" disabled={!complete} onClick={()=>grade()}>Check answer</button></div>;
 return <div className="editor-question-preview editor-quiz-preview"><small>{typeLabel(type)}</small><PreviewQuestionMedia draft={draft}/><h3>{['fill_blank','cloze','fill_blank_options'].includes(type)?(gaps>1?'Fill in the missing words.':'Fill in the missing word.'):draft.prompt||'Your question appears here'}</h3>
 {['single_choice','true_false','multi_select'].includes(type)&&<div className="editor-preview-options">{options.map((x:string,i:number)=>{const picked=type==='multi_select'?value.includes(x):value===x,isCorrect=type==='multi_select'?answerList.includes(x):draft.answer===x;return <div className="editor-preview-option-wrap" key={i}><button type="button" className={`editor-preview-option${picked?' is-selected':''}${revealed&&isCorrect?' is-correct':''}${revealed&&picked&&!isCorrect?' is-wrong':''}`} aria-pressed={picked} onClick={()=>!revealed&&setValue((old:any)=>type==='multi_select'?(old.includes(x)?old.filter((v:string)=>v!==x):[...old,x]):x)}>{item.optionImages?.[x]&&<img src={item.optionImages[x]} alt=""/>}<span>{String.fromCharCode(65+i)}{isPictureLabel(x)&&(item.optionImages?.[x]||item.optionMedia?.[x])?'':` · ${x}`}</span></button><ItemExtras item={item} text={x}/></div>;})}{check}</div>}
 {['fill_blank','cloze'].includes(type)&&<InlineBlankAnswer key={round} item={item} value={value} onChange={setValue} disabled={revealed} onGrade={grade}/>}
 {type==='fill_blank_options'&&(item.blanks?.length?<WordBankAnswer key={round} item={item} value={value} onChange={setValue} disabled={revealed} onGrade={grade}/>:<p className="extra-note">Add ___ to the sentence to create a gap.</p>)}
 {['matching','ordering'].includes(type)&&((type==='matching'?item.pairs?.length:item.sequence?.length)>1?<StructuredAnswer key={round} item={item} value={value} onChange={setValue} disabled={revealed} onGrade={grade}/>:<p className="extra-note">Add at least two {type==='matching'?'pairs':'steps'} to try it.</p>)}
 {type==='numeric'&&<div className="editor-preview-interaction"><label className="editor-preview-answer-label">Your answer<input aria-label="Preview numeric answer" inputMode="decimal" value={value} disabled={revealed} onChange={e=>setValue(e.target.value)} placeholder="Enter a number…"/></label>{check}</div>}
 {type==='short_answer'&&<div className="editor-preview-interaction"><label className="editor-preview-answer-label">Your answer<textarea aria-label="Preview short answer" value={value} disabled={revealed} onChange={e=>setValue(e.target.value)} placeholder="Write what you remember…"/></label>{check}</div>}
 {revealed&&<div className="editor-preview-actions"><button type="button" className="editor-preview-check" disabled>{result?'Correct':'Not quite'}</button><button type="button" className="editor-preview-reset" onClick={reset}><RefreshCw size={14}/>Try again</button></div>}
 {revealed&&answerText(item)&&<small className={result?'is-correct-text':'is-wrong-text'}>Answer: {answerText(item)}</small>}
 {revealed&&<AnswerMediaPreview draft={draft}/>}
 </div>;
}

function ExtraPreview({draft}:any){
 const [round,setRound]=useState(0),[result,setResult]=useState<boolean|null>(null);
 const item={...specFromDraft(draft),id:'editor-preview',image:draft.image};
 const key=JSON.stringify([item.type,item.prompt,item.answer,item.listItems,item.listCount,item.groups,item.passage,item.spots,item.tapMode,item.sliderMin,item.sliderMax,item.sliderStep,item.numericTolerance,item.image,item.optionImages,item.optionMedia]);
 React.useEffect(()=>{setResult(null);setRound(r=>r+1);},[key]);
 const grade=(value:any)=>{try{setResult(gradeQuestion(item,value));}catch{setResult(false);}};
 return <div className="editor-question-preview editor-quiz-preview"><small>{typeLabel(item.type)}</small><PreviewQuestionMedia draft={draft}/><h3>{draft.prompt||'Your question appears here'}</h3>
  <ExtraAnswer key={round} item={item} disabled={result!==null} onGrade={grade}/>
  {result!==null&&<div className="editor-preview-actions"><button type="button" className="editor-preview-check" disabled>{result?'Correct':'Not quite'}</button><button type="button" className="editor-preview-reset" onClick={()=>{setResult(null);setRound(r=>r+1);}}><RefreshCw size={14}/>Try again</button></div>}
  {result!==null&&item.type!=='image_tap'&&answerText(item)&&<small className={result?'is-correct-text':'is-wrong-text'}>Answer: {answerText(item)}</small>}
  {result!==null&&<AnswerMediaPreview draft={draft}/>}
 </div>;
}

const textTypes=['short_answer','fill_blank','flashcard','numeric'];
function seedVariant(type:string,base:any){
 const next:any=emptyDraft(type,base.prompt||'');
 const answer=['short_answer','fill_blank','flashcard','single_choice','numeric'].includes(base.type)?String(base.answer||'').trim():'';
 if(textTypes.includes(type)&&answer&&(type!=='numeric'||/^[-+.\d]/.test(answer)))next.answer=answer;
 if(['single_choice','multi_select'].includes(type)){
  if(['single_choice','multi_select'].includes(base.type)){next.options=base.options;next.optionImages=base.optionImages||{};next.answer=type===base.type||type==='multi_select'?base.answer:String(base.answer).split('\n')[0]||'';}
  else if(answer){next.options=answer+'\n';next.answer=answer;}
 }
 if(['matching','ordering'].includes(type)&&base.type===type)next.structured=base.structured;
 return next;
}

export function QuestionEditor({draft,setDraft,onSave,onCancel,busy,status,saved,editing,prepareAudio,setPrepareAudio,onAnother}:any){
 const [mediaError,setMediaErrorRaw]=useState(''),[step,setStep]=useState(0),[zoom,setZoom]=useState<string|null>(null),[vi,setVi]=useState(0),[addingType,setAddingType]=useState(false),[mediaFor,setMediaFor]=useState<string|null>(null),[editImg,setEditImg]=useState<{src:string;key?:string;target:'image'|'answerImage';temp?:boolean}|null>(null);
 // Show every editor error as a bottom toast: buzz once, auto-dismiss after 5s, dismissable with the close button.
 const setMediaError=React.useCallback((msg:string)=>{setMediaErrorRaw(msg);if(msg){try{navigator.vibrate?.([30,20,30]);}catch{}}},[]);
 React.useEffect(()=>{if(!mediaError)return;const t=window.setTimeout(()=>setMediaErrorRaw(''),5000);return()=>window.clearTimeout(t);},[mediaError]);
 // Surface save/validation failures through the same toast.
 React.useEffect(()=>{if(busy||!status)return;if(!/^Saved successfully|Saving question|Question saved|preparing/i.test(status))setMediaError(status);},[status,busy,setMediaError]);
 const tabs=useRef<HTMLDivElement>(null);
 const tabLabels=['Question','Media','Optional','Preview'];
 const variants:any[]=draft.variants||[];
 const active=Math.min(vi,variants.length),d=active===0?draft:variants[active-1];
 const allTypes=[draft,...variants];
 const usedTypes=allTypes.map((v:any)=>v.type||'short_answer');
 const canAddType=variants.length<MAX_VARIANTS&&usedTypes.length<questionTypes.length;
 function goStep(next:number){setStep(next);tabs.current?.scrollIntoView({block:'start',behavior:'smooth'});}
 function tabKey(e:React.KeyboardEvent,index:number){let next=index;if(e.key==='ArrowRight')next=(index+1)%tabLabels.length;else if(e.key==='ArrowLeft')next=(index+tabLabels.length-1)%tabLabels.length;else if(e.key==='Home')next=0;else if(e.key==='End')next=tabLabels.length-1;else return;e.preventDefault();goStep(next);(tabs.current?.querySelectorAll('button')[next] as HTMLButtonElement)?.focus();}
 const setD=(fn:(v:any)=>any)=>setDraft((x:any)=>active===0?fn(x):{...x,variants:(x.variants||[]).map((v:any,i:number)=>i===active-1?fn(v):v)});
 const field=(key:string,value:any)=>setD((v:any)=>({...v,[key]:value}));
 const shared=(key:string,value:any)=>setDraft((x:any)=>({...x,[key]:value}));
 const lines=(key:string,min=0)=>{const rows=String(d[key]||'').split('\n');while(rows.length<min)rows.push('');return rows;};
 const update=(key:string,i:number,value:string,min=0)=>{const rows=lines(key,min);rows[i]=value;field(key,rows.join('\n'));};
 const choices=lines('options',2),steps=lines('structured',2),blankCount=(String(d.prompt||'').match(/_{2,}/g)||[]).length;
 const pairs=steps.map((line:string)=>{const [left='',...rest]=line.split('|');return [left,rest.join('|')];});
 function structuredChange(i:number,value:string){const rows=lines('structured',2),old=rows[i]||'';rows[i]=value;setD((v:any)=>{let next={...v,structured:rows.join('\n')};if(v.type==='matching'){const [ol='',...or]=old.split('|'),[nl='',...nr]=value.split('|');next=rekeyMedia(rekeyMedia(next,ol,nl),or.join('|'),nr.join('|'));}else next=rekeyMedia(next,old,value);return next;});}
 const markChoice=(choice:string,on:boolean)=>{if(d.type==='single_choice')field('answer',choice);else{const answers=lines('answer').filter(Boolean);field('answer',(on?[...new Set([...answers,choice])]:answers.filter((x:string)=>x!==choice)).join('\n'));}};
 function choiceChange(i:number,value:string){const old=choices[i],next=[...choices];next[i]=value;setD((v:any)=>({...v,options:next.join('\n'),answer:v.type==='single_choice'?(v.answer===old?value:v.answer):String(v.answer).split('\n').map((x:string)=>x===old?value:x).join('\n')}));if(old&&choices.filter((c:string)=>c===old).length===1)setD((v:any)=>rekeyMedia(v,old,value));}
 function removeChoice(i:number){const old=choices[i];setD((v:any)=>({...dropMedia(v,old.trim()),options:choices.filter((_:string,j:number)=>j!==i).join('\n'),answer:v.type==='single_choice'?(v.answer===old?'':v.answer):String(v.answer).split('\n').filter((x:string)=>x!==old).join('\n')}));}
 async function place(data:string,key?:string,target:'image'|'answerImage'='image'){const image=await storeImage(data).catch(()=>data);if(key)setD((v:any)=>({...v,optionImages:{...v.optionImages,[key]:image}}));else shared(target,image);}
 async function upload(file:File,key?:string,target:'image'|'answerImage'='image'){
  setMediaError('');
  if(!file.type.startsWith('image/')){setMediaError('Choose an image file (PNG, JPEG, WebP or GIF).');return;}
  if(file.size>25*1024*1024){setMediaError('Choose an image under 25 MB.');return;}
  setEditImg({src:URL.createObjectURL(file),key,target,temp:true});
 }
 async function link(url:string,key?:string,target:'image'|'answerImage'='image'){setMediaError('');try{const {image,linked}=await imageFromLink(url);if(linked){await place(image,key,target);}else setEditImg({src:image,key,target});return true;}catch(e:any){pushMediaLinkError(e.message||'That image link could not be added.');return false;}}
 function closeEditor(){if(editImg?.temp)URL.revokeObjectURL(editImg.src);setEditImg(null);}
 const removeChoiceImage=(choice:string)=>field('optionImages',Object.fromEntries(Object.entries(d.optionImages||{}).filter(([key])=>key!==choice)));
 const choiceImages=imageTypes.includes(d.type);
 function nameChoice(i:number,choice:string){if(choice.trim())return choice;const name=pictureLabel(i+1);choiceChange(i,name);return name;}
 // Opening the sheet on an empty row names it "Picture n", so its media has a key; the quiz then shows only the media.
 const mediaButton=(text:string,label=text,name?:()=>string,blocked=false)=>{const key=text.trim();return <ItemMediaButton label={key||label} image={key?d.optionImages?.[key]:undefined} media={key?d.optionMedia?.[key]:undefined} disabled={blocked||(!key&&!name)} onOpen={()=>setMediaFor(key||name!())}/>;};
 const setItemMedia=(key:string,patch:any)=>setD((v:any)=>({...v,optionMedia:{...(v.optionMedia||{}),[key]:{...(v.optionMedia?.[key]||{}),...patch}}}));
 const bankWords=d.type==='fill_blank_options'?[...new Set([...lines('structured'),...choices].map((x:string)=>x.trim()).filter(Boolean))]:[];
 const groupItems=d.type==='categorize'?(d.groups||[]).flatMap((g:any)=>String(g.items||'').split('\n').map((x:string)=>x.trim()).filter(Boolean)):[];
 const imageList=d.type==='matching'?{title:'Pair media',hint:'Add a picture, sound or video to either side of a pair.'}:d.type==='ordering'?{title:'Step media',hint:'Shown on each step.'}:d.type==='fill_blank_options'?{title:'Word bank media',hint:'Shown on each word in the word bank.'}:d.type==='categorize'?{title:'Item media',hint:'Shown on each item learners sort.'}:{title:'Choice media',hint:'Shown inside each answer choice.'};
 function pasteImage(e:React.ClipboardEvent){const file=[...e.clipboardData.files].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();void upload(file);}}
 function addType(type:string){if(usedTypes.includes(type)){setMediaError(`${typeLabel(type)} is already on this question. Pick a different type.`);return;}setMediaError('');setDraft((x:any)=>({...x,typeMode:x.typeMode||'random',variants:[...(x.variants||[]),seedVariant(type,active===0?x:x.variants[active-1])]}));setVi(variants.length+1);setAddingType(false);}
 function changeType(id:string){if(usedTypes.some((t,i)=>i!==active&&t===id)){setMediaError(`${typeLabel(id)} is already on this question.`);return;}setMediaError('');field('type',id);}
 function removeType(){setDraft((x:any)=>{const rest=(x.variants||[]).filter((_:any,i:number)=>i!==active-1);return {...x,variants:rest.length?rest:undefined};});setVi(Math.max(0,active-1));}
 function makeMain(){setDraft((x:any)=>{const list=[x,...(x.variants||[])],main=list[active];const old=Object.fromEntries(draftTypeFields.map(k=>[k,x[k]]));const rest=(x.variants||[]).map((v:any,i:number)=>i===active-1?old:v);return {...x,...main,variants:rest};});setVi(0);}
 const statusId='editor-status';
 if(saved)return <section className="editor-success" role="status"><span className="editor-success-icon"><Check size={30}/></span><h2>{editing?'Question updated':'Question created'}</h2><p>{status}</p><div className="editor-saved-question"><small>{[saved.type,...(saved.variants||[]).map((v:any)=>v.type)].map(typeLabel).join(' · ')}</small><strong>{saved.prompt}</strong><SpeechButton questionId={saved.id} text={saved.prompt} spokenText={saved.type==='fill_blank'?saved.prompt.replace(/_{2,}/g,'blank'):undefined} label="Play saved question audio"/></div><Button onClick={onCancel}>Back to question bank</Button><Button variant="outline" onClick={()=>{setStep(0);setVi(0);setMediaError('');onAnother();}}><Plus size={16}/>Add another question</Button></section>;
 return <div className="editor-composer" aria-busy={busy}>
 <fieldset disabled={busy} className="editor-fields">
 <div className="editor-tabs editor-numbered-steps" ref={tabs} role="tablist" aria-label="Question editor sections" style={{['--rf-count' as any]:tabLabels.length,['--rf-active' as any]:step}}>{tabLabels.map((label,i)=><button type="button" key={label} role="tab" id={`editor-tab-${i}`} aria-selected={step===i} data-done={i<step||undefined} aria-controls={`editor-panel-${i}`} tabIndex={step===i?0:-1} onClick={()=>goStep(i)} onKeyDown={e=>tabKey(e,i)}><span className="editor-step-dot">{i<step?<Check size={15}/>:i+1}</span><span className="editor-step-label">{label}</span></button>)}</div>
 <section className="editor-section editor-step-panel" role="tabpanel" id="editor-panel-0" aria-labelledby="editor-tab-0" hidden={step!==0}>
 <div className="editor-variants">
  <div className="editor-variants-head"><span><Layers size={15}/>Ways to ask this question</span>{canAddType&&<button type="button" className="editor-variant-add" aria-expanded={addingType} onClick={()=>setAddingType(v=>!v)}><Plus size={14}/>Add type</button>}</div>
  {allTypes.length>1&&<div className="editor-variant-tabs" role="tablist" aria-label="Question types">{allTypes.map((v:any,i:number)=><button type="button" role="tab" key={i} aria-selected={active===i} onClick={()=>setVi(i)}><span>{i+1}</span>{typeLabel(v.type)}</button>)}</div>}
  {addingType&&<TypeSheet title="Add another way to ask" blocked={usedTypes} onPick={addType} onClose={()=>setAddingType(false)}/>}
  {allTypes.length>1&&<div className="editor-variant-mode" role="radiogroup" aria-label="Type used in quizzes"><button type="button" role="radio" aria-checked={draft.typeMode!=='primary'} onClick={()=>shared('typeMode','random')}><Shuffle size={14}/>Random each quiz</button><button type="button" role="radio" aria-checked={draft.typeMode==='primary'} onClick={()=>shared('typeMode','primary')}><span className="editor-variant-one">1</span>Always type 1</button></div>}
 </div>
<div className="editor-type-row"><TypeField label={allTypes.length>1?`Type ${active+1}`:'Question type'} value={d.type} help={help[d.type]} blocked={usedTypes} onChange={changeType}/>{active>0&&<div className="editor-type-actions"><button type="button" onClick={makeMain}>Make type 1</button><button type="button" className="is-remove" onClick={removeType}><Trash2 size={14}/>Remove</button></div>}</div>
 <label>{d.type==='flashcard'?'Front of card':'Question prompt'}{d.image&&!['fill_blank','cloze','fill_blank_options','highlight'].includes(d.type)&&<small className="editor-optional">Optional — the picture can be the question</small>}<textarea value={d.prompt} onChange={e=>field('prompt',e.target.value)} onPaste={pasteImage} placeholder={['fill_blank','cloze','fill_blank_options'].includes(d.type)?'The capital of France is ___.':promptHints[d.type]||'What would you like to remember?'}/></label> {['fill_blank','cloze','fill_blank_options'].includes(d.type)&&<button type="button" className="editor-text-button" onClick={()=>field('prompt',String(d.prompt||'').trimEnd()+' ___')}><Plus size={14}/>Insert a blank</button>}
 {d.type==='image_tap'&&active===0&&!draft.image&&<p className="editor-inline-warn" role="status"><AlertCircle size={14} aria-hidden="true"/><span>Add the picture learners tap on in the <b>Media</b> step.</span></p>}
 <div className="editor-answer-fields">
 {d.type==='list_recall'&&<ListRecallEditor d={d} field={field}/>}
 {d.type==='categorize'&&<CategorizeEditor d={d} field={field} mediaButton={(x:string,label:string)=>mediaButton(x,label)} onRename={(a:string,b:string)=>setD((v:any)=>rekeyMedia(v,a,b))}/>}
 {d.type==='highlight'&&<HighlightEditor d={d} field={field}/>}
 {d.type==='image_tap'&&<ImageTapEditor d={d} field={field} image={draft.image}/>}
 {d.type==='slider'&&<SliderEditor d={d} field={field}/>}
 {textTypes.includes(d.type)&&!(d.type==='fill_blank'&&blankCount>1)&&<label>{d.type==='flashcard'?'Back of card':'Correct answer'}{d.type==='flashcard'&&d.answerImage&&<small className="editor-optional">Optional — the answer picture is enough</small>}<textarea value={d.answer} onChange={e=>field('answer',e.target.value)} placeholder={d.type==='numeric'?'e.g. 3.14':'Enter the correct answer'}/></label>}
 {d.type==='numeric'&&<label>Accepted tolerance (±)<input inputMode="decimal" value={d.numericTolerance} onChange={e=>field('numericTolerance',e.target.value)}/><small>0 means exact. For example, 3.14 ± 0.01.</small></label>}
 {d.type==='true_false'&&<div className="editor-boolean" role="group" aria-label="Correct answer">{['True','False'].map(x=><button type="button" key={x} aria-pressed={d.answer===x} onClick={()=>field('answer',x)}>{d.answer===x&&<Check size={17}/>} {x}</button>)}</div>}
 {['single_choice','multi_select'].includes(d.type)&&<div className="editor-choice-list"><p className="editor-list-label">Answer choices<small>{d.type==='multi_select'?'Mark every correct choice':'Mark the correct choice'} · <ImagePlus size={12} aria-hidden="true"/> adds a picture, sound or video</small></p>{choices.map((choice:string,i:number)=><div className="editor-choice-row" key={i}><input type={d.type==='single_choice'?'radio':'checkbox'} name={`editor-correct-choice-${active}`} aria-label={`Choice ${i+1} is correct`} checked={!!choice&&(d.type==='single_choice'?d.answer===choice:lines('answer').includes(choice))} onChange={e=>markChoice(choice,e.target.checked)} disabled={!choice||busy}/><input aria-label={`Choice ${i+1}`} value={choice} placeholder={`Choice ${i+1}`} onChange={e=>choiceChange(i,e.target.value)}/>{mediaButton(choice,`choice ${i+1}`,()=>nameChoice(i,choice),!!choice.trim()&&choices.filter((c:string)=>c===choice).length>1)}<button type="button" aria-label={`Remove choice ${i+1}`} disabled={choices.length<=2} onClick={()=>removeChoice(i)}><Trash2 size={16}/></button></div>)}<button type="button" className="editor-text-button" onClick={()=>field('options',choices.concat('').join('\n'))}><Plus size={15}/>Add choice</button></div>}
 {d.type==='matching'&&<div className="editor-pairs"><div className="editor-pair-labels"><span>Left side</span><span>Matching answer</span></div>{pairs.map((pair:string[],i:number)=><div className="editor-pair-row" key={i}><input aria-label={`Pair ${i+1} left`} value={pair[0]} placeholder="e.g. Japan" onChange={e=>structuredChange(i,e.target.value+'|'+pair[1])}/><span>↔</span><input aria-label={`Pair ${i+1} right`} value={pair[1]} placeholder="e.g. Tokyo" onChange={e=>structuredChange(i,pair[0]+'|'+e.target.value)}/><button type="button" aria-label={`Remove pair ${i+1}`} disabled={pairs.length<=2} onClick={()=>field('structured',steps.filter((_:string,j:number)=>i!==j).join('\n'))}><Trash2 size={15}/></button></div>)}<div className="editor-pair-footer"><button type="button" className="editor-text-button" onClick={()=>field('structured',steps.concat('').join('\n'))}><Plus size={15}/>Add pair</button><button type="button" className="editor-text-button" onClick={()=>goStep(1)}><ImagePlus size={15}/>{Object.values(d.optionImages||{}).some(Boolean)||Object.keys(d.optionMedia||{}).length?'Edit pair media':'Add pictures or sound'}</button></div></div>}
 {d.type==='ordering'&&<div className="editor-sequence">{steps.map((s:string,i:number)=><div className="editor-step-row" key={i}><span className="editor-row-number">{i+1}</span><input aria-label={`Step ${i+1}`} value={s} placeholder={`Step ${i+1}`} onChange={e=>structuredChange(i,e.target.value)}/><div>{mediaButton(s,s||`step ${i+1}`,()=>{const n=pictureLabel(i+1);structuredChange(i,n);return n;})}<button type="button" aria-label={`Move step ${i+1} up`} disabled={i===0} onClick={()=>{const next=[...steps];[next[i-1],next[i]]=[next[i],next[i-1]];field('structured',next.join('\n'));}}><ArrowUp size={14}/></button><button type="button" aria-label={`Move step ${i+1} down`} disabled={i===steps.length-1} onClick={()=>{const next=[...steps];[next[i+1],next[i]]=[next[i],next[i+1]];field('structured',next.join('\n'));}}><ArrowDown size={14}/></button><button type="button" aria-label={`Remove step ${i+1}`} disabled={steps.length<=2} onClick={()=>field('structured',steps.filter((_:string,j:number)=>i!==j).join('\n'))}><Trash2 size={14}/></button></div></div>)}<button type="button" className="editor-text-button" onClick={()=>field('structured',steps.concat('').join('\n'))}><Plus size={15}/>Add step</button></div>}
 {(['cloze','fill_blank_options'].includes(d.type)||(d.type==='fill_blank'&&blankCount>1))&&<div className="editor-blanks"><p className="editor-list-label">{d.type==='fill_blank_options'?'Blank answers':'Answer for each blank'}<small>{!blankCount?'Add ___ to your question to create a gap':d.type==='fill_blank_options'?`${blankCount} ${blankCount===1?'gap':'gaps'} · these words go in the word bank`:`${blankCount} gaps · learners type each one. Add other accepted answers after a |, like colour|color`}</small></p>{Array.from({length:blankCount},(_,i)=><label key={i}>Blank {i+1}<input value={lines('structured')[i]||''} onChange={e=>update('structured',i,e.target.value,blankCount)} placeholder={d.type==='fill_blank_options'?'Correct word':'Correct word or phrase'}/></label>)}</div>}
 {d.type==='fill_blank_options'&&<div className="editor-choice-list"><p className="editor-list-label">Extra words<small>Wrong words mixed into the bank. Blank answers are added for you.</small></p>{choices.map((choice:string,i:number)=><div className="editor-choice-row" key={i}><span className="editor-row-number">{i+1}</span><input aria-label={`Extra word ${i+1}`} value={choice} placeholder={['e.g. dog','e.g. hat'][i]||`Word ${i+1}`} onChange={e=>choiceChange(i,e.target.value)}/>{mediaButton(choice,`word ${i+1}`,undefined,!!choice.trim()&&choices.filter((c:string)=>c===choice).length>1)}<button type="button" aria-label={`Remove word ${i+1}`} disabled={choices.length<=1} onClick={()=>removeChoice(i)}><Trash2 size={16}/></button></div>)}<button type="button" className="editor-text-button" onClick={()=>field('options',choices.concat('').join('\n'))}><Plus size={15}/>Add word</button></div>}
 {['short_answer','fill_blank','cloze','list_recall'].includes(d.type)&&<details className="editor-details"><summary>Grading options</summary>{!['cloze','list_recall'].includes(d.type)&&!(d.type==='fill_blank'&&blankCount>1)&&<label>Accepted alternative answers<textarea value={d.accepted||''} onChange={e=>field('accepted',e.target.value)} placeholder="One accepted answer per line"/></label>}<label className="editor-toggle"><input type="checkbox" checked={d.fuzzy!==false} onChange={e=>field('fuzzy',e.target.checked)}/><span>Accept minor typos<small>One-character typos in words of 5+ letters.</small></span></label></details>}
 </div></section>
 <section className="editor-section editor-step-panel editor-media-step" role="tabpanel" id="editor-panel-1" aria-labelledby="editor-tab-1" hidden={step!==1}>
  <div className="editor-media-intro"><div><p className="editor-media-eyebrow">Question setup <span className="editor-media-eyebrow-pill">Optional step</span></p><h2>Add media</h2><p>Give your question and answer more context with an image, sound, or video. Upload a file or add a direct link.</p></div><aside className="editor-media-tip"><Info size={16} aria-hidden="true"/><span>Large files are resized automatically. For audio and video links, use a direct file URL.</span></aside></div>
  <div className="editor-media-layout">
   <section className="media-panel question-panel" aria-labelledby="editor-question-media-title"><header className="media-panel-heading"><span className="media-panel-icon" aria-hidden="true"><ScanEye size={20}/></span><div><h3 className="media-panel-title" id="editor-question-media-title">{draft.type==='flashcard'?'Front of card':'Question media'}</h3><p className="media-panel-help">Shown while the question is on screen.</p></div><span className={`media-count${mediaSlotCount(draft.image,draft.audio,draft.video)?' has-added':''}`}>{mediaSlotCount(draft.image,draft.audio,draft.video)} added</span></header>
    <div className="asset-list">
     <InlineImage assetLayout required={draft.type==='image_tap'} label={draft.type==='flashcard'?'Front image':'Question image'} hint={draft.type==='image_tap'?'Needed · learners tap on this picture':'Optional · you can also paste an image'} image={draft.image} onPick={(file:File)=>upload(file)} onLink={(url:string)=>link(url)} onRemove={()=>shared('image',undefined)} onView={setZoom} onEdit={()=>setEditImg({src:draft.image,target:'image'})} onClearError={()=>setMediaError('')}/>
     <SoundField assetLayout audio={draft.audio} audioName={draft.audioName} onAudioNameChange={value=>shared('audioName',value)} edit={draft.audioEdit} onEditChange={value=>shared('audioEdit',value)} onChange={value=>shared('audio',value)} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
     <VideoField assetLayout video={draft.video} edit={draft.videoEdit} onEditChange={value=>shared('videoEdit',value)} onChange={value=>shared('video',value)} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
    </div></section>
   <section className="media-panel answer-panel" aria-labelledby="editor-answer-media-title"><header className="media-panel-heading"><span className="media-panel-icon" aria-hidden="true"><Lightbulb size={20}/></span><div><h3 className="media-panel-title" id="editor-answer-media-title">{draft.type==='flashcard'?'Back of card':'Answer media'}</h3><p className="media-panel-help">{draft.type==='flashcard'?'Shown on the back of the card.':'Shown after the answer is checked.'}</p></div><span className={`media-count${mediaSlotCount(draft.answerImage,draft.answerAudio,draft.answerVideo)?' has-added':''}`}>{mediaSlotCount(draft.answerImage,draft.answerAudio,draft.answerVideo)} added</span></header>
    <div className="asset-list">
     <InlineImage assetLayout linkLabel="Add link" uploadEmptyLabel="Upload image" label={draft.type==='flashcard'?'Back image':'Answer image'} hint={draft.type==='flashcard'?'Optional · shown on the back of the card':'Add a visual explanation for learners.'} image={draft.answerImage} onPick={(file:File)=>upload(file,undefined,'answerImage')} onLink={(url:string)=>link(url,undefined,'answerImage')} onRemove={()=>shared('answerImage',undefined)} onView={setZoom} onEdit={()=>setEditImg({src:draft.answerImage,target:'answerImage'})} onClearError={()=>setMediaError('')}/>
     <SoundField assetLayout title={draft.type==='flashcard'?'Back sound':'Answer sound'} hint={draft.type==='flashcard'?'Optional · plays on the back of the card':'Optional · e.g. the pronunciation, played after checking'} audio={draft.answerAudio} audioName={draft.answerAudioName} onAudioNameChange={value=>shared('answerAudioName',value)} edit={draft.answerAudioEdit} onEditChange={value=>shared('answerAudioEdit',value)} onChange={value=>shared('answerAudio',value)} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
     <VideoField assetLayout linkLabel="Add link" uploadEmptyLabel="Upload video" title="Answer video" hint="Optional · shown after checking" emptyHint="Add a short clip for learners." video={draft.answerVideo} edit={draft.answerVideoEdit} onEditChange={value=>shared('answerVideoEdit',value)} onChange={value=>shared('answerVideo',value)} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
    </div>
    <p className="media-answer-foot"><CircleCheck size={15} aria-hidden="true"/><span>Everything here is optional. Your answer stays clear without media.</span></p></section>
  </div>
  {choiceImages&&(()=>{const rows=(d.type==='ordering'?steps:d.type==='fill_blank_options'?bankWords:d.type==='categorize'?groupItems:choices).filter((x:string)=>x.trim());const has=d.type==='matching'?pairs.some((p:string[])=>p[0].trim()||p[1].trim()):rows.length>0;const summary=(x:string)=>{const k=x.trim(),m=d.optionMedia?.[k]||{};return [d.optionImages?.[k]&&'Picture',m.audio&&'Sound',m.video&&'Video'].filter(Boolean).join(' · ')||'Nothing added';};
   return <div className="editor-choice-image-list"><p className="editor-list-label">{imageList.title}{allTypes.length>1?` · type ${active+1}`:''}<small>{has?imageList.hint:`Add ${d.type==='matching'?'pairs':d.type==='ordering'?'steps':d.type==='fill_blank_options'?'words':d.type==='categorize'?'group items':'choices'} in the Question step first.`}</small></p>{d.type==='matching'?pairs.map((p:string[],i:number)=><div className="editor-choice-image-row is-pair" key={`${i}-${p[0]}`}>{mediaButton(p[0],p[0]||`pair ${i+1} left`,()=>{const n=pictureLabel(i+1);structuredChange(i,n+'|'+p[1]);return n;})}<span>{p[0]||'Left side'} <i>↔</i> {p[1]||'Matching answer'}</span>{mediaButton(p[1],p[1]||`pair ${i+1} right`,()=>{const n=pictureLabel(String.fromCharCode(65+i));structuredChange(i,p[0]+'|'+n);return n;})}</div>):rows.map((x:string,i:number)=><div className="editor-choice-image-row" key={`${i}-${x}`}>{mediaButton(x)}<span><b>{d.type==='single_choice'||d.type==='multi_select'?String.fromCharCode(65+i):i+1}</b> {x}</span><small>{summary(x)}</small></div>)}</div>;})()}</section>
 <section className="editor-section editor-ready editor-step-panel" role="tabpanel" id="editor-panel-2" aria-labelledby="editor-tab-2" hidden={step!==2}><div className="editor-section-heading"><span>03</span><div><h2>Optional settings</h2><p>You can save without adding anything here.</p></div></div><details className="editor-details editor-organization" open={!!(draft.subject||draft.topic||draft.tags)}><summary>Organize question <small>Subject, topic & tags</small></summary><div className="editor-meta-grid"><label>Subject<input value={draft.subject} onChange={e=>shared('subject',e.target.value)} placeholder="e.g. Geography"/></label><label>Topic<input value={draft.topic} onChange={e=>shared('topic',e.target.value)} placeholder="e.g. Capitals"/></label></div><label>Tags<input value={draft.tags||''} onChange={e=>shared('tags',e.target.value)} placeholder="e.g. revision, chapter 1"/><small>Separate tags with commas.</small></label></details><label className="editor-toggle"><input type="checkbox" checked={prepareAudio} onChange={e=>setPrepareAudio(e.target.checked)}/><span><Volume2 size={16}/>Prepare voice when saving<small>Makes the first playback instant.</small></span></label></section>
 <section className="editor-section editor-step-panel editor-preview-panel" role="tabpanel" id="editor-panel-3" aria-labelledby="editor-tab-3" hidden={step!==3}><div className="editor-section-heading"><span><Eye size={18}/></span><div><h2>Preview</h2><p>This is how the question looks in a quiz. Try answering it.</p></div></div>{allTypes.length>1&&<div className="editor-variant-tabs" role="tablist" aria-label="Preview type">{allTypes.map((v:any,i:number)=><button type="button" role="tab" key={i} aria-selected={active===i} onClick={()=>setVi(i)}><span>{i+1}</span>{typeLabel(v.type)}</button>)}</div>}<QuestionTypePreview key={active} draft={{...draft,...d,image:draft.image,answerImage:draft.answerImage,audio:draft.audio,audioEdit:draft.audioEdit,audioName:draft.audioName,video:draft.video,videoEdit:draft.videoEdit,answerAudio:draft.answerAudio,answerAudioEdit:draft.answerAudioEdit,answerVideo:draft.answerVideo,answerVideoEdit:draft.answerVideoEdit}} choices={choices} pairs={pairs} steps={steps}/></section>
 </fieldset>
 {mediaFor&&(()=>{const key=mediaFor,m=d.optionMedia?.[key]||{},img=d.optionImages?.[key];return <ItemMediaSheet title={isPictureLabel(key)?`Media for ${key.toLowerCase()}`:`Media for “${key}”`} hint="Shown on this answer in the quiz. Everything is optional." onClose={()=>setMediaFor(null)}>
  <InlineImage assetLayout label="Picture" uploadEmptyLabel="Upload" linkLabel="Link" hint="Shown on the answer" image={img} onPick={(file:File)=>upload(file,key)} onLink={(url:string)=>link(url,key)} onRemove={()=>removeChoiceImage(key)} onView={setZoom} onEdit={()=>setEditImg({src:img,key,target:'image'})} onClearError={()=>setMediaError('')}/>
  <SoundField assetLayout title="Sound" hint="A speaker button appears on the answer" audio={m.audio} edit={m.audioEdit} onEditChange={value=>setItemMedia(key,{audioEdit:value})} onChange={value=>setItemMedia(key,value?{audio:value}:{audio:undefined,audioEdit:undefined})} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
  <VideoField assetLayout title="Video" hint="Opens full screen from the answer" emptyHint="Keep it short, or add a link." video={m.video} edit={m.videoEdit} onEditChange={value=>setItemMedia(key,{videoEdit:value})} onChange={value=>setItemMedia(key,value?{video:value}:{video:undefined,videoEdit:undefined})} onError={msg=>setMediaError(msg)} onClearError={()=>setMediaError('')}/>
 </ItemMediaSheet>;})()}
 <ImageLightbox src={zoom} onClose={()=>setZoom(null)}/>
 {editImg&&<ImageEditor src={editImg.src} onCancel={closeEditor} onSave={(image:string)=>{place(image,editImg.key,editImg.target);closeEditor();}}/>}
 {status&&!busy&&/^Saved successfully|Question saved|preparing/i.test(status)&&<p className="editor-save-message" id={statusId} role="status" aria-live="polite"><Info size={15}/>{status}</p>}
 {busy&&<p className="editor-save-message" id={statusId} role="status" aria-live="polite"><LoaderCircle size={17} className="speech-spinner"/>{status||'Saving…'}</p>}
 {mediaError&&<div className="editor-toast" role="alert"><AlertCircle size={16} aria-hidden="true"/><span>{mediaError}</span><button type="button" aria-label="Dismiss" onClick={()=>setMediaErrorRaw('')}><X size={15}/></button></div>}
 <footer className="question-editor-actions editor-tab-actions"><div className="editor-step-controls"><Button variant="outline" onClick={()=>step===0?onCancel():goStep(step-1)} disabled={busy}>{step===0?'Cancel':'Back'}</Button><Button variant="ghost" className="editor-preview-toggle" aria-pressed={step===3} onClick={()=>goStep(3)}><Eye size={16}/>Preview</Button><Button variant="outline" onClick={()=>goStep(step+1)} disabled={busy||step===tabLabels.length-1}>Next</Button></div><Button onClick={onSave} disabled={busy}>{busy?<LoaderCircle size={16} className="speech-spinner"/>:<Save size={16}/>} {busy?'Saving…':editing?'Save changes':'Create question'}</Button></footer>
 </div>;
}
