import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileUp,FileDown,FileJson,Sheet,Layers,FileText,Download,Copy,Check,CheckCircle2,AlertCircle,UploadCloud,ClipboardPaste,ArrowLeft,X,ImageIcon,History,AudioLines,Sparkles,ChevronRight,ChevronDown,Film,Undo2,Share2,Eye,Library,BookOpen,LayoutGrid,ListChecks,Info,FolderInput} from 'lucide-react';
import {Button} from './components/Button';
import {questionTypes,typeLabel,validateQuestion} from '../question-types.js';
import {itemTypes} from '../question-variants.js';
import {exportFormats,importFormats,serialize,parseImport,duplicateKey,csvTemplate,aiImportPrompt,embeddedAudioCount,embeddedVideoCount} from '../transfer-formats.js';
import {inlineImages} from '../sync.js';

const formatIcons:any={json:FileJson,csv:Sheet,tsv:Layers,text:FileText};
const formatShort:any={json:['RecallFlow','Full backup'],csv:['Spreadsheet','Excel · Sheets'],tsv:['Flashcards','Anki · Quizlet'],text:['Printable','Read or print']};
const importShort:any={json:'RecallFlow',csv:'CSV',tsv:'Tab separated',lines:'Text lines'};
const size=(n:number)=>n<1024?`${n} B`:n<1048576?`${Math.round(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
const plural=(n:number,one:string,many=one+'s')=>`${n} ${n===1?one:many}`;
const FORMAT_KEY='recallflow_export_format';
function download(text:string,name:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function ExportPanel({items,selectedIds,onDone}:any){
 const subjects=useMemo(()=>{const m=new Map<string,number>();for(const x of items){const s=x.subject||'General';m.set(s,(m.get(s)||0)+1);}return [...m].sort((a,b)=>a[0].localeCompare(b[0]));},[items]);
 const [scope,setScope]=useState(selectedIds.length?'selected':'all'),[subject,setSubject]=useState(subjects[0]?.[0]||''),[types,setTypes]=useState<string[]>([]);
 const [format,setFormatState]=useState(()=>{try{const f=localStorage.getItem(FORMAT_KEY);return exportFormats.some(x=>x.id===f)?f!:'json';}catch{return 'json';}});
 const setFormat=(f:string)=>{setFormatState(f);try{localStorage.setItem(FORMAT_KEY,f);}catch{}};
 const [preview,setPreview]=useState(false),[images,setImages]=useState(true),[audio,setAudio]=useState(false),[video,setVideo]=useState(false),[progress,setProgress]=useState(true),[status,setStatus]=useState('');
 const chosen=useMemo(()=>scope==='selected'?items.filter((x:any)=>selectedIds.includes(x.id)):scope==='subject'?items.filter((x:any)=>(x.subject||'General')===subject):scope==='types'?items.filter((x:any)=>!types.length||itemTypes(x).some(t=>types.includes(t))):items,[items,scope,subject,types,selectedIds]);
 const [inlined,setInlined]=useState<any[]|null>(chosen);
 useEffect(()=>{if(format!=='json'||!images||!chosen.some((x:any)=>JSON.stringify(x).includes('"rf-img/'))){setInlined(chosen);return;}let live=true;setInlined(null);inlineImages(chosen).then((x:any[])=>{if(live)setInlined(x);}).catch(()=>{if(live)setInlined(chosen);});return()=>{live=false;};},[chosen,format,images]);
 const output=useMemo(()=>inlined?.length?serialize(inlined,format,{images,audio,video,progress}):'',[inlined,format,images,audio,video,progress]);
 const preparing=!inlined;
 const meta=exportFormats.find(f=>f.id===format)!;
 const imageCount=chosen.filter((x:any)=>x.image||x.answerImage||Object.keys(x.optionImages||{}).length).length;
 const soundCount=embeddedAudioCount(chosen);
 const linkSoundCount=chosen.filter((x:any)=>typeof x.audio==='string'&&x.audio.startsWith('https://')||typeof x.answerAudio==='string'&&x.answerAudio.startsWith('https://')).length;
 const videoCount=embeddedVideoCount(chosen);
 const linkVideoCount=chosen.filter((x:any)=>['video','answerVideo'].some(k=>typeof x[k]==='string'&&x[k].startsWith('https://'))).length;
 const chosenSubjects=new Set(chosen.map((x:any)=>x.subject||'General')).size;
 const bytes=useMemo(()=>new Blob([output]).size,[output]);
 const name=`recallflow-${scope==='subject'?subject.toLowerCase().replace(/[^a-z0-9]+/g,'-'):scope}-${new Date().toISOString().slice(0,10)}.${meta.ext}`;
 async function copy(){try{await navigator.clipboard.writeText(output);setStatus('Copied to the clipboard.');}catch{setStatus('Copy is blocked here. Use Download instead.');}}
 const canShare=useMemo(()=>{if(typeof navigator==='undefined'||!navigator.share||!navigator.canShare)return false;try{return navigator.canShare({files:[new File(['x'],'test.'+meta.ext,{type:meta.mime})]});}catch{return false;}},[meta]);
 async function share(){let f:File;try{f=new File([output],name,{type:meta.mime});}catch{return;}try{await navigator.share({files:[f],title:name});setStatus(`Shared ${name}`);}catch(e:any){if(e?.name!=='AbortError')setStatus('Sharing did not work here. Use Download instead.');}}
 const typeCounts=useMemo(()=>new Map(questionTypes.map(([id]:any)=>[id,items.filter((x:any)=>itemTypes(x).includes(id)).length])),[items]);
 const scopes:[string,string,string,any][]=[['subject','One subject',plural(subjects.length,'subject'),BookOpen],['types','By type',types.length?`${types.length} picked`:'Pick types',LayoutGrid],['all','Everything',plural(items.length,'question'),Library],...(selectedIds.length?[['selected','Selected in library',plural(selectedIds.length,'question'),ListChecks] as [string,string,string,any]]:[])];
 const switchRow=(Icon:any,title:string,hint:string,checked:boolean,set:(v:boolean)=>void)=><label className="settings-switch"><span className="settings-switch-icon"><Icon size={17}/></span><span className="settings-switch-copy"><strong>{title}</strong><small>{hint}</small></span><input type="checkbox" role="switch" checked={checked} onChange={e=>set(e.target.checked)}/><i aria-hidden="true"/></label>;
 return <div className="tf-stack">
  <section className="tf-card">
   <h2 className="tf-h">What to export</h2>
   <div className="tf-scope" role="radiogroup" aria-label="Questions to export">{scopes.map(([id,label,hint,Icon])=>{const wide=id==='all'||id==='selected';return <button key={id} type="button" role="radio" aria-checked={scope===id} data-span={wide?'wide':undefined} data-kind={id} onClick={()=>setScope(id)}><Icon size={wide?22:19}/><span className="tf-scope-copy"><strong>{label}</strong><small>{hint}</small></span></button>;})}</div>
   {scope==='subject'&&<div className="tf-chips" role="radiogroup" aria-label="Subject">{subjects.map(([s,n])=><button key={s} type="button" role="radio" aria-checked={subject===s} onClick={()=>setSubject(s)}>{s}<b>{n}</b></button>)}</div>}
   {scope==='types'&&<div className="tf-chips" role="group" aria-label="Question types">{questionTypes.map(([id,label]:any)=>{const n=typeCounts.get(id)||0;return n>0&&<button key={id} type="button" aria-pressed={types.includes(id)} onClick={()=>setTypes(t=>t.includes(id)?t.filter(x=>x!==id):[...t,id])}>{types.includes(id)&&<Check size={13}/>}{label}<b>{n}</b></button>;})}</div>}
  </section>
  <section className="tf-card">
   <h2 className="tf-h">Format</h2>
   <div className="tf-formats" role="radiogroup" aria-label="Export format">{exportFormats.map(f=>{const Icon=formatIcons[f.id];const [label,tag]=formatShort[f.id]||[f.label,''];return <button key={f.id} type="button" role="radio" aria-checked={format===f.id} data-format={f.id} onClick={()=>setFormat(f.id)}><span className="tf-format-icon"><Icon size={18}/></span><strong>{label}</strong><small>{tag}</small>{format===f.id&&<Check size={15} className="tf-format-check"/>}</button>;})}</div>
   <p className="tf-format-detail"><Info size={14}/>{meta.detail}</p>
   {format==='json'&&<div className="tf-include"><p className="tf-label">Include in the file</p>
    {switchRow(ImageIcon,'Pictures',imageCount?`${plural(imageCount,'question')} with pictures`:'None in this selection',images,setImages)}
    {switchRow(AudioLines,'Recorded sounds',soundCount?`${plural(soundCount,'clip')} · makes the file larger`:linkSoundCount?'Sound links are always kept':'None in this selection',audio,setAudio)}
    {switchRow(Film,'Uploaded videos',videoCount?`${plural(videoCount,'video')} · makes the file much larger`:linkVideoCount?'Video links are always kept':'None in this selection',video,setVideo)}
    {switchRow(History,'Study progress','Review dates and past answers',progress,setProgress)}
   </div>}
   {format!=='json'&&chosen.some((x:any)=>x.variants?.length)&&<p className="tf-note">Questions with several types keep only their first type here. Choose RecallFlow to keep them all.</p>}
  </section>
  <section className="tf-card tf-summary-card">
   <div className="tf-file-line"><span className="tf-file-icon" data-format={format}>{React.createElement(formatIcons[format],{size:20})}</span><span><strong>{name}</strong><small>{preparing?'Preparing pictures…':chosen.length?size(bytes):'Nothing to export'}</small></span></div>
   <div className="tf-facts"><span><b>{chosen.length}</b>{chosen.length===1?'question':'questions'}</span><span><b>{chosenSubjects}</b>{chosenSubjects===1?'subject':'subjects'}</span><span><b>{format==='json'&&images?imageCount:0}</b>pictures</span></div>
   {chosen.length>0&&!preparing&&<><button type="button" className="tf-collapse" aria-expanded={preview} onClick={()=>setPreview(v=>!v)}><Eye size={16}/><span>Preview the file</span><ChevronDown size={16} className="tf-chev"/></button>{preview&&<pre className="tf-pre">{output.length>2400?output.slice(0,2400)+'\n…':output}</pre>}</>}
  </section>
  <footer className="tf-bar"><div className="tf-bar-copy"><strong>{plural(chosen.length,'question')}</strong><small>{preparing?'Preparing…':chosen.length?`${formatShort[format]?.[0]||meta.label} · ${size(bytes)}`:'Pick something to export'}</small></div><div className="tf-bar-actions">{canShare?<Button variant="outline" disabled={!chosen.length||preparing} onClick={share}><Share2 size={16}/>Share</Button>:<Button variant="outline" disabled={!chosen.length||preparing} onClick={copy} aria-label="Copy to clipboard"><Copy size={16}/>Copy</Button>}<Button disabled={!chosen.length||preparing} onClick={()=>{download(output,name,meta.mime);setStatus(`Downloaded ${name}`);onDone?.();}}><Download size={16}/>Download</Button></div></footer>
  {status&&<p className="tf-status" role="status"><CheckCircle2 size={15}/>{status}</p>}
 </div>;
}

function AiHelper({onCopyPrompt,promptCopied}:any){
 const example=`{
  "prompt": "Capital of France?",
  "type": "short_answer",
  "answer": "Paris",
  "audio": "https://…/paris.mp3",
  "variants": [
    { "type": "single_choice", "options": ["Paris","Lyon","Nice"] }
  ]
}`;
 return <div className="tf-ai">
  <ol className="tf-steps"><li><b>1</b><span>Copy the guide below</span></li><li><b>2</b><span>Paste it into ChatGPT or any AI with your notes</span></li><li><b>3</b><span>Paste or upload what it gives back</span></li></ol>
  <Button className="tf-ai-copy" onClick={onCopyPrompt}><Sparkles size={16}/>Copy AI guide</Button>
  {promptCopied&&<p className="tf-status" role="status"><CheckCircle2 size={15}/>{promptCopied}</p>}
  <details className="tf-ai-example"><summary>See an example question<ChevronDown size={15} className="tf-chev"/></summary><div><button type="button" onClick={()=>void navigator.clipboard?.writeText(example)}><Copy size={13}/>Copy</button><pre className="tf-pre">{example}</pre></div></details>
  <p className="tf-note">Pictures and sounds should be https links. Several types per question are kept.</p>
 </div>;
}

function ImportPanel({items,onImport,onUndo,onBack}:any){
 const [text,setText]=useState(''),[fileName,setFileName]=useState(''),[format,setFormat]=useState('auto'),[pasting,setPasting]=useState(false),[drag,setDrag]=useState(false),[promptCopied,setPromptCopied]=useState(''),[aiOpen,setAiOpen]=useState(false),[optsOpen,setOptsOpen]=useState(false);
 const [subject,setSubject]=useState(''),[topic,setTopic]=useState(''),[tag,setTag]=useState(''),[dupes,setDupes]=useState<'skip'|'keep'>('skip'),[keepProgress,setKeepProgress]=useState(false),[excluded,setExcluded]=useState<Set<number>>(new Set()),[done,setDone]=useState<number|null>(null),[added,setAdded]=useState<{ids:string[];subjects:[string,number][]}>({ids:[],subjects:[]}),[undone,setUndone]=useState(false);
 const input=useRef<HTMLInputElement>(null);
 const parsed=useMemo(()=>{
  if(!text.trim())return null;
  try{
   const {format:detected,records}=parseImport(text,format,fileName);
   const existing=new Set(items.map(duplicateKey)),seen=new Set<string>();
   const rows=records.map((r:any,i:number)=>{try{const item=validateQuestion({...r,prompt:String(r.prompt||'')});const key=duplicateKey(item);const duplicate=existing.has(key)||seen.has(key);seen.add(key);return {i,item,duplicate};}catch(e:any){return {i,error:e.message,raw:r};}});
   return {detected,rows,hasProgress:records.some((r:any)=>r?.due||r?.attempts)};
  }catch(e:any){return {error:e.message||'This file could not be read.'};}
 },[text,format,fileName,items]);
 const rows=(parsed as any)?.rows||[];
 const ready=rows.filter((r:any)=>r.item&&!excluded.has(r.i)&&(dupes==='keep'||!r.duplicate));
 const pickable=rows.filter((r:any)=>r.item&&(dupes==='keep'||!r.duplicate));
 const newCount=rows.filter((r:any)=>r.item&&!r.duplicate).length,dupeCount=rows.filter((r:any)=>r.duplicate).length,errorCount=rows.filter((r:any)=>r.error).length;
 const [fileError,setFileError]=useState('');
 async function readFile(file?:File){if(!file)return;if(file.size>15*1024*1024){setFileName('');setText('');setFileError('Choose a file under 15 MB.');return;}setFileError('');setText(await file.text());setFileName(file.name);setFormat('auto');setExcluded(new Set());setDone(null);setPasting(false);}
 async function copyPrompt(){try{await navigator.clipboard.writeText(aiImportPrompt);setPromptCopied('AI guide copied. Paste it into your AI chat.');}catch{setPromptCopied('Copy is blocked here. Try another browser.');}}
 function commit(){
  const stamp=Date.now(),extraTags=tag.split(',').map(x=>x.trim()).filter(Boolean);
  const clean=ready.map((r:any,n:number)=>{const {id:_id,...item}=r.item;const out:any={...item,id:`item_${stamp}_${n}`,subject:subject.trim()||String(item.subject||'').trim()||'General',topic:topic.trim()||String(item.topic||'').trim()||'Imported',tags:[...new Set([...(item.tags||[]),...extraTags])]};if(!out.tags.length)delete out.tags;if(!keepProgress)for(const k of ['due','interval','lastReviewed','attempts','lapses'])delete out[k];for(const k of Object.keys(out))if(out[k]===undefined)delete out[k];return out;});
  const subs=new Map<string,number>();for(const x of clean)subs.set(x.subject,(subs.get(x.subject)||0)+1);
  onImport(clean);setDone(clean.length);setAdded({ids:clean.map((x:any)=>x.id),subjects:[...subs].sort((a,b)=>b[1]-a[1])});setUndone(false);window.scrollTo({top:0,behavior:'smooth'});
 }
 function reset(){setUndone(false);setAdded({ids:[],subjects:[]});setText('');setFileName('');setFormat('auto');setExcluded(new Set());setDone(null);setSubject('');setTopic('');setTag('');setPromptCopied('');setAiOpen(false);setPasting(false);setOptsOpen(false);}
 const detectedLabel=(parsed as any)?.detected?importFormats.find(([id])=>id===(parsed as any).detected)?.[1]:'';

 if(done!==null)return <div className="tf-stack"><section className="tf-card tf-done">
  {undone?<><span className="tf-done-icon is-undone"><Undo2 size={28}/></span><h2>Import undone</h2><p>{plural(done,'question')} removed. Your bank is back to how it was.</p><div className="tf-done-actions"><Button onClick={reset}>Import something else</Button></div></>
  :<><span className="tf-done-icon"><CheckCircle2 size={32}/></span><h2>Added {plural(done,'question')}</h2><p>They are in your question bank and ready to practise.</p>
   {added.subjects.length>0&&<div className="tf-done-tags">{added.subjects.slice(0,5).map(([s,n])=><span key={s}>{s}<b>{n}</b></span>)}</div>}
   <div className="tf-done-actions"><Button onClick={onBack}>View questions</Button><Button variant="outline" onClick={reset}>Import more</Button></div>
   {onUndo&&added.ids.length>0&&<button type="button" className="tf-undo" onClick={()=>{onUndo(added.ids);setUndone(true);}}><Undo2 size={15}/>Undo this import</button>}</>}
 </section></div>;

 const fileInput=<input ref={input} type="file" hidden aria-label="Choose a file to import" accept=".json,.csv,.tsv,.txt,.md,application/json,text/csv,text/plain,text/tab-separated-values" onChange={e=>{void readFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>;

 if(pasting)return <div className="tf-stack"><section className="tf-card">
  <div className="tf-card-head"><span className="tf-tile" data-tone="blue"><ClipboardPaste size={18}/></span><div><h2>Paste questions</h2><p>One per line. Put the answer after a | or a comma.</p></div></div>
  <textarea className="tf-textarea" autoFocus value={text} onChange={e=>{setText(e.target.value);setFileName('');setFormat('auto');setExcluded(new Set());}} placeholder={'Capital of France? | Paris\nLargest planet, Jupiter\nH2O is called… | Water'}/>
  <p className="tf-live" data-state={!text.trim()?'empty':errorCount&&!newCount?'error':'ok'}>{!text.trim()?'Questions are checked as you type.':(parsed as any)?.error?(parsed as any).error:<><b>{plural(newCount,'question')}</b> ready{dupeCount?` · ${dupeCount} already in your bank`:''}{errorCount?` · ${errorCount} missing an answer`:''}</>}</p>
  <div className="tf-row-actions"><Button variant="outline" onClick={()=>{setPasting(false);setText('');}}>Cancel</Button><Button disabled={!rows.length} onClick={()=>setPasting(false)}>Review<ChevronRight size={16}/></Button></div>
 </section></div>;

 if(!text.trim())return <div className="tf-stack">
  <button type="button" className="tf-drop" data-drag={drag||undefined} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void readFile(e.dataTransfer.files?.[0]);}}>
   <span className="tf-drop-icon"><UploadCloud size={28}/></span>
   <strong>Choose a file</strong><small>or drag and drop it here</small>
   <span className="tf-drop-types">{['JSON','CSV','TSV','TXT'].map(t=><i key={t}>{t}</i>)}</span>
  </button>
  {fileInput}
  {fileError&&<p className="tf-error" role="alert"><AlertCircle size={16}/>{fileError}</p>}
  <p className="tf-label">Other ways to add</p>
  <div className="tf-list">
   <button type="button" className="tf-item" onClick={()=>setPasting(true)}><span className="tf-tile" data-tone="blue"><ClipboardPaste size={18}/></span><span className="tf-item-copy"><strong>Paste text</strong><small>Type or paste question and answer lines</small></span><ChevronRight size={18} className="tf-item-chev"/></button>
   <button type="button" className="tf-item" aria-expanded={aiOpen} onClick={()=>setAiOpen(o=>!o)}><span className="tf-tile" data-tone="violet"><Sparkles size={18}/></span><span className="tf-item-copy"><strong>Make questions with AI</strong><small>Turn your notes into questions with any AI chat</small></span><ChevronDown size={18} className="tf-item-chev tf-chev"/></button>
   {aiOpen&&<AiHelper onCopyPrompt={()=>void copyPrompt()} promptCopied={promptCopied}/>}
   <button type="button" className="tf-item" onClick={()=>download(csvTemplate,'recallflow-template.csv','text/csv')}><span className="tf-tile" data-tone="green"><Sheet size={18}/></span><span className="tf-item-copy"><strong>Spreadsheet template</strong><small>Fill it in Excel or Google Sheets, then import</small></span><Download size={17} className="tf-item-chev"/></button>
  </div>
  <details className="tf-help"><summary><Info size={15}/>Which files work?<ChevronDown size={15} className="tf-chev"/></summary><ul>
   <li><b>RecallFlow file</b><span>The JSON from Export. Keeps every question type, picture and setting.</span></li>
   <li><b>Spreadsheet (CSV)</b><span>Columns like subject, topic, type, prompt, answer, options.</span></li>
   <li><b>Anki / Quizlet</b><span>Front and back separated by a tab.</span></li>
   <li><b>Plain text</b><span>One question per line, answer after | or a comma.</span></li>
  </ul></details>
 </div>;

 const allOn=pickable.length>0&&ready.length===pickable.length;
 const types=new Map<string,number>();for(const r of ready)types.set(r.item.type,(types.get(r.item.type)||0)+1);
 const optsSummary=[subject.trim()?`Subject: ${subject.trim()}`:'Subject from file',topic.trim()?`Topic: ${topic.trim()}`:null,dupes==='skip'?'Skip duplicates':'Keep duplicates'].filter(Boolean).join(' · ');
 return <div className="tf-stack">
  <section className="tf-file">
   <span className="tf-file-icon"><FileUp size={19}/></span>
   <span className="tf-file-copy"><strong>{fileName||'Pasted text'}</strong><label>Read as<select value={format} onChange={e=>{setFormat(e.target.value);setExcluded(new Set());}}>{importFormats.map(([id,label])=><option key={id} value={id}>{id==='auto'?`Automatic${(parsed as any)?.detected?` · ${importShort[(parsed as any).detected]||detectedLabel}`:''}`:label}</option>)}</select></label></span>
   {!fileName&&<button type="button" className="tf-file-edit" onClick={()=>setPasting(true)}>Edit</button>}
   <button type="button" className="tf-file-x" aria-label="Start over" onClick={reset}><X size={17}/></button>
  </section>
  {(parsed as any)?.error&&<p className="tf-error" role="alert"><AlertCircle size={16}/>{(parsed as any).error}</p>}
  {!!rows.length&&<>
   <div className="tf-tally">
    <div data-kind="new"><strong>{newCount}</strong><span>New</span></div>
    <div data-kind="dupe"><strong>{dupeCount}</strong><span>Already have</span></div>
    <div data-kind="error"><strong>{errorCount}</strong><span>Need fixing</span></div>
   </div>
   {errorCount>0&&<div className="tf-fix"><AlertCircle size={16}/><span>{plural(errorCount,'row')} can't be added yet. The AI guide can reformat {errorCount===1?'it':'them'} for you.</span><button type="button" onClick={()=>void copyPrompt()}>Copy guide</button></div>}
   {promptCopied&&errorCount>0&&<p className="tf-status" role="status"><CheckCircle2 size={15}/>{promptCopied}</p>}
   <section className="tf-card tf-review">
    <div className="tf-review-head"><h2 className="tf-h">Questions</h2>{pickable.length>1&&<button type="button" className="tf-link" onClick={()=>setExcluded(allOn?new Set(pickable.map((r:any)=>r.i)):new Set())}>{allOn?'Select none':'Select all'}</button>}</div>
    {ready.length>0&&<div className="tf-types">{[...types].map(([t,n])=><span key={t}>{typeLabel(t)}<b>{n}</b></span>)}</div>}
    <ul className="tf-rows">{rows.slice(0,200).map((r:any)=>{const on=!!r.item&&!excluded.has(r.i)&&(dupes==='keep'||!r.duplicate),locked=!r.item||(r.duplicate&&dupes==='skip');return <li key={r.i}><label className="tf-q" data-state={r.error?'error':r.duplicate?'dupe':'ok'} data-on={on||undefined}>
     {r.item?<input type="checkbox" className="tf-check" aria-label={`Include ${r.item.prompt||'picture question'}`} checked={on} disabled={locked} onChange={e=>setExcluded(s=>{const n=new Set(s);if(e.target.checked)n.delete(r.i);else n.add(r.i);return n;})}/>:<span className="tf-q-alert"><AlertCircle size={17}/></span>}
     <span className="tf-q-copy"><strong>{r.item?.prompt||r.raw?.prompt||(r.item?.image?'Picture question':`Row ${r.i+1}`)}</strong><small>{r.error?r.error:<>{[r.item.type,...(r.item.variants||[]).map((v:any)=>v.type)].map(typeLabel).join(' + ')}<em>{r.item.answer}</em></>}</small></span>
     {r.duplicate&&<span className="tf-badge">Have it</span>}
    </label></li>;})}{rows.length>200&&<li className="tf-more">and {rows.length-200} more</li>}</ul>
   </section>
   <section className="tf-card tf-opts">
    <button type="button" className="tf-collapse tf-opts-toggle" aria-expanded={optsOpen} onClick={()=>setOptsOpen(o=>!o)}><span className="tf-tile" data-tone="amber"><FolderInput size={17}/></span><span className="tf-item-copy"><strong>Where they go</strong><small>{optsSummary}</small></span><ChevronDown size={17} className="tf-chev"/></button>
    {optsOpen&&<div className="tf-opts-body">
     <div className="tf-grid"><label className="tf-field">Subject<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Keep from file"/></label><label className="tf-field">Topic<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Keep from file"/></label></div>
     <label className="tf-field">Add tags<input value={tag} onChange={e=>setTag(e.target.value)} placeholder="e.g. imported, chapter 3"/></label>
     <p className="tf-label">If a question is already in your bank</p>
     <div className="settings-segmented" role="radiogroup" aria-label="Duplicates"><button type="button" role="radio" aria-checked={dupes==='skip'} onClick={()=>setDupes('skip')}>Skip it</button><button type="button" role="radio" aria-checked={dupes==='keep'} onClick={()=>setDupes('keep')}>Add a copy</button></div>
     {(parsed as any).hasProgress&&<label className="settings-switch"><span className="settings-switch-icon"><History size={17}/></span><span className="settings-switch-copy"><strong>Keep study progress</strong><small>Otherwise they start as new questions.</small></span><input type="checkbox" role="switch" checked={keepProgress} onChange={e=>setKeepProgress(e.target.checked)}/><i aria-hidden="true"/></label>}
    </div>}
   </section>
   <footer className="tf-bar"><div className="tf-bar-copy"><strong>{plural(ready.length,'question')}</strong><small>{ready.length?'Ready to add':newCount?'Nothing selected':'Nothing new to add'}</small></div><div className="tf-bar-actions"><Button disabled={!ready.length} onClick={commit}><FileUp size={16}/>Add {ready.length||''}</Button></div></footer>
  </>}
 </div>;
}

export function TransferPage({items,selectedIds,initial='import',onImport,onUndo,onBack}:any){
 const [tab,setTab]=useState<'import'|'export'>(initial);
 const subjectCount=useMemo(()=>new Set(items.map((x:any)=>x.subject||'General')).size,[items]);
 return <section className="tf-page">
  <button className="tf-back" onClick={onBack}><ArrowLeft size={16}/>Question bank</button>
  <header className="tf-hero"><h1>Import &amp; export</h1><p>{plural(items.length,'question')} · {plural(subjectCount,'subject')} in your bank</p></header>
  <div className="tf-tabs" role="tablist" aria-label="Import or export" data-tab={tab}><span className="tf-tabs-pill" aria-hidden="true"/>{([['import','Import',FileUp],['export','Export',FileDown]] as const).map(([id,label,Icon])=><button key={id} type="button" role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>
  {tab==='import'?<ImportPanel items={items} onImport={onImport} onUndo={onUndo} onBack={onBack}/>:<ExportPanel items={items} selectedIds={selectedIds}/>}
 </section>;
}
