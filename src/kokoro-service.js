import {audioCache,validAudio} from './audio-cache.js';
import {voicePreferences} from './voice-preferences.js';
const model='onnx-community/Kokoro-82M-v1.0-ONNX';
export function speechKey(text,options) {
  return JSON.stringify({version:2,engine:'kokoro-js@1.2.1',model,precision:'webgpu-fp32/wasm-q8',questionId:options.questionId,role:options.role,text,spokenText:options.spokenText,voice:options.voice,speed:options.speed,backend:options.backend||'auto'});
}
export class KokoroVoice {
  constructor() {
    this.audio=new Audio();this.audio.controls=true;this.token=0;this.listeners=new Set();
    this.requests=new Map();this.memory=new Map();this.deleted=new Map();this.queue=Promise.resolve();
    this.inferences=0;this.state={phase:'idle',status:'Ready.',owner:null,evidence:null};
  }
  subscribe(listener) {this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  publish(change) {this.state={...this.state,...change};this.listeners.forEach(fn=>fn(this.state));}
  stop() {this.token++;this.audio.pause();const evidence=this.state.phase==='playing'&&this.state.evidence?{...this.state.evidence,playback:'Stopped',playedSeconds:this.audio.currentTime,paused:true}:this.state.evidence;this.publish({phase:'idle',owner:null,status:'Audio stopped.',evidence});}
  stopOwner(owner) {if(this.state.owner===owner)this.stop();}
  async deleteQuestion(id) {
    this.deleted.set(id,(this.deleted.get(id)||0)+1);
    for(const [key,entry] of this.memory)if(entry.questionId===id)this.memory.delete(key);
    try {await audioCache.deleteQuestion(id);}catch{}
  }
  async clearCache() {
    this.stop();
    this.publish({phase:"clearing",status:"Clearing generated audio…"});
    try {
    // Wait for pending work before clearing, so it cannot repopulate the cache afterwards.
    await Promise.allSettled([...this.requests.values()]);
    await audioCache.clear();this.memory.clear();
    if(this.url)URL.revokeObjectURL(this.url);this.url=null;this.audio.src='';this.audio.load?.();
    this.publish({phase:'idle',evidence:null,status:'Generated audio cleared.'});
    }catch(error){this.publish({phase:'error',status:'Could not clear generated audio.'});throw error;}
  }
  ensureWorker() {
    if(this.worker)return;
    this.worker=new Worker(new URL('./tts-worker.js',import.meta.url),{type:'module'});
    this.worker.onmessage=({data})=>{
      const request=this.workerRequest;if(!request)return;
      if(data.type==='status'||data.type==='fallback') {
        request.onProgress?.(data.message.startsWith('Generating')?'Generating voice…':'Loading voice model…');
        if(data.type==='fallback')request.fallback=data.message;
        if(this.state.key===request.key&&['checking','loading','generating'].includes(this.state.phase))this.publish({phase:data.message.startsWith('Generating')?'generating':'loading',status:data.message.startsWith('Generating')?'Generating voice…':'Loading Kokoro…'});
      }else if(data.type==='audio'||data.type==='error') {
        clearTimeout(request.timeout);this.workerRequest=null;
        data.type==='audio'?request.resolve({...data,fallbackReason:request.fallback}):request.reject(new Error(data.message));
      }
    };
    this.worker.onerror=event=>this.failWorker(new Error(event.message||'Kokoro could not start in this browser.'));
    this.worker.onmessageerror=()=>this.failWorker(new Error('This browser could not receive Kokoro audio.'));
  }
  failWorker(error) {
    if(this.workerRequest){clearTimeout(this.workerRequest.timeout);this.workerRequest.reject(error);this.workerRequest=null;}
    this.worker?.terminate();this.worker=null;
  }
  generate(text,options,key,onProgress) {
    const run=this.queue.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{
      try {
        this.ensureWorker();this.inferences++;
        this.workerRequest={resolve,reject,key,onProgress,timeout:setTimeout(()=>this.failWorker(new Error('Kokoro took too long to load. Check your connection and retry.')),300000)};
        this.worker.postMessage({text,...options});
      }catch(error){this.failWorker(error);reject(error);}
    }));
    this.queue=run;return run;
  }
  async obtain(text,options,key,onProgress) {
    const started=performance.now();let cacheWarning;
    const deletionVersion=this.deleted.get(options.questionId)||0;
    let entry=this.memory.get(key),source=entry?'memory':'IndexedDB';
    if(!entry)try{entry=await audioCache.get(key);}catch(error){cacheWarning=`Audio storage unavailable: ${error.message}`;}
    if(entry&&await validAudio(entry))return {...entry,cacheHit:true,cacheSource:source,lookupMilliseconds:performance.now()-started,cacheWarning};
    if(entry){this.memory.delete(key);try{await audioCache.remove(key);}catch{}cacheWarning='Damaged cached audio was replaced.';}
    if(this.state.key===key&&this.state.phase==='checking')this.publish({phase:'generating',status:'Generating voice…'});
    const {samples,sampleRate,device,rms,peak,elapsed,fallbackReason}=await this.generate(text,options,key,onProgress);
    if(!Number.isFinite(sampleRate)||sampleRate<=0)throw new Error('Kokoro returned an invalid audio sample rate.');
    entry={key,questionId:options.questionId,blob:toWav(samples,sampleRate),evidence:{model,voice:options.voice,speed:options.speed,role:options.role,questionId:options.questionId,text,spokenText:options.spokenText,backend:device,sampleRate,durationSeconds:samples.length/sampleRate,rms,peak,generationSeconds:elapsed,fallbackReason},createdAt:new Date().toISOString()};
    if(deletionVersion===(this.deleted.get(options.questionId)||0)) {
      this.memory.set(key,entry);
      try{await audioCache.put(entry);}catch(error){cacheWarning=`Audio plays, but could not be saved for your next visit: ${error.message}`;}
    }
    return {...entry,cacheHit:false,cacheSource:'generated',lookupMilliseconds:performance.now()-started,cacheWarning};
  }
  async prepare(text,settings={},onProgress=()=>{}) {
    const options={...voicePreferences(),backend:'auto',...settings};
    const key=speechKey(text,options);
    onProgress('Checking saved voice…');
    let request=this.requests.get(key);
    if(!request){request=this.obtain(text,options,key,onProgress);this.requests.set(key,request);request.finally(()=>{if(this.requests.get(key)===request)this.requests.delete(key);}).catch(()=>{});}
    const entry=await request;
    this.publish({status:'Question voice prepared.'});
    return entry;
  }
  speak(text,settings={}) {
    if(this.state.phase==='clearing')return Promise.resolve();
    const options={...voicePreferences(),backend:'auto',questionId:'voice-preview',role:'preview',...settings};
    const key=speechKey(text,options);
    if(this.state.key===key&&['checking','loading','generating'].includes(this.state.phase)&&this.playPromise)return this.playPromise;
    this.stop();const token=this.token;
    this.publish({owner:settings.owner||key,key,phase:'checking',status:'Checking saved audio…'});
    this.playPromise=this.play(text,options,key,token);return this.playPromise;
  }
  async play(text,options,key,token,retry=false) {
    try {
      let request=this.requests.get(key);
      if(!request){request=this.obtain(text,options,key);this.requests.set(key,request);request.finally(()=>{if(this.requests.get(key)===request)this.requests.delete(key);}).catch(()=>{});}
      const entry=await request;if(token!==this.token)return;
      if(this.url)URL.revokeObjectURL(this.url);
      this.url=URL.createObjectURL(entry.blob);this.audio.src=this.url;
      const evidence={...entry.evidence,cacheHit:entry.cacheHit,cacheSource:entry.cacheSource,requestMilliseconds:entry.lookupMilliseconds,inferenceCount:this.inferences,workerLoaded:!!this.worker,cacheWarning:entry.cacheWarning,playback:'Ready',testedAt:new Date().toISOString()};
      const update=change=>{if(token===this.token)this.publish({evidence:{...this.state.evidence,...change}});};
      this.publish({evidence});
      this.audio.onplaying=()=>{if(token!==this.token)return;update({playback:'Playing',playingEvent:true,volume:this.audio.volume,muted:this.audio.muted});this.publish({phase:'playing',status:entry.cacheHit?'Playing saved Kokoro audio.':'Playing Kokoro speech. Saved for next time.'});};
      this.audio.ontimeupdate=()=>update({playedSeconds:this.audio.currentTime});
      this.audio.onended=()=>{if(token!==this.token)return;update({playback:'Completed',endedEvent:true,playedSeconds:this.audio.currentTime});this.publish({phase:'idle',status:entry.cacheWarning||'Playback completed.'});};
      let recoveryStarted=false;
      const recover=async()=>{
        if(recoveryStarted)return;
        recoveryStarted=true;this.memory.delete(key);await audioCache.remove(key).catch(()=>{});
        if(token!==this.token)return;
        this.publish({phase:'generating',status:'Saved audio could not play. Regenerating…'});
        return this.play(text,options,key,token,true);
      };
      this.audio.onerror=()=>{
        if(token!==this.token)return;
        this.memory.delete(key);audioCache.remove(key).catch(()=>{});
        if(entry.cacheHit&&!retry){void recover();}
        else{update({playback:'Failed'});this.publish({phase:'error',status:'Kokoro audio could not play in this browser. You can continue the quiz and retry.'});}
      };
      try{await this.audio.play();}catch(error){
        if(token!==this.token)return;
        if(error.name==='NotSupportedError'&&entry.cacheHit&&!retry)return recover();
        update({playback:'Failed'});this.publish({phase:'error',status:'Audio is ready. Tap the speaker again to allow playback, or use the preview player.'});
      }
      return evidence;
    }catch(error){if(token===this.token)this.publish({phase:'error',status:`Could not play Kokoro: ${error.message}. You can continue without voice.`});}
  }
}
export const kokoroVoice=new KokoroVoice();
function toWav(samples,rate) {
  const b=new ArrayBuffer(44+samples.length*2),d=new DataView(b);
  const str=(offset,value)=>[...value].forEach((c,i)=>d.setUint8(offset+i,c.charCodeAt(0)));
  str(0,'RIFF');d.setUint32(4,b.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');d.setUint32(16,16,true);d.setUint16(20,1,true);d.setUint16(22,1,true);d.setUint32(24,rate,true);d.setUint32(28,rate*2,true);d.setUint16(32,2,true);d.setUint16(34,16,true);str(36,'data');d.setUint32(40,samples.length*2,true);
  samples.forEach((s,i)=>d.setInt16(44+i*2,Math.max(-1,Math.min(1,s))*(s<0?32768:32767),true));
  return new Blob([b],{type:'audio/wav'});
}
