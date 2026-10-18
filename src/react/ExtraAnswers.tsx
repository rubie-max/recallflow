import React,{useMemo,useRef,useState} from 'react';
import {Check,X,Plus,Minus} from 'lucide-react';
import {Button} from './components/Button';
import {listNeed,listMatches,listAlternatives,passageTokens,hotspotHit} from '../question-types.js';
import {seededShuffle} from '../question-variants.js';

// Answer areas for the newer question types. Each keeps its own answer and reports it through onGrade.
const clamp=(v:number,lo=0,hi=1)=>Math.min(hi,Math.max(lo,v));

export function ListRecallAnswer({item,disabled,onGrade}:any){
 const total=item.listItems?.length||0,need=Math.max(1,listNeed(item));
 const [values,setValues]=useState<string[]>(()=>Array(need).fill('')),fields=useRef<(HTMLInputElement|null)[]>([]);
 const matches=disabled?listMatches(item,values):[],named=new Set(matches.filter((i:number)=>i>=0)),filled=values.some(v=>v.trim());
 const others=(item.listItems||[]).map((x:string,i:number)=>named.has(i)?null:listAlternatives(x)[0]).filter(Boolean);
 return <div className="extra-answer list-answer">
  <p className="split-answer-help">{need<total?`Name any ${need} of ${total}, in any order.`:`Name all ${need}, in any order.`}</p>
  <ol className="list-answer-fields">{values.map((v,i)=><li key={i} data-state={disabled?(matches[i]>=0?'correct':'wrong'):undefined}>
   <span className="list-answer-number" aria-hidden="true">{i+1}</span>
   <input ref={el=>{fields.current[i]=el;}} aria-label={`Answer ${i+1}`} value={v} disabled={disabled} autoComplete="off" spellCheck={false} enterKeyHint={i<need-1?'next':'done'} placeholder={i===0?'Type one…':''} onChange={e=>setValues(xs=>xs.map((x,j)=>j===i?e.target.value:x))} onKeyDown={e=>{if(e.key!=='Enter')return;e.preventDefault();const next=fields.current[i+1];if(next)next.focus();else if(filled)onGrade(values);}}/>
   {disabled&&<span className="list-answer-mark" aria-label={matches[i]>=0?'Correct':'Not on the list'}>{matches[i]>=0?<Check size={16}/>:<X size={16}/>}</span>}
  </li>)}</ol>
  {disabled&&<div className="list-answer-summary"><p role="status"><b>{named.size}</b> of {need} named</p>{others.length>0&&<><small>{named.size>=need?'Others on the list':'Ones you missed'}</small><div className="list-answer-others">{others.map((x:string)=><span key={x}>{x}</span>)}</div></>}</div>}
  {!disabled&&<Button className="split-submit" disabled={!filled} onClick={()=>onGrade(values)}>Check answers</Button>}
 </div>;
}

export function CategorizeAnswer({item,disabled,onGrade}:any){
 const groups:any[]=item.groups||[];
 const all=useMemo(()=>seededShuffle(groups.flatMap(g=>g.items),String(item.id||item.prompt)+'|sort'),[item]);
 const [placed,setPlaced]=useState<Record<string,string>>({}),[active,setActive]=useState<string|null>(null),[note,setNote]=useState('');
 const home=(x:string)=>groups.find(g=>g.items.includes(x))?.name,pool=all.filter(x=>!placed[x]);
 function pick(x:string){if(disabled)return;setActive(a=>a===x?null:x);setNote('');}
 function drop(name:string){
  if(disabled)return;
  if(!active){setNote('Tap an item first, then the group it belongs to.');return;}
  setPlaced(p=>({...p,[active]:name}));setNote('');
  setActive(pool.find(x=>x!==active)??null);
 }
 function putBack(x:string){setPlaced(p=>{const n={...p};delete n[x];return n;});setActive(x);}
 return <div className="extra-answer sort-answer">
  <p className="split-answer-help">{disabled?'Your groups':'Tap an item, then tap the group it belongs to.'}</p>
  {!disabled&&<div className="sort-pool" role="group" aria-label="Items to sort">{pool.length?pool.map(x=><button type="button" key={x} className="sort-chip" aria-pressed={active===x} onClick={()=>pick(x)}>{x}</button>):<span className="sort-pool-done">All sorted. Tap an item to move it.</span>}</div>}
  <div className="sort-groups" data-count={groups.length}>{groups.map(g=>{const here=all.filter(x=>placed[x]===g.name);return <section key={g.name} className="sort-group" data-ready={!disabled&&!!active||undefined} onClick={e=>{if(!(e.target as Element).closest('.sort-chip'))drop(g.name);}}>
   <button type="button" className="sort-group-head" disabled={disabled} aria-label={active?`Put ${active} in ${g.name}`:g.name}><span>{g.name}</span>{!disabled&&active&&<Plus size={16} aria-hidden="true"/>}</button>
   <div className="sort-group-items">{here.map(x=>{const right=home(x)===g.name;return <button type="button" key={x} className="sort-chip" aria-pressed={active===x} data-state={disabled?(right?'correct':'wrong'):undefined} disabled={disabled} onClick={()=>active===x?putBack(x):pick(x)}>{x}{disabled&&!right&&<small>→ {home(x)}</small>}</button>;})}{!here.length&&<span className="sort-empty">{disabled?'Nothing here':'Tap to place'}</span>}</div>
  </section>;})}</div>
  {note&&<p className="extra-note" role="status">{note}</p>}
  {!disabled&&<div className="extra-tools"><span role="status">{all.length-pool.length} of {all.length} sorted</span><button type="button" disabled={!Object.keys(placed).length} onClick={()=>{setPlaced({});setActive(null);setNote('');}}>Start over</button></div>}
  {!disabled&&<Button className="split-submit" disabled={pool.length>0} onClick={()=>onGrade(placed)}>Check groups</Button>}
 </div>;
}

