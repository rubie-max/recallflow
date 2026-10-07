import React,{useEffect,useRef,useState} from 'react';
import {KeyRound,Eye,EyeOff,Camera,ImagePlus,Pencil,Send,CalendarClock,CircleAlert,UserRound,Palette,Volume2,SlidersHorizontal,Database,Smartphone,Sun,Moon,MonitorSmartphone,Type,ArrowLeftRight,ArrowRight,TriangleAlert,Info,Check,Download,Copy,Trash2,RotateCcw,Timer,Shuffle,FastForward,DoorOpen,Sparkles,Mic,Cloud,CloudOff,RefreshCw,LogOut,CircleCheck,ChevronLeft,ChevronRight} from 'lucide-react';
import {Button} from './components/Button';
import {KokoroPanel} from './KokoroPanel';
import {BackupRestore,OfflineSettings} from './LearningFeatures';
import {quizPreferences,saveQuizPreferences} from '../quiz-preferences.js';
import {readSetups} from '../quiz-setups.js';
import {appPreferences,saveAppPreferences,textSizes} from '../app-preferences.js';
import {audioCache} from '../audio-cache.js';
import {session,signOut,syncNow,syncStatus,requestBackup,backupStatus,setBackupPassword,backupPasswordInfo} from '../sync.js';
import {passwordProblem,MIN_PASSWORD,MAX_PASSWORD} from '../backup-password.js';
import {openPhoto,saveProfilePhoto,profilePhoto,profilePhotoKey} from '../profile-photo.js';
import {useProfilePhoto,PhotoEditor} from './ProfilePhoto';

const sections:[string,string,any][]=[['profile','Profile',UserRound],['account','Account',Cloud],['appearance','Appearance',Palette],['voice','Voice',Volume2],['quiz','Quiz',SlidersHorizontal],['data','Data',Database],['app','App',Smartphone]];

function Toggle({icon:Icon,title,detail,checked,onChange}:any){
 return <label className="settings-switch"><span className="settings-switch-icon"><Icon size={17}/></span><span className="settings-switch-copy"><strong>{title}</strong>{detail&&<small>{detail}</small>}</span><input type="checkbox" role="switch" checked={checked} onChange={e=>onChange(e.target.checked)}/><i aria-hidden="true"/></label>;
}
function Panel({icon:Icon,title,detail,children,className=''}:any){
 return <section className={`settings-panel ${className}`}><div className="settings-heading"><span className="settings-icon"><Icon size={19}/></span><div><h2>{title}</h2>{detail&&<p>{detail}</p>}</div></div>{children}</section>;
}
function usePrefs(){
 const [prefs,setPrefs]=useState(appPreferences);
 useEffect(()=>{const sync=(e:any)=>setPrefs(e.detail);window.addEventListener('recallflow:preferences',sync);return()=>window.removeEventListener('recallflow:preferences',sync);},[]);
 return [prefs,(patch:any)=>setPrefs(saveAppPreferences({...appPreferences(),...patch}))] as const;
}

