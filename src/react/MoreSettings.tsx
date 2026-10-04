import React,{useEffect,useState} from 'react';
import {Button} from './components/Button';
import {Input} from './components/Input';
import {SlidersHorizontal,Database,Download,Copy,RefreshCw,Trash2,Check} from 'lucide-react';
import {readSetups} from '../quiz-setups.js';
import {quizPreferences,saveQuizPreferences} from '../quiz-preferences.js';
import {audioCache} from '../audio-cache.js';
import {kokoroVoice} from '../kokoro-service.js';

export function QuizSettings({onSaved}:{onSaved:(value:{count:number;shuffle:boolean})=>void}) {
  const [saved,setSaved]=useState(quizPreferences);
  const [mode,setMode]=useState(saved.count?'custom':'all'),[count,setCount]=useState(String(saved.count||10)),[shuffle,setShuffle]=useState(saved.shuffle),[status,setStatus]=useState('');
  const dirty=mode!==(saved.count?'custom':'all')||(mode==='all'?0:Number(count))!==saved.count||shuffle!==saved.shuffle;
  function save(){try{
    const requested=mode==='all'?0:Number(count);
    if(mode==='custom'&&(!count.trim()||requested<1))throw new Error('Choose at least one question.');
    const preferences=saveQuizPreferences({count:requested,shuffle});setSaved(preferences);onSaved(preferences);setStatus('Quiz settings saved.');
  }catch(error:any){setStatus(error.message);}}
  return <section className="settings-panel"><div className="settings-heading"><span className="settings-icon"><SlidersHorizontal size={19}/></span><div><h2>Quiz defaults</h2><p>A session that fits your day.</p></div></div>
    <label>Quiz length<select value={mode} onChange={e=>{setMode(e.target.value);setStatus('');}}><option value="all">All saved questions</option><option value="custom">Choose a number</option></select></label>
    {mode==='custom'&&<label>Questions per quiz<Input type="number" min="1" max="1000" step="1" value={count} onChange={e=>{setCount(e.target.value);setStatus('');}}/></label>}
    <label className="settings-toggle"><input type="checkbox" checked={shuffle} onChange={e=>{setShuffle(e.target.checked);setStatus('');}}/><span><strong>Shuffle question order</strong><small>Keep each session fresh</small></span></label>
    <div className="settings-save-row"><Button onClick={save}><Check size={16}/> Save quiz settings</Button><p role="status" aria-live="polite">{status||(dirty?'Unsaved quiz changes.':'Saved for your next quiz.')}</p></div><p className="settings-footnote">Retry mistakes includes every available missed question.</p>
  </section>;
}
export function VoiceCache(){
  const [stats,setStats]=useState<any>(null),[status,setStatus]=useState(''),[confirm,setConfirm]=useState(false),[clearing,setClearing]=useState(false);
  useEffect(()=>{let active=true,revision=0;async function refresh(){const current=++revision;try{const value=await audioCache.stats();if(active&&current===revision)setStats(value);}catch{if(active&&current===revision)setStatus('Audio storage is unavailable in this browser.');}}void refresh();const unsubscribe=audioCache.subscribe(refresh);return()=>{active=false;unsubscribe();};},[]);
  async function refresh(){try{setStats(await audioCache.stats());setStatus('Cache information updated.');}catch{setStatus('Could not check audio storage.');}}
  async function clear(){setClearing(true);setConfirm(false);try{await kokoroVoice.clearCache();setStats(await audioCache.stats());setStatus('Generated audio cleared.');}catch{setStatus('Could not clear generated audio. Please try again.');}finally{setClearing(false);}}
  return <section className="voice-cache" aria-label="Voice cache"><div className="voice-cache-heading"><h3>Voice cache</h3><button aria-label="Refresh voice cache" title="Refresh voice cache" disabled={clearing} onClick={refresh}><RefreshCw size={15}/></button></div><div className="voice-cache-metrics" data-testid="voice-cache-stats"><div><span>Cached audio</span><strong>{stats?`${stats.count} ${stats.count===1?"clip":"clips"}`:'Checking…'}</strong></div><div><span>Storage used</span><strong>{stats?`~${(stats.bytes/1048576).toFixed(2)} MB`:'Checking…'}</strong></div></div><Button variant="outline" disabled={clearing||!stats?.count} onClick={()=>setConfirm(true)}><Trash2 size={15}/>{clearing?'Clearing generated audio…':'Clear generated audio'}</Button>{confirm&&<div className="settings-confirm" role="group" aria-label="Confirm generated audio clear"><p>Clear all generated speech? RecallFlow will regenerate audio when you use the speaker buttons again.</p><p>Your questions, reports, streaks and voice settings will stay saved.</p><div className="kokoro-controls"><Button disabled={clearing} onClick={clear}>Confirm clear audio</Button><Button variant="outline" onClick={()=>setConfirm(false)}>Cancel</Button></div></div>}<p role="status" aria-live="polite">{status}</p></section>;
}
export function StorageSettings({questions,reports,quizCount,streakDays,theme}:{questions:any[];reports:any[];quizCount:number;streakDays:string[];theme:string}) {
  const [status,setStatus]=useState('');
  function backupJSON(){return JSON.stringify({app:'RecallFlow',version:1,exportedAt:new Date().toISOString(),questions,reports,quizCount,streakDays,preferences:{theme,voice:localStorage.getItem('recallflow_kokoro_voice')||'af_heart',speed:Number(localStorage.getItem('recallflow_kokoro_speed')||1),quiz:quizPreferences(),quizSetups:readSetups()}},null,2);}
  async function copyBackup(){try{await navigator.clipboard.writeText(backupJSON());setStatus('Backup JSON copied. Paste it into a file and keep it somewhere safe.');}catch(error:any){setStatus(`Could not copy the backup: ${error.message}`);}}
  function backup(){try{
    const url=URL.createObjectURL(new Blob([backupJSON()],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download=`RecallFlow_backup_${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Backup download requested. If your browser blocks it, use Copy backup JSON.');
  }catch(error:any){setStatus(`Could not create the backup: ${error.message}`);}}
  return <section className="settings-panel"><div className="settings-heading"><span className="settings-icon"><Database size={19}/></span><div><h2>Data &amp; storage</h2><p>Keep a copy of your progress.</p></div></div><div className="settings-data-stats"><span><b>{questions.length}</b> Questions</span><span><b>{reports.length}</b> Reports</span><span className="settings-local">Saved on this device</span></div>
    <div className="kokoro-controls"><Button variant="outline" onClick={backup}><Download size={16}/> Download data backup</Button><Button variant="ghost" onClick={copyBackup}><Copy size={16}/> Copy backup JSON</Button></div><p>Includes questions, reports, progress and preferences. Audio is excluded.</p>
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
