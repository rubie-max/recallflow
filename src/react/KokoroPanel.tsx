import React,{useEffect,useRef,useState} from 'react';
import {Volume2,Square,LoaderCircle,Check} from 'lucide-react';
import {kokoroVoice,speechKey} from '../kokoro-service.js';
import {audioCache,validAudio} from '../audio-cache.js';
import {VoiceCache} from './MoreSettings';
import {voicePreferences,saveVoicePreferences,voices,speeds} from '../voice-preferences.js';
import {Button} from './components/Button';
import {VoicePreview} from './VoicePreview';
function useVoice(){const [state,setState]=useState(kokoroVoice.state);useEffect(()=>kokoroVoice.subscribe(setState),[]);return state;}
export function SpeechButton({text,spokenText,questionId,role='question',label='Read question'}:{text:string;spokenText?:string;questionId:string;role?:string;label?:string}) {
  const owner=`${questionId}:${role}`,state=useVoice(),own=state.owner===owner;
  const busy=own&&['checking','loading','generating'].includes(state.phase),playing=own&&state.phase==='playing';
  const [cached,setCached]=useState<boolean|null>(null);
  useEffect(()=>{
    let active=true,revision=0;setCached(null);
    const key=speechKey(text,{...voicePreferences(),backend:'auto',questionId,role,spokenText});
    async function refresh(){const current=++revision;try{const found=kokoroVoice.memory.has(key)||await validAudio(await audioCache.get(key));if(active&&current===revision)setCached(found);}catch{if(active&&current===revision)setCached(null);}}
    void refresh();const unsubscribe=audioCache.subscribe(refresh);return()=>{active=false;unsubscribe();};
  },[questionId,role,text,spokenText]);
  useEffect(()=>()=>kokoroVoice.stopOwner(owner),[owner,text]);
  const readLabel=label.endsWith('aloud')?label:`${label} aloud`;
  return <span className="speech-control"><button className="speech-button" data-playing={playing} aria-label={playing?'Stop speech':readLabel} aria-pressed={playing} aria-busy={busy} title={playing?'Stop speech':cached===false?'Generate voice':readLabel} disabled={busy||state.phase==='clearing'} onClick={()=>playing?kokoroVoice.stop():kokoroVoice.speak(text,{spokenText,questionId,role,owner})}>{busy?<LoaderCircle size={18} className="speech-spinner"/>:playing?<Square size={16}/>:<Volume2 size={18}/>}</button>{own&&<small role="status" aria-live="polite">{state.status}</small>}{!own&&cached===false&&<small className="speech-cache-hint">Generate voice</small>}</span>;
}
export function SpeechEvidence(){const state=useVoice();return state.evidence?<details className="speech-evidence"><summary>Audio details</summary><pre data-testid="voice-evidence">{JSON.stringify(state.evidence,null,2)}</pre></details>:null;}
export function KokoroPanel() {
  const [preferences,setPreferences]=useState(voicePreferences),[warning,setWarning]=useState('');
  const [saved,setSaved]=useState(voicePreferences),[saveMessage,setSaveMessage]=useState('');
  const state=useVoice(),player=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(player.current)player.current.append(kokoroVoice.audio);return()=>kokoroVoice.stopOwner('preview');},[]);
  const dirty=preferences.voice!==saved.voice||preferences.speed!==saved.speed;
  function change(voice:string,speed:number){kokoroVoice.stop();setPreferences({voice,speed});setSaveMessage('');setWarning('');}
  function cancel(){kokoroVoice.stopOwner('preview');const current=voicePreferences();setPreferences(current);setSaved(current);setSaveMessage('Unsaved changes discarded.');setWarning('');}
  function save(){try{saveVoicePreferences(preferences.voice,preferences.speed);setSaved({...preferences});setSaveMessage('Voice settings saved.');setWarning('');}catch{setWarning('Your browser could not save the voice settings. Please try again.');}}
  return <div className="kokoro-panel"><div className="settings-heading"><span className="settings-icon"><Volume2 size={19}/></span><div><h2>Voice &amp; speech</h2><p>Make your revision sound natural.</p></div><span className="settings-badge">Kokoro</span></div>
    <div className="kokoro-options"><label>Voice<select value={preferences.voice} onChange={e=>change(e.target.value,preferences.speed)}>{voices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Speech speed<select value={preferences.speed} onChange={e=>change(preferences.voice,Number(e.target.value))}>{speeds.map(speed=><option key={speed} value={speed}>{speed.toFixed(1)}×</option>)}</select></label></div>
    <VoicePreview voice={preferences.voice} speed={preferences.speed}/>
    <div className="settings-save-row"><div className="voice-save-actions"><Button onClick={save} disabled={!dirty}><Check size={16}/> Save voice settings</Button>{dirty&&<Button variant="ghost" onClick={cancel}>Cancel</Button>}</div><div><p data-testid="saved-voice-settings">Saved: {voices.find(([id])=>id===saved.voice)?.[1]} · {saved.speed.toFixed(1)}×</p>{(dirty||saveMessage)&&<p role="status" aria-live="polite">{dirty?'Unsaved changes':saveMessage}</p>}</div></div>
    {warning&&<p role="alert">{warning}</p>}
    <p>Question, answer and flashcard speech uses Kokoro on your device, with generated audio saved for later playback. Heart is the default voice; you can save a different preference.</p>
    <VoiceCache/>
    <details className="voice-advanced"><summary>Advanced / Compatibility</summary><p>Study audio prefers WebGPU and falls back to WASM when needed. Voice previews use the included audio files.</p><div ref={player} className="kokoro-player" hidden={!state.evidence}/><SpeechEvidence/></details>
  </div>;
}
