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
    ctx=new AC({latencyHint:'interactive'});
  }
  // Safari reports "interrupted" after other media plays or the app is backgrounded.
  if(ctx.state!=='running')ctx.resume().catch(()=>{});
  return ctx;
}

function unlock(){
  if(appPreferences().soundEffects==='off')return;
  void loadCountdownVoice();
  if(ctx&&ctx.state==='running')return;
  const c=audioContext();if(!c)return;
  try{const b=c.createBuffer(1,1,22050),s=c.createBufferSource();s.buffer=b;s.connect(c.destination);s.start(0);}catch{}
}
if(typeof window!=='undefined'){
  for(const ev of ['pointerdown','touchend','keydown'])window.addEventListener(ev,unlock,{capture:true,passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&ctx&&ctx.state!=='running')ctx.resume().catch(()=>{});});
}

// Everything goes through one output: a short generated room echo, then a hard limiter so effects
// can be mixed loud for phone speakers without clipping.
let bus=null;
function output(c){
  if(bus&&bus.ctx===c)return bus.input;
  const input=c.createGain(),limit=c.createDynamicsCompressor(),echo=c.createConvolver(),wet=c.createGain();
  limit.threshold.value=-4;limit.knee.value=0;limit.ratio.value=20;limit.attack.value=.001;limit.release.value=.08;
  const len=Math.round(c.sampleRate*.5),room=c.createBuffer(2,len,c.sampleRate);
  for(let ch=0;ch<2;ch++){const d=room.getChannelData(ch);for(let i=0;i<len;i++)d[i]=(Math.random()*2-1)*Math.pow(1-i/len,5);}
  echo.buffer=room;wet.gain.value=.12;
  input.connect(limit);input.connect(echo);echo.connect(wet).connect(limit);limit.connect(c.destination);
  const noise=c.createBuffer(1,c.sampleRate,c.sampleRate),nd=noise.getChannelData(0);
  for(let i=0;i<nd.length;i++)nd[i]=Math.random()*2-1;
  bus={ctx:c,input,noise};return input;
}

function envelope(c,t,gain,dur,attack=.004){
  const amp=c.createGain();
  amp.gain.setValueAtTime(0.0001,t);
  amp.gain.exponentialRampToValueAtTime(gain,t+attack);
  amp.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  return amp;
}
function filtered(c,node,type,freq){
  if(!freq)return node.connect(output(c));
  const f=c.createBiquadFilter();f.type=type;f.frequency.value=freq;node.connect(f);f.connect(output(c));
}

// One oscillator with a quick attack and decay; `to` glides the pitch for sweeps and "bwah" sounds.
function tone(c,{freq,to,start=0,dur=.2,type='square',gain=.2,lowpass}){
  const t=c.currentTime+start,osc=c.createOscillator(),amp=envelope(c,t,gain,dur);
  osc.type=type;osc.frequency.setValueAtTime(freq,t);
  if(to)osc.frequency.exponentialRampToValueAtTime(to,t+dur);
  osc.connect(amp);filtered(c,amp,'lowpass',lowpass);
  osc.start(t);osc.stop(t+dur+.05);
}

// FM bell: an inharmonic modulator whose depth fades, so the strike is bright and the tail is pure.
function bell(c,{freq,start=0,dur=.9,gain=.3,ratio=3.5,depth=2.2,lowpass}){
  const t=c.currentTime+start,car=c.createOscillator(),mod=c.createOscillator(),modGain=c.createGain(),amp=envelope(c,t,gain,dur,.002);
  car.frequency.value=freq;mod.frequency.value=freq*ratio;
  modGain.gain.setValueAtTime(freq*depth,t);modGain.gain.exponentialRampToValueAtTime(freq*.05,t+dur*.6);
  mod.connect(modGain).connect(car.frequency);car.connect(amp);filtered(c,amp,'lowpass',lowpass);
  for(const o of [car,mod]){o.start(t);o.stop(t+dur+.05);}
}

// Filtered noise for sparkles and whooshes.
function hiss(c,{start=0,dur=.2,gain=.1,from=6000,to,type='bandpass'}){
  const t=c.currentTime+start,src=c.createBufferSource(),f=c.createBiquadFilter(),amp=envelope(c,t,gain,dur,.01);
  output(c);src.buffer=bus.noise;f.type=type;f.Q.value=1.2;f.frequency.setValueAtTime(from,t);
  if(to)f.frequency.exponentialRampToValueAtTime(to,t+dur);
  src.connect(f).connect(amp).connect(output(c));src.start(t);src.stop(t+dur+.05);
}

