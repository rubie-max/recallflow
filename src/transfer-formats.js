import {normalize} from './learning-core.js';
import {typeLabel,questionTypes,resolveMediaLink} from './question-types.js';

export const exportFormats=[
  {id:'json',label:'RecallFlow file',ext:'json',mime:'application/json',detail:'Keeps every type and setting. Use the toggles below to leave out pictures or recorded sounds and keep the file small.'},
  {id:'csv',label:'Spreadsheet (CSV)',ext:'csv',mime:'text/csv',detail:'Open or edit in Excel, Google Sheets or Numbers.'},
  {id:'tsv',label:'Anki / Quizlet',ext:'txt',mime:'text/tab-separated-values',detail:'Tab-separated front and back, ready for flashcard apps.'},
  {id:'text',label:'Printable sheet',ext:'md',mime:'text/markdown',detail:'Readable questions and answers for printing or sharing.'},
];
export const importFormats=[['auto','Detect automatically'],['json','RecallFlow file (JSON)'],['csv','Spreadsheet (CSV)'],['tsv','Tab separated (Anki / Quizlet)'],['lines','Question | Answer lines']];

const progressKeys=['due','interval','lastReviewed','attempts','lapses'];
const typeIds=new Set(questionTypes.map(([id])=>id));
const isEmbeddedImage=x=>typeof x==='string'&&(x.startsWith('data:image/')||x.startsWith('rf-img/'));
const isEmbeddedAudio=x=>typeof x==='string'&&/^data:audio\//i.test(x);
const isEmbeddedVideo=x=>typeof x==='string'&&/^data:video\//i.test(x);
const mediaLink=v=>typeof v==='string'&&!v.startsWith('data:')?v:'';

function stripEmbeddedImages(item){
  const out={...item};
  for(const key of ['image','answerImage'])if(isEmbeddedImage(out[key]))delete out[key];
  if(out.optionImages)out.optionImages=Object.fromEntries(Object.entries(out.optionImages).filter(([,v])=>!isEmbeddedImage(v)));
  if(out.variants)out.variants=out.variants.map(v=>v.optionImages?{...v,optionImages:Object.fromEntries(Object.entries(v.optionImages).filter(([,x])=>!isEmbeddedImage(x)))}:v);
  return out;
}

export function prepareExport(items,{images=true,audio=false,video=false,progress=true}={}){
  return items.map(item=>{
    let out={...item};
    if(!images)out=stripEmbeddedImages(out);
    if(!audio){for(const k of ['audio','answerAudio'])if(isEmbeddedAudio(out[k]))delete out[k];}
    if(!video){for(const k of ['video','answerVideo'])if(isEmbeddedVideo(out[k]))delete out[k];}
    if(!audio||!video){out=stripItemMedia(out,!audio,!video);out.variants=out.variants?.map(v=>stripItemMedia(v,!audio,!video));if(!out.variants)delete out.variants;}
    if(!progress)for(const key of progressKeys)delete out[key];
    return out;
  });
}
function stripItemMedia(item,audio,video){
  if(!item.optionMedia)return item;
  const media=Object.fromEntries(Object.entries(item.optionMedia).map(([k,m])=>{const e={...m};if(audio&&isEmbeddedAudio(e.audio)){delete e.audio;delete e.audioEdit;}if(video&&isEmbeddedVideo(e.video)){delete e.video;delete e.videoEdit;}return [k,e];}).filter(([,e])=>e.audio||e.video));
  const out={...item};
  if(Object.keys(media).length)out.optionMedia=media;else delete out.optionMedia;
  return out;
}
const itemMediaHas=(x,test,key)=>[x,...(x?.variants||[])].some(v=>Object.values(v?.optionMedia||{}).some(m=>test(m?.[key])));

export function embeddedAudioCount(items){
  return items.filter(x=>isEmbeddedAudio(x?.audio)||isEmbeddedAudio(x?.answerAudio)||itemMediaHas(x,isEmbeddedAudio,'audio')).length;
}
export function embeddedVideoCount(items){
  return items.filter(x=>isEmbeddedVideo(x?.video)||isEmbeddedVideo(x?.answerVideo)||itemMediaHas(x,isEmbeddedVideo,'video')).length;
}

