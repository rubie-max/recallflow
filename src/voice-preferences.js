export const voices=[['af_heart','Heart — American Female'],['af_bella','Bella — American Female'],['am_michael','Michael — American Male'],['am_fenrir','Fenrir — American Male'],['bf_emma','Emma — British Female']];
export const speeds=[0.8,0.9,1,1.1,1.2];
export const engines=[['kokoro','Kokoro AI voice'],['system','Device voice']];
const read=key=>{try{return localStorage.getItem(key);}catch{return null;}};
export function voicePreferences() {
  const voice=read('recallflow_kokoro_voice'),speed=Number(read('recallflow_kokoro_speed')||1);return {voice:voices.some(([id])=>id===voice)?voice:'af_heart',speed:speeds.includes(speed)?speed:1};
}
export function saveVoicePreferences(voice,speed) {localStorage.setItem('recallflow_kokoro_voice',voice);localStorage.setItem('recallflow_kokoro_speed',String(speed));}
export function speechEngine(){return read('recallflow_speech_engine')==='system'?'system':'kokoro';}
export function saveSpeechEngine(engine){localStorage.setItem('recallflow_speech_engine',engine==='system'?'system':'kokoro');}
export function systemVoicePreferences(){const rate=Number(read('recallflow_system_rate')||1);return {voiceURI:read('recallflow_system_voice')||'',rate:speeds.includes(rate)?rate:1};}
export function saveSystemVoicePreferences(voiceURI,rate){localStorage.setItem('recallflow_system_voice',voiceURI||'');localStorage.setItem('recallflow_system_rate',String(rate));}
export function prefetchEnabled(){return read('recallflow_voice_prefetch')!=='off';}
export function savePrefetchEnabled(on){localStorage.setItem('recallflow_voice_prefetch',on?'on':'off');}
export function kokoroUsedBefore(){return read('recallflow_kokoro_ready')==='1';}
export function markKokoroUsed(){try{localStorage.setItem('recallflow_kokoro_ready','1');}catch{}}
