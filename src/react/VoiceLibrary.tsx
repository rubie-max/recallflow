import React,{useEffect,useRef,useState} from 'react';
import {Activity,AudioLines,CheckCircle2,AlertTriangle,LoaderCircle,Square} from 'lucide-react';
import {kokoroVoice} from '../kokoro-service.js';
import {audioCache} from '../audio-cache.js';
import {voicePreferences,voices} from '../voice-preferences.js';
import {pickVariant} from '../question-variants.js';
import {Button} from './components/Button';

type Clip={questionId:string;role:string;text:string;spokenText?:string};

// Mirrors the clips a quiz asks for, so prepared audio is reused as-is.
export function questionClips(items:any[]):Clip[]{
 const seen=new Set<string>(),clips:Clip[]=[];
 for(const item of items)for(const version of [item,...(item.variants||[]).map((v:any)=>({...item,...pickVariant(v)}))]){
  for(const clip of [{questionId:item.id,role:'question',text:version.prompt||'',spokenText:version.type==='fill_blank'&&version.prompt?version.prompt.replace(/_{2,}/g,'blank'):undefined},{questionId:item.id,role:'answer',text:version.answer||''}]){
   const key=`${clip.questionId}\u0000${clip.role}\u0000${clip.text}\u0000${clip.spokenText||''}`;
   if(clip.text.trim()&&!seen.has(key)){seen.add(key);clips.push(clip);}
  }
 }
 return clips;
}
function bankItems(){try{const value=JSON.parse(localStorage.getItem('recallflow_bank_v2')||'[]');return Array.isArray(value)?value:[];}catch{return [];}}

function KokoroCheck(){
 const [state,setState]=useState<{phase:'idle'|'running'|'ok'|'error';stage?:string;result?:any;error?:string}>({phase:'idle'});
 const gpu=typeof navigator!=='undefined'&&'gpu' in navigator,worker=typeof Worker!=='undefined',idb=typeof indexedDB!=='undefined';
 async function run(){
  kokoroVoice.stop();setState({phase:'running',stage:'Starting Kokoro…'});
  try{const result=await kokoroVoice.check(stage=>setState(s=>({...s,stage})));let stats=null;try{stats=await audioCache.stats();}catch{}setState({phase:'ok',result:{...result,stats}});}
  catch(error:any){setState({phase:'error',error:error?.message||'Kokoro could not start.'});}
 }
 const r=state.result;
 return <section className="voice-tool" aria-label="Kokoro check">
  <div className="voice-tool-head"><span className="voice-tool-icon"><Activity size={17}/></span><div><h3>Check Kokoro</h3><p>Loads the voice model and generates a short test sentence, so you know it works on this device.</p></div></div>
  <ul className="voice-check-list">
   <li data-ok={worker}><span>Background worker</span><b>{worker?'Supported':'Not supported'}</b></li>
   <li data-ok={gpu||undefined} data-neutral={!gpu||undefined}><span>Graphics acceleration (WebGPU)</span><b>{gpu?'Available':'Not available, will use CPU'}</b></li>
   <li data-ok={idb}><span>Voice storage</span><b>{idb?'Available':'Unavailable'}</b></li>
   {state.phase==='ok'&&<>
    <li data-ok><span>Model</span><b>Loaded · {r.device==='webgpu'?'WebGPU':r.device==='wasm'?'CPU (WASM)':r.device||'ready'}</b></li>
    <li data-ok><span>Test sentence</span><b>{r.generationSeconds?`${Number(r.generationSeconds).toFixed(1)} s to generate`:'Generated'} · {r.durationSeconds.toFixed(1)} s audio</b></li>
    <li data-ok><span>Total time</span><b>{r.totalSeconds.toFixed(1)} s{r.totalSeconds>8?' (first load downloads the model)':''}</b></li>
    {r.stats&&<li data-ok><span>Saved clips</span><b>{r.stats.count} · ~{(r.stats.bytes/1048576).toFixed(1)} MB</b></li>}
   </>}
  </ul>
  {r?.fallbackReason&&<p className="voice-tool-note">{r.fallbackReason}</p>}
  {state.phase==='error'&&<p className="voice-tool-error" role="alert"><AlertTriangle size={15}/> {state.error}</p>}
  {state.phase==='ok'&&<p className="voice-tool-ok" role="status"><CheckCircle2 size={15}/> Kokoro is working.</p>}
  <Button variant="outline" disabled={state.phase==='running'} onClick={run}>{state.phase==='running'?<><LoaderCircle size={16} className="speech-spinner"/> {state.stage||'Checking…'}</>:<><Activity size={16}/> {state.phase==='idle'?'Run check':'Run again'}</>}</Button>
 </section>;
}