export const aiImportPrompt=`You are preparing questions for RecallFlow (a quiz app). Reply with ONE JSON object only — no markdown fences, no commentary.

Shape:
{"questions":[ ... ]}

Each question is an object. Use these fields when they apply:

Always useful:
- "type" — one of: short_answer, fill_blank, single_choice, flashcard, true_false, multi_select, numeric, matching, ordering, cloze, fill_blank_options, list_recall, categorize, highlight, image_tap, slider
- "prompt" — the question text (required for most types)
- "answer" — the correct answer text (see type notes below)
- "subject", "topic", "tags" (array of strings)

Choices & lists:
- "options" — array of strings (single_choice, multi_select, fill_blank_options)
- "correctAnswers" — array of strings (multi_select only; each must match an option)
- "acceptedAnswers" — array of extra spellings that count as correct (short_answer, etc.)
- "pairs" — [{ "left":"...", "right":"..." }, ...] (matching)
- "sequence" — array of strings in correct order (ordering)
- "blanks" — array of answers, one per ___ in the prompt (cloze, fill_blank_options)
- "listItems" — array of strings (list_recall); optional "listCount" if they only need to name some
- "groups" — [{ "name":"Group A", "items":["a","b"] }, ...] (categorize, 2–4 groups)

Special types:
- "passage" — sentence with correct words wrapped in *asterisks* (highlight), e.g. "The *cat* sat."
- "hotspot" — { "x":0.5, "y":0.4, "r":0.08, "aspect":0.75 } fractions of picture width/height (image_tap; needs "image")
- "sliderMin", "sliderMax", "sliderStep", "numericTolerance", "unit" (slider)
- "numericTolerance" — allowed difference (numeric and slider)

Pictures, sound & video (optional):
- "image", "answerImage" — https:// or Google Drive image link
- "audio" — question sound; "answerAudio" — answer sound (https / Drive)
- "video" — question video; "answerVideo" — answer video (https / Drive)
- Use links, not base64. Google Drive “anyone with the link” URLs are accepted.
- "fuzzy" — true/false for forgiving spelling (default true for text types)

Multi-type questions (optional):
- "variants" — array of extra type objects (same fields, often share the main prompt)
- "typeMode" — "random" or "primary"

Type-specific answer rules:
- true_false: answer is "True" or "False"
- multi_select: use correctAnswers; answer can be "2; 3" style summary
- matching / ordering: answer is auto-derived from pairs/sequence if omitted
- list_recall: answer like "Red; Blue; Yellow"
- categorize: answer like "Fruit: Apple; Vegetable: Carrot"
- highlight: answer lists marked words, e.g. "sat, slept"
- image_tap: answer can describe the spot; include hotspot + image
- slider: answer is the number as a string

Example (minimal):
{"questions":[
  {"type":"short_answer","subject":"Geography","topic":"Capitals","prompt":"Capital of Japan?","answer":"Tokyo","tags":["asia"]},
  {"type":"single_choice","prompt":"Largest planet?","answer":"Jupiter","options":["Earth","Jupiter","Mars"]},
  {"type":"list_recall","prompt":"Name two primary colours.","listItems":["Red","Blue","Yellow"],"listCount":2,"answer":"Red; Blue; Yellow"}
]}

Several types for one question — add a "variants" array. Each item has its own "type" plus the fields that type needs ("options" for choice types, "answer" otherwise). The top-level type is the first way to ask it.
Example: { "prompt": "Capital of France?", "type": "short_answer", "answer": "Paris", "variants": [ { "type": "single_choice", "options": ["Paris","Lyon","Nice"] } ] }
In CSV, put extra types in the "variants" column: type=opt|opt, separate several with ;

Question sound — add "audio": "https://..." (direct mp3/wav link). Links only, never base64.
In CSV, use an "audio" column with the https link.`;

export function parseVariantsCell(cell){
  if(!cell||!String(cell).trim())return undefined;
  const out=String(cell).split(';').map(part=>{
    const eq=part.indexOf('=');
    const type=(eq>=0?part.slice(0,eq):part).trim();
    const rest=eq>=0?part.slice(eq+1):'';
    if(!type||!typeIds.has(type))return null;
    const v={type};
    const opts=rest.split('|').map(s=>s.trim()).filter(Boolean);
    if(['single_choice','fill_blank_options'].includes(type))v.options=opts;
    else if(type==='multi_select'){v.options=opts;v.correctAnswers=opts;}
    else if(type==='true_false')v.answer=/^t/i.test(opts[0]||rest.trim())?'True':'False';
    else if(opts.length)v.answer=opts[0];
    else if(rest.trim())v.answer=rest.trim();
    return v;
  }).filter(Boolean);
  return out.length?out:undefined;
}

