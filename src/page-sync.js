// Page-file cloud format (format 2). Questions and reports are split into files of about PAGE_BYTES in
// data/questions/ and data/reports/; streak, quiz count and settings are in data/extras.json, and
// data/index.json marks the format. A sync downloads only the files whose git hash changed since the last
// sync and uploads only the files that differ, all in one commit. Page files are never renamed or deleted
// (an emptied page stays as an empty list), so every question keeps its page on every device.
export const PAGE_BYTES=400000;
export const INDEX_PATH='data/index.json',EXTRAS_PATH='data/extras.json',LEGACY_PATH='data/state.json';
const LISTS=[['items','data/questions/'],['reports','data/reports/']];
// The data repo's backup workflow reads the data files, so a bank only moves once that workflow knows page files.
export const BACKUP_WORKFLOW='.github/workflows/daily-backup.yml',BACKUP_MARK='recallflow-pages-v1';
export const INDEX_TEXT=JSON.stringify({app:'RecallFlow',format:2,pages:LISTS.map(([,dir])=>dir),extras:EXTRAS_PATH})+'\n';
// Older app versions fail to parse this, so they stop syncing instead of saving to a file nobody reads.
export const MOVED_TEXT='RecallFlow keeps this data in data/questions/, data/reports/ and data/extras.json now.\nThis file is no longer updated. Reload the app on every device to keep syncing.\n';

const PAGE=/^data\/(questions|reports)\/\d{4,}\.json$/;
export const isPagedPath=p=>p===INDEX_PATH||p===EXTRAS_PATH||PAGE.test(p);
export const pageName=(dir,n)=>`${dir}${String(n).padStart(4,'0')}.json`;
const pageNumber=p=>Number(p.slice(p.lastIndexOf('/')+1,-5));
const pagesIn=(files,dir)=>Object.keys(files).filter(p=>p.startsWith(dir)&&PAGE.test(p)).sort((a,b)=>pageNumber(a)-pageNumber(b));

