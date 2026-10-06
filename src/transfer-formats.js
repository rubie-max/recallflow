import {normalize} from './learning-core.js';
import {typeLabel,questionTypes} from './question-types.js';

export const exportFormats=[
  {id:'json',label:'RecallFlow file',ext:'json',mime:'application/json',detail:'Keeps every type, image and setting. Best for moving to another device.'},
  {id:'csv',label:'Spreadsheet (CSV)',ext:'csv',mime:'text/csv',detail:'Open or edit in Excel, Google Sheets or Numbers.'},
  {id:'tsv',label:'Anki / Quizlet',ext:'txt',mime:'text/tab-separated-values',detail:'Tab-separated front and back, ready for flashcard apps.'},
  {id:'text',label:'Printable sheet',ext:'md',mime:'text/markdown',detail:'Readable questions and answers for printing or sharing.'},
];
export const importFormats=[['auto','Detect automatically'],['json','RecallFlow file (JSON)'],['csv','Spreadsheet (CSV)'],['tsv','Tab separated (Anki / Quizlet)'],['lines','Question | Answer lines']];

const progressKeys=['due','interval','lastReviewed','attempts','lapses'];
const typeIds=new Set(questionTypes.map(([id])=>id));
const isImage=x=>typeof x==='string'&&(x.startsWith('data:')||x.startsWith('rf-img/'));

function stripImages(item){
  const out={...item};
  for(const key of ['image','answerImage'])if(isImage(out[key]))delete out[key];
  if(out.optionImages)out.optionImages=Object.fromEntries(Object.entries(out.optionImages).filter(([,v])=>!isImage(v)));
  if(out.variants)out.variants=out.variants.map(v=>v.optionImages?{...v,optionImages:Object.fromEntries(Object.entries(v.optionImages).filter(([,x])=>!isImage(x)))}:v);
  return out;
}

export function prepareExport(items,{images=true,progress=true}={}){
  return items.map(item=>{let out={...item};if(!images)out=stripImages(out);if(!progress)for(const key of progressKeys)delete out[key];return out;});
}

const csvCell=v=>{const s=String(v??'');return /[",\n\r]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};
const list=a=>(a||[]).join(' | ');
export const csvColumns=['subject','topic','type','prompt','answer','options','correct_answers','accepted_answers','pairs','sequence','blanks','tolerance','tags'];
function csvRow(item){return [item.subject,item.topic,item.type||'short_answer',item.prompt,item.type==='multi_select'?'':item.answer,list(item.options),list(item.correctAnswers),list(item.acceptedAnswers),list((item.pairs||[]).map(p=>p.left+' => '+p.right)),list(item.sequence),list(item.blanks),item.type==='numeric'?item.numericTolerance??0:'',list(item.tags)];}

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
  return out;
}

export function detectFormat(text,filename=''){
  const t=text.trim(),ext=filename.split('.').pop()?.toLowerCase();
  if(ext==='json'||t.startsWith('{')||t.startsWith('['))return 'json';
  const first=t.split(/\r?\n/)[0]||'';
  if(ext==='csv'||(/,/.test(first)&&/\b(prompt|question|front|term)\b/i.test(first)))return 'csv';
  if(/\t/.test(first))return 'tsv';
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

export const csvTemplate=[csvColumns.join(','),
  'Geography,Capitals,short_answer,What is the capital of Japan?,Tokyo,,,,,,,,',
  'Space,Planets,single_choice,Which planet is the largest?,Jupiter,Mars | Jupiter | Saturn,,,,,,,',
  'Biology,Cells,true_false,Mitochondria produce energy for the cell.,True,,,,,,,,',
  'Chemistry,Symbols,matching,Match each element to its symbol.,,,,,Oxygen => O | Sodium => Na | Iron => Fe,,,,',
].join('\r\n');
