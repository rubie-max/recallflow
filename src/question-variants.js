// A question can be asked as several types. The primary type lives on the item itself
// (so older banks keep working); extra types live in item.variants.
export const variantFields=['type','prompt','answer','options','correctAnswers','numericTolerance','acceptedAnswers','fuzzy','optionImages','pairs','sequence','blanks','audio','clips','spots','groups','steps'];
export const MAX_VARIANTS=5;

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
export function emptyDraft(type='short_answer',prompt=''){return {type,prompt,answer:type==='true_false'?'True':'',options:'',numericTolerance:'0',structured:'',accepted:'',fuzzy:type!=='dictation',optionImages:{},audio:'',clips:[{label:'',audio:''},{label:'',audio:''}],spots:[],groups:[{name:'',items:''},{name:'',items:''}],steps:[{prompt:'',answer:''},{prompt:'',answer:''}]};}

export function draftFromSpec(item){
  const type=item.type||'short_answer';
  const structured=type==='matching'?(item.pairs||[]).map(p=>p.left+'|'+p.right).join('\n'):type==='ordering'||type==='build_answer'?(item.sequence||[]).join('\n'):type==='timeline'?(item.sequence||[]).map(row=>{const [year,...rest]=String(row).split(' · ');return rest.length?`${year}|${rest.join(' · ')}`:row;}).join('\n'):(item.blanks||[]).join('\n');
  return {type,prompt:item.prompt||'',answer:type==='multi_select'?(item.correctAnswers||[]).join('\n'):String(item.answer??''),options:(item.options||[]).join('\n'),numericTolerance:String(item.numericTolerance??0),structured,accepted:(item.acceptedAnswers||[]).join('\n'),fuzzy:item.fuzzy!==false,optionImages:item.optionImages||{},audio:item.audio||'',clips:item.clips?.length?item.clips:[{label:'',audio:''},{label:'',audio:''}],spots:item.spots||[],groups:item.groups?.length?item.groups.map(g=>({name:g.name,items:(g.items||[]).join('\n')})):[{name:'',items:''},{name:'',items:''}],steps:item.steps?.length?item.steps:[{prompt:'',answer:''},{prompt:'',answer:''}]};
}

// Items added as a picture with no text get an automatic name; the quiz shows only the picture.
export const pictureLabel=index=>`Picture ${index}`;
export function isPictureLabel(text){return /^Picture (\d+|[A-Z])$/.test(String(text||'').trim());}

export const imageTypes=['single_choice','multi_select','fill_blank_options','matching','ordering','odd_one_out'];

// optionImages is keyed by the text of a choice, word-bank word, matching side or ordering step.
export function imageKeys(item){
  if(item.type==='matching')return (item.pairs||[]).flatMap(p=>[p.left,p.right]);
  if(item.type==='ordering')return item.sequence||[];
  return item.options||[];
}

export function specFromDraft(d){
  const type=d.type||'short_answer',options=lines(d.options);
  const pairs=type==='matching'?String(d.structured||'').split('\n').filter(x=>x.trim()).map(line=>{const [left,...rest]=line.split('|');return {left:left?.trim(),right:rest.join('|').trim()};}):undefined;
  const sequence=type==='ordering'||type==='build_answer'?lines(d.structured):type==='timeline'?String(d.structured||'').split('\n').map(row=>row.trim()).filter(Boolean).map(row=>{const [year,...rest]=row.split('|');const event=rest.join('|').trim();return event?(year.trim()?`${year.trim()} · ${event}`:event):year.trim();}):undefined;
  const keys=imageKeys({type,options,pairs,sequence});
  return {type,prompt:d.prompt,answer:d.answer,
    options:['single_choice','multi_select','fill_blank_options','odd_one_out','build_answer'].includes(type)?options:undefined,
    correctAnswers:type==='multi_select'?lines(d.answer):undefined,
    numericTolerance:d.numericTolerance,
    acceptedAnswers:lines(d.accepted),
    fuzzy:d.fuzzy!==false,
    optionImages:imageTypes.includes(type)?Object.fromEntries(Object.entries(d.optionImages||{}).map(([key,value])=>[key.trim(),value]).filter(([key,value])=>value&&keys.includes(key))):undefined,
    pairs,sequence,
    blanks:['cloze','fill_blank_options'].includes(type)?lines(d.structured):undefined,
    audio:['audio_name','audio_voice','dictation','lyric'].includes(type)?d.audio:undefined,
    clips:['audio_choice','audio_order'].includes(type)?(d.clips||[]).map(c=>({label:String(c.label||'').trim(),audio:c.audio})).filter(c=>c.label||c.audio):undefined,
    spots:['image_tap','image_label'].includes(type)?d.spots:undefined,
    groups:type==='categorize'?(d.groups||[]).map(g=>({name:String(g.name||'').trim(),items:String(g.items||'').split('\n').map(x=>x.trim()).filter(Boolean)})):undefined,
    steps:type==='two_step'?d.steps:undefined};
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