export function HighlightAnswer({item,disabled,onGrade}:any){
 const tokens=useMemo(()=>passageTokens(item.passage),[item.passage]);
 const [picked,setPicked]=useState<number[]>([]);
 const marked=new Set(tokens.filter((t:any)=>t.marked).map((t:any)=>t.index));
 const found=picked.filter(i=>marked.has(i)).length,extra=picked.length-found;
 const state=(i:number)=>!disabled?(picked.includes(i)?'picked':undefined):picked.includes(i)?(marked.has(i)?'correct':'wrong'):marked.has(i)?'missed':undefined;
 return <div className="extra-answer highlight-answer">
  <p className="split-answer-help">{disabled?`Found ${found} of ${marked.size}${extra?` · ${extra} not a match`:''}`:`Find ${marked.size} ${marked.size===1?'word':'words'}. Tap again to undo.`}</p>
  <p className="highlight-passage">{tokens.map((t:any,i:number)=>t.word?<React.Fragment key={i}>{t.pre}<button type="button" className="highlight-word" aria-pressed={picked.includes(t.index)} data-state={state(t.index)} disabled={disabled} onClick={()=>setPicked(xs=>xs.includes(t.index)?xs.filter(x=>x!==t.index):[...xs,t.index])}>{t.word}</button>{t.post}</React.Fragment>:<React.Fragment key={i}>{t.space?t.text:t.plain}</React.Fragment>)}</p>
  {disabled&&marked.size>found&&<p className="extra-note"><span className="highlight-key" data-state="missed">dashed</span> words are the ones you missed.</p>}
  {!disabled&&<div className="extra-tools"><span role="status">{picked.length} selected</span><button type="button" disabled={!picked.length} onClick={()=>setPicked([])}>Clear</button></div>}
  {!disabled&&<Button className="split-submit" disabled={!picked.length} onClick={()=>onGrade(picked)}>Check words</Button>}
 </div>;
}

export function TapTarget({spot}:any){return <span className="tap-target" aria-hidden="true" style={{left:`${spot.x*100}%`,top:`${spot.y*100}%`,width:`${spot.r*200}%`,height:`${spot.r*200/spot.aspect}%`}}/>;}

