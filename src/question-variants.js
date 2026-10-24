// A question can be asked as several types. The primary type lives on the item itself
// (so older banks keep working); extra types live in item.variants.
export const variantFields=['type','prompt','answer','options','correctAnswers','numericTolerance','acceptedAnswers','fuzzy','optionImages','optionMedia','pairs','sequence','blanks','listItems','listCount','groups','passage','hotspot','spots','tapMode','sliderMin','sliderMax','sliderStep','unit'];
// Editor draft fields that belong to one type (the rest, like images and tags, are shared).
export const draftTypeFields=['type','prompt','answer','options','numericTolerance','structured','accepted','fuzzy','optionImages','optionMedia','listCount','groups','passage','spots','tapMode','sliderMin','sliderMax','sliderStep','unit'];
export const MAX_VARIANTS=15;

export function itemTypes(item){return [item.type||'short_answer',...(item.variants||[]).map(v=>v.type||'short_answer')];}

export function pickVariant(variant){return Object.fromEntries(variantFields.filter(key=>variant[key]!==undefined).map(key=>[key,variant[key]]));}

// Returns a copy of the item shaped as the chosen type; id and shared fields are kept.
export function resolveVariant(item,types=[],random=Math.random){
  const all=[{index:0,type:item.type||'short_answer'},...(item.variants||[]).map((v,i)=>({index:i+1,type:v.type||'short_answer'}))];
  if(all.length===1)return {...item,variantIndex:0};
  const allowed=types?.length?all.filter(x=>types.includes(x.type)):all;
  const pool=allowed.length?allowed:all;
  const choice=item.typeMode==='primary'&&pool.some(x=>x.index===0)?pool.find(x=>x.index===0):pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
  return variantAt(item,choice.index);
}
export function variantAt(item,index){
  const variant=index>0&&item.variants?.[index-1];
  if(!variant)return {...item,variantIndex:0};
  const shaped={...item};
  for(const key of variantFields)shaped[key]=variant[key];
  shaped.prompt=variant.prompt||item.prompt;
  shaped.variantIndex=index;
  return shaped;
}
// A retake asks a missed question as one of its other types when it has any.
export function retakeVariant(item,missedType,random=Math.random){
  const others=itemTypes(item).filter(type=>type!==missedType);
  return resolveVariant({...item,typeMode:undefined},others,random);
}

const lines=text=>String(text||'').split('\n').map(x=>x.trim()).filter(Boolean);
export const emptyGroups=()=>[{name:'',items:''},{name:'',items:''}];
export function emptyDraft(type='short_answer',prompt=''){return {type,prompt,answer:type==='true_false'?'True':'',options:'',numericTolerance:'0',structured:'',accepted:'',fuzzy:true,optionImages:{},optionMedia:{},...(type==='categorize'?{groups:emptyGroups()}:{}),...(type==='slider'?{sliderMin:'0',sliderMax:'100',sliderStep:'1'}:{})};}

// Places on a Tap the picture question; older questions stored one hotspot, named by the answer.
function draftSpots(item){
  if(Array.isArray(item.spots)&&item.spots.length)return item.spots.map(s=>({...s}));
  return item.hotspot?[{...item.hotspot,label:item.answer&&item.answer!=='The marked spot'?String(item.answer):''}]:[];
}
export function draftFromSpec(item){
  const type=item.type||'short_answer';
  // Word-bank answers are added to the bank on save, so the editor lists only the extra words.
  const options=type==='fill_blank_options'?(item.options||[]).filter(x=>!(item.blanks||[]).includes(x)):(item.options||[]);
  return {type,prompt:item.prompt||'',answer:type==='multi_select'?(item.correctAnswers||[]).join('\n'):['list_recall','categorize','highlight','image_tap'].includes(type)||(type==='fill_blank'&&item.blanks?.length>1)?'':String(item.answer??''),options:options.join('\n'),numericTolerance:String(item.numericTolerance??0),structured:type==='matching'?(item.pairs||[]).map(p=>p.left+'|'+p.right).join('\n'):type==='ordering'?(item.sequence||[]).join('\n'):type==='list_recall'?(item.listItems||[]).join('\n'):(item.blanks||[]).join('\n'),accepted:(item.acceptedAnswers||[]).join('\n'),fuzzy:item.fuzzy,optionImages:item.optionImages||{},optionMedia:item.optionMedia||{},
    listCount:item.listCount?String(item.listCount):'',groups:item.groups?.length?item.groups.map(g=>({name:g.name,items:(g.items||[]).join('\n')})):undefined,passage:item.passage||'',spots:type==='image_tap'?draftSpots(item):undefined,tapMode:item.tapMode,
    sliderMin:item.sliderMin===undefined?undefined:String(item.sliderMin),sliderMax:item.sliderMax===undefined?undefined:String(item.sliderMax),sliderStep:item.sliderStep===undefined?undefined:String(item.sliderStep),unit:item.unit||''};
}

