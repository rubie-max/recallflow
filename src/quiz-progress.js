// An unfinished quiz is kept on this device so it can be continued the same day.
// When it is dropped (a new day, Start over, or another quiz) the answers given so far become a report.
export const PROGRESS_KEY='recallflow_quiz_progress';

export function makeReport(results,{mode,source,date=new Date().toISOString()}={}){
  const correct=results.filter(x=>x.correct).length;
  return {id:`report_${Date.parse(date)}`,mode,source_report_id:source,date,duration_seconds:results.reduce((a,b)=>a+(Number(b.response_time_seconds)||0),0),total:results.length,correct,accuracy:results.length?Math.round(correct/results.length*100):0,questions:results};
}

export function readProgress(raw){
  try{
    const p=JSON.parse(raw||'null');
    return p&&/^\d{4}-\d{2}-\d{2}$/.test(p.day)&&Array.isArray(p.questions)&&Array.isArray(p.results)&&p.results.length<p.questions.length?p:null;
  }catch{return null;}
}

export function currentProgress(raw,day){const p=readProgress(raw);return p&&p.day===day?p:null;}

// Returns {day,report} for progress that should be kept as a report, or null.
export function unfinishedReport(raw,day,discard=false,now=new Date()){
  const p=readProgress(raw);
  if(!p||!p.results.length||(!discard&&p.day===day))return null;
  const noon=Date.parse(p.day+'T12:00:00Z');
  const at=typeof p.at==='string'&&!Number.isNaN(Date.parse(p.at))?p.at:p.day!==day&&!Number.isNaN(noon)?new Date(noon).toISOString():now.toISOString();
  return {day:p.day,report:makeReport(p.results,{mode:p.kind,source:p.source,date:at})};
}
