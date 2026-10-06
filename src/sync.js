// Cloud sync. The app keeps reading and writing localStorage as before; this module mirrors
// that data to data/state.json in a private GitHub repo and stores uploaded pictures there too.
// Sync keys use the rfsync_ prefix so "Delete everything" (which clears recallflow_*) keeps the
// sync base, letting the deletion reach the other devices instead of being undone by them.
const SESSION_KEY='rfsync_session',META_KEY='rfsync_meta',PENDING_KEY='rfsync_pending_images';
const STATE_PATH='data/state.json',IMAGE_CACHE='recallflow-images';
export const IMAGE_DIR='rf-img/';
const BANK='recallflow_bank_v2',REPORTS='recallflow_reports',STREAK='recallflow_streak_days',COUNT='recallflow_quiz_count';
export const PREF_KEYS=['recallflow_theme','recallflow_app_preferences_v1','recallflow_quiz_preferences_v1','recallflow_quiz_setups_v1','recallflow_kokoro_voice','recallflow_kokoro_speed','recallflow_speech_engine','recallflow_system_voice','recallflow_system_rate','recallflow_voice_prefetch'];
const SYNCED_KEYS=new Set([BANK,REPORTS,STREAK,COUNT,...PREF_KEYS]);
const EXT={'image/webp':'webp','image/jpeg':'jpg','image/png':'png','image/gif':'gif'};

