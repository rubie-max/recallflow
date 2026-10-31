const CACHE='recallflow-shell-v147';
const IMAGE_CACHE='recallflow-images';
const ROOT=new URL('./',self.location.href);
const FILES=['./','./index.html','./assets/app.js','./assets/app.css','./public/recallflow-logo.png','./public/recallflow-logo.svg','./manifest.webmanifest','./public/icon-192.png','./public/icon-512.png',...['af_heart','af_bella','am_michael','am_fenrir','bf_emma'].map(voice=>'./public/voice-previews/'+voice+'.wav')];
const TYPES={webp:'image/webp',jpg:'image/jpeg',png:'image/png',gif:'image/gif'};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES.map(x=>new URL(x,ROOT).href))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('recallflow-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
function syncAuth(){return new Promise(resolve=>{const req=indexedDB.open('recallflow-sync',1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onerror=()=>resolve(null);req.onsuccess=()=>{const db=req.result;try{const get=db.transaction('kv').objectStore('kv').get('auth');get.onsuccess=()=>{resolve(get.result||null);db.close();};get.onerror=()=>{resolve(null);db.close();};}catch{resolve(null);db.close();}};});}
// Pictures saved by the app live in the private data repo as images/<hash>.<ext>; they never change, so cache first.
async function storedImage(request,name){
  const cache=await caches.open(IMAGE_CACHE),hit=await cache.match(request.url);if(hit)return hit;
  const auth=await syncAuth();if(!auth)return new Response('',{status:404});
  const res=await fetch(`https://api.github.com/repos/${auth.owner}/${auth.repo}/contents/images/${name}`,{headers:{Authorization:`Bearer ${auth.token}`,Accept:'application/vnd.github.raw+json','X-GitHub-Api-Version':'2022-11-28'}}).catch(()=>null);
  if(!res?.ok)return new Response('',{status:res?.status||504});
  const response=new Response(await res.blob(),{headers:{'Content-Type':TYPES[name.split('.').pop()]||'image/png'}});
  await cache.put(request.url,response.clone());return response;
}
async function driveThumbFetch(id){
 const urls=[`https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1600`,`https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`,`https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`];
 for(const u of urls){
  const res=await fetch(u,{redirect:'follow'}).catch(()=>null);
  if(!res?.ok)continue;
  const blob=await res.blob();
  if(blob.type.startsWith('image/')||blob.size>1000)return {blob,type:blob.type.startsWith('image/')?blob.type:(res.headers.get('Content-Type')||'image/jpeg')};
 }
 return null;
}
async function driveThumb(request,id){
 const cache=await caches.open(IMAGE_CACHE),hit=await cache.match(request.url);if(hit)return hit;
 const got=await driveThumbFetch(id);
 if(!got)return new Response('',{status:502});
 const out=new Response(got.blob,{headers:{'Content-Type':got.type,'Cache-Control':'private, max-age=86400'}});
 await cache.put(request.url,out.clone());return out;
}
// Stream a Drive audio/video as a readable same-origin response so <audio>/<video> can play & seek it.
// Google blocks cross-origin media requests to its download URL, so we fetch it inside the worker
// (no cookies -> no "confirm" interstitial) and re-serve the bytes from our own origin with range support.
async function driveMedia(request,id){
 const upstream=`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download`;
 const range=request.headers.get('range');
 const headers={};if(range)headers.Range=range;
 try{
  const r=await fetch(upstream,{credentials:'omit',redirect:'follow',headers});
  if(!r.ok&&r.status!==206)return new Response('',{status:r.status||502});
  const buf=await r.arrayBuffer();
  const out={'Content-Type':r.headers.get('content-type')||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'private, max-age=3600'};
  const cr=r.headers.get('content-range');if(cr)out['Content-Range']=cr;
  return new Response(buf,{status:r.status,headers:out});
 }catch{
  try{return await fetch(upstream,{mode:'no-cors',credentials:'omit',redirect:'follow'});}catch{return new Response('',{status:502});}
 }
}
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.pathname.endsWith('/__reload'))return;const rel=url.pathname.slice(ROOT.pathname.length);const drive=rel.match(/^rf-drive-thumb\/([^/?#]+)$/);if(drive){event.respondWith(driveThumb(event.request,decodeURIComponent(drive[1])));return;}const dmedia=rel.match(/^rf-drive-media\/([^/?#]+)$/);if(dmedia){event.respondWith(driveMedia(event.request,decodeURIComponent(dmedia[1])));return;}const image=rel.match(/^rf-img\/([a-f0-9]{32}\.(?:webp|jpg|png|gif))$/);if(image){event.respondWith(storedImage(event.request,image[1]));return;}if(!FILES.some(x=>new URL(x,ROOT).pathname===url.pathname)&&event.request.mode!=='navigate')return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>{return await caches.match(event.request)|| (event.request.mode==='navigate'?await caches.match(new URL('./index.html',ROOT).href):null)||Response.error();}));});
// Daily reminder. The page keeps its settings, due count and last practice day in REMINDER_CACHE.
// Keep reminderDue in step with src/reminders.js; reminder-tests.mjs compares the two.
const REMINDER_CACHE='recallflow-reminder',REMINDER_KEY='./__rf-reminder',IST_OFFSET=330*60000;
function reminderDue({now=new Date(),settings,lastShown='',dueCount=0,practisedDay=''}){
 const s=settings||{},days=Array.isArray(s.reminderDays)?s.reminderDays:[];
 if(s.reminder!==true||!days.length||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.reminderTime||''))return false;
 const clock=new Date(new Date(now).getTime()+IST_OFFSET),day=clock.toISOString().slice(0,10);
 if(!days.includes(clock.getUTCDay()))return false;
 const [h,m]=s.reminderTime.split(':').map(Number);
 if(clock.getUTCHours()*60+clock.getUTCMinutes()<h*60+m)return false;
 if(lastShown===day)return false;
 if(s.reminderOnlyDue!==false&&!(dueCount>0))return false;
 if(s.reminderSkipDone!==false&&practisedDay===day)return false;
 return true;
}
async function checkReminder(){
 const cache=await caches.open(REMINDER_CACHE),hit=await cache.match(REMINDER_KEY);if(!hit)return;
 const state=await hit.json().catch(()=>null);if(!state||!reminderDue(state))return;
 const open=await self.clients.matchAll({type:'window'});if(open.some(c=>c.visibilityState==='visible'))return;
 const n=state.dueCount||0;
 await self.registration.showNotification(n>0?`${n} ${n===1?'question':'questions'} due`:'Time to practise',{body:n>0?'A few minutes now keeps your streak going.':'Nothing is due, but a quick round keeps it fresh.',icon:new URL('./public/icon-192.png',ROOT).href,badge:new URL('./public/icon-192.png',ROOT).href,tag:'rf-reminder',data:{url:new URL('./#/home',ROOT).href}});
 const day=new Date(Date.now()+IST_OFFSET).toISOString().slice(0,10);
 await cache.put(REMINDER_KEY,new Response(JSON.stringify({...state,lastShown:day}),{headers:{'Content-Type':'application/json'}}));
}
self.addEventListener('periodicsync',event=>{if(event.tag==='rf-reminder')event.waitUntil(checkReminder().catch(()=>{}));});
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification.data?.url||ROOT.href;event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{const win=list.find(c=>c.url.startsWith(ROOT.href));if(win)return win.focus();return self.clients.openWindow(url);}));});
