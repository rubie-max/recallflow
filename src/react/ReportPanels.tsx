import React,{useEffect,useRef,useState} from 'react';
import {TrendingUp,TrendingDown,Play} from 'lucide-react';
import {Button} from './components/Button';
import {REPORT_RANGES,MASTERY_LEVELS,formatDuration} from '../report-stats.js';

type Summary={quizzes:number;retakes:number;answers:number;correct:number;missed:number;accuracy:number|null;firstTryAccuracy:number|null;seconds:number;perAnswer:number|null;days:number};
type Day={day:string;answers:number;correct:number;quizzes:number;accuracy:number|null};
type QuestionStat={id:string;prompt:string;subject?:string;topic?:string;attempts:number;correct:number;accuracy:number;avgSeconds:number};

const shortDate=(day:string)=>new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
const weekday=(day:string)=>new Date(day+'T00:00:00Z').toLocaleDateString(undefined,{weekday:'short',timeZone:'UTC'});
const periodName=(days:number)=>days===7?'last week':`previous ${days} days`;

export function RangePicker({value,onChange}:{value:number;onChange:(days:number)=>void}){
  return <div className="rx-range" role="radiogroup" aria-label="Time range">{REPORT_RANGES.map(([days,label])=><button key={days} type="button" role="radio" aria-checked={value===days} onClick={()=>onChange(days as number)}>{label}</button>)}</div>;
}

function Delta({now,before,days,unit='',lowerIsBetter=false,format=(n:number)=>String(n)}:{now:number|null;before:number|null;days:number;unit?:string;lowerIsBetter?:boolean;format?:(n:number)=>string}){
  if(!days||now==null||before==null)return null;
  const change=now-before;
  if(Math.abs(change)<(unit===' pts'?1:.5))return <small className="rx-delta" data-trend="flat">Same as {periodName(days)}</small>;
  const good=lowerIsBetter?change<0:change>0;
  return <small className="rx-delta" data-good={good}>{change>0?<TrendingUp size={12} aria-hidden="true"/>:<TrendingDown size={12} aria-hidden="true"/>}{change>0?'+':'−'}{format(Math.abs(change))}{unit} vs {periodName(days)}</small>;
}

export function OverviewStats({now,before,days,mastered,total}:{now:Summary;before:Summary;days:number;mastered:number;total:number}){
  const prev=before.quizzes?before:null;
  return <section className="rx-overview" aria-label="Summary">
    <div className="rx-lead"><span>ACCURACY</span><strong>{now.accuracy??0}%</strong><small>{now.answers} {now.answers===1?'answer':'answers'} in {now.quizzes} {now.quizzes===1?'quiz':'quizzes'}{days?` · last ${days} days`:''}</small><Delta now={now.accuracy} before={prev?.accuracy??null} days={days} unit=" pts"/></div>
    <div className="rx-tiles">
      <div><span>Quizzes</span><strong>{now.quizzes}</strong><Delta now={now.quizzes} before={prev?prev.quizzes:days?0:null} days={days}/></div>
      <div><span>Study time</span><strong>{formatDuration(now.seconds)}</strong><Delta now={now.seconds} before={prev?prev.seconds:days?0:null} days={days} format={formatDuration}/></div>
      <div><span>Per question</span><strong>{now.perAnswer==null?'—':`${now.perAnswer.toFixed(1)}s`}</strong><Delta now={now.perAnswer==null?null:Math.round(now.perAnswer*10)/10} before={prev?.perAnswer==null?null:Math.round(prev.perAnswer*10)/10} days={days} lowerIsBetter format={n=>n.toFixed(1)} unit="s"/></div>
      <div><span>First-try accuracy</span><strong>{now.firstTryAccuracy==null?'—':`${now.firstTryAccuracy}%`}</strong><small className="rx-note">{now.retakes?`Leaves out ${now.retakes} ${now.retakes===1?'retake':'retakes'}`:'Daily and custom quizzes'}</small></div>
      <div><span>Days studied</span><strong>{now.days}{days?<small> / {days}</small>:null}</strong><small className="rx-note">{days?`${Math.round(now.days/days*100)}% of days`:'Days with a quiz'}</small></div>
      <div><span>Mastered</span><strong>{mastered}<small> / {total}</small></strong><small className="rx-note">Questions you know well</small></div>
    </div>
  </section>;
}

function useWidth(fallback:number){
  const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(fallback);
  useEffect(()=>{const el=ref.current;if(!el)return;const update=()=>setWidth(Math.max(240,Math.round(el.clientWidth)));update();const observer=new ResizeObserver(update);observer.observe(el);return()=>observer.disconnect();},[]);
  return [ref,width] as const;
}