// ---------- pure helpers (unit tested) ----------
export function hash(value){
  const s=typeof value==='string'?value:JSON.stringify(value??null);let h1=0xdeadbeef,h2=0x41c6ce57;
  for(let i=0;i<s.length;i++){const c=s.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(36)+(h1>>>0).toString(36);
}
export function hashMap(list,key=x=>x.id){return Object.fromEntries(list.map(x=>[key(x),hash(x)]));}

// Three-way merge by id. base is {id:hash} from the last sync (null on a device that never synced).
// A side "changed" an entry when its hash differs from base; local edits win when both changed.
export function mergeLists(base,local,remote,{key=x=>x.id,keepLocalOnFirstSync=()=>true}={}){
  const L=new Map(local.map(x=>[key(x),x])),R=new Map(remote.map(x=>[key(x),x]));
  const ids=local.map(key),out=[];let at=0;
  for(const id of remote.map(key)){const i=ids.indexOf(id);if(i>=0)at=i+1;else ids.splice(at++,0,id);}
  for(const id of ids){
    const l=L.get(id),r=R.get(id),b=base?.[id];let pick;
    if(!base)pick=r!==undefined?r:(keepLocalOnFirstSync(l)?l:undefined);
    else if(l!==undefined&&r!==undefined)pick=hash(l)!==b?l:r;
    else if(l!==undefined)pick=b===undefined||hash(l)!==b?l:undefined;
    else pick=b===undefined||hash(r)!==b?r:undefined;
    if(pick!==undefined)out.push(pick);
  }
  return out;
}
const reportTime=r=>Number(String(r.id||'').replace(/\D/g,''))||0;
export function mergeState(base,local,remote){
  const first=!base;
  const items=mergeLists(first?null:base.items,local.items,remote.items,{keepLocalOnFirstSync:x=>!String(x.id).startsWith('demo_')});
  const reports=mergeLists(first?null:base.reports,local.reports,remote.reports).sort((a,b)=>reportTime(b)-reportTime(a));
  const streakDays=mergeLists(first?null:base.streak,local.streakDays,remote.streakDays,{key:x=>x}).sort();
  const quizCount=first?local.quizCount+remote.quizCount:Math.max(0,remote.quizCount+local.quizCount-(base.count||0));
  const prefs={};
  for(const k of PREF_KEYS){const l=local.prefs[k]??null,r=remote.prefs?.[k]??null;prefs[k]=first?(r!==null?r:l):(l!==(base.prefs?.[k]??null)?l:r);}
  return {items,reports,streakDays,quizCount,prefs};
}
export function baseOf(state){return {items:hashMap(state.items),reports:hashMap(state.reports),streak:Object.fromEntries(state.streakDays.map(d=>[d,hash(d)])),count:state.quizCount,prefs:{...state.prefs}};}
const parse=(raw,fallback)=>{try{return raw==null?fallback:JSON.parse(raw);}catch{return fallback;}};
export function normalizeState(s){return {items:Array.isArray(s?.items)?s.items:[],reports:Array.isArray(s?.reports)?s.reports:[],streakDays:Array.isArray(s?.streakDays)?s.streakDays:[],quizCount:Number(s?.quizCount)||0,prefs:s?.prefs&&typeof s.prefs==='object'?s.prefs:{}};}

// ---------- session ----------
const b64=bytes=>{let s='';const a=new Uint8Array(bytes);for(let i=0;i<a.length;i+=0x8000)s+=String.fromCharCode(...a.subarray(i,i+0x8000));return btoa(s);};
const unb64=text=>Uint8Array.from(atob(String(text).replace(/\s/g,'')),c=>c.charCodeAt(0));
const utf8=text=>new TextEncoder().encode(text);
export async function vaultKey(username,password,salt,iterations){
  const material=await crypto.subtle.importKey('raw',utf8(`${username.trim().toLowerCase()}\n${password}`),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations},material,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
export async function sealVault(username,password,secret,iterations=600000){
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await vaultKey(username,password,salt,iterations),utf8(JSON.stringify(secret)));
  return {version:1,iterations,salt:b64(salt),iv:b64(iv),data:b64(data)};
}
export async function openVault(vault,username,password){
  const key=await vaultKey(username,password,unb64(vault.salt),vault.iterations);
  try{return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(vault.iv)},key,unb64(vault.data))));}
  catch{throw new Error('Wrong username or password.');}
}
function authDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('recallflow-sync',1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function mirrorAuth(auth){try{const db=await authDb();await new Promise(r=>{const tx=db.transaction('kv','readwrite');auth?tx.objectStore('kv').put({token:auth.token,owner:auth.owner,repo:auth.repo},'auth'):tx.objectStore('kv').delete('auth');tx.oncomplete=tx.onerror=r;});db.close();}catch{}}
export function session(){return parse(localStorage.getItem(SESSION_KEY),null);}
export async function signIn(username,password){
  const res=await fetch(new URL('public/sync-vault.json',document.baseURI),{cache:'no-store'}).catch(()=>null);
  if(!res?.ok)throw new Error(res?'Sign-in is not set up on this site yet.':'You are offline. Connect to the internet to sign in.');
  const secret=await openVault(await res.json(),username,password);
  const auth={user:username.trim(),token:secret.token,owner:secret.owner,repo:secret.repo};
  localStorage.setItem(SESSION_KEY,JSON.stringify(auth));await mirrorAuth(auth);return auth;
}
export async function signOut(){localStorage.removeItem(SESSION_KEY);await mirrorAuth(null);setStatus({state:'signed-out'});window.dispatchEvent(new Event('recallflow:session'));}

// ---------- GitHub API ----------
async function gh(auth,path,init={}){
  const res=await fetch(`https://api.github.com/repos/${auth.owner}/${auth.repo}/${path}`,{cache:'no-store',...init,headers:{Authorization:`Bearer ${auth.token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(init.headers||{})}});
  if(res.status===401)throw Object.assign(new Error('The saved GitHub key has expired. Ask for a new one, then sign in again.'),{status:401});
  return res;
}
async function readRemote(auth,etag){
  const res=await gh(auth,`contents/${STATE_PATH}`,{headers:etag?{'If-None-Match':etag}:{}});
  if(res.status===304)return {unchanged:true};
  if(res.status===404)return {state:null,sha:null};
  if(!res.ok)throw new Error(`GitHub said ${res.status} while reading your data.`);
  const meta=await res.json();let content=meta.encoding==='base64'&&meta.content?meta.content:'';
  if(!content){const blob=await gh(auth,`git/blobs/${meta.sha}`);content=(await blob.json()).content;}
  return {state:normalizeState(JSON.parse(new TextDecoder().decode(unb64(content)))),sha:meta.sha,etag:res.headers.get('ETag')};
}
async function writeRemote(auth,state,sha){
  const body={message:`Sync from ${navigator.userAgent.includes('Mobile')?'phone':'computer'}`,content:b64(utf8(JSON.stringify({app:'RecallFlow',version:1,updatedAt:new Date().toISOString(),...state}))),branch:'main',...(sha?{sha}:{})};
  const res=await gh(auth,`contents/${STATE_PATH}`,{method:'PUT',body:JSON.stringify(body)});
  if(res.status===409||res.status===422)throw Object.assign(new Error('conflict'),{conflict:true});
  if(!res.ok)throw new Error(`GitHub said ${res.status} while saving your data.`);
  return (await res.json()).content.sha;
}

// ---------- pictures ----------
const imageUrl=name=>new URL(IMAGE_DIR+name,document.baseURI).href;
const pending=()=>parse(localStorage.getItem(PENDING_KEY),[]);
const setPending=list=>localStorage.setItem(PENDING_KEY,JSON.stringify([...new Set(list)]));
export const pendingImageCount=()=>pending().length;
export const isStoredImage=src=>typeof src==='string'&&src.startsWith(IMAGE_DIR);

// Moves a data: URL picture into the picture cache and queues it for upload; returns its rf-img/ path.
export async function storeImage(src){
  if(!session()||typeof src!=='string'||!src.startsWith('data:image/'))return src;
  const blob=await (await fetch(src)).blob();
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()));
  const name=[...digest.slice(0,16)].map(b=>b.toString(16).padStart(2,'0')).join('')+'.'+(EXT[blob.type]||'png');
  await (await caches.open(IMAGE_CACHE)).put(imageUrl(name),new Response(blob,{headers:{'Content-Type':blob.type||'image/png'}}));
  setPending([...pending(),name]);schedule();
  return IMAGE_DIR+name;
}
async function imageBlob(name){
  const cache=await caches.open(IMAGE_CACHE),hit=await cache.match(imageUrl(name));if(hit)return hit.blob();
  const auth=session();if(!auth)return null;
  const res=await gh(auth,`contents/images/${name}`,{headers:{Accept:'application/vnd.github.raw+json'}});if(!res.ok)return null;
  const blob=await res.blob(),typed=new Blob([blob],{type:Object.entries(EXT).find(([,e])=>name.endsWith('.'+e))?.[0]||'image/png'});
  await cache.put(imageUrl(name),new Response(typed,{headers:{'Content-Type':typed.type}}));return typed;
}
async function mapImages(items,fn){
  let changed=false;const conv=async v=>{const n=await fn(v);if(n!==v)changed=true;return n;};
  const convOptions=async o=>o?Object.fromEntries(await Promise.all(Object.entries(o).map(async([k,v])=>[k,await conv(v)]))):o;
  const out=await Promise.all(items.map(async item=>{const x={...item};
    if(x.image)x.image=await conv(x.image);if(x.answerImage)x.answerImage=await conv(x.answerImage);
    if(x.optionImages)x.optionImages=await convOptions(x.optionImages);
    if(Array.isArray(x.variants))x.variants=await Promise.all(x.variants.map(async v=>v.optionImages?{...v,optionImages:await convOptions(v.optionImages)}:v));
    return x;}));
  return {items:out,changed};
}
// For exports to other apps or accounts: turns rf-img/ paths back into embedded pictures.
export async function inlineImages(items){
  return (await mapImages(items,async v=>{if(!isStoredImage(v))return v;const blob=await imageBlob(v.slice(IMAGE_DIR.length));if(!blob)return v;return `data:${blob.type};base64,${b64(await blob.arrayBuffer())}`;})).items;
}
async function uploadPending(auth){
  const cache=await caches.open(IMAGE_CACHE);
  for(const name of pending()){
    const hit=await cache.match(imageUrl(name));
    if(hit){const res=await gh(auth,`contents/images/${name}`,{method:'PUT',body:JSON.stringify({message:`Add picture ${name}`,content:b64(await hit.arrayBuffer()),branch:'main'})});
      if(!res.ok&&res.status!==422)throw new Error(`GitHub said ${res.status} while uploading a picture.`);}
    setPending(pending().filter(x=>x!==name));
  }
}
// Pictures shown before the service worker controls the page are loaded here instead.
function rescueImages(){document.addEventListener('error',e=>{const img=e.target;if(!(img instanceof HTMLImageElement))return;const src=img.getAttribute('src')||'';if(!isStoredImage(src)||img.dataset.rfRescued)return;img.dataset.rfRescued='1';imageBlob(src.slice(IMAGE_DIR.length)).then(blob=>{if(blob)img.src=URL.createObjectURL(blob);}).catch(()=>{});},true);}

// ---------- sync engine ----------
let status={state:'idle'},running=null,again=false,timer=0,suppress=false;
function setStatus(next){status={...status,...next};window.dispatchEvent(new CustomEvent('recallflow:sync-status',{detail:status}));}
export const syncStatus=()=>({...status,lastSynced:parse(localStorage.getItem(META_KEY),null)?.syncedAt||0,pendingImages:pendingImageCount()});
function readLocal(){
  const prefs={};for(const k of PREF_KEYS)prefs[k]=localStorage.getItem(k);
  return {items:parse(localStorage.getItem(BANK),[]),reports:parse(localStorage.getItem(REPORTS),[]),streakDays:parse(localStorage.getItem(STREAK),[]),quizCount:Number(localStorage.getItem(COUNT)||0)||0,prefs};
}
function applyLocal(state){
  suppress=true;
  try{
    localStorage.setItem(BANK,JSON.stringify(state.items));localStorage.setItem(REPORTS,JSON.stringify(state.reports));
    localStorage.setItem(STREAK,JSON.stringify(state.streakDays));localStorage.setItem(COUNT,String(state.quizCount));
    for(const k of PREF_KEYS){const v=state.prefs[k];if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,v);}
  }finally{suppress=false;}
  window.dispatchEvent(new Event('recallflow:remote-update'));
}
async function syncOnce(auth){
  const local0=readLocal(),moved=await mapImages(local0.items,storeImage);
  if(moved.changed){suppress=true;try{localStorage.setItem(BANK,JSON.stringify(moved.items));}finally{suppress=false;}window.dispatchEvent(new Event('recallflow:remote-update'));}
  await uploadPending(auth);
  const meta=parse(localStorage.getItem(META_KEY),null),local=readLocal(),localHash=hash(local);
  const remote=await readRemote(auth,meta?.etag);
  let merged=local,sha=meta?.sha||null,etag=remote.etag||null;
  if(remote.unchanged){if(localHash===meta.stateHash)return;}
  else{sha=remote.sha;merged=remote.state?mergeState(meta?.base||null,local,remote.state):meta?.base?local:mergeState(null,local,normalizeState(null));}
  if(hash(readLocal())!==localHash){again=true;return;}
  if(hash(merged)!==localHash||localStorage.getItem(BANK)===null)applyLocal(merged);
  if(remote.unchanged||!remote.state||hash(merged)!==hash(remote.state)){sha=await writeRemote(auth,merged,sha);etag=null;}
  localStorage.setItem(META_KEY,JSON.stringify({base:baseOf(merged),stateHash:hash(merged),sha,etag,syncedAt:Date.now()}));
}
export function syncNow(){
  const auth=session();if(!auth)return Promise.resolve();
  if(running){again=true;return running;}
  if(!navigator.onLine){setStatus({state:'offline'});return Promise.resolve();}
  setStatus({state:'syncing',error:''});
  running=(async()=>{
    try{let tries=0;do{again=false;try{await syncOnce(auth);}catch(e){if(!e.conflict||++tries>4)throw e;const m=parse(localStorage.getItem(META_KEY),null);if(m)localStorage.setItem(META_KEY,JSON.stringify({...m,etag:null}));again=true;}}while(again);setStatus({state:'synced',error:''});}
    catch(e){setStatus({state:navigator.onLine?'error':'offline',error:e.message});}
    finally{running=null;}
  })();
  return running;
}
function schedule(){clearTimeout(timer);timer=setTimeout(syncNow,2500);}
let started=false;
export function startSync(){
  if(started)return;started=true;rescueImages();
  const set=Storage.prototype.setItem,remove=Storage.prototype.removeItem;
  const touched=(store,key)=>{if(store===localStorage&&!suppress&&SYNCED_KEYS.has(key)&&session())schedule();};
  Storage.prototype.setItem=function(key,value){set.call(this,key,value);touched(this,key);};
  Storage.prototype.removeItem=function(key){remove.call(this,key);touched(this,key);};
  window.addEventListener('online',()=>syncNow());window.addEventListener('offline',()=>setStatus({state:'offline'}));
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')syncNow();else if(timer){clearTimeout(timer);syncNow();}});
  setInterval(()=>{if(document.visibilityState==='visible')syncNow();},60000);
}
