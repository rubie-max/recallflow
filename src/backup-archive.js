// Opens files chosen in Restore backup: a .json backup, a .zip archive (the daily Telegram backup, optionally
// password protected) or the split parts of one (.zip.001, .zip.002, …). The daily backup names its parts
// RecallFlow_backup_<date>_<N>parts.zip.NNN so a missing part can be named before anything is read.
import {ZipReader,BlobReader,TextWriter,BlobWriter,configure,ERR_INVALID_PASSWORD,ERR_ENCRYPTED} from '@zip.js/zip.js/lib/zip-core-native.js';
configure({useWebWorkers:false});

const PART=/^(.+)\.(\d{3})$/;
const IMAGE=/(?:^|\/)images\/([a-f0-9]{32}\.(webp|jpg|png|gif))$/;
const TYPES={webp:'image/webp',jpg:'image/jpeg',png:'image/png',gif:'image/gif'};
const VOICES=['af_heart','af_bella','am_michael','am_fenrir','bf_emma'],SPEEDS=[.8,.9,1,1.1,1.2];

export function orderParts(files){
  if(files.length===1&&!PART.test(files[0].name))return {name:files[0].name,files,total:1};
  const parts=files.map(file=>{const m=PART.exec(file.name);if(!m)throw new Error(`“${file.name}” is not a backup part. Choose only the .001, .002… files of one backup.`);return {file,base:m[1],n:Number(m[2])};});
  if(new Set(parts.map(p=>p.base)).size>1)throw new Error('These parts come from different backups. Choose the parts of one backup only.');
  if(new Set(parts.map(p=>p.n)).size<parts.length)throw new Error('The same part was chosen twice.');
  parts.sort((a,b)=>a.n-b.n);
  const base=parts[0].base,total=Math.max(Number(/_(\d+)parts\.zip$/i.exec(base)?.[1]||0),parts.at(-1).n);
  const missing=[];for(let i=1;i<=total;i++)if(!parts.some(p=>p.n===i))missing.push(i);
  if(missing.length)throw new Error(`${missing.length===1?`Part ${missing[0]} of ${total} is`:`Parts ${missing.join(', ')} of ${total} are`} missing. Choose all ${total} parts together.`);
  return {name:base,files:parts.map(p=>p.file),total};
}

// The private data repo stores data/state.json; turn it into the Full backup shape Restore already understands.
export function backupFromState(s){
  const p=s.prefs&&typeof s.prefs==='object'?s.prefs:{};
  const json=(key,fallback)=>{try{return p[key]==null?fallback:JSON.parse(p[key]);}catch{return fallback;}};
  const speed=Number(p.recallflow_kokoro_speed),quiz=json('recallflow_quiz_preferences_v1',null);
  return {app:'RecallFlow',version:1,exportedAt:s.updatedAt||new Date().toISOString(),
    questions:Array.isArray(s.items)?s.items:[],reports:Array.isArray(s.reports)?s.reports:[],
    quizCount:Number.isInteger(s.quizCount)&&s.quizCount>=0?s.quizCount:0,streakDays:Array.isArray(s.streakDays)?s.streakDays:[],
    preferences:{theme:['light','dark','system'].includes(p.recallflow_theme)?p.recallflow_theme:'light',voice:VOICES.includes(p.recallflow_kokoro_voice)?p.recallflow_kokoro_voice:'af_heart',
      speed:SPEEDS.includes(speed)?speed:1,speechEngine:p.recallflow_speech_engine||'system',
      quiz:quiz&&Number.isInteger(quiz.count)&&typeof quiz.shuffle==='boolean'?quiz:{count:0,shuffle:true},
      quizSetups:json('recallflow_quiz_setups_v1',[]),app:json('recallflow_app_preferences_v1',undefined)},
    synced:Object.fromEntries(Object.entries(p).filter(([k,v])=>k.startsWith('recallflow_')&&typeof v==='string'))};
}
export const asBackup=data=>data?.app==='RecallFlow'&&Array.isArray(data.items)&&!Array.isArray(data.questions)?backupFromState(data):data;

// Returns {kind:'json',text,label} or {kind:'zip',label,locked,entries}.
export async function openBackupFiles(list){
  const files=[...list];if(!files.length)throw new Error('Choose a backup file.');
  const {name,files:parts,total}=orderParts(files);
  const blob=new Blob(parts),head=new Uint8Array(await blob.slice(0,2).arrayBuffer());
  if(head[0]!==0x50||head[1]!==0x4b){
    if(total>1)throw new Error('These parts are not a RecallFlow backup archive.');
    return {kind:'json',text:await parts[0].text(),label:name};
  }
  let entries;
  try{entries=(await new ZipReader(new BlobReader(blob)).getEntries()).filter(e=>!e.directory);}
  catch{throw new Error(total>1?'These parts could not be joined. Make sure every part of the same backup is chosen.':'This zip file is damaged or incomplete.');}
  return {kind:'zip',label:total>1?`${name.replace(/(_\d+parts)?\.zip$/i,'')} · ${total} parts`:name,locked:entries.some(e=>e.encrypted),entries};
}

// Reads the backup data and pictures. Throws an error with wrongPassword:true when the password does not open it.
export async function readArchive(archive,password=''){
  const options=archive.locked?{password}:{};
  const json=archive.entries.find(e=>/(^|\/)state\.json$/i.test(e.filename))||archive.entries.find(e=>/\.json$/i.test(e.filename));
  if(!json)throw new Error('This archive has no RecallFlow data inside.');
  const read=async(entry,writer)=>{try{return await entry.getData(writer,options);}catch(e){if(e?.message===ERR_INVALID_PASSWORD||e?.message===ERR_ENCRYPTED)throw Object.assign(new Error(password?'Wrong password. Try again.':'Enter the password.'),{wrongPassword:true});throw e;}};
  const data=asBackup(JSON.parse(await read(json,new TextWriter())));
  const images=[];
  for(const entry of archive.entries){const m=IMAGE.exec(entry.filename);if(m)images.push({name:m[1],blob:await read(entry,new BlobWriter(TYPES[m[2]]))});}
  return {data,images};
}