export function AccuracyChart({series}:{series:Day[]}){
  const [ref,W]=useWidth(320);
  const H=190,L=34,R=10,T=14,B=26,w=W-L-R,h=H-T-B,n=series.length;
  const x=(i:number)=>L+(n===1?w/2:i*w/(n-1)),y=(a:number)=>T+h-a/100*h;
  const maxAnswers=Math.max(1,...series.map(s=>s.answers)),barW=Math.max(2,Math.min(16,w/Math.max(n,1)*.55));
  const points=series.flatMap((s,i)=>s.accuracy==null?[]:[{x:x(i),y:y(s.accuracy),s}]);
  const line=points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area=points.length>1?`${line} L${points[points.length-1].x.toFixed(1)},${T+h} L${points[0].x.toFixed(1)},${T+h} Z`:'';
  const labels=n>2?[0,Math.floor((n-1)/2),n-1]:n===2?[0,1]:[0];
  const average=points.length?Math.round(points.reduce((a,p)=>a+(p.s.accuracy||0)*p.s.answers,0)/Math.max(1,points.reduce((a,p)=>a+p.s.answers,0))):null;
  return <div className="rx-chart-wrap" ref={ref}>
    <svg className="rx-chart" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={points.length?`Accuracy by day, from ${shortDate(series[0].day)} to ${shortDate(series[n-1].day)}. Average ${average}%.`:'No quizzes in this period'}>
      <defs><linearGradient id="rx-area-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="currentColor" stopOpacity=".26"/><stop offset="1" stopColor="currentColor" stopOpacity="0"/></linearGradient></defs>
      {[0,50,100].map(v=><g key={v}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} className="rx-grid"/><text x={L-7} y={y(v)+3.5} textAnchor="end" className="rx-axis">{v}%</text></g>)}
      {series.map((s,i)=>s.answers?<rect key={s.day} className="rx-bar" x={x(i)-barW/2} y={T+h-s.answers/maxAnswers*h*.35} width={barW} height={s.answers/maxAnswers*h*.35} rx={2}><title>{`${shortDate(s.day)}: ${s.answers} ${s.answers===1?'answer':'answers'}`}</title></rect>:null)}
      {average!=null&&points.length>1&&<line x1={L} x2={W-R} y1={y(average)} y2={y(average)} className="rx-average"/>}
      {area&&<path d={area} fill="url(#rx-area-fill)"/>}
      {points.length>1&&<path d={line} className="rx-line"/>}
      {points.map(p=><circle key={p.s.day} cx={p.x} cy={p.y} r={n>45?2.4:3.6} className="rx-dot"><title>{`${shortDate(p.s.day)}: ${p.s.accuracy}% · ${p.s.correct}/${p.s.answers} correct`}</title></circle>)}
      {n>0&&labels.map((i,k)=><text key={i} x={x(i)} y={H-7} textAnchor={labels.length===1?'middle':k===0?'start':k===labels.length-1?'end':'middle'} className="rx-axis">{shortDate(series[i].day)}</text>)}
    </svg>
    <div className="rx-chart-legend"><span><i className="rx-key-line"/>Accuracy</span><span><i className="rx-key-bar"/>Answers</span>{average!=null&&points.length>1&&<span><i className="rx-key-average"/>Average {average}%</span>}</div>
  </div>;
}

export function MemoryPanel({counts,forecast,onStart}:{counts:Record<string,number>;forecast:{days:{day:string;count:number}[];overdue:number;unstudied:number};onStart:()=>void}){
  const total=Object.values(counts).reduce((a,b)=>a+b,0),strong=counts.familiar+counts.mastered,max=Math.max(1,...forecast.days.map(d=>d.count)),dueNow=forecast.days[0]?.count||0;
  return <>
    <section className="report-content-card">
      <div className="report-content-heading"><div><p>MEMORY STRENGTH</p><h2>How well you know them</h2></div><strong title="Familiar or mastered">{total?Math.round(strong/total*100):0}%</strong></div>
      <p className="report-muted">Each correct answer pushes a question’s next review further away. The further away it is, the stronger you know it.</p>
      <div className="rx-stack" role="img" aria-label={MASTERY_LEVELS.map(([id,label])=>`${label} ${counts[id]}`).join(', ')}>{MASTERY_LEVELS.map(([id])=>counts[id]?<i key={id} data-level={id} style={{flexGrow:counts[id]}}/>:null)}</div>
      <ul className="rx-levels">{MASTERY_LEVELS.map(([id,label,hint])=><li key={id} data-level={id}><i aria-hidden="true"/><span><b>{label}</b><small>{hint}</small></span><strong>{counts[id]}</strong></li>)}</ul>
    </section>
    <section className="report-content-card">
      <div className="report-content-heading"><div><p>COMING UP</p><h2>Reviews this week</h2></div><strong>{forecast.days.reduce((a,d)=>a+d.count,0)}</strong></div>
      <p className="report-muted">Questions you’ve studied that come due each day. New questions you haven’t studied yet aren’t counted.</p>
      <div className="rx-forecast">{forecast.days.map((d,i)=><div key={d.day} data-today={i===0||undefined}><span>{d.count||''}</span><i><b style={{height:`${d.count?Math.max(6,d.count/max*100):0}%`}}/></i><small>{i===0?'Today':weekday(d.day)}</small></div>)}</div>
      <div className="rx-forecast-notes">{forecast.overdue>0&&<span>Today includes {forecast.overdue} overdue</span>}{forecast.unstudied>0&&<span>{forecast.unstudied} new {forecast.unstudied===1?'question':'questions'} not studied yet</span>}</div>
      {(dueNow>0||forecast.unstudied>0)&&<Button onClick={onStart}><Play size={16} fill="currentColor"/> Start today’s quiz</Button>}
    </section>
  </>;
}

export function QuestionStatList({rows,metric,onPractice,practiceLabel}:{rows:QuestionStat[];metric:'accuracy'|'speed';onPractice?:()=>void;practiceLabel?:string}){
  return <><ol className="rx-question-list">{rows.map(s=><li key={s.id}><span><b>{s.prompt||'Picture question'}</b><small>{[s.subject,s.topic].filter(Boolean).join(' · ')}</small></span><strong data-metric={metric}>{metric==='accuracy'?`${s.accuracy}%`:`${s.avgSeconds.toFixed(1)}s`}<small>{metric==='accuracy'?`${s.correct}/${s.attempts} right`:`${s.attempts} ${s.attempts===1?'try':'tries'}`}</small></strong></li>)}</ol>{onPractice&&<Button variant="outline" onClick={onPractice}><Play size={15} fill="currentColor"/> {practiceLabel}</Button>}</>;
}