const csvCell=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const list=a=>(a||[]).join(' | ');
export const csvColumns=['subject','topic','type','prompt','answer','options','correct_answers','accepted_answers','pairs','sequence','blanks','tolerance','tags','audio','video','answer_audio','answer_video'];
function csvRow(item){return [item.subject,item.topic,item.type||'short_answer',item.prompt,item.type==='multi_select'?'':item.answer,list(item.options),list(item.correctAnswers),list(item.acceptedAnswers),list((item.pairs||[]).map(p=>p.left+' => '+p.right)),list(item.sequence),list(item.blanks),item.type==='numeric'?item.numericTolerance??0:'',list(item.tags),mediaLink(item.audio),mediaLink(item.video),mediaLink(item.answerAudio),mediaLink(item.answerVideo)];}

export function serialize(items,format,options={}){
  const data=prepareExport(items,options);
  if(format==='json')return JSON.stringify({app:'RecallFlow',version:1,exported:new Date().toISOString(),questions:data},null,2);
  if(format==='csv')return [csvColumns.join(','),...data.map(item=>csvRow(item).map(csvCell).join(','))].join('\r\n');
  const clean=s=>String(s??'').replace(/[\t\r\n]+/g,' ').trim();
  if(format==='tsv')return data.map(item=>[clean(item.prompt),clean(item.answer),clean([item.subject,item.topic,...(item.tags||[])].filter(Boolean).map(t=>String(t).replace(/\s+/g,'_')).join(' '))].join('\t')).join('\n');
  const groups=new Map();
  for(const item of data){const key=item.subject||'General';groups.set(key,[...(groups.get(key)||[]),item]);}
  let out='# RecallFlow questions\n';
  for(const [subject,group] of groups){
    out+=`\n## ${subject}\n`;
    group.forEach((item,i)=>{
      out+=`\n${i+1}. ${item.prompt}\n`;
      if(item.options?.length&&item.type!=='fill_blank_options')out+=item.options.map((o,j)=>`   ${String.fromCharCode(97+j)}) ${o}`).join('\n')+'\n';
      if(item.type==='fill_blank_options')out+=`   Word bank: ${item.options.join(', ')}\n`;
      if(item.type==='matching')out+=item.pairs.map(p=>`   - ${p.left}`).join('\n')+'\n';
      out+=`   **Answer:** ${item.answer}\n`;
      if(item.variants?.length)out+=`   _Also asked as: ${item.variants.map(v=>typeLabel(v.type)).join(', ')}_\n`;
    });
  }
  return out;
}

export function parseCSV(text,delimiter=','){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
    if(c==='"'&&!cell)quoted=true;
    else if(c===delimiter){row.push(cell);cell='';}
    else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row);}
  return rows.filter(r=>r.some(c=>c.trim()));
}

const split=s=>String(s||'').split('|').map(x=>x.trim()).filter(Boolean);
const headerAlias={question:'prompt',front:'prompt',term:'prompt',back:'answer',definition:'answer',choices:'options',correct:'correct_answers',accepted:'accepted_answers',alternatives:'accepted_answers',category:'subject',deck:'subject',chapter:'topic'};
function fromRecord(rec){
  const type=typeIds.has(rec.type)?rec.type:[...typeIds].find(id=>typeLabel(id).toLowerCase()===String(rec.type||'').toLowerCase())||(split(rec.options).length?'single_choice':'short_answer');
  const out={type,prompt:rec.prompt||'',answer:rec.answer||'',subject:rec.subject||'',topic:rec.topic||''};
  if(split(rec.options).length)out.options=split(rec.options);
  if(split(rec.correct_answers).length)out.correctAnswers=split(rec.correct_answers);
  if(split(rec.accepted_answers).length)out.acceptedAnswers=split(rec.accepted_answers);
  if(split(rec.pairs).length)out.pairs=split(rec.pairs).map(p=>{const [left,...right]=p.split(/=>|->|→/);return {left:left.trim(),right:right.join('').trim()};});
  if(split(rec.sequence).length)out.sequence=split(rec.sequence);
  if(split(rec.blanks).length)out.blanks=split(rec.blanks);
  if(rec.tolerance)out.numericTolerance=rec.tolerance;
  if(rec.tags)out.tags=String(rec.tags).split(/[|,]/).map(x=>x.trim()).filter(Boolean);
  if(type==='true_false')out.answer=/^t/i.test(out.answer)?'True':'False';
  for(const [col,key] of [['audio','audio'],['video','video'],['answer_audio','answerAudio'],['answer_video','answerVideo']])if(rec[col]?.trim())out[key]=resolveMediaLink(rec[col].trim());
  const variants=parseVariantsCell(rec.variants);
  if(variants)out.variants=variants.map(v=>{
    if(v.type==='single_choice'&&!v.answer&&out.answer)return {...v,answer:out.answer};
    if(v.type==='multi_select'&&(!v.options?.length)&&split(rec.options).length)return {...v,options:split(rec.options),correctAnswers:v.correctAnswers||split(rec.correct_answers)};
    return v;
  });
  return out;
}