function ProfileSettings(){
 const [prefs,update]=usePrefs(),[name,setName]=useState(prefs.name),photo=useProfilePhoto(),[busy,setBusy]=useState(false),[photoError,setPhotoError]=useState(''),[editing,setEditing]=useState<ImageBitmap|null>(null),picker=useRef<HTMLInputElement>(null);
 const commit=()=>{if(name.trim()!==prefs.name)update({name});};
 const pick=()=>picker.current?.click();
 async function edit(source?:File|string){if(!source)return;setBusy(true);setPhotoError('');try{setEditing(await openPhoto(source));}catch(e:any){setPhotoError(e.message||'This picture could not be used.');}finally{setBusy(false);}}
 const close=()=>{editing?.close();setEditing(null);};
 function save(url:string){try{saveProfilePhoto(url);close();}catch(e:any){setPhotoError(e.message);close();}}
 const remove=()=>{setPhotoError('');saveProfilePhoto('');};
 return <Panel icon={UserRound} title="Name & picture" detail="Shown in greetings, before each quiz and on the home screen.">
  <div className="settings-profile">
   <button type="button" className="settings-avatar" data-photo={photo?'':undefined} data-busy={busy||undefined} onClick={()=>photo?edit(photo):pick()} disabled={busy} aria-label={photo?'Edit profile picture':'Add profile picture'} title={photo?'Edit picture':'Add a picture'}>{photo?<img src={photo} alt=""/>:(name.trim()[0]||'?').toUpperCase()}<span className="settings-avatar-badge" aria-hidden="true">{busy?<RefreshCw size={12}/>:photo?<Pencil size={12}/>:<Camera size={12}/>}</span></button>
   <label className="settings-profile-field">Name<input value={name} maxLength={40} placeholder="Your name" autoComplete="given-name" onChange={e=>setName(e.target.value)} onBlur={commit} onKeyDown={e=>{if(e.key==='Enter')(e.target as HTMLInputElement).blur();}}/></label>
  </div>
  <div className="settings-photo-actions"><Button variant="outline" size="sm" onClick={pick} disabled={busy}><ImagePlus size={15}/>{busy?'Opening…':photo?'New picture':'Upload picture'}</Button>{photo&&<Button variant="outline" size="sm" onClick={()=>edit(photo)} disabled={busy}><Pencil size={15}/>Edit</Button>}{photo&&<Button variant="ghost" size="sm" className="settings-photo-remove" onClick={remove} disabled={busy}><Trash2 size={15}/>Remove</Button>}</div>
  <input ref={picker} type="file" accept="image/*" hidden onChange={e=>{edit(e.target.files?.[0]);e.target.value='';}}/>
  {photoError&&<p className="settings-error" role="alert">{photoError}</p>}
  {editing&&<PhotoEditor image={editing} onCancel={close} onSave={save}/>}
  <p className="settings-preview-line">“Good to see you again, <b>{name.trim()||'there'}</b>”</p>
 </Panel>;
}

function AppearanceSettings({theme,onTheme}:any){
 const [prefs,update]=usePrefs();
 return <Panel icon={Palette} title="Look & feel" detail="Make RecallFlow comfortable to read.">
  <p className="settings-label">Theme</p>
  <div className="settings-segmented" role="radiogroup" aria-label="Theme">{[['light','Light',Sun],['dark','Dark',Moon],['system','System',MonitorSmartphone]].map(([id,label,Icon]:any)=><button key={id} role="radio" aria-checked={theme===id} onClick={()=>onTheme(id)}><Icon size={16}/>{label}</button>)}</div>
  <p className="settings-label">Text size</p>
  <div className="settings-segmented settings-text-size" role="radiogroup" aria-label="Text size">{textSizes.map(([id,label,scale]:any)=><button key={id} role="radio" aria-checked={prefs.textSize===id} onClick={()=>update({textSize:id})}><span style={{fontSize:`${Math.round(14*scale)}px`}}>Aa</span>{label}</button>)}</div>
  <Toggle icon={Sparkles} title="Reduce motion" detail="Fewer animations and transitions." checked={prefs.reduceMotion} onChange={(v:boolean)=>update({reduceMotion:v})}/>
 </Panel>;
}

function VoiceBehaviour(){
 const [prefs,update]=usePrefs();
 return <section className="settings-panel settings-panel-compact"><Toggle icon={Mic} title="Read questions aloud automatically" detail="Each new question is spoken when it appears." checked={prefs.autoRead} onChange={(v:boolean)=>update({autoRead:v})}/></section>;
}