function VoiceBuilder(){
 const [clips,setClips]=useState<Clip[]>([]),[missing,setMissing]=useState<Clip[]|null>(null),[run,setRun]=useState<{done:number;total:number;failed:number;current?:string}|null>(null),[summary,setSummary]=useState('');
 const stopRef=useRef(false),running=useRef(false),voice=voicePreferences();
 async function scan(){const all=questionClips(bankItems());setClips(all);setMissing(null);const out:Clip[]=[];for(const clip of all)if(!await kokoroVoice.isCached(clip.text,{questionId:clip.questionId,role:clip.role,spokenText:clip.spokenText}))out.push(clip);setMissing(out);}
 useEffect(()=>{void scan();const off=audioCache.subscribe(()=>{if(!stopRef.current&&!running.current)void scan();});return()=>{off();stopRef.current=true;};},[]);
 async function generate(list:Clip[]){
  kokoroVoice.stop();stopRef.current=false;running.current=true;setSummary('');let failed=0,done=0;setRun({done,total:list.length,failed});
  for(const clip of list){
   if(stopRef.current)break;
   setRun({done,total:list.length,failed,current:clip.text});
   try{await kokoroVoice.prepare(clip.text,{questionId:clip.questionId,role:clip.role,spokenText:clip.spokenText});}catch{failed++;}
   done++;setRun({done,total:list.length,failed});
  }
  running.current=false;const stopped=stopRef.current&&done<list.length;stopRef.current=false;setRun(null);
  setSummary(stopped?`Stopped after ${done-failed} ${done-failed===1?'clip':'clips'}.`:failed?`${done-failed} ready, ${failed} could not be generated. Try again later.`:`All ${done} ${done===1?'clip is':'clips are'} ready.`);
  await scan();
 }
 const ready=missing?clips.length-missing.length:0,pct=clips.length?Math.round(ready/clips.length*100):0;
 return <section className="voice-tool" aria-label="Voices for existing questions">
  <div className="voice-tool-head"><span className="voice-tool-icon"><AudioLines size={17}/></span><div><h3>Voices for existing questions</h3><p>Make every question and answer play instantly, even offline. Uses the voice and speed saved above.</p></div></div>
  {!clips.length&&missing?<p className="voice-tool-note">No questions with text to read yet.</p>:<>
   <div className="voice-progress" aria-hidden="true"><i style={{width:`${run?Math.round((ready+run.done-run.failed)/Math.max(1,clips.length)*100):pct}%`}}/></div>
   <p className="voice-progress-label" role="status" aria-live="polite">{!missing?'Checking saved voices…':run?`Generating ${run.done+1>run.total?run.total:run.done+1} of ${run.total}…`:`${ready} of ${clips.length} clips ready${missing.length?` · ${missing.length} missing`:''}`}</p>
   {run?.current&&<p className="voice-progress-current">“{run.current.length>70?run.current.slice(0,70)+'…':run.current}”</p>}
  </>}
  {summary&&<p className="voice-tool-ok" role="status"><CheckCircle2 size={15}/> {summary}</p>}
  <div className="voice-tool-actions">
   {run?<Button variant="outline" onClick={()=>{stopRef.current=true;}}><Square size={15}/> Stop</Button>:<Button disabled={!missing?.length} onClick={()=>missing&&generate(missing)}><AudioLines size={16}/> {missing?.length?`Generate ${missing.length} missing`:'All voices ready'}</Button>}
  </div>
  <small className="voice-tool-hint">Voice: {voices.find(([id])=>id===voice.voice)?.[1]||voice.voice} · {Number(voice.speed).toFixed(1)}×. Generation runs on this device; keep this page open until it finishes.</small>
 </section>;
}

export function VoiceLibrary(){return <div className="voice-tools"><VoiceBuilder/><KokoroCheck/></div>;}