const C5=523.25,E5=659.25,G5=783.99,B5=987.77,C6=1046.5,E6=1318.5,G6=1568,B6=1975.5,C7=2093;

const styles={
  arcade:{
    correct:c=>{tone(c,{freq:E6,dur:.09,gain:.2,lowpass:5000});tone(c,{freq:E5,dur:.09,type:'triangle',gain:.4});tone(c,{freq:B6,start:.08,dur:.34,gain:.2,lowpass:6500});tone(c,{freq:B5,start:.08,dur:.34,type:'triangle',gain:.4});hiss(c,{start:.08,dur:.16,gain:.08,from:9000});},
    incorrect:c=>{tone(c,{freq:196,to:180,dur:.15,type:'sawtooth',gain:.4,lowpass:1600});tone(c,{freq:150,to:98,start:.17,dur:.34,type:'sawtooth',gain:.45,lowpass:1300});tone(c,{freq:75,to:50,start:.17,dur:.34,type:'sine',gain:.35});},
    tick:c=>{tone(c,{freq:C6,dur:.06,gain:.22,lowpass:4500});tone(c,{freq:C5,dur:.06,type:'triangle',gain:.35});},
    go:c=>{tone(c,{freq:C5,to:C7,dur:.18,gain:.16,lowpass:5000});hiss(c,{dur:.2,gain:.12,from:1500,to:9000});for(const f of [C6,E6,G6])tone(c,{freq:f,start:.16,dur:.6,type:'triangle',gain:.3});tone(c,{freq:C7,start:.16,dur:.45,gain:.1,lowpass:7000});},
    save:c=>{tone(c,{freq:G5,to:G6,dur:.08,gain:.32,lowpass:4500});tone(c,{freq:C7,start:.07,dur:.28,type:'triangle',gain:.6});hiss(c,{start:.07,dur:.12,gain:.08,from:9000});},
    complete:c=>{[C6,E6,G6].forEach((f,i)=>{tone(c,{freq:f,start:i*.08,dur:.1,gain:.2,lowpass:6000});tone(c,{freq:f/2,start:i*.08,dur:.1,type:'triangle',gain:.3});});tone(c,{freq:C7,start:.24,dur:.7,gain:.18,lowpass:7000});for(const f of [C6,E6,G6])tone(c,{freq:f,start:.24,dur:.9,type:'triangle',gain:.22});hiss(c,{start:.24,dur:.5,gain:.1,from:8000});},
    delete:c=>{hiss(c,{dur:.24,gain:.4,from:3500,to:300});tone(c,{freq:620,to:180,dur:.2,type:'triangle',gain:.6});},
    error:c=>{tone(c,{freq:165,dur:.1,gain:.3,lowpass:1400});tone(c,{freq:165,start:.14,dur:.12,gain:.3,lowpass:1400});},
  },
  bells:{
    correct:c=>{bell(c,{freq:G6,dur:.5,gain:.35});bell(c,{freq:C7,start:.1,dur:1,gain:.4});},
    incorrect:c=>{bell(c,{freq:233,ratio:1.4,depth:3,dur:.35,gain:.5,lowpass:2200});bell(c,{freq:185,ratio:1.4,depth:3,start:.18,dur:.6,gain:.55,lowpass:1800});},
    tick:c=>bell(c,{freq:1760,dur:.14,gain:.3}),
    go:c=>{for(const f of [C6,E6,G6])bell(c,{freq:f,dur:1,gain:.22});bell(c,{freq:C7,start:.05,dur:.8,gain:.2});},
    save:c=>{bell(c,{freq:E6,dur:.3,gain:.45});bell(c,{freq:B6,start:.07,dur:.6,gain:.48});},
    complete:c=>[C6,E6,G6,C7].forEach((f,i)=>bell(c,{freq:f,start:i*.1,dur:i===3?1.4:.6,gain:.45})),
    delete:c=>bell(c,{freq:330,ratio:1.4,depth:2,dur:.3,gain:.45,lowpass:1600}),
    error:c=>{bell(c,{freq:196,ratio:1.4,depth:3,dur:.16,gain:.45,lowpass:1600});bell(c,{freq:196,ratio:1.4,depth:3,start:.18,dur:.2,gain:.45,lowpass:1600});},
  },
};
export const feedbackKinds=Object.keys(styles.arcade),soundStyles=Object.keys(styles);

