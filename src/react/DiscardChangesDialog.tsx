import React,{useEffect,useRef} from 'react';
import {X} from 'lucide-react';
export function DiscardChangesDialog({onKeep,onDiscard}: {onKeep:()=>void,onDiscard:()=>void}){
 const ref=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const focus=document.activeElement as HTMLElement|null;ref.current?.showModal();return()=>{ref.current?.close();focus?.focus();};},[]);
 return <dialog ref={ref} className="discard-changes-dialog" aria-labelledby="discard-title" aria-describedby="discard-description" onCancel={e=>{e.preventDefault();onKeep();}}><button type="button" className="discard-close" aria-label="Keep editing and close" onClick={onKeep}><X size={19}/></button><h2 id="discard-title">Leave without saving?</h2><p id="discard-description">Your latest edits haven’t been saved.</p><div className="discard-actions"><button type="button" autoFocus className="discard-keep" onClick={onKeep}>Keep editing</button><button type="button" className="discard-confirm" onClick={onDiscard}>Discard</button></div></dialog>;
}
