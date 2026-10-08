const CACHE='recallflow-shell-v36';
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
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname)||url.pathname.endsWith('/__reload'))return;const image=url.pathname.slice(ROOT.pathname.length).match(/^rf-img\/([a-f0-9]{32}\.(?:webp|jpg|png|gif))$/);if(image){event.respondWith(storedImage(event.request,image[1]));return;}if(!FILES.some(x=>new URL(x,ROOT).pathname===url.pathname)&&event.request.mode!=='navigate')return;event.respondWith(fetch(event.request).then(response=>{if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));}return response;}).catch(async()=>{return await caches.match(event.request)|| (event.request.mode==='navigate'?await caches.match(new URL('./index.html',ROOT).href):null)||Response.error();}));});
