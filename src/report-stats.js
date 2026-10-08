import {localDay} from './streak-stats.js';
import {typeLabel} from './question-types.js';

export const REPORT_RANGES=[[7,'7 days'],[30,'30 days'],[90,'90 days'],[0,'All time']];
export const MASTERY_LEVELS=[['new','New','Not studied yet'],['learning','Learning','Next review within a week'],['familiar','Familiar','Next review in 1–4 weeks'],['mastered','Mastered','Next review a month or more away']];

export function shiftDay(day,n){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
const reportDay=r=>localDay(new Date(r.date));

// The last `days` calendar days up to today; offset 1 is the period just before that. 0 days means all history.
export function reportsInRange(reports,days,today=localDay(),offset=0){
  if(!days)return offset?[]:reports;
  const end=shiftDay(today,-days*offset),start=shiftDay(end,-(days-1));
  return reports.filter(r=>{const d=reportDay(r);return d>=start&&d<=end;});
}

export function summarize(reports){
  const answers=reports.reduce((n,r)=>n+(r.total||0),0),correct=reports.reduce((n,r)=>n+(r.correct||0),0),seconds=reports.reduce((n,r)=>n+(Number(r.duration_seconds)||0),0);
  const first=reports.filter(r=>r.mode!=='retry_mistakes'),firstAnswers=first.reduce((n,r)=>n+(r.total||0),0),firstCorrect=first.reduce((n,r)=>n+(r.correct||0),0);
  return {quizzes:reports.length,retakes:reports.length-first.length,answers,correct,missed:answers-correct,accuracy:answers?Math.round(correct/answers*100):null,firstTryAccuracy:firstAnswers?Math.round(firstCorrect/firstAnswers*100):null,seconds,perAnswer:answers?seconds/answers:null,days:new Set(reports.map(reportDay)).size};
}

// One entry per calendar day; with a fixed range, days without a quiz are included with no accuracy.
export function dailySeries(reports,days,today=localDay()){
  const byDay=new Map();
  for(const r of reports){const day=reportDay(r),s=byDay.get(day)||{day,answers:0,correct:0,quizzes:0,seconds:0};s.answers+=r.total||0;s.correct+=r.correct||0;s.quizzes++;s.seconds+=Number(r.duration_seconds)||0;byDay.set(day,s);}
  const empty=day=>({day,answers:0,correct:0,quizzes:0,seconds:0});
  const list=days?Array.from({length:days},(_,i)=>byDay.get(shiftDay(today,i-days+1))||empty(shiftDay(today,i-days+1))):[...byDay.values()].sort((a,b)=>a.day<b.day?-1:1);
  return list.map(s=>({...s,accuracy:s.answers?Math.round(s.correct/s.answers*100):null}));
}

export function masteryLevel(item){if(!item.lastReviewed)return 'new';const interval=item.interval||0;return interval>=30?'mastered':interval>=7?'familiar':'learning';}
export function mastery(items){const counts={new:0,learning:0,familiar:0,mastered:0};for(const item of items)counts[masteryLevel(item)]++;return counts;}

// Studied questions coming due over the next `days` days; anything overdue is counted in today.
export function dueForecast(items,days=7,today=localDay()){
  const out=Array.from({length:days},(_,i)=>({day:shiftDay(today,i),count:0}));let overdue=0,unstudied=0;
  for(const item of items){
    if(!item.lastReviewed&&!item.due){unstudied++;continue;}
    const due=item.due||today;if(due<today)overdue++;
    const index=due<=today?0:Math.round((Date.parse(due+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
    if(index<days)out[index].count++;
  }
  return {days:out,overdue,unstudied};
}

export function questionStats(reports){
  const stats=new Map();
  for(const r of [...reports].reverse())for(const q of r.questions||[]){
    const s=stats.get(q.knowledge_id)||{id:q.knowledge_id,prompt:q.prompt,subject:q.subject,topic:q.topic,attempts:0,correct:0,seconds:0,lastCorrect:false};
    s.attempts++;s.correct+=q.correct?1:0;s.seconds+=Number(q.response_time_seconds)||0;s.lastCorrect=!!q.correct;s.prompt=q.prompt||s.prompt;stats.set(q.knowledge_id,s);
  }
  return [...stats.values()].map(s=>({...s,accuracy:Math.round(s.correct/s.attempts*100),avgSeconds:s.seconds/s.attempts}));
}
export function hardestQuestions(stats,limit=6){return stats.filter(s=>s.attempts>=2&&s.correct<s.attempts).sort((a,b)=>a.accuracy-b.accuracy||b.attempts-a.attempts).slice(0,limit);}
export function slowestQuestions(stats,limit=5){return stats.filter(s=>s.avgSeconds>0).sort((a,b)=>b.avgSeconds-a.avgSeconds).slice(0,limit);}

// Spreadsheet apps treat cells starting with these characters as formulas.
const csvCell=value=>{let s=String(value??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return /[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s;};
export function reportsCsv(reports){
  const rows=[['Date','Time','Kind','Subject','Topic','Question type','Question','Your answer','Correct answer','Result','Seconds']];
  for(const r of [...reports].reverse()){const d=new Date(r.date),time=`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;for(const q of r.questions||[])rows.push([localDay(d),time,r.mode==='retry_mistakes'?'Retake':'Quiz',q.subject,q.topic,typeLabel(q.type),q.prompt,q.user_answer,q.correct_answer,q.correct?'Correct':'Missed',q.response_time_seconds]);}
  return rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
}

export function formatDuration(seconds){seconds=Math.round(seconds||0);if(seconds<60)return `${seconds}s`;const minutes=Math.round(seconds/60);return minutes<60?`${minutes}m`:`${Math.floor(minutes/60)}h ${minutes%60}m`;}