export function ImageTapAnswer({item,disabled,onGrade}:any){
 const [spot,setSpot]=useState<{x:number,y:number}|null>(null),board=useRef<HTMLDivElement>(null);
 const hit=disabled&&hotspotHit(item.hotspot,spot);
 function place(e:React.MouseEvent){if(disabled)return;const r=board.current!.getBoundingClientRect();setSpot({x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)});}
 function key(e:React.KeyboardEvent){
  if(disabled)return;const moves:any={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};
  if(moves[e.key]){e.preventDefault();setSpot(s=>({x:clamp((s?.x??.5)+moves[e.key][0]),y:clamp((s?.y??.5)+moves[e.key][1])}));}
  else if((e.key==='Enter'||e.key===' ')&&!spot){e.preventDefault();setSpot({x:.5,y:.5});}
 }
 return <div className="extra-answer tap-answer">
  <p className="split-answer-help">{disabled?(hit?'You found the right spot.':'The green circle shows the right spot.'):spot?'Tap again to move your pin, then check.':'Tap the right place on the picture.'}</p>
  <div className="tap-board" ref={board} data-locked={disabled||undefined} role="button" tabIndex={disabled?-1:0} aria-label="Picture. Tap to place your pin; arrow keys move it." onClick={place} onKeyDown={key}>
   <img src={item.image} alt={item.imageAlt||'Question picture'} draggable={false}/>
   {disabled&&item.hotspot&&<TapTarget spot={item.hotspot}/>}
   {spot&&<span className="tap-pin" data-state={disabled?(hit?'correct':'wrong'):undefined} style={{left:`${spot.x*100}%`,top:`${spot.y*100}%`}} aria-hidden="true"/>}
  </div>
  {!disabled&&<Button className="split-submit" disabled={!spot} onClick={()=>onGrade(spot)}>Check</Button>}
 </div>;
}

export function SliderAnswer({item,disabled,onGrade}:any){
 const min=Number(item.sliderMin??0),max=Number(item.sliderMax??100),step=Number(item.sliderStep)||1;
 const decimals=Math.min(6,(String(step).split('.')[1]||'').length),snap=(v:number)=>Number(clamp(min+Math.round((v-min)/step)*step,min,max).toFixed(decimals));
 const [value,setValue]=useState<number|null>(null),shown=value??snap((min+max)/2);
 const answer=Number(item.answer),tolerance=Number(item.numericTolerance)||0,span=max-min||1;
 const pct=(v:number)=>clamp((v-min)/span)*100,fmt=(v:number)=>v.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals});
 const right=disabled&&value!==null&&Math.abs(value-answer)<=tolerance+1e-9;
 const unit=item.unit?<small>{item.unit}</small>:null;
 return <div className="extra-answer slider-answer">
  <p className="split-answer-help">{disabled?(right?'Close enough — well estimated.':`You were ${fmt(Math.abs((value??answer)-answer))}${item.unit?' '+item.unit:''} away.`):`Drag to your best estimate.${tolerance>0?` Within ± ${fmt(tolerance)} counts as right.`:''}`}</p>
  <output className="slider-value" data-state={disabled?(right?'correct':'wrong'):value===null?'empty':undefined}>{value===null?'Drag the slider':fmt(value)}{value!==null&&unit}</output>
  <div className="slider-track">
   <input type="range" min={min} max={max} step={step} value={shown} disabled={disabled} aria-label="Your estimate" aria-valuetext={`${fmt(shown)}${item.unit?' '+item.unit:''}`} data-untouched={value===null||undefined} onChange={e=>setValue(snap(Number(e.target.value)))}/>
   {disabled&&<div className="slider-marks" aria-hidden="true">{tolerance>0&&<span className="slider-band" style={{left:`${pct(answer-tolerance)}%`,width:`${pct(answer+tolerance)-pct(answer-tolerance)}%`}}/>}<span className="slider-correct" style={{left:`${pct(answer)}%`}}><b>{fmt(answer)}</b></span></div>}
  </div>
  <div className="slider-scale" aria-hidden="true"><span>{fmt(min)}</span><span>{fmt(max)}</span></div>
  {!disabled&&<div className="slider-nudge"><button type="button" aria-label="Decrease by one step" onClick={()=>setValue(snap(shown-step))}><Minus size={18}/></button><span>Fine-tune</span><button type="button" aria-label="Increase by one step" onClick={()=>setValue(snap(shown+step))}><Plus size={18}/></button></div>}
  {!disabled&&<Button className="split-submit" disabled={value===null} onClick={()=>onGrade(value)}>Check estimate</Button>}
 </div>;
}

export function ExtraAnswer(props:any){
 const type=props.item?.type;
 if(type==='list_recall')return <ListRecallAnswer {...props}/>;
 if(type==='categorize')return <CategorizeAnswer {...props}/>;
 if(type==='highlight')return <HighlightAnswer {...props}/>;
 if(type==='image_tap')return props.item.image?<ImageTapAnswer {...props}/>:<p className="extra-note">Add a question picture to use this type.</p>;
 if(type==='slider')return <SliderAnswer {...props}/>;
 return null;
}
