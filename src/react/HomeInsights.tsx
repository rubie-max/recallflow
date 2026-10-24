import React,{useMemo} from 'react';
import {ArrowRight,TrendingUp,TrendingDown,Minus,CalendarClock,Target,Plus,FileUp,Play,Trophy} from 'lucide-react';
import {reportsInRange,summarize,dailySeries,formatDuration,MASTERY_LEVELS} from '../report-stats.js';
import {analytics} from '../learning-core.js';

type Props={items:any[];reports:any[];forecast:{days:{day:string;count:number}[];overdue:number;unstudied:number};memory:Record<string,number>;mistakes:any[];onPracticeMistakes:()=>void;onPracticeSubject:(subject:string)=>void;onOpenReport:(view:'progress'|'memory'|'mistakes'|'history')=>void;onAdd:()=>void;onImport:()=>void};

const weekday=(day:string)=>new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{weekday:'narrow',timeZone:'UTC'});
const level=(pct:number|null)=>pct==null?'none':pct>=80?'good':pct>=50?'ok':'low';
function ago(iso:string){const m=Math.round((Date.now()-Date.parse(iso))/60000);if(m<1)return 'just now';if(m<60)return `${m} min ago`;const h=Math.round(m/60);if(h<24)return `${h} h ago`;const d=Math.round(h/24);return d===1?'yesterday':`${d} days ago`;}

export function HomeInsights({items,reports,forecast,memory,mistakes,onPracticeMistakes,onPracticeSubject,onOpenReport,onAdd,onImport}:Props){
 const week=useMemo(()=>summarize(reportsInRange(reports,7)),[reports]);
 const before=useMemo(()=>summarize(reportsInRange(reports,7,undefined,1)),[reports]);
 const days=useMemo(()=>dailySeries(reportsInRange(reports,7),7),[reports]);
 const weakest=useMemo(()=>{
  const groups=analytics(reportsInRange(reports,30)).groups.subject as Record<string,{total:number;correct:number}>;
  return Object.entries(groups).filter(([,s])=>s.total>=4).map(([name,s])=>({name,pct:Math.round(s.correct/s.total*100)})).filter(s=>s.pct<80).sort((a,b)=>a.pct-b.pct)[0];
 },[reports]);
 const last=reports[0];
 const maxAnswers=Math.max(1,...days.map(d=>d.answers));
 const change=week.accuracy!=null&&before.accuracy!=null?week.accuracy-before.accuracy:null;
 const studied=items.length-(memory.new||0);
 const tomorrow=forecast.days[1]?.count||0,later=forecast.days.slice(1).reduce((n,d)=>n+d.count,0);

 if(!items.length)return <section className="hx-empty">
  <h2>Build your question bank</h2>
  <p>Add questions yourself or bring in a list you already have. Your first quiz is one tap away after that.</p>
  <div className="hx-actions"><button type="button" onClick={onAdd}><Plus size={17}/>New question</button><button type="button" onClick={onImport}><FileUp size={17}/>Import</button></div>
 </section>;

 return <div className="hx">
  <button type="button" className="hx-card hx-week" onClick={()=>onOpenReport('progress')} aria-label={`This week: ${week.accuracy??0}% correct. Open progress report`}>
   <div className="hx-head"><span className="hx-title">This week</span>{last&&<span className="hx-last" data-level={level(last.accuracy)}>Last quiz {last.accuracy}% · {ago(last.date)}</span>}</div>
   {week.quizzes?<>
    <div className="hx-week-main">
     <div className="hx-big"><strong data-level={level(week.accuracy)}>{week.accuracy}%</strong><span>correct</span></div>
     {change!=null&&<span className="hx-change" data-dir={change>0?'up':change<0?'down':'flat'}>{change>0?<TrendingUp size={14}/>:change<0?<TrendingDown size={14}/>:<Minus size={14}/>}{change>0?`+${change}`:change} vs last week</span>}
    </div>
    <div className="hx-bars" aria-hidden="true">{days.map(d=><div key={d.day} className="hx-bar" data-level={level(d.accuracy)} data-today={d===days[days.length-1]||undefined}><i style={{height:`${d.answers?Math.max(14,d.answers/maxAnswers*100):6}%`}}/><span>{weekday(d.day)}</span></div>)}</div>
    <div className="hx-foot"><span><b>{week.quizzes}</b> {week.quizzes===1?'quiz':'quizzes'}</span><span><b>{week.answers}</b> answers</span><span><b>{formatDuration(week.seconds)}</b> studied</span></div>
   </>:<p className="hx-muted">No quizzes in the last 7 days yet. Start today’s quiz and your week will fill in here.</p>}
  </button>

  <button type="button" className="hx-card hx-plan" onClick={()=>onOpenReport('memory')} aria-label="Coming up and memory strength. Open memory report">
   <div className="hx-head"><span className="hx-title"><CalendarClock size={16}/>Coming up</span><ArrowRight size={16} className="hx-go"/></div>
   <div className="hx-plan-grid">
    <div><strong>{forecast.days[0]?.count||0}</strong><span>Due today</span></div>
    <div><strong>{tomorrow}</strong><span>Tomorrow</span></div>
    <div><strong>{later}</strong><span>Next 7 days</span></div>
   </div>
   <div className="hx-memory" role="img" aria-label={MASTERY_LEVELS.map(([id,label])=>`${memory[id]||0} ${label}`).join(', ')}>{MASTERY_LEVELS.map(([id])=>memory[id]?<i key={id} data-level={id} style={{flexGrow:memory[id]}}/>:null)}</div>
   <div className="hx-legend">{MASTERY_LEVELS.map(([id,label])=><span key={id} data-level={id}><i/>{label} {memory[id]||0}</span>)}</div>
   <p className="hx-muted">{studied} of {items.length} questions studied{memory.mastered?` · ${memory.mastered} mastered`:''}</p>
  </button>

  {(mistakes.length>0||weakest)&&<section className="hx-card hx-focus">
   <div className="hx-head"><span className="hx-title"><Target size={16}/>Needs practice</span></div>
   {mistakes.length>0&&<div className="hx-focus-row"><div><strong>{mistakes.length} {mistakes.length===1?'question':'questions'} to revisit</strong><small>Each one clears after two right answers in a row.</small></div><button type="button" className="hx-pill" onClick={onPracticeMistakes}><Play size={13} fill="currentColor"/>Practice</button></div>}
   {weakest&&<div className="hx-focus-row"><div><strong>{weakest.name} · {weakest.pct}%</strong><small>Your weakest subject this month.</small></div><button type="button" className="hx-pill is-soft" onClick={()=>onPracticeSubject(weakest.name)}><Play size={13} fill="currentColor"/>Drill</button></div>}
   {mistakes.length>0&&<button type="button" className="hx-link" onClick={()=>onOpenReport('mistakes')}>See all mistakes <ArrowRight size={14}/></button>}
  </section>}
  {!mistakes.length&&!weakest&&week.quizzes>0&&<section className="hx-card hx-great"><Trophy size={20}/><div><strong>Nothing to fix right now</strong><small>No open mistakes and every subject is above 80%.</small></div></section>}

  <div className="hx-actions"><button type="button" onClick={onAdd}><Plus size={17}/>New question</button><button type="button" onClick={onImport}><FileUp size={17}/>Import</button></div>
 </div>;
}
