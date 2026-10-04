import React,{useEffect,useState} from 'react';
import {Flame,Check,ArrowLeft,ChevronLeft,ChevronRight,Trophy,CalendarDays,ChartNoAxesColumnIncreasing} from 'lucide-react';
import {streakStats} from '../streak-stats.js';
import styles from './StreakPage.module.css';
const key=(date:Date)=>date.toISOString().slice(0,10);
const dayNames=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
export function StreakPage({days,onBack,onQuiz}:{days:string[];onBack:()=>void;onQuiz:()=>void}) {
  useEffect(()=>{window.scrollTo({top:0});},[]);
  const now=new Date(),today=key(now),active=new Set(days),stats=streakStats(days,today);
  const [offset,setOffset]=useState(0);
  const month=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()+offset,1));
  const monthLabel=month.toLocaleDateString(undefined,{month:'long',year:'numeric',timeZone:'UTC'});
  const currentYear=now.getUTCFullYear(),currentMonth=now.getUTCMonth();
  const firstYear=Math.min(currentYear-10,...days.map(d=>Number(d.slice(0,4))).filter(y=>Number.isInteger(y)&&y>=1900&&y<=currentYear));
  const years=Array.from({length:currentYear-firstYear+1},(_,i)=>currentYear-i);
  const selectMonth=(year:number,index:number)=>setOffset(Math.min(0,(year-currentYear)*12+index-currentMonth));
  const leading=(month.getUTCDay()+6)%7,count=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  const cells=Array.from({length:Math.ceil((leading+count)/7)*7},(_,i)=>new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),i-leading+1)));
  const monthCount=cells.filter(d=>d.getUTCMonth()===month.getUTCMonth()&&key(d)<=today&&active.has(key(d))).length;
  const monday=new Date(today+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const week=dayNames.map((label,i)=>{const date=new Date(monday);date.setUTCDate(date.getUTCDate()+i);return {label,date:key(date)};});
  const weekCount=week.filter(d=>d.date<=today&&active.has(d.date)).length,doneToday=active.has(today);
  return <section className={styles.page}>
    <button className={styles.back} onClick={onBack}><ArrowLeft size={16}/> Back to home</button>
    <div className={styles.heading}><h1>Your streak</h1></div>
    <section className={styles.hero} aria-label="Current streak">
      <div className={styles.streakRing}><svg className={styles.ringSvg} viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="53" className={styles.ringTrack}/><circle cx="60" cy="60" r="53" className={styles.ringProgress} strokeDasharray={`${weekCount/7*333.01} 333.01`} transform="rotate(-90 60 60)"/></svg><div><Flame size={25}/><strong>{stats.current}</strong><span>day streak</span></div></div>
      <div className={styles.ringDetails}><h2>{weekCount} of 7 days</h2><div className={styles.weekGrid} aria-label="This week’s activity">{week.map(d=><div key={d.date}><span className={`${styles.weekDay} ${active.has(d.date)&&d.date<=today?styles.complete:''} ${d.date===today?styles.current:''} ${d.date<today&&!active.has(d.date)?styles.missed:''}`} aria-label={`${d.label}, ${d.date}${active.has(d.date)&&d.date<=today?', studied':d.date===today?', today':d.date>today?', upcoming':', no quiz completed'}`}>{active.has(d.date)&&d.date<=today?<Flame size={15} fill="currentColor" strokeWidth={1.5}/>:d.date<=today?<Flame size={12}/>:<span className={styles.emptyDayIcon}/>}</span><span className={styles.dayLabel}>{d.label.slice(0,1)}</span></div>)}</div><button className={styles.practice} onClick={onQuiz}><span>{doneToday?'Practice again':'Practice now'}</span><ChevronRight size={17}/></button></div>

    </section>
    <div className={styles.stats}><div><Trophy size={19}/><span>Longest streak</span><strong>{stats.longest}<small> {stats.longest===1?'day':'days'}</small></strong></div><div><ChartNoAxesColumnIncreasing size={19}/><span>Total study days</span><strong>{stats.total}<small> {stats.total===1?'day':'days'}</small></strong></div></div>
    <section className={styles.calendar} aria-label="Study calendar"><div className={styles.calendarHeader}><div><div className={styles.dateSelectors}><select aria-label="Calendar month" value={month.getUTCMonth()} onChange={e=>selectMonth(month.getUTCFullYear(),Number(e.target.value))}>{Array.from({length:12},(_,i)=><option key={i} value={i} disabled={month.getUTCFullYear()===currentYear&&i>currentMonth}>{new Date(Date.UTC(2000,i,1)).toLocaleDateString(undefined,{month:'long',timeZone:'UTC'})}</option>)}</select><select aria-label="Calendar year" value={month.getUTCFullYear()} onChange={e=>selectMonth(Number(e.target.value),month.getUTCMonth())}>{[...new Set([...years,month.getUTCFullYear()])].sort((a,b)=>b-a).map(y=><option key={y} value={y}>{y}</option>)}</select></div><span>{monthCount} study {monthCount===1?'day':'days'} · {monthLabel}</span></div><div><button aria-label="Previous month" onClick={()=>setOffset(n=>n-1)}><ChevronLeft size={19}/></button><button aria-label="Next month" disabled={offset===0} onClick={()=>setOffset(n=>Math.min(0,n+1))}><ChevronRight size={19}/></button></div></div><div className={styles.calendarGrid}>{dayNames.map(d=><span className={styles.weekLabel} key={d}>{d}</span>)}{cells.map((date,i)=>{if(!date)return <span key={'empty'+i}/>;const dateKey=key(date),done=active.has(dateKey)&&dateKey<=today,isToday=dateKey===today;return <span key={dateKey} className={`${styles.calendarDay} ${done?styles.complete:''} ${isToday?styles.current:''} ${date.getUTCMonth()!==month.getUTCMonth()?styles.outside:dateKey>today?styles.future:''}`} aria-label={`${date.toLocaleDateString(undefined,{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'})}${done?', studied':isToday?', today':dateKey>today?', upcoming':', no quiz completed'}`} aria-current={isToday?'date':undefined}>{date.getUTCDate()}{done&&<i/>}</span>;})}</div><div className={styles.legend}><span><i className={styles.legendDone}/> Studied</span><span><i className={styles.legendToday}/> Today</span></div></section>
    <p className={styles.note}>A day counts when you finish a quiz. Multiple quizzes on the same day count as one study day.</p>
  </section>;
}