function QuizDefaults({onSaved}:any){
 const [saved,setSaved]=useState(quizPreferences),[count,setCount]=useState(String(saved.count||10)),[error,setError]=useState('');
 const [prefs,update]=usePrefs();
 function save(next:any){try{const value=saveQuizPreferences({...saved,...next});setSaved(value);onSaved(value);setError('');}catch(e:any){setError(e.message);}}
 return <Panel icon={SlidersHorizontal} title="Quiz defaults" detail="Applies to Today’s quiz and quick practice.">
  <p className="settings-label">Questions per quiz</p>
  <div className="settings-segmented" role="radiogroup" aria-label="Quiz length"><button role="radio" aria-checked={!saved.count} onClick={()=>save({count:0})}>All due</button><button role="radio" aria-checked={!!saved.count} onClick={()=>save({count:Math.max(1,Number(count)||10)})}>Set a number</button></div>
  {!!saved.count&&<div className="settings-stepper"><button type="button" aria-label="Fewer questions" disabled={saved.count<=1} onClick={()=>{const n=Math.max(1,saved.count-5);setCount(String(n));save({count:n});}}>−</button><input type="number" min="1" max="1000" aria-label="Questions per quiz" value={count} onChange={e=>{setCount(e.target.value);const n=Number(e.target.value);if(Number.isInteger(n)&&n>=1&&n<=1000)save({count:n});}}/><button type="button" aria-label="More questions" disabled={saved.count>=1000} onClick={()=>{const n=Math.min(1000,saved.count+5);setCount(String(n));save({count:n});}}>+</button></div>}
  {error&&<p className="settings-error" role="alert">{error}</p>}
  <div className="settings-switch-list">
   <Toggle icon={Shuffle} title="Shuffle question order" detail="A fresh order every session." checked={saved.shuffle} onChange={(v:boolean)=>save({shuffle:v})}/>
   <Toggle icon={ArrowLeftRight} title="Shuffle answer choices" detail="Mix choices and word banks each time." checked={prefs.shuffleChoices} onChange={(v:boolean)=>update({shuffleChoices:v})}/>
   <Toggle icon={Timer} title="3-2-1 countdown" detail="A short pause before the first question." checked={prefs.countdown} onChange={(v:boolean)=>update({countdown:v})}/>
   <Toggle icon={FastForward} title="Continue automatically" detail="Move on shortly after a correct answer." checked={prefs.autoAdvance} onChange={(v:boolean)=>update({autoAdvance:v})}/>
   <Toggle icon={DoorOpen} title="Confirm before leaving a quiz" detail="Avoid losing progress by accident." checked={prefs.confirmExit} onChange={(v:boolean)=>update({confirmExit:v})}/>
  </div>
 </Panel>;
}

