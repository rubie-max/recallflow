import assert from 'node:assert/strict';
// Test the production service with deterministic media/inference adapters.
// Real Kokoro, IndexedDB persistence, and playback are verified separately in the browser.
globalThis.Audio=class {constructor(){this.paused=true;this.volume=1;this.muted=false;this.currentTime=0;}pause(){this.paused=true;}async play(){this.paused=false;this.onplaying?.();}};
let running=0,maxRunning=0;
globalThis.Worker=class {
  postMessage(data){running++;maxRunning=Math.max(maxRunning,running);setTimeout(()=>{
    running--;
    this.onmessage({data:data.text==='FAIL'?{type:'error',message:'Offline test'}:{type:'audio',samples:new Float32Array([.1,.2,-.1,.3]),sampleRate:24000,device:'webgpu',rms:.2,peak:.3,elapsed:.01}});
  },20);}
  terminate(){}
};
const {audioCache}=await import('./src/audio-cache.js');
const {KokoroVoice,speechKey}=await import('./src/kokoro-service.js');
const disk=new Map();
audioCache.get=async key=>disk.get(key);
audioCache.put=async entry=>disk.set(entry.key,entry);
audioCache.remove=async key=>disk.delete(key);
audioCache.deleteQuestion=async id=>{for(const [key,entry]of disk)if(entry.questionId===id)disk.delete(key);};
const options={questionId:'q1',role:'question',voice:'af_heart',speed:1};
const service=new KokoroVoice();
const a=service.speak('Tokyo?',options),b=service.speak('Tokyo?',options);
assert.equal(a,b,'rapid taps share the exact request');await a;
assert.equal(service.inferences,1);assert.equal(disk.size,1);assert.equal(service.state.evidence.cacheHit,false);
await service.speak('Tokyo?',options);assert.equal(service.inferences,1);assert.equal(service.state.evidence.cacheHit,true);
const reloaded=new KokoroVoice();await reloaded.speak('Tokyo?',options);
assert.equal(reloaded.inferences,0);assert.equal(reloaded.state.evidence.cacheSource,'IndexedDB');assert.equal(reloaded.worker,undefined);
for(const changed of [{voice:'am_michael'},{speed:.9},{role:'answer'},{questionId:'q2'}])await service.speak('Tokyo?',{...options,...changed});
await service.speak('Name Tokyo?',options);assert.equal(service.inferences,6);
await service.speak('Tokyo?',options);assert.equal(service.inferences,6,'switching back retains previous voice audio');
assert.notEqual(speechKey('Tokyo?',options),speechKey('Tokyo?',{...options,backend:'wasm'}));
assert.notEqual(speechKey('____',options),speechKey('____',{...options,spokenText:'blank'}));
const pending=service.speak('Canceled request',options);service.stop();await pending;
assert.equal(service.state.phase,'idle');assert.equal(service.audio.paused,true,'canceled generation never auto-plays');
const first=service.speak('Queued first',options),second=service.speak('Queued second',options);await Promise.all([first,second]);
assert.equal(maxRunning,1,'different requests serialize inference');assert.equal(service.state.evidence.text,'Queued second');
const damagedKey=speechKey('Damaged?',{...options,backend:'auto'});
disk.set(damagedKey,{key:damagedKey,questionId:'q1',blob:new Blob(['invalid']),evidence:{rms:.1,durationSeconds:1}});
await reloaded.speak('Damaged?',options);assert.equal(reloaded.inferences,1);assert.equal(reloaded.state.evidence.cacheHit,false);
await service.deleteQuestion('q1');assert.ok([...disk.values()].every(entry=>entry.questionId!=='q1'));
const deleting=service.speak('Delete during generation',{...options,questionId:'delete-race'});
await new Promise(resolve=>setTimeout(resolve,5));await service.deleteQuestion('delete-race');await deleting;
assert.ok([...disk.values()].every(entry=>entry.questionId!=='delete-race'));
await service.speak('FAIL',options);assert.equal(service.state.phase,'error');assert.match(service.state.status,/Offline test/);
audioCache.put=async()=>{throw new Error('Quota exceeded');};
await service.speak('Storage full?',options);assert.equal(service.state.phase,'playing');assert.match(service.state.evidence.cacheWarning,/Quota/);
const count=service.inferences;await service.speak('Storage full?',options);assert.equal(service.inferences,count,'memory cache still works when persistence fails');
audioCache.clear=async()=>disk.clear();
await service.clearCache();assert.equal(disk.size,0);assert.equal(service.memory.size,0);assert.equal(service.state.evidence,null);assert.equal(service.audio.paused,true);
assert.equal(service.audio.src,'','clearing releases the previously loaded generated clip');assert.equal(service.url,null);
audioCache.put=async entry=>disk.set(entry.key,entry);
const clearDuringGeneration=service.speak('Clear while generating',options);
const cleared=service.clearCache();await Promise.all([clearDuringGeneration,cleared]);assert.equal(disk.size,0);assert.equal(service.memory.size,0);assert.equal(service.audio.paused,true);
console.log('PASS: request deduplication, serialization, persistence reuse, keys, edit/voice/speed isolation, cancellation, corruption, deletion races, and storage/generation failures.');

const preparedService=new KokoroVoice();
const prepared=await preparedService.prepare('Prepared question?',{...options,questionId:'prepared-editor'});
assert.equal(prepared.cacheHit,false);
assert.equal(preparedService.audio.paused,true,'preparing question voice never autoplays');
await preparedService.prepare('Prepared question?',{...options,questionId:'prepared-editor'});
assert.equal(preparedService.inferences,1,'saving the same question reuses audio');
await preparedService.speak('Prepared question?',{...options,questionId:'prepared-editor'});
assert.equal(preparedService.state.evidence.cacheHit,true,'speaker reuses prepared editor audio');
assert.equal(preparedService.inferences,1);
console.log('PASS: editor audio preparation, no autoplay, repeated-save reuse, and speaker cache reuse.');
