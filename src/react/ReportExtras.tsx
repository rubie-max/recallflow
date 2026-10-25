import React,{useMemo,useState} from 'react';
import {Play,Pencil,XCircle,CheckCircle2,ChevronLeft,ChevronRight,Flame,Trophy,CalendarDays,Clock,Sunrise,Sun,Sunset,Moon,ChevronDown,Target} from 'lucide-react';
import {mistakeLedger,activityStats,formatDuration,shiftDay} from '../report-stats.js';
import {streakStats,localDay} from '../streak-stats.js';
import {typeLabel} from '../question-types.js';

const ago=(iso:string)=>{const d=Math.floor((Date.now()-Date.parse(iso))/86400000);return d<=0?'today':d===1?'yesterday':d<7?`${d} days ago`:new Date(iso).toLocaleDateString(undefined,{day:'numeric',month:'short'});};
const level=(pct:number)=>pct>=80?'good':pct>=50?'ok':'low';

export function MistakesPanel({reports,items,onPractice,onEdit}:{reports:any[];items:any[];onPractice:(results:any[])=>void;onEdit:(item:any)=>void}){
 const ledger=useMemo(()=>mistakeLedger(reports),[reports]);
 const byId=useMemo(()=>new Map(items.map(x=>[x.id,x])),[items]);
 const [subject,setSubject]=useState(''),[sort,setSort]=useState<'recent'|'most'|'close'>('recent'),[showCleared,setShowCleared]=useState(false);
 const subjects=useMemo(()=>{const m=new Map<string,number>();for(const e of ledger.open){const s=e.last.subject||'General';m.set(s,(m.get(s)||0)+1);}return [...m].sort((a,b)=>b[1]-a[1]);},[ledger]);
 const list=useMemo(()=>{const rows=ledger.open.filter(e=>!subject||(e.last.subject||'General')===subject);return sort==='most'?[...rows].sort((a,b)=>b.misses-a.misses):sort==='close'?[...rows].sort((a,b)=>b.streak-a.streak||b.misses-a.misses):rows;},[ledger,subject,sort]);
 const monthAgo=new Date(Date.now()-30*86400000).toISOString();
 const clearedRecent=ledger.cleared.filter(e=>e.clearedAt>=monthAgo);
 const practicable=list.filter(e=>byId.has(e.id));
 if(!ledger.open.length&&!ledger.cleared.length)return <section className="report-content-card mx"><div className="mx-empty"><CheckCircle2 size={30}/><h2>No mistakes yet</h2><p>Questions you get wrong will appear here with your answer and the right one, so you can fix them.</p></div></section>;
 return <section className="report-content-card mx">
  <div className="report-content-heading"><div><p>WHAT TO PRACTICE NEXT</p><h2>Mistakes</h2></div></div>
  <div className="mx-stats">
   <div data-kind="open"><strong>{ledger.open.length}</strong><span>To fix</span></div>
   <div data-kind="cleared"><strong>{clearedRecent.length}</strong><span>Fixed in 30 days</span></div>
   <div><strong>{subjects[0]?.[0]||'—'}</strong><span>{subjects[0]?`Most mistakes (${subjects[0][1]})`:'No open mistakes'}</span></div>
  </div>
  {ledger.open.length>0?<>
   <p className="report-muted">A question is fixed after you answer it right twice in a row. The dots show how close each one is.</p>
   {practicable.length>0&&<button type="button" className="mx-practice-all" onClick={()=>onPractice(practicable.map(e=>e.last))}><Target size={17}/>Practice {practicable.length===ledger.open.length?'all':'these'} {practicable.length} {practicable.length===1?'mistake':'mistakes'}</button>}
   <div className="mx-tools">
    {subjects.length>1&&<div className="mx-chips" role="radiogroup" aria-label="Subject"><button type="button" role="radio" aria-checked={!subject} onClick={()=>setSubject('')}>All <b>{ledger.open.length}</b></button>{subjects.map(([s,n])=><button key={s} type="button" role="radio" aria-checked={subject===s} onClick={()=>setSubject(s)}>{s} <b>{n}</b></button>)}</div>}
    <label className="mx-sort">Sort<select value={sort} onChange={e=>setSort(e.target.value as any)}><option value="recent">Newest first</option><option value="most">Most missed</option><option value="close">Closest to fixed</option></select></label>
   </div>
   <ul className="mx-list">{list.map(e=>{const item=byId.get(e.id),q=e.last;return <li key={e.id} className="mx-item">
    <div className="mx-item-top"><span className="mx-place">{[q.subject,q.topic].filter(Boolean).join(' › ')||'General'}</span><span className="mx-type">{typeLabel(q.type)}</span></div>
    <strong className="mx-prompt">{q.prompt||'Picture question'}</strong>
    <div className="mx-answers"><p data-kind="wrong"><XCircle size={14}/><span><small>Your answer</small>{q.user_answer||'No answer'}</span></p><p data-kind="right"><CheckCircle2 size={14}/><span><small>Correct</small>{q.correct_answer||'—'}</span></p></div>
    <div className="mx-item-foot">
     <span className="mx-progress" title={`${e.streak} of 2 right answers in a row`}><i data-on={e.streak>=1||undefined}/><i data-on={e.streak>=2||undefined}/><em>{e.streak?'1 more to fix':'2 to fix'}</em></span>
     <span className="mx-meta">Missed {e.misses}× · {ago(e.lastMissed)}</span>
    </div>
    {item?<div className="mx-actions"><button type="button" onClick={()=>onPractice([q])}><Play size={13} fill="currentColor"/>Practice</button><button type="button" className="is-soft" onClick={()=>onEdit(item)}><Pencil size={13}/>Edit</button></div>:<p className="mx-gone">No longer in your question bank.</p>}
   </li>;})}</ul>
  </>:<div className="mx-allclear"><Trophy size={22}/><div><strong>All mistakes fixed</strong><small>Nothing left to revisit. Nice work.</small></div></div>}
  {ledger.cleared.length>0&&<div className="mx-cleared">
   <button type="button" aria-expanded={showCleared} onClick={()=>setShowCleared(v=>!v)}><CheckCircle2 size={16}/>Fixed questions <b>{ledger.cleared.length}</b><ChevronDown size={16} className="mx-chev"/></button>
   {showCleared&&<ul>{ledger.cleared.slice(0,30).map(e=><li key={e.id}><span>{e.last.prompt||'Picture question'}</span><small>Fixed {ago(e.clearedAt)} · missed {e.misses}×</small></li>)}</ul>}
  </div>}
 </section>;
}