function bytesOf(){let total=0;try{for(let i=0;i<localStorage.length;i++){const key=localStorage.key(i)||'';total+=(key.length+(localStorage.getItem(key)||'').length)*2;}}catch{}return total;}
const mb=(n:number)=>n<1048576?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1048576).toFixed(1)} MB`;
function StorageMeter({items}:any){
 const [used,setUsed]=useState(bytesOf),[audio,setAudio]=useState<any>(null);
 useEffect(()=>{setUsed(bytesOf());let active=true;audioCache.stats().then((s:any)=>active&&setAudio(s)).catch(()=>{});return()=>{active=false;};},[items]);
 const limit=5*1048576,pct=Math.min(100,Math.round(used/limit*100)),images=items.reduce((n:number,x:any)=>n+[x.image,x.answerImage,...Object.values(x.optionImages||{})].filter(Boolean).length,0);
 return <div className="settings-storage"><div className="settings-storage-head"><strong>{mb(used)}</strong><span>of about 5 MB for questions & reports</span></div><div className="settings-storage-bar" data-level={pct>85?'high':pct>60?'mid':'low'} role="meter" aria-label="Storage used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{width:`${Math.max(2,pct)}%`}}/></div><div className="settings-storage-facts"><span><b>{items.length}</b> questions</span><span><b>{images}</b> images</span><span><b>{audio?audio.count:'–'}</b> voice {audio?.count===1?'clip':'clips'}{audio?.count?` · ${mb(audio.bytes)}`:''}</span></div>{pct>85&&<p className="settings-warning">Storage is nearly full. Remove large images or export and archive old questions.</p>}</div>;
}

function BackupPanel({items,reports,quizCount,streakDays,theme}:any){
 const [status,setStatus]=useState('');
 function json(){return JSON.stringify({app:'RecallFlow',version:1,exportedAt:new Date().toISOString(),questions:items,reports,quizCount,streakDays,preferences:{theme,voice:localStorage.getItem('recallflow_kokoro_voice')||'af_heart',speed:Number(localStorage.getItem('recallflow_kokoro_speed')||1),speechEngine:localStorage.getItem('recallflow_speech_engine')||'system',quiz:quizPreferences(),quizSetups:readSetups(),app:appPreferences()},...(profilePhoto()?{synced:{[profilePhotoKey]:profilePhoto()}}:{})},null,2);}
 function download(){try{const url=URL.createObjectURL(new Blob([json()],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`RecallFlow_backup_${new Date().toISOString().slice(0,10)}.json`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);setStatus('Backup downloaded.');}catch(e:any){setStatus(`Could not create the backup: ${e.message}`);}}
 async function copy(){try{await navigator.clipboard.writeText(json());setStatus('Backup copied to the clipboard.');}catch{setStatus('Copy is blocked here. Use Download instead.');}}
 return <Panel icon={Download} title="Full backup" detail="Everything: questions, reports, streak and settings."><div className="settings-button-row"><Button onClick={download}><Download size={16}/>Download backup</Button><Button variant="outline" onClick={copy}><Copy size={16}/>Copy</Button></div>{status&&<p className="settings-status" role="status">{status}</p>}</Panel>;
}

const PENDING_BACKUP='rf_backup_pending',WAIT_MS=6*60000;
function when(iso:string){const d=new Date(iso),days=Math.round((new Date().setHours(0,0,0,0)-new Date(iso).setHours(0,0,0,0))/864e5),time=d.toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});return days===0?`Today, ${time}`:days===1?`Yesterday, ${time}`:`${d.toLocaleDateString([],{day:'numeric',month:'short'})}, ${time}`;}
function TelegramBackup(){
 const [last,setLast]=useState<any>(null),[note,setNote]=useState(''),[phase,setPhase]=useState<'idle'|'saving'|'waiting'|'done'|'failed'|'slow'>('idle'),[error,setError]=useState(''),[started,setStarted]=useState(0),[,tick]=useState(0),[online,setOnline]=useState(navigator.onLine);
 const alive=useRef(true);
 async function wait(id:string,since:number){
  setPhase('waiting');setStarted(since);
  while(alive.current&&Date.now()-since<WAIT_MS){
   await new Promise(r=>setTimeout(r,5000));if(!alive.current)return;
   const s=await backupStatus().catch(()=>null);
   if(s?.id===id){sessionStorage.removeItem(PENDING_BACKUP);setLast(s);if(s.ok)setPhase('done');else{setPhase('failed');setError(s.error||'The backup could not be sent.');}return;}
  }
  if(alive.current){sessionStorage.removeItem(PENDING_BACKUP);setPhase('slow');}
 }
 useEffect(()=>{
  alive.current=true;backupStatus().then(s=>alive.current&&setLast(s)).catch(()=>{});
  try{const p=JSON.parse(sessionStorage.getItem(PENDING_BACKUP)||'null');if(p&&Date.now()-p.at<WAIT_MS)wait(p.id,p.at);}catch{}
  const net=()=>setOnline(navigator.onLine);
  window.addEventListener('online',net);window.addEventListener('offline',net);
  return()=>{alive.current=false;window.removeEventListener('online',net);window.removeEventListener('offline',net);};
 },[]);
 useEffect(()=>{if(phase!=='waiting')return;const t=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(t);},[phase]);
 async function send(){
  setPhase('saving');setError('');
  try{const id=await requestBackup(note),at=Date.now();sessionStorage.setItem(PENDING_BACKUP,JSON.stringify({id,at}));setNote('');await wait(id,at);}
  catch(e:any){setPhase('failed');setError(e.message||'The backup could not be requested.');}
 }
 const busy=phase==='saving'||phase==='waiting',secs=Math.max(0,Math.floor((Date.now()-started)/1000)),clock=`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`;
 return <Panel icon={Send} title="Telegram backup" detail="An encrypted backup goes to your Telegram every night at 3 AM. Send one now whenever you like.">
  <div className="tg-backup-last" data-state={last?(last.ok?'ok':'failed'):'none'}>
   {last?(last.ok?<CircleCheck size={18}/>:<CircleAlert size={18}/>):<CalendarClock size={18}/>}
   <div>{last?<><strong>{last.ok?'Last backup':'Last backup failed'} · {when(last.at)}</strong><small>{last.ok?`${last.trigger==='manual'?'Sent by you':'Nightly backup'} · ${last.summary}`:last.error}</small></>:<><strong>Next backup tonight at 3:00 AM</strong><small>Sent automatically every day</small></>}</div>
  </div>
  <label className="tg-backup-note"><span>Note <i>(optional)</i></span><input value={note} maxLength={120} placeholder="e.g. Before deleting old questions" disabled={busy} onChange={e=>setNote(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!busy&&online)send();}}/></label>
  <Button onClick={send} disabled={busy||!online} className="tg-backup-send" data-busy={busy||undefined}>{busy?<RefreshCw size={16}/>:<Send size={16}/>}{phase==='saving'?'Saving your latest changes…':phase==='waiting'?`Sending… ${clock}`:'Send backup now'}</Button>
  <div aria-live="polite">
   {!online&&!busy&&<p className="settings-status">You’re offline. Connect to send a backup.</p>}
   {phase==='waiting'&&<p className="settings-status">Packing and encrypting your backup. It usually reaches Telegram in about 2 minutes — you can keep using the app.</p>}
   {phase==='done'&&<p className="tg-backup-result" data-ok=""><CircleCheck size={16}/>Sent to Telegram. Check your chat with the RecallFlow bot.</p>}
   {phase==='slow'&&<p className="settings-status">This is taking longer than usual. Check Telegram in a few minutes.</p>}
   {phase==='failed'&&<p className="tg-backup-result" role="alert"><CircleAlert size={16}/>{error}</p>}
  </div>
  <BackupPassword/>
 </Panel>;
}

function BackupPassword(){
 const [info,setInfo]=useState<{changedAt:string|null}|null|'unknown'>(null),[open,setOpen]=useState(false),[pw,setPw]=useState(''),[confirm,setConfirm]=useState(''),[show,setShow]=useState(false),[tried,setTried]=useState(false),[saving,setSaving]=useState(false),[error,setError]=useState(''),[saved,setSaved]=useState(false);
 useEffect(()=>{let active=true;backupPasswordInfo().then(i=>active&&setInfo(i)).catch(()=>active&&setInfo('unknown'));return()=>{active=false;};},[]);
 const problem=passwordProblem(pw,confirm),date=(iso:string)=>new Date(iso).toLocaleDateString([],{day:'numeric',month:'short',year:'numeric'});
 const reset=()=>{setPw('');setConfirm('');setShow(false);setTried(false);setError('');};
 async function save(e:React.FormEvent){
  e.preventDefault();setTried(true);if(problem)return;
  setSaving(true);setError('');
  try{const changedAt=await setBackupPassword(pw);setInfo({changedAt});reset();setOpen(false);setSaved(true);}
  catch(err:any){setError(err.message||'The password could not be saved.');}
  finally{setSaving(false);}
 }
 return <div className="tg-password">
  <div className="tg-password-row">
   <span className="tg-password-icon"><KeyRound size={17}/></span>
   <div><strong>Backup file password</strong><small>{info===null?'Checking…':info==='unknown'?'Couldn’t check right now':info.changedAt?`Changed on ${date(info.changedAt)}`:'Using your original password'}</small></div>
   {!open&&<Button variant="outline" size="sm" onClick={()=>{reset();setSaved(false);setOpen(true);}}>Change</Button>}
  </div>
  {saved&&!open&&<p className="tg-backup-result" data-ok="" role="status"><CircleCheck size={16}/>Password changed. The next backup will use it — send one now to try it.</p>}
  {open&&<form className="tg-password-form" onSubmit={save} noValidate>
   <label><span>New password</span><span className="tg-password-input"><input type={show?'text':'password'} value={pw} maxLength={MAX_PASSWORD} autoComplete="new-password" autoFocus disabled={saving} onChange={e=>setPw(e.target.value)} aria-invalid={tried&&!!passwordProblem(pw)||undefined}/><button type="button" onClick={()=>setShow(!show)} aria-label={show?'Hide password':'Show password'} aria-pressed={show}>{show?<EyeOff size={16}/>:<Eye size={16}/>}</button></span></label>
   <label><span>Type it again</span><input type={show?'text':'password'} value={confirm} maxLength={MAX_PASSWORD} autoComplete="new-password" disabled={saving} onChange={e=>setConfirm(e.target.value)} aria-invalid={tried&&!!problem&&!passwordProblem(pw)||undefined}/></label>
   <p className="tg-password-hint">{tried&&problem?<b role="alert">{problem}</b>:`At least ${MIN_PASSWORD} characters. You’ll type it when restoring a backup from Telegram.`}</p>
   <p className="tg-password-note"><Info size={15}/>Backups you already have keep the password they were made with. Write the new one down somewhere safe — it can’t be recovered.</p>
   {error&&<p className="tg-backup-result" role="alert"><CircleAlert size={16}/>{error}</p>}
   <div className="settings-button-row"><Button type="submit" disabled={saving}>{saving?<RefreshCw size={16} className="tg-spin"/>:<KeyRound size={16}/>}{saving?'Saving…':'Save password'}</Button><Button type="button" variant="outline" disabled={saving} onClick={()=>{reset();setOpen(false);}}>Cancel</Button></div>
  </form>}
 </div>;
}

function ago(ms:number){if(!ms)return 'Not synced yet';const s=Math.round((Date.now()-ms)/1000);if(s<45)return 'Synced just now';if(s<3600)return `Synced ${Math.round(s/60)} min ago`;if(s<86400)return `Synced ${Math.round(s/3600)} h ago`;return `Synced ${new Date(ms).toLocaleDateString()}`;}
function AccountSettings(){
 const [status,setStatus]=useState(syncStatus),[,tick]=useState(0),[confirm,setConfirm]=useState(false),user=session()?.user||'';
 useEffect(()=>{const on=()=>setStatus(syncStatus());window.addEventListener('recallflow:sync-status',on);const t=setInterval(()=>tick(n=>n+1),30000);return()=>{window.removeEventListener('recallflow:sync-status',on);clearInterval(t);};},[]);
 const label=status.state==='syncing'?'Syncing…':status.state==='offline'?'Offline · changes will sync when you reconnect':status.state==='error'?'Sync problem':ago(status.lastSynced);
 const Icon=status.state==='offline'||status.state==='error'?CloudOff:status.state==='syncing'?RefreshCw:CircleCheck;
 return <Panel icon={Cloud} title={`Signed in as ${user}`} detail="Questions, pictures, reports and settings sync across your devices.">
  <div className="sync-status" data-state={status.state}><Icon size={20}/><div><strong>{label}</strong>{status.state==='error'&&<small>{status.error}</small>}{status.pendingImages>0&&<small>{status.pendingImages} {status.pendingImages===1?'picture':'pictures'} waiting to upload</small>}</div></div>
  <div className="settings-button-row"><Button onClick={()=>syncNow()} disabled={status.state==='syncing'}><RefreshCw size={16}/>Sync now</Button><Button variant="outline" onClick={()=>setConfirm(!confirm)}><LogOut size={16}/>Log out</Button></div>
  {confirm&&<div className="settings-confirm" role="alertdialog" aria-label="Confirm log out"><p>Log out on this device? Your questions stay saved online.</p><div className="settings-button-row"><Button variant="destructive" onClick={async()=>{await syncNow();await signOut();}}>Log out</Button><Button variant="outline" onClick={()=>setConfirm(false)}>Cancel</Button></div></div>}
 </Panel>;
}

function DangerZone({onResetProgress,onDeleteAll}:any){
 const [open,setOpen]=useState<''|'progress'|'all'>(''),[typed,setTyped]=useState('');
 return <Panel icon={TriangleAlert} title="Danger zone" detail="These actions cannot be undone." className="settings-danger">
  <div className="settings-danger-row"><div><strong>Reset progress</strong><small>Clear reports, streak and review schedule on all your devices. Questions stay.</small></div><Button variant="outline" onClick={()=>{setOpen(open==='progress'?'':'progress');setTyped('');}}><RotateCcw size={15}/>Reset</Button></div>
  {open==='progress'&&<div className="settings-confirm" role="alertdialog" aria-label="Confirm reset progress"><p>Reset all study progress?</p><div className="settings-button-row"><Button variant="destructive" onClick={()=>{onResetProgress();setOpen('');}}>Reset progress</Button><Button variant="outline" onClick={()=>setOpen('')}>Cancel</Button></div></div>}
  <div className="settings-danger-row"><div><strong>Delete everything</strong><small>Remove all questions, reports and settings on all your devices, and voice clips here.</small></div><Button variant="outline" className="is-danger" onClick={()=>{setOpen(open==='all'?'':'all');setTyped('');}}><Trash2 size={15}/>Delete</Button></div>
  {open==='all'&&<div className="settings-confirm" role="alertdialog" aria-label="Confirm delete everything"><p>Type <b>DELETE</b> to remove everything from all your devices.</p><input aria-label="Type DELETE to confirm" value={typed} onChange={e=>setTyped(e.target.value)} placeholder="DELETE" autoComplete="off"/><div className="settings-button-row"><Button variant="destructive" disabled={typed.trim().toUpperCase()!=='DELETE'} onClick={onDeleteAll}>Delete everything</Button><Button variant="outline" onClick={()=>setOpen('')}>Cancel</Button></div></div>}
 </Panel>;
}

function useNarrow(){
 const query='(max-width: 819px)',[narrow,setNarrow]=useState(()=>window.matchMedia(query).matches);
 useEffect(()=>{const m=window.matchMedia(query),on=()=>setNarrow(m.matches);m.addEventListener('change',on);return()=>m.removeEventListener('change',on);},[]);
 return narrow;
}

export function SettingsPage({items,reports,quizCount,streakDays,theme,onTheme,onQuizDefaults,onOpenTransfer,onResetProgress,onDeleteAll}:any){
 const narrow=useNarrow(),[activeSection,setActiveSection]=useState('profile'),[openSection,setOpenSection]=useState<string|null>(()=>history.state?.rfSettings??null);
 const [prefs]=usePrefs();
 useEffect(()=>{if(narrow)return;const els=sections.map(([id])=>document.getElementById(`settings-${id}`)).filter(Boolean) as HTMLElement[];const observer=new IntersectionObserver(entries=>{const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(visible)setActiveSection(visible.target.id.slice(9));},{rootMargin:'-20% 0px -65% 0px'});els.forEach(el=>observer.observe(el));return()=>observer.disconnect();},[narrow]);
 useEffect(()=>{const back=(e:PopStateEvent)=>setOpenSection(e.state?.rfSettings??null);window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);
 const jump=(id:string)=>{setActiveSection(id);document.getElementById(`settings-${id}`)?.scrollIntoView({behavior:document.documentElement.classList.contains('rf-reduce-motion')?'auto':'smooth',block:'start'});};
 const open=(id:string)=>{history.pushState({...history.state,rfSettings:id},'',location.href);setOpenSection(id);window.scrollTo(0,0);};
 const close=()=>{if(history.state?.rfSettings)history.back();else setOpenSection(null);window.scrollTo(0,0);};
 const summaries:Record<string,string>={profile:prefs.name||'Your name',account:'Sync and log out',appearance:'Theme, text size, motion',voice:'Device voice or Kokoro, speed',quiz:'Questions per quiz, shuffle, countdown',data:'Import, export, backup, reset',app:'Install, offline, about'};
 const groups:Record<string,React.ReactNode>={
  profile:<ProfileSettings/>,
  account:<AccountSettings/>,
  appearance:<AppearanceSettings theme={theme} onTheme={onTheme}/>,
  voice:<><KokoroPanel/><VoiceBehaviour/></>,
  quiz:<QuizDefaults onSaved={onQuizDefaults}/>,
  data:<>
   <Panel icon={Database} title="Storage" detail="A copy on this device, so it works offline."><StorageMeter items={items}/></Panel>
   <button className="settings-link-card" onClick={onOpenTransfer}><span className="settings-icon"><ArrowLeftRight size={19}/></span><span><strong>Import & export questions</strong><small>CSV, Anki, JSON or plain text</small></span><ArrowRight size={18}/></button>
   {session()&&<TelegramBackup/>}
   <BackupPanel items={items} reports={reports} quizCount={quizCount} streakDays={streakDays} theme={theme}/>
   <BackupRestore/>
   <DangerZone onResetProgress={onResetProgress} onDeleteAll={onDeleteAll}/>
  </>,
  app:<><OfflineSettings/><Panel icon={Info} title="About RecallFlow" detail="Version 2026.10"><ul className="settings-about"><li><Check size={15}/>Works offline once installed</li><li><Check size={15}/>Private login, synced through your own GitHub</li><li><Check size={15}/>{items.length} {items.length===1?'question':'questions'} · {reports.length} {reports.length===1?'report':'reports'}</li></ul></Panel></>
 };
 if(narrow){
  const current=sections.find(([id])=>id===openSection);
  if(current)return <section className="settings-page settings-mobile is-detail">
   <header className="settings-detail-head"><button type="button" className="settings-back" onClick={close}><ChevronLeft size={20}/>Settings</button><h1>{current[1]}</h1></header>
   <div className="settings-content" id={`settings-${current[0]}`}>{groups[current[0]]}</div>
  </section>;
  return <section className="settings-page settings-mobile">
   <header className="settings-hero"><h1>Settings</h1></header>
   <nav className="settings-menu" aria-label="Settings sections">{sections.map(([id,label,Icon])=><button type="button" key={id} onClick={()=>open(id)}><span className="settings-menu-icon" data-section={id}><Icon size={18} aria-hidden="true"/></span><span className="settings-menu-copy"><strong>{label}</strong><small>{summaries[id]}</small></span><ChevronRight size={18} aria-hidden="true"/></button>)}</nav>
  </section>;
 }
 return <section className="settings-page settings-layout">
  <header className="settings-hero"><h1>Settings</h1></header>
  <nav className="settings-jump" aria-label="Settings sections">{sections.map(([id,label,Icon])=><a key={id} href="#/settings" aria-current={activeSection===id?'true':undefined} onClick={e=>{e.preventDefault();jump(id);}}><Icon size={16} aria-hidden="true"/><span>{label}</span></a>)}</nav>
  <div className="settings-content">
   {sections.map(([id,label])=><div className="settings-group" id={`settings-${id}`} key={id}><h2 className="settings-group-title">{label}</h2>{groups[id]}</div>)}
  </div>
 </section>;
}
