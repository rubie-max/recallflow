import {textGrade,normalize} from './learning-core.js';
import {MAX_VARIANTS,itemTypes,pickVariant} from './question-variants.js';

export function driveFileId(url){const s=String(url||'');const m=s.match(/\/file\/d\/([\w-]{20,})/)||s.match(/[?&]id=([\w-]{20,})/)||s.match(/\/d\/([\w-]{20,})/);return m?m[1]:'';}
export function isDriveLink(url){return /^https:\/\/(drive|docs)\.google\.com\//i.test(String(url||''))&&!!driveFileId(url);}
// Shown when someone pastes a Drive share URL. Those links cannot play in our player; pick the file instead.
export const DRIVE_SHARE_REJECT='Google Drive share links do not play here. Upload the file instead.';
export const DRIVE_SHARE_LEGACY_HINT='This was saved as a Google Drive link. Edit the question, remove it, then upload the file so it plays in RecallFlow.';
const IMAGE_EXT={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',bmp:'image/bmp'};
const AUDIO_EXT={mp3:'audio/mpeg',m4a:'audio/mp4',aac:'audio/aac',wav:'audio/wav',ogg:'audio/ogg',oga:'audio/ogg',opus:'audio/ogg',webm:'audio/webm'};
const VIDEO_EXT={mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',m4v:'video/mp4',ogv:'video/ogg'};
// Drive's file picker often sends files with an empty type; fill it in from the filename so Upload still works.
export function typedMediaFile(file,kind){
 if(!file)return null;
 const name=String(file.name||'');
 const ext=name.split('.').pop()?.toLowerCase()||'';
 const declared=String(file.type||'');
 const map=kind==='image'?IMAGE_EXT:kind==='audio'?AUDIO_EXT:VIDEO_EXT;
 const prefix=kind==='image'?'image/':kind==='audio'?'audio/':'video/';
 const type=declared.startsWith(prefix)?declared:(map[ext]||'');
 if(!type)return null;
 if(declared===type)return file;
 try{return new File([file],name||`drive.${ext||kind}`,{type,lastModified:file.lastModified});}catch{return new Blob([file],{type});}
}
export function driveDirectUrl(url){const id=driveFileId(url);return id?`https://drive.google.com/uc?export=view&id=${id}`:String(url||'');}
export function drivePreviewUrl(url){const id=driveFileId(url);return id?`https://drive.google.com/file/d/${id}/preview`:String(url||'');}
// Direct Drive download stream. Google refuses cross-origin <audio>/<video> requests to this URL
// (cookie-based confirm pages + no CORS), so it is only used server-side (dev server / service worker).
export function driveDownloadUrl(url){const id=driveFileId(url);return id?`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`:String(url||'');}
// Same-origin proxy path streamed by the service worker (production) or dev server (local). The browser
// will only play/seek Drive audio & video through a same-origin URL, not Google's download endpoint.
export function driveMediaProxyUrl(url){
 const id=driveFileId(url);
 if(!id)return String(url||'');
 const path=`rf-drive-media/${encodeURIComponent(id)}`;
 if(typeof location==='undefined')return `/${path}`;
 return new URL(path,new URL('./',location.href)).href;
}
export function resolveMediaPlaybackSrc(url){const s=String(url||'');return driveFileId(s)?driveMediaProxyUrl(s):resolveMediaLink(s);}
// Thumbnail endpoint loads in <img> tags; uc?export=view often returns HTML and fails the link check.
export function driveImageUrl(url){const id=driveFileId(url);return id?`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`:String(url||'');}
export function resolveMediaLink(url){return isDriveLink(url)?driveDirectUrl(url):String(url||'').trim();}
export function resolveImageLink(url){const s=String(url||'').trim();return driveFileId(s)?driveImageUrl(s):resolveMediaLink(s);}
// CORS-enabling image proxy so a Google Drive picture can be drawn on a canvas without tainting it.
// Google serves Drive images with no CORS headers, so a direct crossOrigin load (and any same-origin
// service-worker proxy that must read the bytes) fails; images.weserv.nl refetches the thumbnail
// server-side and re-serves it with "Access-Control-Allow-Origin", letting us crop/rotate/export.
export function driveImageEditUrl(url){
 const id=driveFileId(url);
 if(!id)return String(url||'');
 const inner=`drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`;
 return `https://images.weserv.nl/?url=${encodeURIComponent(inner)}&output=jpg`;
}
export const questionTypes=[['short_answer','Type answer'],['fill_blank','Fill in the blank'],['single_choice','Multiple choice'],['flashcard','Flashcard'],['true_false','True / False'],['multi_select','Multi-select'],['numeric','Numeric answer'],['matching','Matching'],['ordering','Ordering / sequence'],['cloze','Multi-blank / cloze'],['fill_blank_options','Fill blanks with options'],['list_recall','List recall'],['categorize','Sort into groups'],['highlight','Highlight words'],['image_tap','Tap the picture'],['slider','Slider / estimate']];
export const extraTypes=['list_recall','categorize','highlight','image_tap','slider'];

// List recall: each entry may list other accepted spellings after a |, e.g. "USA|United States".
export const listAlternatives=entry=>String(entry||'').split('|').map(x=>x.trim()).filter(Boolean);
export const listNeed=item=>{const total=item.listItems?.length||0,count=Number(item.listCount);return Number.isInteger(count)&&count>0?Math.min(count,total):total;};
// For each typed answer, the index of the list entry it names (each entry counts once), or -1.
export function listMatches(item,given){
  const used=new Set();
  return (Array.isArray(given)?given:[]).map(text=>{
    if(!String(text??'').trim())return -1;
    const i=(item.listItems||[]).findIndex((entry,j)=>!used.has(j)&&listAlternatives(entry).some(answer=>textGrade({answer,fuzzy:item.fuzzy},text)!=='wrong'));
    if(i>=0)used.add(i);
    return i;
  });
}

// Highlight words: the passage marks correct words with *asterisks*; words are numbered in reading order.
export function passageTokens(passage){
  let n=0;
  return String(passage||'').split(/(\s+)/).filter(Boolean).map(text=>{
    if(/^\s+$/.test(text))return {text,space:true};
    const plain=text.replace(/\*/g,''),m=plain.match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u),word=m?.[2]||'';
    return word?{text,plain,pre:m[1],word,post:m[3],marked:text.includes('*'),index:n++}:{text,plain};
  });
}
export const passageWords=passage=>passageTokens(passage).filter(t=>t.word);
export function toggleMark(passage,index){return passageTokens(passage).map(t=>t.word&&t.index===index?(t.marked?t.plain:`${t.pre}*${t.word}*${t.post}`):t.text).join('');}

// Tap the picture: x and y are fractions of the picture, r is a fraction of its width, aspect is height / width.
export function hotspotHit(spot,given){return !!spot&&!!given&&Number.isFinite(given.x)&&Number.isFinite(given.y)&&Math.hypot(given.x-spot.x,(given.y-spot.y)*spot.aspect)<=spot.r;}

// Sounds are stored inside the question, so they sync and back up with it; keep each clip small.
export const MAX_AUDIO_CHARS=700000;
export const MAX_VIDEO_CHARS=3500000;
export const MAX_AUDIO_SECONDS=60;
export function dataUrlLength(bytes,mime='audio/webm'){return Math.ceil(bytes/3)*4+String(mime).length+13;}
export function maxBytesForChars(chars){return Math.floor((chars-64)/4)*3;}
export function formatBytes(n){if(!Number.isFinite(n)||n<0)return '';if(n<1024)return `${n} B`;if(n<1048576)return `${(n/1024).toFixed(n<10240?1:0)} KB`;return `${(n/1048576).toFixed(1)} MB`;}
export function saneDuration(d){return Number.isFinite(d)&&d>0&&d<86400?d:0;}
export function blobToDataUrl(blob,onProgress){
 return new Promise((resolve,reject)=>{
  const r=new FileReader();
  r.onprogress=e=>{if(onProgress&&e.lengthComputable)onProgress(e.loaded/e.total);};
  r.onload=()=>resolve(String(r.result).replace(/^data:([^,]*),/,(_,head)=>`data:${head.replace(/\s+/g,'')},`));
  r.onerror=()=>reject(new Error('Could not read this file.'));
  r.readAsDataURL(blob);
 });
}
export function audioSafe(x){return typeof x==='string'&&((/^data:audio\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,"=-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(x)&&x.length<=MAX_AUDIO_CHARS)||(/^https:\/\/[^\s"'<>]+$/i.test(x)&&x.length<=2048));}
export function videoSafe(x){return typeof x==='string'&&((/^data:video\/[a-z0-9.+-]+(?:;codecs=[a-z0-9.,"=-]+)?;base64,[A-Za-z0-9+/=]+$/i.test(x)&&x.length<=MAX_VIDEO_CHARS)||(/^https:\/\/[^\s"'<>]+$/i.test(x)&&x.length<=2048));}
export function mediaEditSafe(x){
 if(x===undefined||x===null)return true;
 if(typeof x!=='object')return false;
 const {trimStart,trimEnd,muted,volume,fadeIn,fadeOut,gain,frame}=x;
 const opt=(v,min,max)=>v===undefined||(typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max);
 const frameOk=frame===undefined||(frame&&typeof frame==='object'&&typeof frame.k==='number'&&Number.isFinite(frame.k)&&frame.k>0&&frame.k<100&&typeof frame.x==='number'&&Number.isFinite(frame.x)&&typeof frame.y==='number'&&Number.isFinite(frame.y)&&(frame.fx===undefined||typeof frame.fx==='boolean')&&(frame.fy===undefined||typeof frame.fy==='boolean'));
 return typeof trimStart==='number'&&typeof trimEnd==='number'&&typeof muted==='boolean'&&Number.isFinite(trimStart)&&Number.isFinite(trimEnd)&&trimStart>=0&&trimEnd>trimStart&&opt(volume,0,1)&&opt(fadeIn,0,600)&&opt(fadeOut,0,600)&&opt(gain,0.1,8)&&frameOk;
}

const trimmed=x=>typeof x==='string'?x.trim():'';
function validateExtra(type,input,prompt,answer){
  if(type==='list_recall'){
    const items=Array.isArray(input.listItems)?input.listItems.map(trimmed).filter(Boolean):[];
    if(items.length<2)throw new Error('Add at least two items to the list.');
    const keys=items.map(x=>normalize(listAlternatives(x)[0]||''));
    if(keys.some(k=>!k)||new Set(keys).size!==keys.length)throw new Error('Each list item must be different.');
    let count=input.listCount===undefined||input.listCount===null||input.listCount===''?undefined:Number(input.listCount);
    if(count!==undefined&&(!Number.isInteger(count)||count<1||count>items.length))throw new Error(`Choose how many to name, from 1 to ${items.length}.`);
    if(count===items.length)count=undefined;
    return {fields:{listItems:items,listCount:count},answer:items.map(x=>listAlternatives(x)[0]).join('; ')};
  }
  if(type==='categorize'){
    const groups=Array.isArray(input.groups)?input.groups.map(g=>({name:trimmed(g?.name),items:Array.isArray(g?.items)?g.items.map(trimmed).filter(Boolean):[]})):[];
    if(groups.length<2||groups.length>4)throw new Error('Use two to four groups.');
    if(groups.some(g=>!g.name))throw new Error('Give every group a name.');
    if(new Set(groups.map(g=>normalize(g.name))).size!==groups.length)throw new Error('Each group needs a different name.');
    if(groups.some(g=>!g.items.length))throw new Error('Add at least one item to every group.');
    const all=groups.flatMap(g=>g.items);
    if(new Set(all).size!==all.length)throw new Error('Each item can only be in one group.');
    if(all.length>24)throw new Error('Use up to 24 items in total.');
    return {fields:{groups},answer:groups.map(g=>`${g.name}: ${g.items.join(', ')}`).join('; ')};
  }
  if(type==='highlight'){
    if(!prompt)throw new Error('Write an instruction, like “Tap every verb.”');
    const passage=trimmed(input.passage),words=passageWords(passage),marked=words.filter(w=>w.marked);
    if(words.length<2)throw new Error('Write a sentence or passage with at least two words.');
    if(!marked.length)throw new Error('Tap at least one word to mark it as correct.');
    if(marked.length===words.length)throw new Error('Leave at least one word unmarked.');
    return {fields:{passage},answer:marked.map(w=>w.word).join(', ')};
  }
  if(type==='image_tap'){
    if(!input.image)throw new Error('Add a question picture, then tap it to mark the right spot.');
    const h=input.hotspot,n=['x','y','r','aspect'].map(k=>Number(h?.[k]));
    if(!n.every(Number.isFinite)||n[0]<0||n[0]>1||n[1]<0||n[1]>1||n[2]<=0||n[2]>.5||n[3]<=0)throw new Error('Tap the picture to mark the right spot.');
    const round=v=>Math.round(v*10000)/10000;
    return {fields:{hotspot:{x:round(n[0]),y:round(n[1]),r:round(n[2]),aspect:round(n[3])}},answer:answer||'The marked spot'};
  }
  if(type==='slider'){
    const min=numericValue(input.sliderMin??''),max=numericValue(input.sliderMax??''),step=numericValue(input.sliderStep??1),value=numericValue(answer),tolerance=numericValue(input.numericTolerance??0);
    if(min===null||max===null||min>=max)throw new Error('Set the lowest and highest values, with the highest above the lowest.');
    if(step===null||step<=0||step>max-min)throw new Error('Set a step above 0 and smaller than the range.');
    if((max-min)/step>100000)throw new Error('Use a bigger step; the slider would have too many positions.');
    if(value===null||value<min||value>max)throw new Error(`Set a correct answer between ${min} and ${max}.`);
    if(tolerance===null||tolerance<0)throw new Error('Allowed difference must be zero or more.');
    return {fields:{sliderMin:min,sliderMax:max,sliderStep:step,numericTolerance:tolerance,unit:trimmed(input.unit).slice(0,16)||undefined},answer:String(value)};
  }
}
export function typeLabel(type){return questionTypes.find(([id])=>id===type)?.[1]||'Type answer';}
export function numericValue(text){const value=String(text).trim();if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value))return null;const number=Number(value);return Number.isFinite(number)?number:null;}
export function validateQuestion(input){const type=input.type||'short_answer';if(!questionTypes.some(([id])=>id===type))throw new Error('Choose a supported question type.');const prompt=typeof input.prompt==='string'?input.prompt.trim():'';if(!prompt&&(!input.image||['fill_blank','cloze','fill_blank_options'].includes(type)))throw new Error(input.image?'Write the sentence with ___ for each blank.':'Add a question or a question image first.');let answer=String(input.answer??'').trim(),options,correctAnswers,numericTolerance;
if(['single_choice','multi_select'].includes(type)){if(!Array.isArray(input.options)||input.options.length<2||input.options.some(o=>typeof o!=='string'||!o.trim()))throw new Error('Add at least two non-empty choices.');options=input.options.map(o=>o.trim());if(new Set(options).size!==options.length)throw new Error('Each choice must be different.');if(type==='multi_select'){if(!Array.isArray(input.correctAnswers)||!input.correctAnswers.length||input.correctAnswers.some(a=>typeof a!=='string'||!a.trim()))throw new Error('Add the correct choices, one per line.');correctAnswers=input.correctAnswers.map(a=>a.trim());if(new Set(correctAnswers).size!==correctAnswers.length||correctAnswers.some(a=>!options.includes(a)))throw new Error('Every correct answer must match a different choice.');answer=correctAnswers.join('; ');}else if(!options.includes(answer))throw new Error('The correct answer must match one of the choices.');}
if(type==='true_false'){if(!/^(true|false)$/i.test(answer))throw new Error('Choose True or False as the answer.');answer=answer.toLowerCase()==='true'?'True':'False';}
if(type==='numeric'){if(numericValue(answer)===null)throw new Error('Use a finite number for the correct answer.');numericTolerance=numericValue(input.numericTolerance??0);if(numericTolerance===null||numericTolerance<0)throw new Error('Numeric tolerance must be zero or a positive number.');}
if(type==='matching'){if(!Array.isArray(input.pairs)||input.pairs.length<2||input.pairs.some(p=>typeof p.left!=='string'||typeof p.right!=='string'||!p.left.trim()||!p.right.trim())||new Set(input.pairs.map(p=>p.left)).size!==input.pairs.length||new Set(input.pairs.map(p=>p.right)).size!==input.pairs.length)throw new Error('Add at least two unique matching pairs.');answer=input.pairs.map(p=>p.left+' → '+p.right).join('; ');}
if(type==='ordering'){if(!Array.isArray(input.sequence)||input.sequence.length<2||input.sequence.some(x=>typeof x!=='string'||!x.trim())||new Set(input.sequence).size!==input.sequence.length)throw new Error('Add at least two different sequence steps.');answer=input.sequence.join(' → ');}
if(['cloze','fill_blank_options'].includes(type)){if(!Array.isArray(input.blanks)||!input.blanks.length||input.blanks.some(x=>typeof x!=='string'||!x.trim())||(input.prompt.match(/_{2,}/g)||[]).length!==input.blanks.length)throw new Error('Use one ___ marker for each blank answer.');answer=input.blanks.join('; ');}
if(type==='fill_blank_options'){if(!Array.isArray(input.options)||input.options.length<2||input.options.some(x=>typeof x!=='string'||!x.trim()))throw new Error('Add at least two word-bank options.');options=input.options.map(x=>x.trim());if(new Set(options).size!==options.length||input.blanks.some(x=>!options.includes(x)))throw new Error('Use unique options and include every blank answer in the word bank.');}
const extra=extraTypes.includes(type)?validateExtra(type,input,prompt,answer):null;if(extra)answer=extra.answer;
const mediaNameSafe=x=>x===undefined||x===null||(typeof x==='string'&&x.trim().length>0&&x.trim().length<=120);
if(input.audioName!==undefined&&!mediaNameSafe(input.audioName))throw new Error('Sound file name is invalid.');
if(input.answerAudioName!==undefined&&!mediaNameSafe(input.answerAudioName))throw new Error('Answer sound file name is invalid.');
if(input.audio&&!audioSafe(input.audio))throw new Error('Use a sound clip of about 1 minute or less, or an https sound file.');
if(input.answerAudio&&!audioSafe(input.answerAudio))throw new Error('Use an answer sound of about 1 minute or less, or an https sound file.');
if(input.video&&!videoSafe(input.video))throw new Error('Use an https video file (or a small uploaded video).');
if(input.answerVideo&&!videoSafe(input.answerVideo))throw new Error('Use an https answer video (or a small uploaded video).');
if(input.audio&&isDriveLink(input.audio))throw new Error(DRIVE_SHARE_REJECT);
if(input.answerAudio&&isDriveLink(input.answerAudio))throw new Error(DRIVE_SHARE_REJECT);
if(input.video&&isDriveLink(input.video))throw new Error(DRIVE_SHARE_REJECT);
if(input.answerVideo&&isDriveLink(input.answerVideo))throw new Error(DRIVE_SHARE_REJECT);
for(const [editKey,mediaKey] of [['audioEdit','audio'],['videoEdit','video'],['answerAudioEdit','answerAudio'],['answerVideoEdit','answerVideo']])if(input[editKey]!==undefined&&(!input[mediaKey]||!mediaEditSafe(input[editKey])))throw new Error('Clip edit settings are invalid.');
if(input.image&&!imageSafe(input.image))throw new Error('Use a PNG, JPEG or WebP image under 2 MB, or an https image link.');if(input.answerImage&&!imageSafe(input.answerImage))throw new Error('Use a PNG, JPEG or WebP answer image under 2 MB, or an https image link.');if(input.optionImages&&(typeof input.optionImages!=='object'||Object.values(input.optionImages).some(x=>!imageSafe(x))))throw new Error('Invalid image choices.');
if(input.acceptedAnswers&&(!Array.isArray(input.acceptedAnswers)||input.acceptedAnswers.some(a=>typeof a!=='string'||!a.trim())))throw new Error('Alternative answers must be non-empty text.');if(input.tags&&(!Array.isArray(input.tags)||input.tags.some(a=>typeof a!=='string')))throw new Error('Tags must be text.');if(!answer&&!(type==='flashcard'&&(input.answerImage||input.answerVideo||input.answerAudio)))throw new Error(type==='flashcard'?'Add an answer, a back image, video or sound first.':'Add a correct answer first.');
const result={...input,type,prompt,answer,options,correctAnswers,numericTolerance,...(extra?.fields||{})};
if(input.variants!==undefined){if(!Array.isArray(input.variants)||input.variants.length>MAX_VARIANTS)throw new Error(`Use up to ${MAX_VARIANTS} extra question types.`);result.variants=input.variants.map((variant,i)=>{try{return pickVariant(validateQuestion({...pickVariant(variant||{}),prompt:variant?.prompt||input.prompt,image:input.image}));}catch(error){throw new Error(`${typeLabel(variant?.type)} (type ${i+2}): ${error.message}`);}});if(!result.variants.length)delete result.variants;}
const types=itemTypes(result);if(new Set(types).size!==types.length)throw new Error('Each question type can only be used once on the same question.');
if(result.typeMode!==undefined&&!['random','primary'].includes(result.typeMode))delete result.typeMode;
for(const [editKey,mediaKey] of [['audioEdit','audio'],['videoEdit','video'],['answerAudioEdit','answerAudio'],['answerVideoEdit','answerVideo']])if(!result[mediaKey])delete result[editKey];
for(const [nameKey,mediaKey] of [['audioName','audio'],['answerAudioName','answerAudio']])if(!result[mediaKey])delete result[nameKey];else if(typeof result[nameKey]==='string')result[nameKey]=result[nameKey].trim().slice(0,120);
return result;}
export function imageSafe(x){return typeof x==='string'&&((/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(x)&&x.length<2800000)||(/^https:\/\/[^\s"'<>]+$/i.test(x)&&x.length<=2048)||/^rf-img\/[a-f0-9]{32}\.(webp|jpg|png|gif)$/.test(x));}
export function gradeQuestion(item,given){
if(item.type==='list_recall')return listMatches(item,given).filter(i=>i>=0).length>=Math.max(1,listNeed(item));
if(item.type==='categorize'){const placed=given&&typeof given==='object'?given:{};return (item.groups||[]).length>0&&item.groups.every(g=>g.items.every(x=>placed[x]===g.name));}
if(item.type==='highlight'){const want=passageWords(item.passage).filter(w=>w.marked).map(w=>w.index),got=new Set(Array.isArray(given)?given:[]);return want.length>0&&want.length===got.size&&want.every(i=>got.has(i));}
if(item.type==='image_tap')return hotspotHit(item.hotspot,given);
if(item.type==='slider')return gradeQuestion({...item,type:'numeric'},given);
if(item.type==='fill_blank_options')return Array.isArray(given)&&given.length===item.blanks.length&&item.blanks.every((a,i)=>given[i]===a);if(item.type==='matching')return Array.isArray(given)&&given.length===item.pairs.length&&item.pairs.every((p,i)=>given[i]===p.right);if(item.type==='ordering')return Array.isArray(given)&&JSON.stringify(given)===JSON.stringify(item.sequence);if(item.type==='cloze')return Array.isArray(given)&&given.length===item.blanks.length&&item.blanks.every((a,i)=>textGrade({answer:a,fuzzy:item.fuzzy},given[i])!=='wrong');if(item.type==='multi_select'){const expected=new Set(item.correctAnswers||[]),actual=new Set(Array.isArray(given)?given:[]);return expected.size>0&&expected.size===actual.size&&[...expected].every(value=>actual.has(value));}if(item.type==='numeric'){const value=numericValue(given),expected=numericValue(item.answer),tolerance=Number(item.numericTolerance||0);return value!==null&&expected!==null&&Number.isFinite(tolerance)&&tolerance>=0&&Math.abs(value-expected)<=tolerance+Number.EPSILON*Math.max(1,Math.abs(value),Math.abs(expected))*4;}if(['single_choice','true_false'].includes(item.type))return String(given).trim()===item.answer;return textGrade(item,given)!=='wrong';}
export function answerText(item){
  if(!item)return '';
  if(item.type==='multi_select'&&item.correctAnswers?.length)return item.correctAnswers.join('; ');
  if(item.type==='slider'&&String(item.answer??'').trim())return `${item.answer}${item.unit?' '+item.unit:''}${Number(item.numericTolerance)>0?` (± ${item.numericTolerance})`:''}`;
  if(item.type==='list_recall'&&item.listItems?.length){const names=item.listItems.map(x=>listAlternatives(x)[0]).join('; ');return listNeed(item)<item.listItems.length?`Any ${listNeed(item)} of: ${names}`:names;}
  if(String(item.answer??'').trim())return String(item.answer);
  if(item.blanks?.length)return item.blanks.join('; ');
  if(item.pairs?.length)return item.pairs.map(p=>`${p.left} → ${p.right}`).join('; ');
  if(item.sequence?.length)return item.sequence.join(' → ');
  return item.answerImage?'(answer picture)':item.answerVideo?'(answer video)':item.answerAudio?'(answer sound)':'';
}
// What the learner answered, as text for quiz reports.
export function describeAnswer(item,given){
  if(item.type==='list_recall')return (Array.isArray(given)?given:[]).map(x=>String(x).trim()).filter(Boolean).join('; ');
  if(item.type==='categorize'){const placed=given&&typeof given==='object'?given:{};return (item.groups||[]).map(g=>`${g.name}: ${Object.keys(placed).filter(k=>placed[k]===g.name).join(', ')||'—'}`).join('; ');}
  if(item.type==='highlight'){const picked=new Set(Array.isArray(given)?given:[]);return passageWords(item.passage).filter(w=>picked.has(w.index)).map(w=>w.word).join(', ');}
  if(item.type==='image_tap')return given?(hotspotHit(item.hotspot,given)?'Tapped the right spot':'Tapped outside the spot'):'';
  if(item.type==='slider')return given===undefined||given===null||given===''?'':`${given}${item.unit?' '+item.unit:''}`;
  return Array.isArray(given)?given.join('; '):String(given??'');
}
export function missedItems(attempts,bank){const ids=new Set(attempts.filter(attempt=>!attempt.correct).map(attempt=>attempt.knowledge_id));return bank.filter(item=>ids.has(item.id));}