export function detectFormat(text,filename=''){
  const t=text.trim(),ext=filename.split('.').pop()?.toLowerCase();
  if(ext==='json'||t.startsWith('{')||t.startsWith('['))return 'json';
  const first=t.split(/\r?\n/).find(l=>l.trim())||'';
  if(ext==='csv'||(/,/.test(first)&&/\b(prompt|question|front|term|type|subject)\b/i.test(first)))return 'csv';
  if(ext==='tsv'||ext==='txt'&&/\t/.test(first))return 'tsv';
  if(/\t/.test(first)&&first.split('\t').length>=2)return 'tsv';
  return 'lines';
}

export function parseImport(text,format='auto',filename=''){
  const fmt=format==='auto'?detectFormat(text,filename):format;
  if(fmt==='json'){
    const parsed=JSON.parse(text);
    const arr=Array.isArray(parsed)?parsed:(parsed.questions||parsed.items);
    if(!Array.isArray(arr))throw new Error('This file has no questions list.');
    return {format:fmt,records:arr.map(x=>({...x,prompt:x?.prompt||x?.question||''}))};
  }
  if(fmt==='csv'){
    const rows=parseCSV(text.replace(/^\uFEFF/,''));
    if(rows.length<2)throw new Error('The spreadsheet needs a header row and at least one question.');
    const head=rows[0].map(h=>{const k=h.trim().toLowerCase().replace(/\s+/g,'_');return headerAlias[k]||k;});
    if(!head.includes('prompt'))throw new Error('Add a “prompt” or “question” column.');
    return {format:fmt,records:rows.slice(1).map(r=>fromRecord(Object.fromEntries(head.map((h,i)=>[h,(r[i]||'').trim()]))))};
  }
  const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'));
  if(fmt==='tsv')return {format:fmt,records:lines.map(l=>{const [prompt,answer,tags]=l.split('\t');return {type:'short_answer',prompt:(prompt||'').trim(),answer:(answer||'').trim(),...(tags?.trim()?{tags:tags.trim().split(/\s+/)}:{})};})};
  return {format:fmt,records:lines.map(l=>{const m=l.match(/^(.*?)\s*(?:\||::|\t| = | - )\s*(.*)$/);return {type:'short_answer',prompt:(m?m[1]:l).trim(),answer:(m?m[2]:'').trim()};})};
}

export function duplicateKey(item){return (item.prompt?normalize(item.prompt):'image:'+String(item.image||'').slice(-80))+'|'+normalize(item.answer)+'|'+(item.type||'short_answer');}

export const csvTemplate=`subject,topic,type,prompt,answer,options,variants,audio,video,answer_audio,answer_video
Geography,Capitals,short_answer,Capital of France?,Paris,,single_choice=Paris|Lyon|Nice,,,
Science,Physics,true_false,Light is faster than sound.,true,,short_answer=sound,
Biology,Cells,single_choice,Which stores DNA?,Nucleus,Nucleus|Ribosome|Vacuole,multi_select=Nucleus|Mitochondria,
Maths,Basics,short_answer,What is 7 x 8?,56,,numeric=56;true_false=true,
Art,Colour,short_answer,Name one primary colour.,Red,,,`;
