// Only generated audio lives here; other RecallFlow data stays in localStorage.
let database;
const cacheListeners=new Set();
function changed(result){cacheListeners.forEach(listener=>{try{listener();}catch{}});return result;}
function open() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('Local audio storage is unsupported.'));
  if (!database) database=new Promise((resolve,reject)=>{
    const request=indexedDB.open('recallflow-kokoro-audio',1);
    request.onupgradeneeded=()=>{const store=request.result.createObjectStore('audio',{keyPath:'key'});store.createIndex('questionId','questionId');};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=undefined;};resolve(db);};
    request.onerror=()=>{database=undefined;reject(request.error);};
    request.onblocked=()=>{database=undefined;reject(new Error('Audio storage is blocked by another tab.'));};
  });
  return database;
}
async function operation(mode,action) {
  const db=await open();
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction('audio',mode);let result;
    action(transaction.objectStore('audio'),value=>{result=value;});
    transaction.oncomplete=()=>resolve(result);
    transaction.onerror=transaction.onabort=()=>reject(transaction.error||new Error('Audio storage failed.'));
  });
}
export const audioCache={
  subscribe:listener=>{cacheListeners.add(listener);return()=>cacheListeners.delete(listener);},
  get:key=>operation('readonly',(store,done)=>{const r=store.get(key);r.onsuccess=()=>done(r.result);}),
  put:entry=>operation('readwrite',store=>store.put(entry)).then(changed),
  remove:key=>operation('readwrite',store=>store.delete(key)).then(changed),
  clear:()=>operation('readwrite',store=>store.clear()).then(changed),
  stats:()=>operation('readonly',(store,done)=>{
    let count=0,bytes=0;const request=store.openCursor();
    request.onsuccess=()=>{const cursor=request.result;if(cursor){count++;bytes+=cursor.value.blob?.size||0;cursor.continue();}else done({count,bytes});};
  }),
  deleteQuestion:questionId=>operation('readwrite',(store,done)=>{
    let deleted=0;const request=store.index('questionId').openCursor(IDBKeyRange.only(questionId));
    request.onsuccess=()=>{const cursor=request.result;if(cursor){cursor.delete();deleted++;cursor.continue();}else done(deleted);};
  }).then(changed),
};
export async function validAudio(entry) {
  try {
  if(!(entry?.blob instanceof Blob)||entry.blob.size<46||entry.blob.type!=='audio/wav'||!entry.evidence?.durationSeconds||!(entry.evidence.rms>0.00001))return false;
  const bytes=new DataView(await entry.blob.slice(0,44).arrayBuffer());
  return bytes.getUint32(0)===0x52494646&&bytes.getUint32(8)===0x57415645&&bytes.getUint32(40,true)===entry.blob.size-44&&bytes.getUint32(24,true)===entry.evidence.sampleRate;
  }catch{return false;}
}
