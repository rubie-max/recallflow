import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {PenLine,TextCursorInput,CircleDot,GalleryVerticalEnd,ToggleLeft,ListChecks,Hash,ArrowLeftRight,ListOrdered,Brackets,Puzzle,Shapes,Check,ChevronDown,X,ListTodo,LayoutGrid,Highlighter,Crosshair,SlidersHorizontal} from 'lucide-react';
import {questionTypes,typeLabel} from '../question-types.js';

const icons:any={short_answer:PenLine,fill_blank:TextCursorInput,single_choice:CircleDot,flashcard:GalleryVerticalEnd,true_false:ToggleLeft,multi_select:ListChecks,numeric:Hash,matching:ArrowLeftRight,ordering:ListOrdered,cloze:Brackets,fill_blank_options:Puzzle,list_recall:ListTodo,categorize:LayoutGrid,highlight:Highlighter,image_tap:Crosshair,slider:SlidersHorizontal};
const blurbs:any={short_answer:'Write the answer yourself',fill_blank:'Complete one missing word',numeric:'A number, with allowed tolerance',list_recall:'Name several answers, in any order',single_choice:'Pick one correct option',true_false:'Decide if a statement is true',multi_select:'Pick every correct option',highlight:'Tap the right words in a sentence',matching:'Connect pairs together',ordering:'Put steps in the right order',categorize:'Put each item in its group',cloze:'Several blanks in one text',fill_blank_options:'Choose words from a word bank',image_tap:'Tap the right spot on a picture',slider:'Drag to a number, scored by closeness',flashcard:'Flip the card and rate yourself'};
const groups:[string,string[]][]=[['Write it',['short_answer','fill_blank','numeric','list_recall']],['Choose',['single_choice','true_false','multi_select','highlight']],['Arrange & fill',['matching','ordering','categorize','cloze','fill_blank_options']],['Picture & scale',['image_tap','slider']],['Recall',['flashcard']]];

// Types added to question-types.js later still appear, under "More".
function grouped(){const known=groups.flatMap(([,ids])=>ids),ids=questionTypes.map(([id])=>id);const out=groups.map(([name,list])=>[name,list.filter(id=>ids.includes(id))] as [string,string[]]);const rest=ids.filter(id=>!known.includes(id));if(rest.length)out.push(['More',rest]);return out.filter(([,list])=>list.length);}

export const TypeIcon=({type,size=17}:{type:string,size?:number})=>{const Icon=icons[type]||Shapes;return <Icon size={size} aria-hidden="true"/>;};

export function TypeSheet({title,value,onPick,onClose}:{title:string,value?:string,onPick:(id:string)=>void,onClose:()=>void}){
 const panel=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const back=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  (panel.current?.querySelector('[aria-selected="true"]') as HTMLElement||panel.current?.querySelector('.type-sheet-item') as HTMLElement)?.focus({preventScroll:false});
  const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();onClose();}};
  document.addEventListener('keydown',key);
  return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;back?.focus?.();};
 },[]);
 const move=(e:React.KeyboardEvent)=>{if(!['ArrowDown','ArrowUp'].includes(e.key))return;const items=[...(panel.current?.querySelectorAll('.type-sheet-item')||[])] as HTMLElement[];const i=items.indexOf(document.activeElement as HTMLElement);items[(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();e.preventDefault();};
 return createPortal(<div className="type-sheet-layer" onPointerDown={e=>{if(e.target===e.currentTarget)onClose();}}>
  <div className="type-sheet" ref={panel} role="dialog" aria-modal="true" aria-label={title} onKeyDown={move}>
   <div className="type-sheet-handle" aria-hidden="true"/>
   <div className="type-sheet-head"><h3>{title}</h3><button type="button" className="type-sheet-close" aria-label="Close" onClick={onClose}><X size={18}/></button></div>
   <div className="type-sheet-body" role="listbox" aria-label={title}>
    {grouped().map(([name,ids])=><div className="type-sheet-group" key={name} role="group" aria-label={name}><p>{name}</p>{ids.map(id=><button type="button" role="option" key={id} className="type-sheet-item" aria-selected={id===value} onClick={()=>onPick(id)}><span className="type-sheet-icon"><TypeIcon type={id}/></span><span className="type-sheet-text"><b>{typeLabel(id)}</b><small>{blurbs[id]||''}</small></span>{id===value&&<Check size={17} className="type-sheet-check"/>}</button>)}</div>)}
   </div>
  </div>
 </div>,document.body);
}

export function TypeField({label,value,help,onChange}:{label:string,value:string,help?:string,onChange:(id:string)=>void}){
 const [open,setOpen]=useState(false);
 return <div className="type-field"><span className="type-field-label">{label}</span>
  <button type="button" className="type-field-button" aria-haspopup="dialog" aria-expanded={open} onClick={()=>setOpen(true)}>
   <span className="type-sheet-icon"><TypeIcon type={value}/></span>
   <span className="type-sheet-text"><b>{typeLabel(value)}</b><small>{help||blurbs[value]}</small></span>
   <ChevronDown size={18} className="type-field-chevron"/>
  </button>
  {open&&<TypeSheet title="Choose question type" value={value} onClose={()=>setOpen(false)} onPick={id=>{setOpen(false);if(id!==value)onChange(id);}}/>}
 </div>;
}
