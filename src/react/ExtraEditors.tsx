import React,{useRef,useState} from 'react';
import {Plus,Trash2,Crosshair} from 'lucide-react';
import {passageTokens,toggleMark} from '../question-types.js';
import {emptyGroups} from '../question-variants.js';
import {TapCanvas} from './ExtraAnswers';

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

export function CategorizeEditor({d,field,mediaButton,onRename}:any){
 const groups:any[]=d.groups?.length?d.groups:emptyGroups(),set=(next:any[])=>field('groups',next);
 const change=(i:number,key:string,value:string)=>set(groups.map((g,j)=>j===i?{...g,[key]:value}:g));
 const total=groups.reduce((n,g)=>n+rowsOf(g.items).filter(x=>x.trim()).length,0);
 function item(i:number,k:number,value:string){const rows=rowsOf(groups[i].items,1),old=rows[k]||'';rows[k]=value;change(i,'items',rows.join('\n'));onRename?.(old,value);}
 return <div className="editor-groups">
  <p className="editor-list-label">Groups<small>Two to six groups, up to 30 items. The quiz mixes every item together for learners to sort.</small></p>
  {groups.map((g,i)=>{const rows=rowsOf(g.items,1);return <div className="editor-group-card" key={i}>
   <div className="editor-group-head"><span className="editor-row-number">{i+1}</span><input aria-label={`Group ${i+1} name`} value={g.name} placeholder={['e.g. Fruit','e.g. Vegetable','Group 3','Group 4','Group 5','Group 6'][i]} onChange={e=>change(i,'name',e.target.value)}/><button type="button" aria-label={`Remove group ${i+1}`} disabled={groups.length<=2} onClick={()=>set(groups.filter((_,j)=>j!==i))}><Trash2 size={15}/></button></div>
   <div className="editor-group-items">{rows.map((x,k)=><div className="editor-group-item" key={k}>
    <input aria-label={`Group ${i+1} item ${k+1}`} value={x} placeholder={k===0?(['e.g. Apple','e.g. Carrot'][i]||'Item'):'Another item'} onChange={e=>item(i,k,e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(x.trim()&&total<30){change(i,'items',[...rows.slice(0,k+1),'',...rows.slice(k+1)].join('\n'));setTimeout(()=>((e.target as HTMLElement).closest('.editor-group-items')?.querySelectorAll('input')[k+1] as HTMLInputElement|undefined)?.focus());}}}}/>
    {mediaButton?.(x,`item ${k+1} in group ${i+1}`)}
    <button type="button" aria-label={`Remove item ${k+1} from group ${i+1}`} disabled={rows.length<=1} onClick={()=>change(i,'items',rows.filter((_,j)=>j!==k).join('\n'))}><Trash2 size={14}/></button>
   </div>)}</div>
   <button type="button" className="editor-text-button" disabled={total>=30} onClick={()=>change(i,'items',[...rows,''].join('\n'))}><Plus size={14}/>Add item</button>
  </div>;})}
  {groups.length<6&&<button type="button" className="editor-text-button" onClick={()=>set([...groups,{name:'',items:''}])}><Plus size={15}/>Add group</button>}
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

