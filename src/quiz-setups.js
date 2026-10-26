export const setupKey='recallflow_quiz_setups_v1';
export const QUIZ_GROUPS=['new','weak','mistakes'];
export const QUIZ_MEDIA=['picture','sound','video'];
export const QUIZ_ORDERS=['shuffle','due','bank'];
const MAX_LIST=500;
const bad=()=>{throw new Error('Invalid quiz setup settings.');};
const strings=(v,fallback=[])=>{if(v===undefined)return fallback;if(!Array.isArray(v)||v.length>MAX_LIST||v.some(x=>typeof x!=='string'))bad();return [...new Set(v)];};
const picks=(v,allowed)=>{const x=strings(v);if(x.some(t=>!allowed.includes(t)))bad();return x;};
// Accepts both the original controls (mode, focus, subject, topic, shuffle) and the newer
// list-based ones. The original fields are always written too, so older app versions on
// other synced devices can still load a setup, in a simplified form.
export function normalizeControls(c){
 if(!c||typeof c!=='object'||!['daily','due','all'].includes(c.mode)||!Number.isInteger(c.count)||c.count<0||c.count>1000)bad();
 if(c.focus!==undefined&&!['all','weak','mistakes'].includes(c.focus))bad();
 if(c.shuffle!==undefined&&typeof c.shuffle!=='boolean')bad();
 if((c.subject!==undefined&&typeof c.subject!=='string')||(c.topic!==undefined&&typeof c.topic!=='string'))bad();
 const groups=picks(c.groups??(c.focus&&c.focus!=='all'?[c.focus]:[]),QUIZ_GROUPS);
 const subjects=strings(c.subjects,c.subject?[c.subject]:[]),topics=strings(c.topics,c.topic?[c.topic]:[]);
 const order=c.order===undefined?(c.shuffle?'shuffle':c.mode==='all'?'bank':'due'):c.order;
 if(!QUIZ_ORDERS.includes(order))bad();
 const pickedMode=c.pickedMode===undefined?'add':c.pickedMode;
 if(!['add','only'].includes(pickedMode))bad();
 const due=c.mode!=='all';
 return {mode:due?(c.mode==='due'?'due':'daily'):'all',count:c.count,subject:subjects[0]||'',topic:topics[0]||'',types:strings(c.types),shuffle:order==='shuffle',
  focus:groups.length===1&&groups[0]!=='new'?groups[0]:'all',groups,subjects,topics,tags:strings(c.tags),media:picks(c.media,QUIZ_MEDIA),picked:strings(c.picked),pickedMode,order};
}
export function validateSetups(value){
 if(!Array.isArray(value)||value.length>100)throw new Error('Choose up to 100 saved setups.');
 const ids=new Set(),names=new Set();
 return value.map(p=>{const name=String(p?.name||'').trim(),normalized=name.toLocaleLowerCase();if(typeof p?.id!=='string'||!p.id||ids.has(p.id)||!name||name.length>50||names.has(normalized))throw new Error('Each setup needs a unique name of up to 50 characters.');
 const controls=normalizeControls(p.controls);ids.add(p.id);names.add(normalized);return {id:p.id,name,controls};});
}
export function readSetups(){try{return validateSetups(JSON.parse(localStorage.getItem(setupKey)||'[]'));}catch{return [];}}
export function writeSetups(value){const clean=validateSetups(value);localStorage.setItem(setupKey,JSON.stringify(clean));return clean;}
export function setupNameError(setups,name,exceptId=''){const n=String(name||'').trim();if(!n)return 'Give it a name.';if(n.length>50)return 'Use 50 characters or fewer.';if(setups.some(p=>p.id!==exceptId&&p.name.toLocaleLowerCase()===n.toLocaleLowerCase()))return 'You already have a setup with this name.';return '';}
// Removes picked questions that no longer exist. A setup limited to "only these" questions
// falls back to its filters once none of its picks remain, instead of giving an empty quiz.
export function dropPicked(setups,isGone){let changed=0;const next=setups.map(p=>{const picked=p.controls.picked.filter(id=>!isGone(id));if(picked.length===p.controls.picked.length)return p;changed++;return {...p,controls:{...p.controls,picked,pickedMode:picked.length?p.controls.pickedMode:'add'}};});return {setups:next,changed};}
export function dropPickedFromSetups(ids){if(!ids.length)return 0;const gone=new Set(ids),{setups,changed}=dropPicked(readSetups(),id=>gone.has(id));if(changed)writeSetups(setups);return changed;}
// Cleans picks for questions deleted elsewhere (for example on another device). Skipped while
// the bank is empty so a bank that has not loaded yet can never wipe every pick.
export function prunePickedSetups(setups,bank,keep=[]){if(!bank.length)return {setups,changed:0};const ids=new Set([...bank.map(x=>x.id),...keep]);return dropPicked(setups,id=>!ids.has(id));}
