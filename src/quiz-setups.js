export const setupKey='recallflow_quiz_setups_v1';
export function validateSetups(value){
 if(!Array.isArray(value)||value.length>100)throw new Error('Choose up to 100 saved setups.');
 const ids=new Set(),names=new Set();
 return value.map(p=>{const c=p?.controls,name=String(p?.name||'').trim(),normalized=name.toLocaleLowerCase();if(typeof p?.id!=='string'||!p.id||ids.has(p.id)||!name||name.length>50||names.has(normalized))throw new Error('Each setup needs a unique name of up to 50 characters.');
 if(!c||!['daily','due','all'].includes(c.mode)||!['all','weak','mistakes'].includes(c.focus)||!Number.isInteger(c.count)||c.count<0||c.count>1000||typeof c.shuffle!=='boolean'||typeof c.subject!=='string'||typeof c.topic!=='string'||!Array.isArray(c.types)||c.types.some(t=>typeof t!=='string'))throw new Error('Invalid quiz setup settings.');
 ids.add(p.id);names.add(normalized);return {id:p.id,name,controls:{mode:c.mode,count:c.count,subject:c.subject,topic:c.topic,types:[...new Set(c.types)],shuffle:c.shuffle,focus:c.focus}};});
}
export function readSetups(){try{return validateSetups(JSON.parse(localStorage.getItem(setupKey)||'[]'));}catch{return [];}}
export function writeSetups(value){const clean=validateSetups(value);localStorage.setItem(setupKey,JSON.stringify(clean));return clean;}