// The spoken countdown is recorded with Kokoro (tools/build-countdown-voice.mjs) and shipped in public/countdown/.
export const COUNTDOWN_WORDS=['go','one','two','three'];
const voice={buffers:{},loading:null};
export function loadCountdownVoice(){
  if(voice.loading)return voice.loading;
  const c=audioContext();
  if(!c||typeof fetch!=='function'||typeof document==='undefined')return Promise.resolve(false);
  voice.loading=Promise.all(COUNTDOWN_WORDS.map(async word=>{
    const res=await fetch(new URL(`public/countdown/${word}.wav`,document.baseURI));
    if(!res.ok)throw new Error(`${word}.wav: HTTP ${res.status}`);
    const data=await res.arrayBuffer();
    voice.buffers[word]=await new Promise((resolve,reject)=>c.decodeAudioData(data,resolve,reject));
  })).then(()=>true,e=>{console.warn('RecallFlow: spoken countdown unavailable, using beeps',e);voice.loading=null;return false;});
  return voice.loading;
}
function playBuffer(c,buffer,gain=1){
  const src=c.createBufferSource(),amp=c.createGain();
  src.buffer=buffer;amp.gain.value=gain;src.connect(amp).connect(output(c));src.start();
}

// n is 3, 2 or 1 while counting, 0 for "Go!". Falls back to beeps if the recordings cannot load in time.
export async function countdownCue(n,mode=appPreferences().soundEffects){
  haptic(n?'tick':'go');
  if(mode==='off')return;
  const word=COUNTDOWN_WORDS[n],ready=await Promise.race([loadCountdownVoice(),new Promise(r=>setTimeout(()=>r(false),250))]);
  const c=audioContext();
  if(ready&&c&&voice.buffers[word]){
    try{playBuffer(c,voice.buffers[word]);if(!n)playPreset('go');return;}catch(e){console.warn('RecallFlow: countdown voice failed',e);}
  }
  playPreset(n?'tick':'go');
}

// Android phones vibrate; iPhones and most computers ignore this silently.
// Taps and navigation follow their own setting; everything else follows the "with sounds" setting.
export const hapticPatterns={correct:[18],incorrect:[40,60,40],tick:[12],go:[30],save:[20],complete:[20,60,20,60,60],delete:[25],error:[45,50,45],tap:[10],nav:[16]};
export const TAP_KINDS=['tap','nav'];
export function haptic(kind,on){
  const pattern=hapticPatterns[kind];
  if(on===undefined){const p=appPreferences();on=TAP_KINDS.includes(kind)?p.tapVibration:p.vibration;}
  if(!on||!pattern||typeof navigator==='undefined'||typeof navigator.vibrate!=='function')return false;
  try{return navigator.vibrate(pattern)!==false;}catch{return false;}
}

// Which tap tick a pressed element gets: 'nav' inside navigation bars, 'tap' for other controls, null otherwise.
const TAPPABLE='button,a[href],summary,select,[role=button],[role=radio],[role=switch],[role=tab],[role=checkbox],[role=menuitem],input[type=checkbox],input[type=radio]';
export function tapKind(target){
  const el=target&&typeof target.closest==='function'?target.closest(TAPPABLE):null;
  if(!el||el.disabled||el.getAttribute('aria-disabled')==='true')return null;
  return el.closest('nav')?'nav':'tap';
}
if(typeof document!=='undefined'){
  // Capture phase runs first, so an answer's own right/wrong buzz replaces this tick instead of mixing with it.
  document.addEventListener('click',e=>{const kind=tapKind(e.target);if(kind)haptic(kind);},{capture:true,passive:true});
  window.addEventListener('popstate',()=>haptic('nav'));
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

function playUrl(url){try{const a=new Audio(url);a.volume=1;return a.play().then(()=>true).catch(()=>false);}catch{return Promise.resolve(false);}}

export function playPreset(kind,style=appPreferences().soundStyle){
  const play=(styles[style]||styles.arcade)[kind];
  if(!play)return;
  const c=audioContext();if(!c)return;
  try{play(c);}catch(e){console.warn('RecallFlow: sound effect failed',e);}
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