// The same hash git and GitHub give a file, so unchanged files are recognised without downloading them.
export async function blobSha(text){
  const body=new TextEncoder().encode(text),head=new TextEncoder().encode(`blob ${body.length}\0`),all=new Uint8Array(head.length+body.length);
  all.set(head);all.set(body,head.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-1',all))].map(b=>b.toString(16).padStart(2,'0')).join('');
}
// One entry per line keeps the history on GitHub readable.
export const pageText=list=>`{"app":"RecallFlow","format":2,"items":[${list.length?'\n'+list.map(x=>JSON.stringify(x)).join(',\n')+'\n':''}]}\n`;
function readJson(text,path){try{return JSON.parse(text);}catch{throw new Error(`${path} in your data could not be read.`);}}
function pageItems(text,path){const items=readJson(text,path)?.items;if(!Array.isArray(items))throw new Error(`${path} in your data could not be read.`);return items;}

// files: {path:text}. Returns the state kept in them.
export function assembleState(files){
  const format=readJson(files[INDEX_PATH],INDEX_PATH)?.format;
  if(!(format>=2))throw new Error(`${INDEX_PATH} in your data could not be read.`);
  if(format>2)throw new Error('Your data was saved by a newer version of RecallFlow. Reload the app to update it.');
  const extras=files[EXTRAS_PATH]==null?{}:readJson(files[EXTRAS_PATH],EXTRAS_PATH);
  const [items,reports]=LISTS.map(([,dir])=>pagesIn(files,dir).flatMap(p=>pageItems(files[p],p)));
  return {items,reports,streakDays:Array.isArray(extras?.streakDays)?extras.streakDays:[],quizCount:Number(extras?.quizCount)||0,prefs:extras?.prefs&&typeof extras.prefs==='object'?extras.prefs:{}};
}

// Entries keep the page they are in; new ones go to the last page until it passes maxBytes, then a new page starts.
export function assignPages(list,files,dir,maxBytes=PAGE_BYTES){
  const pages=new Map(),pageOf=new Map(),fresh=[];
  for(const p of pagesIn(files,dir)){pages.set(p,[]);for(const x of pageItems(files[p],p))if(!pageOf.has(x.id))pageOf.set(x.id,p);}
  for(const x of list){const p=pageOf.get(x.id);if(p)pages.get(p).push(x);else fresh.push(x);}
  let last=[...pages.keys()].at(-1),size=last?pageText(pages.get(last)).length:0;
  for(const x of fresh){
    const n=JSON.stringify(x).length+2;
    if(!last||(size+n>maxBytes&&pages.get(last).length)){last=pageName(dir,last?pageNumber(last)+1:1);pages.set(last,[]);size=0;}
    pages.get(last).push(x);size+=n;
  }
  return pages;
}

// The files that hold state, laid out against the files already in the data repo.
export function splitState(state,files={},maxBytes=PAGE_BYTES){
  const out={[INDEX_PATH]:INDEX_TEXT,[EXTRAS_PATH]:JSON.stringify({streakDays:state.streakDays,quizCount:state.quizCount,prefs:state.prefs})+'\n'};
  for(const [key,dir] of LISTS)for(const [p,list] of assignPages(state[key],files,dir,maxBytes))out[p]=pageText(list);
  return out;
}

// api: getRef(etag) → {unchanged:true} | {sha,etag}; commitTree(commit) → tree; dataFiles(tree) → Map of path → blob
// hash under data/; blob(hash) → text; createBlob(text) → hash; createTree(base,[{path,sha}]) → tree;
// createCommit(message,tree,parent) → commit; updateRef(commit) throws {conflict:true} if the branch moved first.
// meta is what the last page sync returned, or null; legacyBase is the merge base from the last state.json sync.
// apply(merged) saves the merged state on the device and returns false if the device changed meanwhile.
// Returns {legacy:true} when the repo has no page files, {again:true} when apply refused, otherwise {meta,idle}
// where idle means nothing changed on either side, so meta does not need saving again.
export async function pagedSync(api,{local,meta,legacyBase=null,merge,baseOf,apply,message,maxBytes=PAGE_BYTES}){
  let head=meta?.commit,tree=meta?.tree,etag=meta?.etag||null,files=meta?.files||{};
  const ref=await api.getRef(meta?etag:null),seen=head;
  if(!ref.unchanged){
    etag=ref.etag||null;
    if(ref.sha!==head){
      head=ref.sha;tree=await api.commitTree(head);
      const listing=await api.dataFiles(tree);
      if(!listing.has(INDEX_PATH))return {legacy:true};
      const next={};
      for(const [p,sha] of listing)if(isPagedPath(p))next[p]=files[p]?.sha===sha?files[p]:{sha,text:await api.blob(sha)};
      files=next;
    }
  }
  const texts=Object.fromEntries(Object.entries(files).map(([p,f])=>[p,f.text]));
  const merged=merge(meta?meta.base:legacyBase,local,assembleState(texts));
  if(!apply(merged))return {again:true};
  const changed=[];
  for(const [path,text] of Object.entries(splitState(merged,texts,maxBytes)))if(files[path]?.sha!==await blobSha(text))changed.push({path,text});
  if(changed.length){
    const entries=[];for(const c of changed)entries.push({path:c.path,sha:await api.createBlob(c.text)});
    tree=await api.createTree(tree,entries);head=await api.createCommit(message,tree,head);
    await api.updateRef(head);etag=null;
    files={...files};changed.forEach((c,i)=>{files[c.path]={sha:entries[i].sha,text:c.text};});
  }
  return {meta:{format:2,commit:head,tree,etag,base:baseOf(merged),files},idle:!!meta&&head===seen&&etag===meta.etag};
}

// Moves a bank from data/state.json to page files in one commit and replaces state.json with MOVED_TEXT.
// expectSha is the state.json the device last synced; anything else means another device saved since, so it waits.
// Returns the meta for pagedSync, or null when it did not move this time.
export async function migrateToPages(api,{state,expectSha,baseOf,message='Move questions to page files',maxBytes=PAGE_BYTES}){
  const ref=await api.getRef(null),tree=await api.commitTree(ref.sha),listing=await api.dataFiles(tree);
  if(listing.has(INDEX_PATH)||listing.get(LEGACY_PATH)!==expectSha)return null;
  const entries=[],files={};
  for(const [path,text] of Object.entries(splitState(state,{},maxBytes))){const sha=await api.createBlob(text);entries.push({path,sha});files[path]={sha,text};}
  entries.push({path:LEGACY_PATH,sha:await api.createBlob(MOVED_TEXT)});
  const newTree=await api.createTree(tree,entries),commit=await api.createCommit(message,newTree,ref.sha);
  try{await api.updateRef(commit);}catch(e){if(e.conflict)return null;throw e;}
  return {format:2,commit,tree:newTree,etag:null,base:baseOf(state),files};
}
