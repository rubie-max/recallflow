import {appPreferences} from './app-preferences.js';

export const customSoundsKey='recallflow_feedback_sounds_v1';
export const MAX_CUSTOM_SOUND_BYTES=400*1024;

let ctx=null;
function audioContext(){
  if(typeof window==='undefined')return null;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!ctx||ctx.state==='closed'){
    // iOS mutes Web Audio with the ring/silent switch unless the session is "playback".
    try{if(navigator.audioSession)navigator.audioSession.type='playback';}catch{}
    ctx=new AC();
  }
  // Safari reports "interrupted" after other media plays or the app is backgrounded.
  if(ctx.state!=='running')ctx.resume().catch(()=>{});
  return ctx;
}

function unlock(){
  if((ctx&&ctx.state==='running')||appPreferences().soundEffects==='off')return;
  const c=audioContext();if(!c)return;
  try{const b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0);}catch{}
}
if(typeof window!=='undefined'){
  for(const ev of ['pointerdown','touchend','keydown'])window.addEventListener(ev,unlock,{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});});
}

// All effects share one output: a small generated room echo and a limiter so stacked notes never clip.
let bus=null;
function output(c){
  if(bus&&bus.ctx===c)return bus.input;
  const input=c.createGain(),limit=c.createDynamicsCompressor(),echo=c.createConvolver(),wet=c.createGain();
  limit.threshold.value=-12;limit.knee.value=8;limit.ratio.value=6;limit.attack.value=.002;limit.release.value=.15;
  const len=Math.round(c.sampleRate*.6),room=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=room.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,4);}
  echo.buffer=room;wet.gain.value=.14;
  input.connect(limit);input.connect(echo);echo.connect(wet).connect(limit);limit.connect(c.destination);
  bus={ctx:c,input};return input;
}

// A struck note: the main pitch plus quieter overtones that fade faster, like a bell or marimba bar.
function note(c,{freq,start=0,dur=.4,gain=.14,type='sine',slide,overtones=[[2,.22],[3,.06]],lowpass}){
  const t=c.currentTime+start,amp=c.createGain();
  amp.gain.setValueAtTime(0.0001,t);
  amp.gain.exponentialRampToValueAtTime(gain,t+.005);
  amp.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  if(lowpass){const f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=lowpass;amp.connect(f).connect(output(c));}
  else amp.connect(output(c));
  for(const [mult,level] of [[1,1],...overtones]){
    const osc=c.createOscillator(),g=c.createGain();
    osc.type=type;osc.frequency.setValueAtTime(freq*mult,t);
    if(slide)osc.frequency.exponentialRampToValueAtTime(slide*mult,t+dur);
    g.gain.setValueAtTime(level,t);
    if(mult>1)g.gain.exponentialRampToValueAtTime(level*.01,t+dur/mult);
    osc.connect(g).connect(amp);osc.start(t);osc.stop(t+dur+.05);
  }
}

const presets={
  correct:c=>{note(c,{freq:1046.5,dur:.32});note(c,{freq:1568,start:.09,dur:.6});},
  incorrect:c=>{note(c,{freq:392,slide:370,dur:.22,type:'triangle',gain:.16,overtones:[[2,.12]],lowpass:1400});note(c,{freq:311.1,start:.14,slide:290,dur:.4,type:'triangle',gain:.16,overtones:[[2,.12]],lowpass:1200});},
  tick:c=>note(c,{freq:1250,slide:950,dur:.07,gain:.09,overtones:[]}),
  go:c=>{for(const f of [1046.5,1318.5,1568])note(c,{freq:f,dur:.7,gain:.07});note(c,{freq:2093,start:.04,dur:.45,gain:.025,overtones:[]});},
  save:c=>{note(c,{freq:520,slide:1040,dur:.09,gain:.1,overtones:[]});note(c,{freq:1568,start:.07,dur:.4,gain:.08});},
  complete:c=>[523.25,659.25,783.99,1046.5].forEach((f,i)=>note(c,{freq:f,start:i*.09,dur:i===3?.95:.35,gain:.11})),
  delete:c=>note(c,{freq:420,slide:150,dur:.16,gain:.12,overtones:[],lowpass:900}),
  error:c=>{note(c,{freq:220,dur:.12,type:'triangle',gain:.13,overtones:[],lowpass:1000});note(c,{freq:220,start:.16,dur:.14,type:'triangle',gain:.13,overtones:[],lowpass:1000});},
};
export const feedbackKinds=Object.keys(presets);

// Android phones vibrate; iPhones and most computers ignore this silently.
export const hapticPatterns={correct:[14],incorrect:[30,60,30],tick:[8],go:[22],save:[18],complete:[16,70,16,70,40],delete:[20],error:[40,50,40],tap:[8]};
export function haptic(kind,on=appPreferences().vibration){
  const pattern=hapticPatterns[kind];
  if(!on||!pattern||typeof navigator==='undefined'||typeof navigator.vibrate!=='function')return false;
  try{return navigator.vibrate(pattern)!==false;}catch{return false;}
}

export function customSounds(){try{const v=JSON.parse(localStorage.getItem(customSoundsKey)||'{}');return {correct:typeof v.correct==='string'?v.correct:'',incorrect:typeof v.incorrect==='string'?v.incorrect:''};}catch{return {correct:'',incorrect:''};}}
export function saveCustomSound(kind,dataUrl){
  const next={...customSounds(),[kind]:dataUrl||''};
  try{localStorage.setItem(customSoundsKey,JSON.stringify(next));}catch{throw new Error('Not enough storage for this sound. Try a shorter clip.');}
  window.dispatchEvent(new CustomEvent('recallflow:feedback-sounds',{detail:next}));
  return next;
}
export function readSoundFile(file){
  return new Promise((resolve,reject)=>{
    if(!file)return reject(new Error('Choose a sound file.'));
    if(!/^audio\//.test(file.type)&&!/\.(mp3|m4a|wav|ogg|webm|aac|opus)$/i.test(file.name))return reject(new Error('Choose an audio file (MP3, WAV, OGG, M4A).'));
    if(file.size>MAX_CUSTOM_SOUND_BYTES)return reject(new Error('Keep feedback sounds under 400 KB (about 1–2 seconds).'));
    const r=new FileReader();r.onload=()=>resolve(String(r.result));r.onerror=()=>reject(new Error('Could not read this sound.'));r.readAsDataURL(file);
  });
}

function playUrl(url){try{const a=new Audio(url);a.volume=.9;return a.play().then(()=>true).catch(()=>false);}catch{return Promise.resolve(false);}}

export function playPreset(kind){
  if(!presets[kind])return;
  const c=audioContext();if(!c)return;
  try{presets[kind](c);}catch(e){console.warn('RecallFlow: sound effect failed',e);}
}

export function playFeedback(kind,mode=appPreferences().soundEffects){
  if(mode==='off')return;
  if(mode==='custom'&&(kind==='correct'||kind==='incorrect')){
    const url=customSounds()[kind];
    if(url){void playUrl(url).then(ok=>{if(!ok)playPreset(kind);});return;}
  }
  playPreset(kind);
}

export function feedback(kind){playFeedback(kind);haptic(kind);}
