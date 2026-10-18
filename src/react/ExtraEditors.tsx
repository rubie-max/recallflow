import React,{useRef} from 'react';
import {Plus,Trash2,Crosshair} from 'lucide-react';
import {passageTokens,toggleMark} from '../question-types.js';
import {emptyGroups} from '../question-variants.js';
import {TapTarget} from './ExtraAnswers';

// Editor fields for the newer question types. d is the draft of the type being edited.
const rowsOf=(text:any,min=0)=>{const rows=String(text||'').split('\n');while(rows.length<min)rows.push('');return rows;};

export function ListRecallEditor({d,field}:any){
 const rows=rowsOf(d.structured,2),filled=rows.filter(x=>x.trim()).length,set=(next:string[])=>field('structured',next.join('\n'));
 return <div className="editor-sequence editor-list-recall">
  <p className="editor-list-label">List items<small>Learners can name them in any order. Add other accepted spellings after a |, like USA|United States.</small></p>
  {rows.map((s,i)=><div className="editor-step-row" key={i}><span className="editor-row-number">{i+1}</span><input aria-label={`List item ${i+1}`} value={s} placeholder={['e.g. Asia','e.g. Africa'][i]||`Item ${i+1}`} onChange={e=>set(rows.map((x,j)=>j===i?e.target.value:x))}/><div><button type="button" aria-label={`Remove item ${i+1}`} disabled={rows.length<=2} onClick={()=>set(rows.filter((_,j)=>j!==i))}><Trash2 size={14}/></button></div></div>)}
  <button type="button" className="editor-text-button" onClick={()=>set([...rows,''])}><Plus size={15}/>Add item</button>
  <label>How many must they name?<select value={Number(d.listCount)<filled?d.listCount:''} onChange={e=>field('listCount',e.target.value)}><option value="">All of them{filled?` (${filled})`:''}</option>{Array.from({length:Math.max(0,filled-1)},(_,i)=><option key={i+1} value={String(i+1)}>Any {i+1}</option>)}</select></label>
 </div>;
}

export function CategorizeEditor({d,field}:any){
 const groups:any[]=d.groups?.length?d.groups:emptyGroups(),set=(next:any[])=>field('groups',next);
 const change=(i:number,key:string,value:string)=>set(groups.map((g,j)=>j===i?{...g,[key]:value}:g));
 return <div className="editor-groups">
  <p className="editor-list-label">Groups<small>Two to four groups. The quiz mixes all the items together for sorting.</small></p>
  {groups.map((g,i)=><div className="editor-group-card" key={i}>
   <div className="editor-group-head"><span className="editor-row-number">{i+1}</span><input aria-label={`Group ${i+1} name`} value={g.name} placeholder={['e.g. Fruit','e.g. Vegetable','Group 3','Group 4'][i]} onChange={e=>change(i,'name',e.target.value)}/><button type="button" aria-label={`Remove group ${i+1}`} disabled={groups.length<=2} onClick={()=>set(groups.filter((_,j)=>j!==i))}><Trash2 size={15}/></button></div>
   <textarea aria-label={`Items in group ${i+1}`} value={g.items} placeholder={[`Apple\nBanana`,`Carrot\nPotato`][i]||'One item per line'} onChange={e=>change(i,'items',e.target.value)}/>
   <small>One item per line · {rowsOf(g.items).filter(x=>x.trim()).length} added</small>
  </div>)}
  {groups.length<4&&<button type="button" className="editor-text-button" onClick={()=>set([...groups,{name:'',items:''}])}><Plus size={15}/>Add group</button>}
 </div>;
}

export function HighlightEditor({d,field}:any){
 const tokens=passageTokens(d.passage),words=tokens.filter((t:any)=>t.word),marked=words.filter((t:any)=>t.marked).length;
 return <div className="editor-highlight">
  <label>Sentence or passage<textarea value={d.passage||''} onChange={e=>field('passage',e.target.value)} placeholder="The cat sat on the mat and slept."/></label>
  <p className="editor-list-label">Correct words<small>{words.length?`Tap the words learners should find · ${marked} marked`:'Write the passage above first'}</small></p>
  {words.length>0&&<p className="highlight-passage is-editor">{tokens.map((t:any,i:number)=>t.word?<React.Fragment key={i}>{t.pre}<button type="button" className="highlight-word" aria-pressed={t.marked} data-state={t.marked?'correct':undefined} onClick={()=>field('passage',toggleMark(d.passage,t.index))}>{t.word}</button>{t.post}</React.Fragment>:<React.Fragment key={i}>{t.space?t.text:t.plain}</React.Fragment>)}</p>}
 </div>;
}

export function ImageTapEditor({d,field,image}:any){
 const board=useRef<HTMLDivElement>(null),spot=d.hotspot;
 const ratio=()=>{const img=board.current?.querySelector('img');return img&&img.naturalWidth?img.naturalHeight/img.naturalWidth:1;};
 if(!image)return <p className="editor-tap-empty"><Crosshair size={18}/>Add the question picture above, then tap it here to mark the right spot.</p>;
 function place(e:React.MouseEvent){const r=board.current!.getBoundingClientRect();const c=(v:number)=>Math.min(1,Math.max(0,v));field('hotspot',{x:c((e.clientX-r.left)/r.width),y:c((e.clientY-r.top)/r.height),r:spot?.r||.08,aspect:ratio()});}
 return <div className="editor-tap">
  <p className="editor-list-label">Right spot<small>{spot?'Tap the picture again to move it.':'Tap the picture where the answer is.'}</small></p>
  <div className="tap-board is-editor" ref={board} onClick={place}><img src={image} alt="Question picture" draggable={false} onLoad={()=>{if(spot&&Math.abs(spot.aspect-ratio())>.001)field('hotspot',{...spot,aspect:ratio()});}}/>{spot&&<TapTarget spot={spot}/>}</div>
  {spot&&<label className="editor-tap-size">Target size<input type="range" min="0.03" max="0.25" step="0.01" value={spot.r} onChange={e=>field('hotspot',{...spot,r:Number(e.target.value)})}/></label>}
  <label>What is at this spot?<small className="editor-optional">Optional — shown after checking</small><input value={d.answer||''} onChange={e=>field('answer',e.target.value)} placeholder="e.g. The heart"/></label>
 </div>;
}

export function SliderEditor({d,field}:any){
 const box=(key:string,label:string,fallback:string)=><label>{label}<input inputMode="decimal" value={d[key]??fallback} onChange={e=>field(key,e.target.value)}/></label>;
 return <div className="editor-slider">
  <div className="editor-meta-grid is-three">{box('sliderMin','Lowest','0')}{box('sliderMax','Highest','100')}{box('sliderStep','Step','1')}</div>
  <div className="editor-meta-grid"><label>Correct answer<input inputMode="decimal" value={d.answer||''} placeholder="e.g. 1945" onChange={e=>field('answer',e.target.value)}/></label>{box('numericTolerance','Allowed difference (±)','0')}</div>
  <label>Unit<small className="editor-optional">Optional</small><input value={d.unit||''} maxLength={16} placeholder="e.g. km, %, years" onChange={e=>field('unit',e.target.value)}/></label>
 </div>;
}
