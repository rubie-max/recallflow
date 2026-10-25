import React,{useMemo,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Check,X,Plus,Minus,ZoomIn,ZoomOut} from 'lucide-react';
import {Button} from './components/Button';
import {listNeed,listMatches,listAlternatives,passageTokens,tapSpots,tapResults} from '../question-types.js';
import {seededShuffle,isPictureLabel} from '../question-variants.js';
import {ItemText} from './QuestionInteractions';
import {ItemExtras} from './ItemMedia';

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

// Sort into groups: drag an item onto a group, or tap the item and then the group.
export function CategorizeAnswer({item,disabled,onGrade}:any){
 const groups:any[]=item.groups||[];
 const all=useMemo(()=>seededShuffle(groups.flatMap(g=>g.items),String(item.id||item.prompt)+'|sort'),[item]);
 const [placed,setPlaced]=useState<Record<string,string>>({}),[active,setActive]=useState<string|null>(null),[note,setNote]=useState('');
 const [drag,setDrag]=useState<{x:string;px:number;py:number;over:string|null}|null>(null),press=useRef<any>(null),skipClick=useRef(false);
 const home=(x:string)=>groups.find(g=>g.items.includes(x))?.name,pool=all.filter(x=>!placed[x]);
 const pictured=all.some(x=>item.optionImages?.[x]);
 function put(x:string,name:string|null){setPlaced(p=>{const n={...p};if(name)n[x]=name;else delete n[x];return n;});setNote('');}
 function pick(x:string){if(disabled)return;setActive(x);setNote('');}
 function drop(name:string){
  if(disabled)return;
  if(!active){setNote('Pick an item first: drag it here, or tap it and then this group.');return;}
  put(active,name);
  setActive(pool.find(x=>x!==active)??null);
 }
 const zoneAt=(x:number,y:number)=>(document.elementFromPoint(x,y)?.closest('[data-zone]') as HTMLElement|null)?.dataset.zone??null;
 function down(x:string,e:React.PointerEvent){if(disabled||(e.pointerType==='mouse'&&e.button!==0))return;press.current={x,sx:e.clientX,sy:e.clientY,id:e.pointerId,moved:false,el:e.currentTarget};}
 function move(e:React.PointerEvent){
  const p=press.current;if(!p||p.id!==e.pointerId)return;
  if(!p.moved){if(Math.hypot(e.clientX-p.sx,e.clientY-p.sy)<7)return;p.moved=true;try{p.el.setPointerCapture(e.pointerId);}catch{}setActive(null);setNote('');try{navigator.vibrate?.(8);}catch{}}
  setDrag({x:p.x,px:e.clientX,py:e.clientY,over:zoneAt(e.clientX,e.clientY)});
 }
 function up(e:React.PointerEvent){
  const p=press.current;press.current=null;setDrag(null);if(!p||p.id!==e.pointerId||!p.moved)return;
  skipClick.current=true;setTimeout(()=>{skipClick.current=false;});
  const zone=zoneAt(e.clientX,e.clientY);if(zone==='__pool')put(p.x,null);else if(zone)put(p.x,zone);
 }
 function chip(x:string,state?:string){
  const img=item.optionImages?.[x];
  return <span className="sort-item media-slot" key={x} data-picture={img?'':undefined}>
   <button type="button" className="sort-chip" aria-pressed={active===x} data-state={state} data-lifted={drag?.x===x||undefined} disabled={disabled} aria-label={placed[x]&&!disabled?`${x}, in ${placed[x]}. Tap to pick it up again.`:undefined}
    onPointerDown={e=>down(x,e)} onPointerMove={move} onPointerUp={up} onPointerCancel={()=>{press.current=null;setDrag(null);}}
    onClick={()=>{if(skipClick.current)return;if(placed[x]&&active===x){put(x,null);return;}pick(x);}}>
    {img&&<img className="sort-chip-img" src={img} alt="" draggable={false}/>}<ItemText item={item} text={x} className="sort-chip-text"/>{state==='wrong'&&<small>→ {home(x)}</small>}
   </button>
   <ItemExtras item={item} text={x}/>
  </span>;
 }
 const ghostImg=drag?item.optionImages?.[drag.x]:null;
 return <div className="extra-answer sort-answer" data-pictured={pictured||undefined} data-dragging={drag?'':undefined}>
  <p className="split-answer-help">{disabled?'Your groups':'Drag each item into its group, or tap an item and then a group.'}</p>
  {!disabled&&<div className="sort-pool" role="group" aria-label="Items to sort" data-zone="__pool" data-over={drag?.over==='__pool'||undefined}>{pool.length?pool.map(x=>chip(x)):<span className="sort-pool-done">All sorted. Drag or tap an item to move it.</span>}</div>}
  <div className="sort-groups" data-count={groups.length}>{groups.map(g=>{const here=all.filter(x=>placed[x]===g.name);return <section key={g.name} className="sort-group" data-zone={g.name} data-over={drag?.over===g.name||undefined} data-ready={!disabled&&!!active||undefined} onClick={e=>{if(!(e.target as Element).closest('.sort-item'))drop(g.name);}}>
   <button type="button" className="sort-group-head" disabled={disabled} aria-label={active?`Put ${active} in ${g.name}`:g.name}><span>{g.name}</span>{disabled?<small>{here.filter(x=>home(x)===g.name).length}/{g.items.length}</small>:active?<Plus size={16} aria-hidden="true"/>:<small>{here.length}</small>}</button>
   <div className="sort-group-items">{here.map(x=>chip(x,disabled?(home(x)===g.name?'correct':'wrong'):undefined))}{!here.length&&<span className="sort-empty">{disabled?'Nothing here':'Drop here'}</span>}</div>
  </section>;})}</div>
  {drag&&createPortal(<div className="sort-ghost" style={{left:drag.px,top:drag.py}} aria-hidden="true">{ghostImg&&<img src={ghostImg} alt=""/>}<span>{isPictureLabel(drag.x)&&ghostImg?'':drag.x}</span></div>,document.body)}
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

export function TapTarget({spot,state,label}:any){return <span className="tap-target" data-state={state} aria-hidden="true" style={{left:`${spot.x*100}%`,top:`${spot.y*100}%`,width:`${spot.r*200}%`,height:`${spot.r*200/spot.aspect}%`}}>{label&&<em>{label}</em>}</span>;}

/** The picture sized to its own shape, so spot positions match the image. Zoom makes small places easier to hit on phones. */
export function TapCanvas({image,alt,boardRef,zoomed,onZoom,children,locked,...rest}:any){
 return <div className="tap-frame" data-zoomed={zoomed||undefined}>
  <div className="tap-scroll"><div className="tap-board is-map" ref={boardRef} data-locked={locked||undefined} style={zoomed?{width:'200%'}:undefined} {...rest}>
   <img src={image} alt={alt} draggable={false}/>
   {children}
  </div></div>
  <button type="button" className="tap-zoom" aria-pressed={!!zoomed} onClick={onZoom}>{zoomed?<ZoomOut size={15}/>:<ZoomIn size={15}/>}{zoomed?'Zoom out':'Zoom in'}</button>
 </div>;
}

export function ImageTapAnswer({item,disabled,onGrade}:any){
 const spots:any[]=tapSpots(item),mode=item.tapMode==='name'?'name':'find',single=mode==='find'&&spots.length===1;
 const order=useMemo(()=>single?[0]:seededShuffle(spots.map((_,i)=>i),String(item.id||item.prompt)+'|tap'),[item]);
 const bank=useMemo(()=>seededShuffle(spots.map(s=>s.label),String(item.id||item.prompt)+'|names'),[item]);
 const [pins,setPins]=useState<({x:number;y:number}|null)[]>(()=>spots.map(()=>null)),[names,setNames]=useState<string[]>(()=>spots.map(()=>''));
 const [cur,setCur]=useState(order[0]??0),[zoomed,setZoomed]=useState(false),board=useRef<HTMLDivElement>(null);
 const given=mode==='name'?names:pins,results=disabled?tapResults(item,given):[],right=results.filter(Boolean).length;
 const done=mode==='name'?names.filter(Boolean).length:pins.filter(Boolean).length;
 const nextOpen=(list:any[],from:number)=>{const at=order.indexOf(from);for(let k=1;k<=order.length;k++){const i=order[(at+k)%order.length];if(!list[i])return i;}return from;};
 function place(e:React.MouseEvent){
  if(disabled||mode==='name')return;const r=board.current!.getBoundingClientRect();
  const next=pins.map((p,i)=>i===cur?{x:clamp((e.clientX-r.left)/r.width),y:clamp((e.clientY-r.top)/r.height)}:p);
  setPins(next);if(!single)setCur(nextOpen(next,cur));
 }
 function key(e:React.KeyboardEvent){
  if(disabled||mode==='name')return;const moves:any={ArrowLeft:[-.02,0],ArrowRight:[.02,0],ArrowUp:[0,-.02],ArrowDown:[0,.02]};
  if(moves[e.key]){e.preventDefault();setPins(ps=>ps.map((p,i)=>i===cur?{x:clamp((p?.x??.5)+moves[e.key][0]),y:clamp((p?.y??.5)+moves[e.key][1])}:p));}
  else if((e.key==='Enter'||e.key===' ')&&!pins[cur]){e.preventDefault();setPins(ps=>ps.map((p,i)=>i===cur?{x:.5,y:.5}:p));}
 }
 function nameIt(label:string){
  if(disabled)return;
  const next=names.map((n,i)=>i===cur?label:n===label?'':n);
  setNames(next);setCur(nextOpen(next,cur));
 }
 const ask=spots[cur]?.label;
 return <div className="extra-answer tap-answer" data-mode={mode}>
  {!disabled&&(single?<p className="split-answer-help">{pins[0]?'Tap again to move your pin, then check.':'Tap the right place on the picture.'}</p>
   :mode==='find'?<p className="tap-ask" role="status"><span>Tap</span><b>{ask}</b><small>{done} of {spots.length} placed</small></p>
   :<p className="tap-ask" role="status"><span>Name pin</span><b className="tap-ask-num">{cur+1}</b><small>{done} of {spots.length} named</small></p>)}
  <TapCanvas image={item.image} alt={item.imageAlt||'Question picture'} boardRef={board} zoomed={zoomed} onZoom={()=>setZoomed(z=>!z)} locked={disabled||mode==='name'} role={mode==='find'?'button':undefined} tabIndex={disabled||mode==='name'?-1:0} aria-label={mode==='find'?`Picture. Tap to place your pin${ask&&!single?` for ${ask}`:''}; arrow keys move it.`:'Picture with numbered pins'} onClick={place} onKeyDown={key}>
   {disabled&&mode==='find'&&spots.map((s,i)=><TapTarget key={'t'+i} spot={s} state={results[i]?'correct':'wrong'} label={single?undefined:String(i+1)}/>)}
   {mode==='find'&&pins.map((p,i)=>p&&!(disabled&&results[i])&&<span key={'p'+i} className="tap-pin" data-current={!disabled&&!single&&i===cur||undefined} data-state={disabled?'wrong':undefined} style={{left:`${p.x*100}%`,top:`${p.y*100}%`}} aria-hidden="true">{!single&&!disabled&&<em>{spots[i].label}</em>}</span>)}
   {mode==='name'&&spots.map((s,i)=><button type="button" key={'n'+i} className="tap-marker" aria-pressed={!disabled&&cur===i} data-state={disabled?(results[i]?'correct':'wrong'):names[i]?'named':undefined} disabled={disabled} aria-label={`Pin ${i+1}${names[i]?`: ${names[i]}`:''}`} style={{left:`${s.x*100}%`,top:`${s.y*100}%`}} onClick={e=>{e.stopPropagation();setCur(i);}}><span>{i+1}</span>{names[i]&&!disabled&&<em>{names[i]}</em>}</button>)}
  </TapCanvas>
  {disabled&&!single&&<ol className="tap-review" aria-label="Your answers">{spots.map((s,i)=><li key={i} data-state={results[i]?'correct':'wrong'}><b>{i+1}</b><span>{s.label}{!results[i]&&<small>{mode==='name'?(names[i]?<>You said <s>{names[i]}</s></>:'Not named'):'Missed'}</small>}</span>{results[i]?<Check size={16} aria-label="Right"/>:<X size={16} aria-label="Wrong"/>}</li>)}</ol>}
  {!disabled&&!single&&mode==='find'&&<div className="tap-queue" role="group" aria-label="Places to find">{order.map(i=><button type="button" key={i} aria-pressed={cur===i} data-done={!!pins[i]||undefined} onClick={()=>setCur(i)}>{pins[i]&&<Check size={13} aria-hidden="true"/>}{spots[i].label}</button>)}</div>}
  {!disabled&&mode==='name'&&<div className="tap-bank" role="group" aria-label="Names">{bank.map(label=>{const at=names.indexOf(label);return <button type="button" key={label} data-used={at>=0||undefined} aria-label={`${label}${at>=0?`, on pin ${at+1}`:''}`} onClick={()=>nameIt(label)}>{at>=0&&<b>{at+1}</b>}{label}</button>;})}</div>}
  {disabled&&<div className="tap-result" data-state={right===spots.length?'correct':'wrong'} role="status">{right===spots.length?<Check size={18}/>:<X size={18}/>}<div><strong>{single?(right?'You found it':'Not quite'):right===spots.length?(mode==='name'?'All named':'All found'):`${right} of ${spots.length} right`}</strong><span>{single?(right?'Right on the spot.':'The ringed spot is the right place.'):right===spots.length?'Every place is right.':mode==='name'?'Numbers match the list below.':'Rings show the right places; red dots are your misses.'}</span></div></div>}
  {!disabled&&<Button className="split-submit" disabled={done<spots.length} onClick={()=>onGrade(given)}>Check</Button>}
 </div>;
}

export function SliderAnswer({item,disabled,onGrade}:any){
 const min=Number(item.sliderMin??0),max=Number(item.sliderMax??100),step=Number(item.sliderStep)||1;
 const decimals=Math.min(6,(String(step).split('.')[1]||'').length),snap=(v:number)=>Number(clamp(min+Math.round((v-min)/step)*step,min,max).toFixed(decimals));
 const [value,setValue]=useState<number|null>(null),shown=value??snap((min+max)/2);
 const answer=Number(item.answer),tolerance=Number(item.numericTolerance)||0,span=max-min||1;
 const pct=(v:number)=>clamp((v-min)/span)*100,fmt=(v:number)=>v.toLocaleString(undefined,{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:Math.abs(v)>=10000});
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
 if(type==='image_tap')return props.item.image&&tapSpots(props.item).length?<ImageTapAnswer {...props}/>:<p className="extra-note">{props.item.image?'Mark at least one place on the picture.':'Add a question picture to use this type.'}</p>;
 if(type==='slider')return <SliderAnswer {...props}/>;
 return null;
}
