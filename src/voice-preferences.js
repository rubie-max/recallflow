export const voices=[['af_heart','Heart — American Female'],['af_bella','Bella — American Female'],['am_michael','Michael — American Male'],['am_fenrir','Fenrir — American Male'],['bf_emma','Emma — British Female']];
export const speeds=[0.8,0.9,1,1.1,1.2];
export function voicePreferences() {
  try {const voice=localStorage.getItem('recallflow_kokoro_voice'),speed=Number(localStorage.getItem('recallflow_kokoro_speed')||1);return {voice:voices.some(([id])=>id===voice)?voice:'af_heart',speed:speeds.includes(speed)?speed:1};}catch{return {voice:'af_heart',speed:1};}
}
export function saveVoicePreferences(voice,speed) {localStorage.setItem('recallflow_kokoro_voice',voice);localStorage.setItem('recallflow_kokoro_speed',String(speed));}
