import {appPreferences} from './app-preferences.js';

export const customSoundsKey='recallflow_feedback_sounds_v1';
export const MAX_CUSTOM_SOUND_BYTES=400*1024;

let ctx=null;
function audioContext(){
  if(typeof window==='undefined')return null;
  const AC=window.AudioContext||window.webkitAudioContext;
  if(!AC)return null;
  if(!ctx)ctx=new AC();
  if(ctx.state==='suspended')ctx.resume().catch(()=>{});
  return ctx;
}

function tone(c,{freq,start=0,dur=.14,type='sine',gain=.22,slide}){
  const t=c.currentTime+start,osc=c.createOscillator(),amp=c.createGain();
  osc.type=type;osc.frequency.setValueAtTime(freq,t);
  if(slide)osc.frequency.exponentialRampToValueAtTime(slide,t+dur);
  amp.gain.setValueAtTime(0.0001,t);
  amp.gain.exponentialRampToValueAtTime(gain,t+.012);
  amp.gain.exponentialRampToValueAtTime(0.0001,t+dur);
  osc.connect(amp).connect(c.destination);
  osc.start(t);osc.stop(t+dur+.02);
}

const presets={
  correct:c=>{tone(c,{freq:1046.5,dur:.13,type:'triangle',gain:.24});tone(c,{freq:1318.5,start:.1,dur:.26,type:'triangle',gain:.24});tone(c,{freq:2637,start:.1,dur:.18,gain:.05});},
  incorrect:c=>{tone(c,{freq:233,dur:.16,type:'square',gain:.07});tone(c,{freq:185,start:.15,dur:.3,type:'square',gain:.07,slide:160});},
  tick:c=>tone(c,{freq:880,dur:.09,type:'sine',gain:.2}),
  go:c=>{tone(c,{freq:1318.5,dur:.22,type:'triangle',gain:.24});tone(c,{freq:1760,start:.06,dur:.24,type:'sine',gain:.1});},
};

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

export function playPreset(kind){const c=audioContext();if(c&&presets[kind])presets[kind](c);}

export function playFeedback(kind,mode=appPreferences().soundEffects){
  if(mode==='off')return;
  if(mode==='custom'&&(kind==='correct'||kind==='incorrect')){
    const url=customSounds()[kind];
    if(url){void playUrl(url).then(ok=>{if(!ok)playPreset(kind);});return;}
  }
  playPreset(kind);
}
