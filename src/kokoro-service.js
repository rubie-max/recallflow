import {audioCache,validAudio} from './audio-cache.js';
import {voicePreferences,speechEngine,systemVoicePreferences,prefetchEnabled,kokoroUsedBefore,markKokoroUsed} from './voice-preferences.js';
const model='onnx-community/Kokoro-82M-v1.0-ONNX';
const USER_PRIORITY=10;
export function speechKey(text,options) {
  return JSON.stringify({version:2,engine:'kokoro-js@1.2.1',model,precision:'webgpu-fp32/wasm-q8',questionId:options.questionId,role:options.role,text,spokenText:options.spokenText,voice:options.voice,speed:options.speed,backend:options.backend||'auto'});
}
export class KokoroVoice {
  constructor() {
    this.audio=new Audio();this.audio.controls=true;this.token=0;this.listeners=new Set();
    this.requests=new Map();this.memory=new Map();this.deleted=new Map();this.jobs=[];this.running=null;this.seq=0;
    this.inferences=0;this.state={phase:'idle',status:'Ready.',owner:null,evidence:null};
  }
  subscribe(listener) {this.listeners.add(listener);return ()=>this.listeners.delete(listener);}
  publish(change) {this.state={...this.state,...change};this.listeners.forEach(fn=>fn(this.state));}
  stop() {this.token++;this.audio.pause();globalThis.speechSynthesis?.cancel();const evidence=this.state.phase==='playing'&&this.state.evidence?{...this.state.evidence,playback:'Stopped',playedSeconds:this.audio.currentTime,paused:true}:this.state.evidence;this.publish({phase:'idle',owner:null,status:'Audio stopped.',evidence});}
  stopOwner(owner) {if(this.state.owner===owner)this.stop();}
  async deleteQuestion(id) {
    this.deleted.set(id,(this.deleted.get(id)||0)+1);
    for(const [key,entry] of this.memory)if(entry.questionId===id)this.memory.delete(key);
    try {await audioCache.deleteQuestion(id);}catch{}
  }
  async clearCache() {
    this.stop();this.cancelPrefetch();
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
      }else if(data.type==='audio'||data.type==='ready'||data.type==='error') {
        clearTimeout(request.timeout);this.workerRequest=null;
        data.type==='error'?request.reject(new Error(data.message)):request.resolve({...data,fallbackReason:request.fallback});
      }
    };
    this.worker.onerror=event=>this.failWorker(new Error(event.message||'Kokoro could not start in this browser.'));
    this.worker.onmessageerror=()=>this.failWorker(new Error('This browser could not receive Kokoro audio.'));
  }
  failWorker(error) {
    if(this.workerRequest){clearTimeout(this.workerRequest.timeout);const request=this.workerRequest;this.workerRequest=null;request.reject(error);}
    this.worker?.terminate();this.worker=null;
  }
  generate(text,options,key,onProgress,priority=USER_PRIORITY) {
    return new Promise((resolve,reject)=>{this.jobs.push({text,options,key,onProgress,priority,resolve,reject,seq:++this.seq});this.pump();});
  }
  // Inference is serial; queued taps outrank background preparation.
  pump() {
    if(this.running||!this.jobs.length)return;
    this.jobs.sort((a,b)=>b.priority-a.priority||a.seq-b.seq);
    const job=this.jobs.shift();this.running=job;
    const finish=()=>{if(this.running===job)this.running=null;this.pump();};
    try {
      this.workerRequest={resolve:value=>{if(!job.warm)markKokoroUsed();job.resolve(value);finish();},reject:error=>{job.reject(error);finish();},key:job.key,onProgress:job.onProgress,timeout:setTimeout(()=>this.failWorker(new Error('Kokoro took too long to load. Check your connection and retry.')),300000)};
      this.ensureWorker();
      if(!job.warm)this.inferences++;
      this.worker.postMessage(job.warm?{type:'warm',backend:'auto'}:{text:job.text,...job.options});
    }catch(error){this.failWorker(error);}
  }
  promote(key) {for(const job of this.jobs)if(job.key===key)job.priority=USER_PRIORITY;}
  cancelPrefetch(keep=new Set()) {
    const dropped=this.jobs.filter(job=>job.priority<USER_PRIORITY&&!keep.has(job.key));
    this.jobs=this.jobs.filter(job=>!dropped.includes(job));
    for(const job of dropped){const error=new Error('Background voice preparation was cancelled.');error.cancelled=true;job.reject(error);}
  }
  warm() {
    if(speechEngine()!=='kokoro'||!kokoroUsedBefore()||this.warmed||this.worker)return;
    this.warmed=new Promise((resolve,reject)=>{this.jobs.push({warm:true,key:'warm',priority:-1000,resolve,reject,seq:++this.seq});this.pump();}).catch(()=>{this.warmed=null;});
  }
  // Prepares upcoming quiz audio in the background; nothing plays.
  prefetch(items) {
    if(speechEngine()!=='kokoro'||!prefetchEnabled()||!kokoroUsedBefore())return;
    const base={...voicePreferences(),backend:'auto'};
    const planned=items.filter(item=>item?.text).map((item,index)=>{const options={...base,questionId:item.questionId,role:item.role,spokenText:item.spokenText};return {text:item.text,options,key:speechKey(item.text,options),priority:-index};});
    this.cancelPrefetch(new Set(planned.map(item=>item.key)));
    for(const item of planned){
      if(this.memory.has(item.key)||this.requests.has(item.key))continue;
      const request=this.obtain(item.text,item.options,item.key,undefined,item.priority);
      this.track(item.key,request);request.catch(()=>{});
    }
  }
  track(key,request) {this.requests.set(key,request);request.finally(()=>{if(this.requests.get(key)===request)this.requests.delete(key);}).catch(()=>{});}
  async obtain(text,options,key,onProgress,priority=USER_PRIORITY) {
    const started=performance.now();let cacheWarning;
    const deletionVersion=this.deleted.get(options.questionId)||0;
    let entry=this.memory.get(key),source=entry?'memory':'IndexedDB';
    if(!entry)try{entry=await audioCache.get(key);}catch(error){cacheWarning=`Audio storage unavailable: ${error.message}`;}
    if(entry&&await validAudio(entry)){if(!this.memory.has(key))this.memory.set(key,entry);markKokoroUsed();return {...entry,cacheHit:true,cacheSource:source,lookupMilliseconds:performance.now()-started,cacheWarning};}
    if(entry){this.memory.delete(key);try{await audioCache.remove(key);}catch{}cacheWarning='Damaged cached audio was replaced.';}
    if(this.state.key===key&&this.state.phase==='checking')this.publish({phase:'generating',status:'Generating voice…'});
    const {samples,sampleRate,device,rms,peak,elapsed,fallbackReason}=await this.generate(text,options,key,onProgress,priority);
    if(!Number.isFinite(sampleRate)||sampleRate<=0)throw new Error('Kokoro returned an invalid audio sample rate.');
    entry={key,questionId:options.questionId,blob:toWav(samples,sampleRate),evidence:{model,voice:options.voice,speed:options.speed,role:options.role,questionId:options.questionId,text,spokenText:options.spokenText,backend:device,sampleRate,durationSeconds:samples.length/sampleRate,rms,peak,generationSeconds:elapsed,fallbackReason},createdAt:new Date().toISOString()};
    if(deletionVersion===(this.deleted.get(options.questionId)||0)) {
      this.memory.set(key,entry);
      try{await audioCache.put(entry);}catch(error){cacheWarning=`Audio plays, but could not be saved for your next visit: ${error.message}`;}
    }
    return {...entry,cacheHit:false,cacheSource:'generated',lookupMilliseconds:performance.now()-started,cacheWarning};
  }
  request(text,options,key,onProgress) {
    let request=this.requests.get(key);
    if(request)this.promote(key);
    else{request=this.obtain(text,options,key,onProgress);this.track(key,request);}
    return request;
  }
  // Health check: loads the model and generates a short sample without caching it.
  async check(onProgress=()=>{}) {
    const options={...voicePreferences(),backend:'auto'},started=performance.now();
    const result=await this.generate('Kokoro is ready.',options,'health-check',onProgress);
    if(!result.samples?.length||!Number.isFinite(result.sampleRate)||result.sampleRate<=0)throw new Error('Kokoro returned empty audio.');
    markKokoroUsed();
    return {device:result.device,totalSeconds:(performance.now()-started)/1000,generationSeconds:result.elapsed,durationSeconds:result.samples.length/result.sampleRate,fallbackReason:result.fallbackReason,voice:options.voice};
  }
  async isCached(text,settings={}) {
    const key=speechKey(text,{...voicePreferences(),backend:'auto',...settings});
    if(this.memory.has(key))return true;
    try{return await validAudio(await audioCache.get(key));}catch{return false;}
  }
  async prepare(text,settings={},onProgress=()=>{}) {
    if(speechEngine()==='system')return {skipped:true};
    const options={...voicePreferences(),backend:'auto',...settings};
    const key=speechKey(text,options);
    onProgress('Checking saved voice…');
    const entry=await this.request(text,options,key,onProgress);
    this.publish({status:'Question voice prepared.'});
    return entry;
  }
  speak(text,settings={}) {
    if(this.state.phase==='clearing')return Promise.resolve();
    if(speechEngine()==='system')return this.speakSystem(text,settings);
    const options={...voicePreferences(),backend:'auto',questionId:'voice-preview',role:'preview',...settings};
    const key=speechKey(text,options);
    if(this.state.key===key&&['checking','loading','generating'].includes(this.state.phase)&&this.playPromise)return this.playPromise;
    this.stop();const token=this.token;
    this.publish({owner:settings.owner||key,key,phase:'checking',status:'Checking saved audio…'});
    this.playPromise=this.play(text,options,key,token);return this.playPromise;
  }
  speakSystem(text,settings={}) {
    const synth=globalThis.speechSynthesis,owner=settings.owner||`system:${text}`;
    this.stop();const token=this.token;
    if(!synth||typeof SpeechSynthesisUtterance==='undefined'){this.publish({owner,key:owner,phase:'error',status:'This browser has no device voice. Choose Kokoro in Settings.'});return Promise.resolve();}
    const preferences=systemVoicePreferences(),utterance=new SpeechSynthesisUtterance(settings.spokenText||text);
    const voice=synth.getVoices().find(v=>v.voiceURI===preferences.voiceURI);
    if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
    utterance.rate=preferences.rate;
    this.publish({owner,key:owner,phase:'checking',status:'Starting device voice…'});
    return new Promise(resolve=>{
      utterance.onstart=()=>{if(token===this.token)this.publish({phase:'playing',status:'Playing device voice.'});};
      utterance.onend=()=>{if(token===this.token)this.publish({phase:'idle',status:'Playback completed.'});resolve();};
      utterance.onerror=event=>{if(token===this.token&&event.error!=='interrupted'&&event.error!=='canceled')this.publish({phase:'error',status:'Device voice could not play. Try again or choose Kokoro.'});resolve();};
      synth.speak(utterance);
    });
  }
  async play(text,options,key,token,retry=false) {
    try {
      const entry=await this.request(text,options,key);if(token!==this.token)return;
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
