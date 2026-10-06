import React,{useEffect,useMemo,useRef,useState} from 'react';
import {FileUp,FileDown,FileJson,Sheet,Layers,FileText,Download,Copy,Check,CheckCircle2,AlertCircle,CopyCheck,UploadCloud,ClipboardPaste,ArrowLeft,X,ImageIcon,History} from 'lucide-react';
import {Button} from './components/Button';
import {questionTypes,typeLabel,validateQuestion} from '../question-types.js';
import {itemTypes} from '../question-variants.js';
import {exportFormats,importFormats,serialize,parseImport,duplicateKey,csvTemplate} from '../transfer-formats.js';
import {inlineImages} from '../sync.js';

const formatIcons:any={json:FileJson,csv:Sheet,tsv:Layers,text:FileText};
const size=(n:number)=>n<1024?`${n} B`:n<1048576?`${Math.round(n/1024)} KB`:`${(n/1048576).toFixed(1)} MB`;
function download(text:string,name:string,mime:string){const url=URL.createObjectURL(new Blob([text],{type:mime+';charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

function ExportPanel({items,selectedIds,onDone}:any){
 const subjects=useMemo(()=>[...new Set(items.map((x:any)=>x.subject||'General'))].sort() as string[],[items]);
 const [scope,setScope]=useState(selectedIds.length?'selected':'all'),[subject,setSubject]=useState(subjects[0]||''),[types,setTypes]=useState<string[]>([]);
 const [format,setFormat]=useState('json'),[images,setImages]=useState(true),[progress,setProgress]=useState(true),[status,setStatus]=useState('');
 const chosen=useMemo(()=>scope==='selected'?items.filter((x:any)=>selectedIds.includes(x.id)):scope==='subject'?items.filter((x:any)=>(x.subject||'General')===subject):scope==='types'?items.filter((x:any)=>!types.length||itemTypes(x).some(t=>types.includes(t))):items,[items,scope,subject,types,selectedIds]);
 const [inlined,setInlined]=useState<any[]|null>(chosen);
 useEffect(()=>{if(format!=='json'||!images||!chosen.some((x:any)=>JSON.stringify(x).includes('"rf-img/'))){setInlined(chosen);return;}let live=true;setInlined(null);inlineImages(chosen).then((x:any[])=>{if(live)setInlined(x);}).catch(()=>{if(live)setInlined(chosen);});return()=>{live=false;};},[chosen,format,images]);
 const output=useMemo(()=>inlined?.length?serialize(inlined,format,{images,progress}):'',[inlined,format,images,progress]);
 const preparing=!inlined;
 const meta=exportFormats.find(f=>f.id===format)!;
 const imageCount=chosen.filter((x:any)=>x.image||x.answerImage||Object.keys(x.optionImages||{}).length).length;
 const name=`recallflow-${scope==='subject'?subject.toLowerCase().replace(/[^a-z0-9]+/g,'-'):scope}-${new Date().toISOString().slice(0,10)}.${meta.ext}`;
 async function copy(){try{await navigator.clipboard.writeText(output);setStatus('Copied to the clipboard.');}catch{setStatus('Copy is blocked here. Use Download instead.');}}
 return <div className="transfer-panel">
  <section className="transfer-card"><h2><span>1</span>Which questions?</h2>
   <div className="transfer-scope" role="radiogroup" aria-label="Questions to export">
    {[['all','All questions',`${items.length}`],['subject','One subject',`${subjects.length} ${subjects.length===1?'subject':'subjects'}`],['types','By question type',types.length?`${types.length} selected`:'Any type'],...(selectedIds.length?[['selected','Selected in library',`${selectedIds.length}`]]:[])].map(([id,label,hint])=><button key={id} role="radio" aria-checked={scope===id} onClick={()=>setScope(id)}><i aria-hidden="true"/><span><strong>{label}</strong><small>{hint}</small></span></button>)}
   </div>
   {scope==='subject'&&<label className="transfer-field">Subject<select value={subject} onChange={e=>setSubject(e.target.value)}>{subjects.map(s=><option key={s}>{s}</option>)}</select></label>}
   {scope==='types'&&<div className="transfer-chips" role="group" aria-label="Question types">{questionTypes.map(([id,label])=>{const count=items.filter((x:any)=>itemTypes(x).includes(id)).length;return <label key={id} data-empty={!count||undefined}><input type="checkbox" checked={types.includes(id)} disabled={!count} onChange={e=>setTypes(t=>e.target.checked?[...t,id]:t.filter(x=>x!==id))}/><span>{label}<b>{count}</b></span></label>;})}</div>}
  </section>
  <section className="transfer-card"><h2><span>2</span>Format</h2>
   <div className="transfer-formats" role="radiogroup" aria-label="Export format">{exportFormats.map(f=>{const Icon=formatIcons[f.id];return <button key={f.id} role="radio" aria-checked={format===f.id} onClick={()=>setFormat(f.id)}><Icon size={20}/><span><strong>{f.label}</strong><small>{f.detail}</small></span>{format===f.id&&<Check size={16} className="transfer-check"/>}</button>;})}</div>
   {format==='json'&&<div className="transfer-options"><label className="settings-switch"><span className="settings-switch-icon"><ImageIcon size={17}/></span><span className="settings-switch-copy"><strong>Include images</strong><small>{imageCount?`${imageCount} ${imageCount===1?'question has':'questions have'} images`:'No images in this selection'}</small></span><input type="checkbox" role="switch" checked={images} onChange={e=>setImages(e.target.checked)}/><i aria-hidden="true"/></label><label className="settings-switch"><span className="settings-switch-icon"><History size={17}/></span><span className="settings-switch-copy"><strong>Include study progress</strong><small>Next review dates and attempts</small></span><input type="checkbox" role="switch" checked={progress} onChange={e=>setProgress(e.target.checked)}/><i aria-hidden="true"/></label></div>}
   {format!=='json'&&chosen.some((x:any)=>x.variants?.length)&&<p className="transfer-note">Only the first type of multi-type questions is included. Use RecallFlow file to keep every type.</p>}
  </section>
  <footer className="transfer-footer"><div><strong>{chosen.length} {chosen.length===1?'question':'questions'}</strong><small>{preparing?'Preparing pictures…':chosen.length?`${meta.label} · ${size(new Blob([output]).size)}`:'Nothing to export'}</small></div><div className="transfer-footer-actions"><Button variant="outline" disabled={!chosen.length||preparing} onClick={copy}><Copy size={16}/>Copy</Button><Button disabled={!chosen.length||preparing} onClick={()=>{download(output,name,meta.mime);setStatus(`Downloaded ${name}`);onDone?.();}}><Download size={16}/>Download</Button></div></footer>
  {status&&<p className="transfer-status" role="status">{status}</p>}
 </div>;
}

function ImportPanel({items,onImport,onBack}:any){
 const [text,setText]=useState(''),[fileName,setFileName]=useState(''),[format,setFormat]=useState('auto'),[pasting,setPasting]=useState(false),[drag,setDrag]=useState(false);
 const [subject,setSubject]=useState(''),[topic,setTopic]=useState(''),[tag,setTag]=useState(''),[dupes,setDupes]=useState<'skip'|'keep'>('skip'),[keepProgress,setKeepProgress]=useState(false),[excluded,setExcluded]=useState<Set<number>>(new Set()),[done,setDone]=useState<number|null>(null);
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
 const [fileError,setFileError]=useState('');
 async function readFile(file?:File){if(!file)return;if(file.size>15*1024*1024){setFileName('');setText('');setFileError('Choose a file under 15 MB.');return;}setFileError('');setText(await file.text());setFileName(file.name);setExcluded(new Set());setDone(null);setPasting(false);}
 function commit(){
  const stamp=Date.now(),extraTags=tag.split(',').map(x=>x.trim()).filter(Boolean);
  const clean=ready.map((r:any,n:number)=>{const {id:_id,...item}=r.item;const out:any={...item,id:`item_${stamp}_${n}`,subject:subject.trim()||String(item.subject||'').trim()||'General',topic:topic.trim()||String(item.topic||'').trim()||'Imported',tags:[...new Set([...(item.tags||[]),...extraTags])]};if(!out.tags.length)delete out.tags;if(!keepProgress)for(const k of ['due','interval','lastReviewed','attempts','lapses'])delete out[k];for(const k of Object.keys(out))if(out[k]===undefined)delete out[k];return out;});
  onImport(clean);setDone(clean.length);
 }
 function reset(){setText('');setFileName('');setExcluded(new Set());setDone(null);setSubject('');setTopic('');setTag('');}
 if(done!==null)return <div className="transfer-panel"><section className="transfer-card transfer-done"><span className="transfer-done-icon"><CheckCircle2 size={30}/></span><h2>Added {done} {done===1?'question':'questions'}</h2><p>They are in your question bank and ready to practise.</p><div className="transfer-footer-actions"><Button onClick={onBack}>View questions</Button><Button variant="outline" onClick={reset}>Import more</Button></div></section></div>;
 return <div className="transfer-panel">
  {!text.trim()||pasting?<section className="transfer-card"><h2><span>1</span>Add your questions</h2>
   {!pasting&&<button type="button" className="transfer-drop" data-drag={drag||undefined} onClick={()=>input.current?.click()} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void readFile(e.dataTransfer.files?.[0]);}}><UploadCloud size={30}/><strong>Choose a file or drop it here</strong><small>JSON, CSV, TSV or TXT</small></button>}
   {fileError&&<p className="transfer-error" role="alert"><AlertCircle size={16}/>{fileError}</p>}
   <input ref={input} type="file" hidden aria-label="Choose a file to import" accept=".json,.csv,.tsv,.txt,.md,application/json,text/csv,text/plain,text/tab-separated-values" onChange={e=>{void readFile(e.currentTarget.files?.[0]);e.currentTarget.value='';}}/>
   {pasting?<label className="transfer-field">Paste questions<textarea autoFocus value={text} onChange={e=>{setText(e.target.value);setFileName('');setExcluded(new Set());}} placeholder={'One per line, for example:\nCapital of France? | Paris\nLargest planet? | Jupiter'}/></label>:<button type="button" className="transfer-paste-toggle" onClick={()=>setPasting(true)}><ClipboardPaste size={16}/>Paste text instead</button>}
   {pasting&&<div className="transfer-footer-actions"><Button variant="outline" onClick={()=>{setPasting(false);setText('');}}>Cancel</Button><Button disabled={!text.trim()} onClick={()=>setPasting(false)}>Preview</Button></div>}
   <div className="transfer-help"><strong>Supported formats</strong><ul><li><b>RecallFlow file</b> – exported from RecallFlow, keeps everything</li><li><b>CSV</b> – columns: subject, topic, type, prompt, answer, options…</li><li><b>Anki / Quizlet</b> – front and back separated by a tab</li><li><b>Plain lines</b> – <code>question | answer</code> on each line</li></ul><button type="button" onClick={()=>download(csvTemplate,'recallflow-template.csv','text/csv')}><Download size={14}/>Download CSV template</button></div>
  </section>:<>
   <section className="transfer-card"><div className="transfer-file"><FileUp size={20}/><span><strong>{fileName||'Pasted text'}</strong><small>{(parsed as any)?.detected?importFormats.find(([id])=>id===(parsed as any).detected)?.[1]:'Could not read'}</small></span><button type="button" aria-label="Remove file" onClick={reset}><X size={16}/></button></div>
    <label className="transfer-field transfer-inline">Read as<select value={format} onChange={e=>{setFormat(e.target.value);setExcluded(new Set());}}>{importFormats.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    {(parsed as any)?.error&&<p className="transfer-error" role="alert"><AlertCircle size={16}/>{(parsed as any).error}</p>}
   </section>
   {!!rows.length&&<>
    <section className="transfer-card"><h2><span>2</span>Review</h2>
     <div className="transfer-counts"><span data-kind="ready"><CheckCircle2 size={15}/><b>{rows.filter((r:any)=>r.item&&!r.duplicate).length}</b> new</span><span data-kind="dupe"><CopyCheck size={15}/><b>{rows.filter((r:any)=>r.duplicate).length}</b> already in bank</span><span data-kind="error"><AlertCircle size={15}/><b>{rows.filter((r:any)=>r.error).length}</b> need fixing</span></div>
     <ul className="transfer-rows">{rows.slice(0,200).map((r:any)=><li key={r.i} data-state={r.error?'error':r.duplicate?'dupe':'ok'}>{r.item?<input type="checkbox" aria-label={`Include ${r.item.prompt||"picture question"}`} checked={!excluded.has(r.i)&&(dupes==='keep'||!r.duplicate)} disabled={r.duplicate&&dupes==='skip'} onChange={e=>setExcluded(s=>{const n=new Set(s);if(e.target.checked)n.delete(r.i);else n.add(r.i);return n;})}/>:<AlertCircle size={16}/>}<div><strong>{r.item?.prompt||r.raw?.prompt||(r.item?.image?'Picture question':`Row ${r.i+1}`)}</strong><small>{r.error?r.error:`${[r.item.type,...(r.item.variants||[]).map((v:any)=>v.type)].map(typeLabel).join(' + ')} · ${r.item.answer}`}</small></div>{r.duplicate&&<em>Duplicate</em>}</li>)}{rows.length>200&&<li className="transfer-more">and {rows.length-200} more…</li>}</ul>
    </section>
    <section className="transfer-card"><h2><span>3</span>Options</h2>
     <div className="transfer-grid"><label className="transfer-field">Subject<input value={subject} onChange={e=>setSubject(e.target.value)} placeholder="Keep from file"/></label><label className="transfer-field">Topic<input value={topic} onChange={e=>setTopic(e.target.value)} placeholder="Keep from file"/></label></div>
     <label className="transfer-field">Add tags<input value={tag} onChange={e=>setTag(e.target.value)} placeholder="e.g. imported, chapter 3"/></label>
     <p className="settings-label">Duplicates</p>
     <div className="settings-segmented" role="radiogroup" aria-label="Duplicates"><button role="radio" aria-checked={dupes==='skip'} onClick={()=>setDupes('skip')}>Skip</button><button role="radio" aria-checked={dupes==='keep'} onClick={()=>setDupes('keep')}>Import anyway</button></div>
     {(parsed as any).hasProgress&&<label className="settings-switch"><span className="settings-switch-icon"><History size={17}/></span><span className="settings-switch-copy"><strong>Keep study progress</strong><small>Otherwise questions start as new.</small></span><input type="checkbox" role="switch" checked={keepProgress} onChange={e=>setKeepProgress(e.target.checked)}/><i aria-hidden="true"/></label>}
    </section>
    <footer className="transfer-footer"><div><strong>{ready.length} {ready.length===1?'question':'questions'}</strong><small>{ready.length?'Ready to add':'Nothing selected'}</small></div><div className="transfer-footer-actions"><Button disabled={!ready.length} onClick={commit}><FileUp size={16}/>{ready.length?`Add ${ready.length} ${ready.length===1?'question':'questions'}`:'Nothing new to add'}</Button></div></footer>
   </>}
  </>}
 </div>;
}

export function TransferPage({items,selectedIds,initial='import',onImport,onBack}:any){
 const [tab,setTab]=useState<'import'|'export'>(initial);
 return <section className="transfer-page">
  <button className="quiz-options-back transfer-back" onClick={onBack}><ArrowLeft size={16}/>Question bank</button>
  <header className="transfer-hero"><p>YOUR QUESTIONS</p><h1>Import &amp; export</h1></header>
  <div className="transfer-tabs" role="tablist" aria-label="Import or export">{([['import','Import',FileUp],['export','Export',FileDown]] as const).map(([id,label,Icon])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)}><Icon size={17}/>{label}</button>)}</div>
  {tab==='import'?<ImportPanel items={items} onImport={onImport} onBack={onBack}/>:<ExportPanel items={items} selectedIds={selectedIds}/>}
 </section>;
}
