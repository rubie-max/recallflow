// The question bank can outgrow localStorage (about 5 MB per site), so it is kept in IndexedDB.
// A memory copy keeps localStorage.getItem/setItem/removeItem for this one key synchronous,
// so the rest of the app and cloud sync keep working unchanged.
export const BANK_KEY='recallflow_bank_v2';

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

function idbBackend(){
  const db=new Promise((resolve,reject)=>{const req=indexedDB.open('recallflow-bank',1);req.onupgradeneeded=()=>req.result.createObjectStore('kv');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
  const run=(mode,fn)=>db.then(d=>new Promise((resolve,reject)=>{const tx=d.transaction('kv',mode),req=fn(tx.objectStore('kv'));tx.oncomplete=()=>resolve(req.result);tx.onerror=tx.onabort=()=>reject(tx.error||new Error('Saving failed.'));}));
  return {get:()=>run('readonly',s=>s.get(BANK_KEY)),put:v=>run('readwrite',s=>s.put(v,BANK_KEY)),del:()=>run('readwrite',s=>s.delete(BANK_KEY))};
}

// Falls back to plain localStorage (today's behaviour) when IndexedDB is missing or fails to load.
export async function startBankStore(){
  if(typeof indexedDB==='undefined')return false;
  const proto=Storage.prototype,get=proto.getItem,set=proto.setItem,remove=proto.removeItem;
  const store=createBankStore(idbBackend(),()=>window.dispatchEvent(new Event('recallflow:storage-full')));
  try{await store.load(get.call(localStorage,BANK_KEY));}catch{return false;}
  remove.call(localStorage,BANK_KEY);
  proto.getItem=function(k){return this===localStorage&&k===BANK_KEY?store.get():get.call(this,k);};
  proto.setItem=function(k,v){if(this===localStorage&&k===BANK_KEY)void store.set(v);else set.call(this,k,v);};
  proto.removeItem=function(k){if(this===localStorage&&k===BANK_KEY)void store.remove();else remove.call(this,k);};
  void navigator.storage?.persist?.().catch(()=>{});
  return true;
}