// Items added as a picture with no text get an automatic name; the quiz shows only the picture.
export const pictureLabel=index=>`Picture ${index}`;
export function isPictureLabel(text){return /^Picture (\d+|[A-Z])$/.test(String(text||'').trim());}

export const imageTypes=['single_choice','multi_select','fill_blank_options','matching','ordering','categorize'];

// optionImages and optionMedia are keyed by the text of a choice, word-bank word, matching side, ordering step or group item.
export function imageKeys(item){
  if(item.type==='matching')return (item.pairs||[]).flatMap(p=>[p.left,p.right]);
  if(item.type==='ordering')return item.sequence||[];
  if(item.type==='categorize')return (item.groups||[]).flatMap(g=>g.items||[]);
  return item.options||[];
}
const blankCount=prompt=>(String(prompt||'').match(/_{2,}/g)||[]).length;
// Keeps only entries that have a sound or video (and, when keys are given, belong to a current item).
export function cleanMedia(x,keys){
  const out={};
  for(const [k,m] of Object.entries(x||{})){
    const key=k.trim();
    if(!m||(keys&&!keys.includes(key)))continue;
    const entry={};
    if(m.audio){entry.audio=m.audio;if(m.audioEdit)entry.audioEdit=m.audioEdit;}
    if(m.video){entry.video=m.video;if(m.videoEdit)entry.videoEdit=m.videoEdit;}
    if(entry.audio||entry.video)out[key]=entry;
  }
  return Object.keys(out).length?out:undefined;
}

export function specFromDraft(d){
  const type=d.type||'short_answer',blanks=lines(d.structured);
  const options=type==='fill_blank_options'?[...new Set([...blanks,...lines(d.options)])]:lines(d.options);
  const pairs=type==='matching'?String(d.structured||'').split('\n').filter(x=>x.trim()).map(line=>{const [left,...rest]=line.split('|');return {left:left?.trim(),right:rest.join('|').trim()};}):undefined;
  const sequence=type==='ordering'?lines(d.structured):undefined;
  const groups=type==='categorize'?(d.groups||[]).map(g=>({name:String(g?.name||'').trim(),items:lines(g?.items)})).filter(g=>g.name||g.items.length):undefined;
  const keys=imageKeys({type,options,pairs,sequence,groups});
  const multiBlank=type==='fill_blank'&&blankCount(d.prompt)>1;
  return {type,prompt:d.prompt,answer:multiBlank?blanks.join('; '):d.answer,
    optionMedia:imageTypes.includes(type)?cleanMedia(d.optionMedia,keys):undefined,
    options:['single_choice','multi_select','fill_blank_options'].includes(type)?options:undefined,
    correctAnswers:type==='multi_select'?lines(d.answer):undefined,
    numericTolerance:d.numericTolerance,
    acceptedAnswers:lines(d.accepted),
    fuzzy:d.fuzzy!==false,
    optionImages:imageTypes.includes(type)?Object.fromEntries(Object.entries(d.optionImages||{}).map(([key,value])=>[key.trim(),value]).filter(([key,value])=>value&&keys.includes(key))):undefined,
    pairs,sequence,
    blanks:['cloze','fill_blank_options'].includes(type)||multiBlank?blanks:undefined,
    listItems:type==='list_recall'?lines(d.structured):undefined,
    listCount:type==='list_recall'&&String(d.listCount||'').trim()?Number(d.listCount):undefined,
    groups,
    passage:type==='highlight'?String(d.passage||''):undefined,
    spots:type==='image_tap'?(d.spots||(d.hotspot?[{...d.hotspot,label:d.answer||''}]:[])):undefined,
    tapMode:type==='image_tap'&&d.tapMode==='name'?'name':undefined,
    sliderMin:type==='slider'?d.sliderMin??'0':undefined,sliderMax:type==='slider'?d.sliderMax??'100':undefined,sliderStep:type==='slider'?d.sliderStep??'1':undefined,
    unit:type==='slider'?String(d.unit||'').trim()||undefined:undefined};
}

// Deterministic per question, so the same quiz attempt keeps a stable order across re-renders.
export function seededShuffle(list,seed){
  let h=2166136261;for(const c of String(seed))h=Math.imul(h^c.charCodeAt(0),16777619);
  const next=()=>{h=Math.imul(h^(h>>>15),2246822507);h=Math.imul(h^(h>>>13),3266489909);return ((h^=h>>>16)>>>0)/4294967296;};
  const out=[...list];
  for(let i=out.length-1;i>0;i--){const j=Math.floor(next()*(i+1));[out[i],out[j]]=[out[j],out[i]];}
  if(out.length>1&&out.every((x,i)=>x===list[i]))out.push(out.shift());
  return out;
}