// Tap the picture: tap empty space to add a place, drag a place to move it, and name each one.
export function ImageTapEditor({d,field,image}:any){
 const board=useRef<HTMLDivElement>(null),press=useRef<any>(null),label=useRef<HTMLInputElement>(null);
 const spots:any[]=d.spots||[],mode=d.tapMode==='name'?'name':'find';
 const [sel,setSel]=useState<number>(spots.length?0:-1),[zoomed,setZoomed]=useState(false);
 const ratio=()=>{const img=board.current?.querySelector('img');return img&&img.naturalWidth?img.naturalHeight/img.naturalWidth:1;};
 const set=(next:any[])=>field('spots',next);
 const at=(e:React.PointerEvent)=>{const r=board.current!.getBoundingClientRect(),c=(v:number)=>Math.min(1,Math.max(0,v));return {x:c((e.clientX-r.left)/r.width),y:c((e.clientY-r.top)/r.height)};};
 if(!image)return <p className="editor-tap-empty"><Crosshair size={18}/>Add the picture or map in the Media step, then mark the places here.</p>;
 function down(e:React.PointerEvent){
  if(e.button>0)return;
  const hit=(e.target as Element).closest('[data-spot]') as HTMLElement|null;
  if(hit){const i=Number(hit.dataset.spot);setSel(i);press.current={i,id:e.pointerId,sx:e.clientX,sy:e.clientY,moved:false};try{board.current!.setPointerCapture(e.pointerId);}catch{}e.preventDefault();return;}
  press.current={add:true,id:e.pointerId,sx:e.clientX,sy:e.clientY};
 }
 function move(e:React.PointerEvent){
  const p=press.current;if(!p||p.add||p.id!==e.pointerId)return;
  if(!p.moved&&Math.hypot(e.clientX-p.sx,e.clientY-p.sy)<4)return;p.moved=true;
  const xy=at(e);set(spots.map((s,j)=>j===p.i?{...s,...xy}:s));
 }
 function up(e:React.PointerEvent){
  const p=press.current;press.current=null;if(!p||p.id!==e.pointerId||!p.add||Math.hypot(e.clientX-p.sx,e.clientY-p.sy)>8||spots.length>=30)return;
  const r=spots[sel]?.r||spots[spots.length-1]?.r||.06;
  set([...spots,{label:'',...at(e),r,aspect:ratio()}]);setSel(spots.length);setTimeout(()=>label.current?.focus({preventScroll:true}),30);
 }
 const cur=spots[sel],change=(patch:any)=>set(spots.map((s,j)=>j===sel?{...s,...patch}:s));
 return <div className="editor-tap">
  <div className="editor-tap-mode" role="radiogroup" aria-label="How learners answer">
   <button type="button" role="radio" aria-checked={mode==='find'} onClick={()=>field('tapMode',undefined)}><b>Find the place</b><small>We name it, they tap it on the picture</small></button>
   <button type="button" role="radio" aria-checked={mode==='name'} onClick={()=>field('tapMode','name')}><b>Name the place</b><small>Pins are shown, they pick each name</small></button>
  </div>
  <p className="editor-list-label">Places · {spots.length}<small>{spots.length?'Tap empty space to add another place. Drag a ring to move it.':'Tap the picture to mark the first place, e.g. a state or country on a map.'}</small></p>
  <TapCanvas image={image} alt="Question picture" boardRef={board} zoomed={zoomed} onZoom={()=>setZoomed(z=>!z)} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{press.current=null;}}>
   {spots.map((s,i)=><span key={i} data-spot={i} className="tap-edit-spot" data-selected={sel===i||undefined} style={{left:`${s.x*100}%`,top:`${s.y*100}%`,width:`${s.r*200}%`,height:`${s.r*200/s.aspect}%`}}><b>{i+1}</b>{s.label&&<em>{s.label}</em>}</span>)}
  </TapCanvas>
  {cur&&<div className="editor-tap-spot">
   <div className="editor-tap-spot-row"><span className="editor-row-number">{sel+1}</span><input ref={label} aria-label={`Name of place ${sel+1}`} value={cur.label||''} maxLength={60} placeholder={spots.length>1||mode==='name'?'Name this place, e.g. Texas':'Name (optional), e.g. The heart'} onChange={e=>change({label:e.target.value})}/><button type="button" aria-label={`Remove place ${sel+1}`} onClick={()=>{set(spots.filter((_,j)=>j!==sel));setSel(Math.min(sel,spots.length-2));}}><Trash2 size={15}/></button></div>
   <label className="editor-tap-size">Target size<input type="range" min="0.015" max="0.25" step="0.005" value={cur.r} onChange={e=>change({r:Number(e.target.value)})}/></label>
  </div>}
  {spots.length>1&&<div className="editor-tap-list" role="group" aria-label="Marked places">{spots.map((s,i)=><button type="button" key={i} aria-pressed={sel===i} data-missing={!s.label||undefined} onClick={()=>setSel(i)}><b>{i+1}</b>{s.label||'Unnamed'}</button>)}</div>}
  <img hidden src={image} alt="" onLoad={e=>{const img=e.currentTarget,r=img.naturalWidth?img.naturalHeight/img.naturalWidth:1;if(spots.some(s=>Math.abs(s.aspect-r)>.001))set(spots.map(s=>({...s,aspect:r})));}}/>
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
