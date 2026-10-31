// The question bank and the sync records that grow with it can outgrow localStorage (about 5 MB per site),
// so they are kept in IndexedDB. A memory copy keeps localStorage.getItem/setItem/removeItem for these keys
// synchronous, so the rest of the app and cloud sync keep working unchanged.
export const BANK_KEY='recallflow_bank_v2';
export const BIG_KEYS=[BANK_KEY,'rfsync_meta','rfsync_pages'];

export function createBankStore(backend,onError){
  let value=null,latest=0,queue=Promise.resolve();
  const save=v=>{const n=++latest;queue=queue.then(()=>n===latest?(v==null?backend.del():backend.put(v)):undefined).catch(e=>onError(e));return queue;};
  return {
    async load(legacy){const stored=await backend.get();if(stored!=null){value=stored;return 'stored';}value=legacy;if(legacy!=null)await backend.put(legacy);return legacy!=null?'migrated':'empty';},
    get:()=>value,
    set(v){value=String(v);return save(value);},
    remove(){value=null;return save(null);},
    flush:()=>queue
  };
}

let database=null;
function idbBackend(key){
  database??=new Promise((resolve,reject)=>{const req=indexedDB.open('recallflow-bank',1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const run=(mode,fn)=>database.then(d=>new Promise((resolve,reject)=>{const tx=d.transaction('kv',mode),req=fn(tx.objectStore('kv'));tx.oncomplete=()=>resolve(req.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Saving failed.'));}));
  return {get:()=>run('readonly',s=>s.get(key)),put:v=>run('readwrite',s=>s.put(v,key)),del:()=>run('readwrite',s=>s.delete(key))};
}

// Each key falls back to plain localStorage on its own when IndexedDB is missing or fails to load it.
export async function startBankStore(){
  if(typeof indexedDB==='undefined')return false;
  const proto=Storage.prototype,get=proto.getItem,set=proto.setItem,remove=proto.removeItem;
  const full=()=>window.dispatchEvent(new Event('recallflow:storage-full'));
  const stores=new Map();
  await Promise.all(BIG_KEYS.map(async key=>{const store=createBankStore(idbBackend(key),full);try{await store.load(get.call(localStorage,key));stores.set(key,store);}catch{}}));
  if(!stores.size)return false;
  for(const key of stores.keys())remove.call(localStorage,key);
  const big=(self,k)=>self===localStorage?stores.get(k):undefined;
  proto.getItem=function(k){const s=big(this,k);return s?s.get():get.call(this,k);};
  proto.setItem=function(k,v){const s=big(this,k);if(s)void s.set(v);else set.call(this,k,v);};
  proto.removeItem=function(k){const s=big(this,k);if(s)void s.remove();else remove.call(this,k);};
  void navigator.storage?.persist?.().catch(()=>{});
  return stores.has(BANK_KEY);
}