const monthName=(y:number,m:number)=>new Date(y,m,1).toLocaleDateString(undefined,{month:'long',year:'numeric'});
const WEEKDAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PARTS=[['morning','Morning',Sunrise,'5am–12pm'],['afternoon','Afternoon',Sun,'12–5pm'],['evening','Evening',Sunset,'5–10pm'],['night','Night',Moon,'10pm–5am']] as const;

export function ActivityPanel({reports,streakDays}:{reports:any[];streakDays:string[]}){
 const today=localDay();
 const stats=useMemo(()=>activityStats(reports),[reports]);
 const streak=useMemo(()=>streakStats([...streakDays,...stats.days.keys()],today),[streakDays,stats,today]);
 const [month,setMonth]=useState(()=>{const d=new Date();return {y:d.getFullYear(),m:d.getMonth()};});
 const [picked,setPicked]=useState<string>(today);
 const first=new Date(month.y,month.m,1),days=new Date(month.y,month.m+1,0).getDate(),lead=(first.getDay()+6)%7;
 const keys=Array.from({length:days},(_,i)=>localDay(new Date(month.y,month.m,i+1)));
 const studied=new Set([...streakDays,...stats.days.keys()]);
 const maxAnswers=Math.max(1,...keys.map(k=>stats.days.get(k)?.answers||0));
 const inMonth=keys.map(k=>stats.days.get(k)).filter(Boolean) as any[];
 const monthSeconds=inMonth.reduce((n,d)=>n+d.seconds,0),monthDays=keys.filter(k=>studied.has(k)).length;
 const elapsed=keys.filter(k=>k<=today).length;
 const isCurrent=month.y===new Date().getFullYear()&&month.m===new Date().getMonth();
 const earliest=reports.length?new Date(reports[reports.length-1].date):new Date();
 const canBack=new Date(month.y,month.m,1)>new Date(earliest.getFullYear(),earliest.getMonth(),1);
 const shift=(n:number)=>setMonth(({y,m})=>{const d=new Date(y,m+n,1);return {y:d.getFullYear(),m:d.getMonth()};});
 const totalQuizzes=stats.weekdays.reduce((a,b)=>a+b,0);
 const topDay=totalQuizzes?stats.weekdays.indexOf(Math.max(...stats.weekdays)):-1;
 const topPart=totalQuizzes?PARTS.reduce((a,p)=>stats.parts[p[0]]>stats.parts[a[0]]?p:a):null;
 const maxWeekday=Math.max(1,...stats.weekdays);
 const day=stats.days.get(picked);
 const last14=Array.from({length:14},(_,i)=>shiftDay(today,i-13));
 const recentMinutes=last14.reduce((n,k)=>n+(stats.days.get(k)?.seconds||0),0)/60;
 return <section className="report-content-card ax">
  <div className="report-content-heading"><div><p>YOUR STUDY RHYTHM</p><h2>Activity</h2></div></div>
  <div className="ax-stats">
   <div data-kind="streak"><Flame size={18}/><strong>{streak.current}</strong><span>Day streak</span></div>
   <div><Trophy size={18}/><strong>{streak.longest}</strong><span>Best streak</span></div>
   <div><CalendarDays size={18}/><strong>{streak.total}</strong><span>Days studied</span></div>
   <div><Clock size={18}/><strong>{Math.round(recentMinutes/14)||0}m</strong><span>Per day (2 wks)</span></div>
  </div>

  <div className="ax-cal">
   <div className="ax-cal-head"><button type="button" aria-label="Previous month" disabled={!canBack} onClick={()=>shift(-1)}><ChevronLeft size={18}/></button><strong>{monthName(month.y,month.m)}</strong><button type="button" aria-label="Next month" disabled={isCurrent} onClick={()=>shift(1)}><ChevronRight size={18}/></button></div>
   <p className="ax-cal-sub">{monthDays} of {isCurrent?elapsed:days} days studied · {formatDuration(monthSeconds)} · {inMonth.reduce((n,d)=>n+d.quizzes,0)} quizzes</p>
   <div className="ax-grid" role="grid" aria-label={`Study days in ${monthName(month.y,month.m)}`}>
    {WEEKDAYS.map(d=><span key={d} className="ax-wd" aria-hidden="true">{d[0]}</span>)}
    {Array.from({length:lead},(_,i)=><span key={'l'+i}/>)}
    {keys.map((k,i)=>{const s=stats.days.get(k),lv=s?Math.min(4,1+Math.floor(s.answers/maxAnswers*3.99)):studied.has(k)?1:0;return <button key={k} type="button" className="ax-day" data-lv={lv} data-today={k===today||undefined} data-picked={k===picked||undefined} disabled={k>today} aria-label={`${k}: ${s?`${s.quizzes} ${s.quizzes===1?'quiz':'quizzes'}, ${s.answers} answers`:studied.has(k)?'practised':'no study'}`} onClick={()=>setPicked(k)}>{i+1}</button>;})}
   </div>
   <div className="ax-legend"><span>Less</span>{[0,1,2,3,4].map(l=><i key={l} data-lv={l}/>)}<span>More</span></div>
  </div>

  <div className="ax-dayview">
   <h3>{picked===today?'Today':new Date(picked+'T12:00:00').toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'})}</h3>
   {day?<><p className="report-muted">{day.quizzes} {day.quizzes===1?'quiz':'quizzes'} · {day.answers} answers · {Math.round(day.correct/Math.max(1,day.answers)*100)}% correct · {formatDuration(day.seconds)}</p>
    <ul>{day.reports.map((r:any)=><li key={r.id}><span>{new Date(r.date).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span><em>{r.mode==='retry_mistakes'?'Retake':'Quiz'} · {r.total} questions</em><b data-level={level(r.accuracy)}>{r.accuracy}%</b></li>)}</ul></>
   :<p className="report-muted">{studied.has(picked)?'You practised this day.':'No quizzes this day.'}{picked===today?' A quick quiz keeps your streak going.':''}</p>}
  </div>

  {totalQuizzes>0&&<div className="ax-rhythm">
   <h3>When you study</h3>
   <p className="report-muted">Most often on <b>{WEEKDAYS[topDay]}</b>{topPart?<>, usually in the <b>{topPart[1].toLowerCase()}</b></>:null}.</p>
   <div className="ax-week">{stats.weekdays.map((n,i)=><div key={i} data-top={i===topDay||undefined}><i style={{height:`${Math.max(6,n/maxWeekday*100)}%`}}/><span>{WEEKDAYS[i][0]}</span><small>{n}</small></div>)}</div>
   <div className="ax-parts">{PARTS.map(([id,label,Icon,hint])=>{const pct=Math.round(stats.parts[id]/totalQuizzes*100);return <div key={id} data-top={topPart?.[0]===id||undefined}><Icon size={16}/><span><strong>{label}</strong><small>{hint}</small></span><b>{pct}%</b><i style={{width:`${pct}%`}}/></div>;})}</div>
  </div>}
 </section>;
}
