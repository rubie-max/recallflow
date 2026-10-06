import React,{useEffect,useRef,useState} from 'react';
import {Volume2,Square,LoaderCircle,Check,Sparkles,Smartphone,Zap} from 'lucide-react';
import {kokoroVoice,speechKey} from '../kokoro-service.js';
import {audioCache,validAudio} from '../audio-cache.js';
import {VoiceCache} from './MoreSettings';
import {voicePreferences,saveVoicePreferences,voices,speeds,speechEngine,saveSpeechEngine,systemVoicePreferences,saveSystemVoicePreferences,prefetchEnabled,savePrefetchEnabled} from '../voice-preferences.js';
import {Button} from './components/Button';
import {VoicePreview} from './VoicePreview';
import {VoiceLibrary} from './VoiceLibrary';
function useVoice(){const [state,setState]=useState(kokoroVoice.state);useEffect(()=>kokoroVoice.subscribe(setState),[]);return state;}
type SpeechProps={text:string;spokenText?:string;questionId:string;role?:string;label?:string};
export function SpeechButton(props:SpeechProps){return String(props.text||'').trim()?<SpeechButtonInner {...props}/>:null;}
function SpeechButtonInner({text,spokenText,questionId,role='question',label='Read question'}:SpeechProps) {
  const owner=`${questionId}:${role}`,state=useVoice(),own=state.owner===owner,system=speechEngine()==='system';
  const busy=own&&['checking','loading','generating'].includes(state.phase),playing=own&&state.phase==='playing';
  const [cached,setCached]=useState<boolean|null>(null);
  useEffect(()=>{
    if(system){setCached(true);return;}
    let active=true,revision=0;setCached(null);
    const key=speechKey(text,{...voicePreferences(),backend:'auto',questionId,role,spokenText});
    async function refresh(){const current=++revision;try{const found=kokoroVoice.memory.has(key)||await validAudio(await audioCache.get(key));if(active&&current===revision)setCached(found);}catch{if(active&&current===revision)setCached(null);}}
    void refresh();const unsubscribe=audioCache.subscribe(refresh);return()=>{active=false;unsubscribe();};
  },[questionId,role,text,spokenText,system]);
  useEffect(()=>()=>kokoroVoice.stopOwner(owner),[owner,text]);
  const readLabel=label.endsWith('aloud')?label:`${label} aloud`;
  return <span className="speech-control"><button className="speech-button" data-playing={playing} aria-label={playing?'Stop speech':readLabel} aria-pressed={playing} aria-busy={busy} title={playing?'Stop speech':readLabel} disabled={busy||state.phase==='clearing'} onClick={()=>playing?kokoroVoice.stop():kokoroVoice.speak(text,{spokenText,questionId,role,owner})}>{busy?<LoaderCircle size={18} className="speech-spinner"/>:playing?<Square size={16}/>:<Volume2 size={18}/>}</button>{own&&state.phase==='error'&&<small className="speech-error" role="alert">Voice unavailable</small>}</span>;
}
export function SpeechEvidence(){const state=useVoice();return state.evidence?<details className="speech-evidence"><summary>Audio details</summary><pre data-testid="voice-evidence">{JSON.stringify(state.evidence,null,2)}</pre></details>:null;}
function useSystemVoices(){
  const [list,setList]=useState<SpeechSynthesisVoice[]>(()=>globalThis.speechSynthesis?.getVoices()||[]);
  useEffect(()=>{const synth=globalThis.speechSynthesis;if(!synth)return;const update=()=>setList(synth.getVoices());update();synth.addEventListener?.('voiceschanged',update);return()=>synth.removeEventListener?.('voiceschanged',update);},[]);
  return list;
}
const sample='Mitochondria are the powerhouse of the cell.';
function SystemVoiceSettings(){
  const voicesList=useSystemVoices(),supported=!!globalThis.speechSynthesis;
  const [draft,setDraft]=useState(systemVoicePreferences),[saved,setSaved]=useState(systemVoicePreferences),[status,setStatus]=useState(''),[playing,setPlaying]=useState(false);
  const dirty=draft.voiceURI!==saved.voiceURI||draft.rate!==saved.rate;
  const sorted=[...voicesList].sort((a,b)=>Number(b.lang.startsWith('en'))-Number(a.lang.startsWith('en'))||a.name.localeCompare(b.name));
  useEffect(()=>()=>globalThis.speechSynthesis?.cancel(),[]);
  function preview(){
    const synth=globalThis.speechSynthesis;if(!synth)return;
    if(playing){synth.cancel();setPlaying(false);return;}
    kokoroVoice.stop();synth.cancel();
    const utterance=new SpeechSynthesisUtterance(sample),voice=voicesList.find(v=>v.voiceURI===draft.voiceURI);
    if(voice){utterance.voice=voice;utterance.lang=voice.lang;}
    utterance.rate=draft.rate;utterance.onend=utterance.onerror=()=>setPlaying(false);
    setPlaying(true);synth.speak(utterance);
  }
  function save(){try{saveSystemVoicePreferences(draft.voiceURI,draft.rate);setSaved({...draft});setStatus('Saved');}catch{setStatus('Your browser could not save the voice settings.');}}
  if(!supported)return <p className="settings-warning" role="alert">This browser has no built-in speech voices. Choose Kokoro AI voice instead.</p>;
  return <div className="voice-engine-body">
    <div className="kokoro-options"><label>Voice<select value={draft.voiceURI} onChange={e=>{setDraft({...draft,voiceURI:e.target.value});setStatus('');}}><option value="">Browser default</option>{sorted.map(v=><option key={v.voiceURI} value={v.voiceURI}>{v.name} · {v.lang}</option>)}</select></label><label>Speech speed<select value={draft.rate} onChange={e=>{setDraft({...draft,rate:Number(e.target.value)});setStatus('');}}>{speeds.map(speed=><option key={speed} value={speed}>{speed.toFixed(1)}×</option>)}</select></label></div>
    <div className="kokoro-controls"><Button variant="outline" onClick={preview}>{playing?<Square size={16}/>:<Volume2 size={16}/>} {playing?'Stop preview':'Preview voice'}</Button></div>
    {(dirty||status)&&<div className="settings-save-row"><div className="voice-save-actions"><Button onClick={save} disabled={!dirty}><Check size={16}/> Save voice</Button>{dirty&&<Button variant="ghost" onClick={()=>{setDraft(saved);setStatus('');}}>Cancel</Button>}</div>{!dirty&&status&&<p role="status" aria-live="polite">{status}</p>}</div>}
  </div>;
}
function KokoroSettings(){
  const [preferences,setPreferences]=useState(voicePreferences),[warning,setWarning]=useState('');
  const [saved,setSaved]=useState(voicePreferences),[saveMessage,setSaveMessage]=useState(''),[prefetch,setPrefetch]=useState(prefetchEnabled);
  useEffect(()=>()=>kokoroVoice.stopOwner('preview'),[]);
  const dirty=preferences.voice!==saved.voice||preferences.speed!==saved.speed;
  function change(voice:string,speed:number){kokoroVoice.stop();setPreferences({voice,speed});setSaveMessage('');setWarning('');}
  function cancel(){kokoroVoice.stopOwner('preview');const current=voicePreferences();setPreferences(current);setSaved(current);setSaveMessage('');setWarning('');}
  function save(){try{saveVoicePreferences(preferences.voice,preferences.speed);setSaved({...preferences});setSaveMessage('Saved');setWarning('');}catch{setWarning('Your browser could not save the voice settings. Please try again.');}}
  return <div className="voice-engine-body">
    <div className="kokoro-options"><label>Voice<select value={preferences.voice} onChange={e=>change(e.target.value,preferences.speed)}>{voices.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Speech speed<select value={preferences.speed} onChange={e=>change(preferences.voice,Number(e.target.value))}>{speeds.map(speed=><option key={speed} value={speed}>{speed.toFixed(1)}×</option>)}</select></label></div>
    <VoicePreview voice={preferences.voice} speed={preferences.speed}/>
    {(dirty||saveMessage)&&<div className="settings-save-row"><div className="voice-save-actions"><Button onClick={save} disabled={!dirty}><Check size={16}/> Save voice</Button>{dirty&&<Button variant="ghost" onClick={cancel}>Cancel</Button>}</div>{!dirty&&saveMessage&&<p data-testid="saved-voice-settings" role="status" aria-live="polite">{saveMessage}</p>}</div>}
    {warning&&<p role="alert">{warning}</p>}
    <label className="settings-switch"><span className="settings-switch-icon"><Zap size={17}/></span><span className="settings-switch-copy"><strong>Prepare voice ahead</strong><small>Upcoming questions play instantly during a quiz.</small></span><input type="checkbox" role="switch" checked={prefetch} onChange={e=>{setPrefetch(e.target.checked);savePrefetchEnabled(e.target.checked);}}/><i aria-hidden="true"/></label>
    <VoiceLibrary key={`${saved.voice}:${saved.speed}`}/>
    <VoiceCache/>
  </div>;
}
export function KokoroPanel() {
  const [engine,setEngine]=useState(speechEngine);
  function choose(next:string){kokoroVoice.stop();globalThis.speechSynthesis?.cancel();saveSpeechEngine(next);setEngine(next);}
  const options:[string,string,string,any][]=[['system','Device voice','Default · instant, no download',Smartphone],['kokoro','Kokoro AI voice','Natural · downloads once, then saved',Sparkles]];
  return <section className="settings-panel kokoro-panel"><div className="settings-heading"><span className="settings-icon"><Volume2 size={19}/></span><div><h2>Voice &amp; speech</h2><p>Choose how questions are read aloud.</p></div></div>
    <div className="voice-engine-picker" role="radiogroup" aria-label="Speech engine">{options.map(([id,title,hint,Icon])=><button key={id} role="radio" aria-checked={engine===id} onClick={()=>choose(id)}><Icon size={18}/><span><strong>{title}</strong><small>{hint}</small></span>{engine===id&&<Check size={16} className="voice-engine-check"/>}</button>)}</div>
    {engine==='system'?<SystemVoiceSettings/>:<KokoroSettings/>}
  </section>;
}
