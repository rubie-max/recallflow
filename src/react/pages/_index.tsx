import React, { useEffect, useMemo, useState } from "react";
import { BookOpen, Download, Upload, ArrowRight, Home, Library, History, CheckCircle2, XCircle, Flame, Sparkles, Moon, Sun, Star, Play, Settings, Plus, Pencil, Trash2, Volume2, Search, ChevronDown } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { useThemeMode } from "../helpers/themeMode";
import styles from "./_index.module.css";
import {KokoroPanel, SpeechButton, SpeechEvidence} from "../KokoroPanel";
import {QuizSettings, StorageSettings} from "../MoreSettings";
import {quizPreferences, prepareQuiz} from "../../quiz-preferences.js";
import {kokoroVoice} from "../../kokoro-service.js";
import {questionTypes, typeLabel, validateQuestion, gradeQuestion, missedItems} from "../../question-types.js";

import {WordBankAnswer,InlineBlankAnswer} from '../QuestionInteractions';
import {QuizBuilder,ExtendedEditor,StructuredAnswer,AnalyticsPanel,BackupRestore,OfflineSettings} from '../LearningFeatures';
import {scheduled,textGrade,duplicateIds} from '../../learning-core.js';
type Item = { [key:string]:any;
  id: string; subject: string; topic: string; prompt: string; answer: string;
  type?: "short_answer" | "fill_blank" | "single_choice" | "flashcard" | "true_false" | "multi_select" | "numeric" | "matching" | "ordering" | "cloze" | "fill_blank_options";
  options?: string[]; correctAnswers?:string[]; numericTolerance?:number; alt?: string; due?: string; interval?: number;
};
type Result = { grading?:string; knowledge_id:string; subject:string; topic:string; type:string; prompt:string; correct_answer:string; user_answer:string; correct:boolean; response_time_seconds:number; selected_answers?:string[] };
type QuizReport = { id:string; date:string; duration_seconds:number; total:number; correct:number; accuracy:number; questions:Result[]; mode?:"all"|"retry_mistakes"|"daily"|"due"; source_report_id?:string };

const starter: Item[] = [
  {id:"demo_short",subject:"Demo",topic:"Type Answer",prompt:"What is the capital of Japan?",answer:"Tokyo",type:"short_answer"},
  {id:"demo_fill",subject:"Demo",topic:"Fill in the Blank",prompt:"World War II ended in _____.",answer:"1945",type:"fill_blank"},
  {id:"demo_choice",subject:"Demo",topic:"Multiple Choice",prompt:"Which planet is the largest in our Solar System?",answer:"Jupiter",type:"single_choice",options:["Mars","Jupiter","Saturn","Earth"]},
  {id:"demo_flash",subject:"Demo",topic:"Flashcard",prompt:"Which organelle is often called the powerhouse of the cell?",answer:"Mitochondrion",type:"flashcard"},
];

const today=()=>new Date().toISOString().slice(0,10);

export default function IndexPage(){
  const { mode, switchToDarkMode, switchToLightMode } = useThemeMode();
  const [showQuizBuilder,setShowQuizBuilder]=useState(false);
  const [libraryTag,setLibraryTag]=useState(""),[librarySort,setLibrarySort]=useState("recent"),[duplicatesOnly,setDuplicatesOnly]=useState(false);
  const [items,setItems]=useState<Item[]>([]);
  const [quizCount,setQuizCount]=useState(0);
  const [streakDays,setStreakDays]=useState<string[]>([]);
  const [tab,setTab]=useState<"home"|"library"|"results"|"settings"|"streak">("home");
  const [review,setReview]=useState<Item[]|null>(null);
  const [idx,setIdx]=useState(0);
  const [answer,setAnswer]=useState("");
  const [selected,setSelected]=useState<string[]>([]);
  const [reviewKind,setReviewKind]=useState<"all"|"retry_mistakes"|"daily"|"due">("all");
  const [sourceReportId,setSourceReportId]=useState<string|undefined>();
  const [completedReportId,setCompletedReportId]=useState<string|undefined>();
  const [revealed,setRevealed]=useState(false);
  const [result,setResult]=useState<boolean|null>(null);
  const [started,setStarted]=useState(Date.now());
  const [results,setResults]=useState<Result[]>([]);
  const [reportHistory,setReportHistory]=useState<QuizReport[]>([]);
  const [openReportId,setOpenReportId]=useState<string|null>(null);
  const [importText,setImportText]=useState("");
  const [showImport,setShowImport]=useState(false);
  const [showAdd,setShowAdd]=useState(false);
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<any>({subject:"",topic:"",prompt:"",answer:"",type:"short_answer" as Item["type"],options:"",numericTolerance:"0"});
  const [message,setMessage]=useState("");
  const [loaded,setLoaded]=useState(false);
  const [quizDefaults,setQuizDefaults]=useState(quizPreferences);
  const [librarySearch,setLibrarySearch]=useState(""),[libraryType,setLibraryType]=useState("all"),[librarySubject,setLibrarySubject]=useState("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const visibleItems=useMemo(()=>items.filter(x=>(libraryType==="all"||(x.type||"short_answer")===libraryType)&&(librarySubject==="all"||x.subject===librarySubject)&&[x.prompt,x.answer,x.subject,x.topic,...(x.tags||[])].join(" ").toLowerCase().includes(librarySearch.trim().toLowerCase())).filter(x=>(!libraryTag||(x.tags||[]).includes(libraryTag))&&(!duplicatesOnly||duplicateIds(items).has(x.id))).sort((a,b)=>librarySort==="prompt"?a.prompt.localeCompare(b.prompt):librarySort==="due"?(a.due||"").localeCompare(b.due||""):items.indexOf(b)-items.indexOf(a)),[items,librarySearch,libraryType,librarySubject,libraryTag,librarySort,duplicatesOnly]);
  const subjects=useMemo(()=>[...new Set(items.map(x=>x.subject))].sort(),[items]);
  const libraryFiltered=!!librarySearch.trim()||libraryType!=="all"||librarySubject!=="all"||!!libraryTag||duplicatesOnly;
  function clearLibraryFilters(){setLibrarySearch("");setLibraryType("all");setLibrarySubject("all");setLibraryTag("");setDuplicatesOnly(false);}

  useEffect(()=>{ 
    try{
      const x=localStorage.getItem("recallflow_bank_v2");
      const saved: Item[] = x?JSON.parse(x):starter;
      setItems(saved);
      setQuizCount(Number(localStorage.getItem("recallflow_quiz_count")||0));
      setStreakDays(JSON.parse(localStorage.getItem("recallflow_streak_days")||"[]"));
      setReportHistory(JSON.parse(localStorage.getItem("recallflow_reports")||"[]"));
      if(localStorage.getItem("recallflow_theme")==="dark") switchToDarkMode();
    }catch{setItems(starter)}finally{setLoaded(true)}
  },[]);
  useEffect(()=>{ if(loaded)try{localStorage.setItem("recallflow_bank_v2",JSON.stringify(items))}catch{setMessage("Storage is full. Export a backup and reduce image sizes before adding more questions.");} },[items,loaded]);

  const due=useMemo(()=>items.filter(x=>!x.due||x.due<=today()),[items]);
  const current=review?.[idx];
  useEffect(()=>{
    if(!review||idx>=review.length)return;
    if(result===null)window.scrollTo({top:0,behavior:'auto'});
    else if(window.matchMedia('(max-width:819px)').matches)document.querySelector('.split-feedback')?.scrollIntoView({block:'nearest',behavior:'auto'});
  },[idx,result,review]);
  const quizSize=quizDefaults.count?Math.min(quizDefaults.count,due.length):due.length;

  function startReview(){if(!items.length){setTab("library");setMessage("Add a question before starting a quiz.");return;}setShowQuizBuilder(true);window.scrollTo({top:0});}
  function beginReview(q:Item[],kind:"all"|"retry_mistakes"|"daily"|"due",source?:string){
    kokoroVoice.stop();setReview(q);setReviewKind(kind);setSourceReportId(source);setCompletedReportId(undefined);
    setIdx(0);setResults([]);setAnswer("");setSelected([]);setRevealed(false);setResult(null);setStarted(Date.now());setMessage("");
  }
  function retryMistakes(attempts:Result[],source?:string){
    const q=missedItems(attempts,items);
    if(!q.length){setMessage("No missed questions remain in your question bank.");return;}
    beginReview(q,"retry_mistakes",source);
  }
  function grade(forced?:boolean,givenAnswer:any=answer){
    if(!current||result!==null)return;
    const ok=forced ?? gradeQuestion(current,Array.isArray(givenAnswer)?givenAnswer:["multi_select","matching","ordering","cloze","fill_blank_options"].includes(current.type||"")?selected:givenAnswer);
    const category=forced!==undefined?(ok?"correct":"wrong"):["short_answer","fill_blank"].includes(current.type||"short_answer")?textGrade(current,givenAnswer):(ok?"correct":"wrong");
    const seconds=Math.max(1,Math.round((Date.now()-started)/1000));
    setResult(ok);setRevealed(true);
    setResults(r=>[...r,{grading:category,knowledge_id:current.id,subject:current.subject,topic:current.topic,type:current.type||"short_answer",prompt:current.prompt,correct_answer:current.answer,user_answer:current.type==="flashcard"?(ok?"self-marked: knew":"self-marked: did not know"):["multi_select","matching","ordering","cloze","fill_blank_options"].includes(current.type||"")?(Array.isArray(givenAnswer)?givenAnswer:selected).join("; "):givenAnswer,selected_answers:current.type==="multi_select"?selected:undefined,correct:ok,response_time_seconds:seconds}]);
    setItems(xs=>xs.map(x=>x.id===current.id?scheduled(x,ok):x));
  }
  function next(){
    if(!review)return;
    if(idx+1>=review.length){
      setQuizCount(c=>{const n=c+1;localStorage.setItem("recallflow_quiz_count",String(n));return n});
      setStreakDays(ds=>{const t=today();const n=ds.includes(t)?ds:[...ds,t];localStorage.setItem("recallflow_streak_days",JSON.stringify(n));return n});
      const report:QuizReport={id:`report_${Date.now()}`,mode:reviewKind,source_report_id:sourceReportId,date:new Date().toISOString(),duration_seconds:results.reduce((a,b)=>a+b.response_time_seconds,0),total:results.length,correct:results.filter(x=>x.correct).length,accuracy:results.length?Math.round(results.filter(x=>x.correct).length/results.length*100):0,questions:results};
      setCompletedReportId(report.id);
      setReportHistory(prev=>{const nextReports=[report,...prev];localStorage.setItem("recallflow_reports",JSON.stringify(nextReports));return nextReports});
      setIdx(review.length);return
    }
    setIdx(i=>i+1);setAnswer("");setSelected([]);setRevealed(false);setResult(null);setStarted(Date.now());
  }
  function doImport(){
    try{
      const parsed=JSON.parse(importText); const arr=Array.isArray(parsed)?parsed:(parsed.items||parsed.questions);
      if(!Array.isArray(arr))throw new Error();
      const clean:Item[]=arr.map((x:any,i:number)=>{const valid=validateQuestion({...x,prompt:x?.prompt||x?.question});return {...valid,id:`item_${Date.now()}_${i}`,subject:String(x.subject||"General"),topic:String(x.topic||"Imported")}});
      localStorage.setItem("recallflow_bank_v2",JSON.stringify([...items,...clean]));
      setItems(xs=>[...xs,...clean]);setShowImport(false);setImportText("");setMessage(`Imported ${clean.length} items`);
    }catch(error:any){setMessage(`That JSON could not be imported: ${error.message}`)}
  }
  function exportReport(){
    const report={id:completedReportId,mode:reviewKind,source_report_id:sourceReportId,date:new Date().toISOString(),duration_seconds:results.reduce((a,b)=>a+b.response_time_seconds,0),total:results.length,correct:results.filter(x=>x.correct).length,accuracy:results.length?Math.round(results.filter(x=>x.correct).length/results.length*100):0,questions:results};
    navigator.clipboard?.writeText(JSON.stringify(report,null,2));setMessage("Detailed report copied to clipboard.");
  }
  function copySavedReport(report:QuizReport){navigator.clipboard?.writeText(JSON.stringify(report,null,2));setMessage("Saved report copied to clipboard.")}
  function openAdd(item?:Item){
    setEditingId(item?.id||null);setDraft(item?{subject:item.subject,topic:item.topic,prompt:item.prompt,answer:item.type==="multi_select"?(item.correctAnswers||[]).join("\n"):item.answer,type:item.type||"short_answer",options:(item.options||[]).join("\n"),numericTolerance:String(item.numericTolerance??0),structured:item.type==="matching"?(item.pairs||[]).map(p=>p.left+" | "+p.right).join("\n"):item.type==="ordering"?(item.sequence||[]).join("\n"):(item.blanks||[]).join("\n"),accepted:(item.acceptedAnswers||[]).join("\n"),tags:(item.tags||[]).join(", "),fuzzy:item.fuzzy,image:item.image,optionImages:item.optionImages}:{subject:"",topic:"",prompt:"",answer:"",type:"short_answer",options:"",numericTolerance:"0"});setShowAdd(true);
  }
  function saveQuestion(){
    try{
      const data=validateQuestion({subject:draft.subject.trim()||"General",topic:draft.topic.trim()||"General",prompt:draft.prompt,answer:draft.answer,type:draft.type,options:["single_choice","multi_select","fill_blank_options"].includes(draft.type||"")?draft.options.split("\n").map(x=>x.trim()).filter(Boolean):undefined,correctAnswers:draft.type==="multi_select"?draft.answer.split("\n").map(x=>x.trim()).filter(Boolean):undefined,numericTolerance:draft.numericTolerance,acceptedAnswers:(draft.accepted||"").split("\n").map(x=>x.trim()).filter(Boolean),tags:(draft.tags||"").split(",").map(x=>x.trim()).filter(Boolean),fuzzy:draft.fuzzy!==false,image:draft.image,optionImages:draft.optionImages,pairs:draft.type==="matching"?(draft.structured||"").split("\n").filter(Boolean).map(line=>{const [left,right]=line.split("|");return {left:left?.trim(),right:right?.trim()};}):undefined,sequence:draft.type==="ordering"?(draft.structured||"").split("\n").map(x=>x.trim()).filter(Boolean):undefined,blanks:["cloze","fill_blank_options"].includes(draft.type)?(draft.structured||"").split("\n").map(x=>x.trim()).filter(Boolean):undefined});
      const candidate=editingId?items.map(x=>x.id===editingId?{...x,...data}:x):[...items,{id:`item_${Date.now()}`,...data}];localStorage.setItem("recallflow_bank_v2",JSON.stringify(candidate));
      setItems(candidate);
      setShowAdd(false);setMessage(editingId?"Question updated.":"Question added.");setEditingId(null);
    }catch(error:any){setMessage(error.message);}
  }
  function deleteQuestion(id:string){setItems(xs=>xs.filter(x=>x.id!==id));void kokoroVoice.deleteQuestion(id);setMessage("Question deleted.")}
  function toggleTheme(){
    if(mode==="dark"){switchToLightMode();localStorage.setItem("recallflow_theme","light")}
    else{switchToDarkMode();localStorage.setItem("recallflow_theme","dark")}
  }
  const last7=Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(6-i));return {key:d.toISOString().slice(0,10),label:d.toLocaleDateString(undefined,{weekday:"narrow"})}});
  let streak=0; for(let i=last7.length-1;i>=0;i--){if(streakDays.includes(last7[i].key))streak++;else if(i!==last7.length-1||streak>0)break}
  const history14=Array.from({length:14},(_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));const key=d.toISOString().slice(0,10);return {key,label:d.toLocaleDateString(undefined,{day:"numeric",month:"short"}),done:streakDays.includes(key),today:key===today()}});
  const sortedDays=[...new Set(streakDays)].sort();
  let longest=0,run=0,prev=""; sortedDays.forEach(k=>{if(!prev){run=1}else{const a=new Date(prev),b=new Date(k);run=(Math.round((b.getTime()-a.getTime())/86400000)===1)?run+1:1}longest=Math.max(longest,run);prev=k});

  if(review){
    if(idx>=review.length){
      const correct=results.filter(x=>x.correct).length;
      const accuracy=results.length?Math.round(correct/results.length*100):0;
      return <main className={styles.reviewPage}><section className={styles.finish}>
        <div className={styles.finishBadge}><Sparkles size={18}/> {reviewKind==="retry_mistakes"?"PRACTICE COMPLETE":"QUIZ COMPLETE"}</div>
        <div className={styles.scoreRing}><strong>{accuracy}%</strong><span>accuracy</span></div>
        <h1>{reviewKind==="retry_mistakes"?"Practice complete.":"Nice work."}</h1>
        <div className={styles.finishStats}><div><b>{correct}</b><span>Correct</span></div><div><b>{results.length-correct}</b><span>Missed</span></div><div><b>{results.length}</b><span>Total</span></div></div>
        {missedItems(results,items).length>0&&<Button onClick={()=>retryMistakes(results,completedReportId)}>Retry mistakes ({missedItems(results,items).length})</Button>}
        <Button onClick={exportReport}><Download size={17}/> Copy full report</Button>
        <Button variant="outline" onClick={()=>setReview(null)}>Back home</Button>
        {message&&<p className={styles.note}>{message}</p>}
      </section></main>
    }
    const choiceQuestion=current?.type==="single_choice"||current?.type==="true_false";
    const answerTitle=current?.type==="fill_blank_options"?"Choose from the word bank":current?.type==="matching"?"Match the pairs":current?.type==="ordering"?"Arrange in order":current?.type==="cloze"?"Complete the blanks":current?.type==="flashcard"?"How did you do?":current?.type==="multi_select"?"Choose your answers":choiceQuestion?"Choose an answer":"Your answer";
    return <main className={`${styles.reviewPage} quiz-screen split-quiz`}><section className="split-quiz-shell">
      <header className="split-quiz-header"><div className="split-quiz-brand"><BookOpen size={22}/><strong>Recall<span>Flow</span></strong></div><button className="split-quiz-exit" aria-label="Exit quiz" onClick={()=>setReview(null)}>×<span>Exit</span></button><div className="split-quiz-progress"><div className={styles.track} role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={review.length} aria-valuenow={idx+1}><span style={{width:`${((idx+1)/review.length)*100}%`}}/></div><small>{idx+1} of {review.length}{reviewKind==="retry_mistakes"?" · Retry":""}</small></div></header>
      <div className="quiz-workspace">
        <section className="quiz-question-card" aria-label="Question">
          <div className="split-question-meta"><p>{current?.subject} <span>·</span> {current?.topic}</p><span className="split-type-badge">{typeLabel(current?.type)}</span></div>
          {current?.image&&<img className="question-media" src={current.image} alt={current.imageAlt||"Question illustration"}/>}
          {current?.type==="flashcard"?<>
            <div className="flashcard-speech"><SpeechButton questionId={current.id} role={revealed?"answer":"question"} text={revealed?current.answer:current.prompt} label={revealed?"Read flashcard answer":"Read flashcard question"}/></div>
            <button className={`${styles.flipCard} ${revealed?styles.flipped:""}`} onClick={()=>result===null&&setRevealed(v=>!v)} aria-label={revealed?"Show question":"Reveal answer"}>
              <div className={styles.flipInner}><div className={styles.flipFront} aria-hidden={revealed}><span>QUESTION</span><strong>{current.prompt}</strong><small>Tap to reveal answer</small></div><div className={styles.flipBack} aria-hidden={!revealed}><span>ANSWER</span><strong>{current.answer}</strong><small>Tap to see question</small></div></div>
            </button>
          </>:<div className="question-with-speech"><h1>{current?.type==="fill_blank_options"?"Choose the missing words.":current?.type==="fill_blank"?"Fill in the missing word.":current?.type==="cloze"?"Fill in the missing words.":current?.prompt}</h1>{current&&<SpeechButton questionId={current.id} text={current.prompt} spokenText={current.type==="fill_blank"?current.prompt.replace(/_{2,}/g,"blank"):undefined}/>}</div>}
        </section>
        <section className="quiz-answer-card" aria-label="Answer area"><h2>{answerTitle}</h2>
          {current?.type==="fill_blank_options"?<WordBankAnswer key={current.id} item={current} value={selected} onChange={setSelected} disabled={revealed} onGrade={values=>{setSelected(values);grade(undefined,values);}}/>:["fill_blank","cloze"].includes(current?.type||"")?<InlineBlankAnswer key={current.id} item={current} value={current.type==="cloze"?selected:answer} onChange={current.type==="cloze"?setSelected:setAnswer} disabled={revealed} onGrade={values=>{if(Array.isArray(values))setSelected(values);else setAnswer(values);grade(undefined,values);}}/>:["matching","ordering"].includes(current?.type||"")?<StructuredAnswer item={current} value={selected} onChange={setSelected} disabled={revealed} onGrade={values=>{setSelected(values);grade(undefined,values);}}/>:current?.type==="flashcard"?<div className="split-flash-actions"><p className="split-answer-help">{revealed?"Mark whether you recalled the answer.":"Recall the answer, then reveal the card."}</p>{!revealed&&<Button onClick={()=>setRevealed(true)}>Reveal answer</Button>}{revealed&&result===null&&<div className={styles.two}><Button variant="outline" onClick={()=>grade(false)}>Didn't know</Button><Button onClick={()=>grade(true)}>Knew it</Button></div>}</div>:current?.type==="multi_select"?<div className={styles.options}><p className="split-answer-help">Select all correct answers.</p>{(current.options||[]).map((o,i)=><label key={o} className="split-choice" data-state={revealed?((current.correctAnswers||current.answer.split('; ')).includes(o)?"correct":selected.includes(o)?"incorrect":"idle"):selected.includes(o)?"selected":"idle"}><input type="checkbox" aria-label={o} checked={selected.includes(o)} disabled={revealed} onChange={e=>setSelected(xs=>e.target.checked?[...xs,o]:xs.filter(x=>x!==o))}/><span className="split-choice-letter">{String.fromCharCode(65+i)}</span><span className="split-choice-text">{current?.optionImages?.[o]&&<img className="choice-media" src={current.optionImages[o]} alt={o}/>} {o}</span><span className="split-choice-indicator" aria-hidden="true"/></label>)}{!revealed&&<Button className="split-submit" disabled={!selected.length} onClick={()=>grade()}>Check selections</Button>}</div>:choiceQuestion?<div className={styles.options}><fieldset className="split-choice-group" aria-label="Choose an answer">{(current?.type==="true_false"?["True","False"]:current?.options||[]).map((o,i)=><label key={o} className="split-choice" data-state={revealed?(gradeQuestion(current,o)?"correct":answer===o?"incorrect":"idle"):answer===o?"selected":"idle"}><input type="radio" name={`quiz-answer-${current.id}`} aria-label={o} checked={answer===o} disabled={revealed} onChange={()=>setAnswer(o)}/><span className="split-choice-letter">{String.fromCharCode(65+i)}</span><span className="split-choice-text">{current?.optionImages?.[o]&&<img className="choice-media" src={current.optionImages[o]} alt={o}/>} {o}</span><span className="split-choice-indicator" aria-hidden="true"/></label>)}</fieldset>{!revealed&&<Button className="split-submit" disabled={!answer} onClick={()=>grade()}>Check answer</Button>}</div>:<div className={styles.answerArea}><p className="split-answer-help">{current?.type==="numeric"?"Enter a number.":"Write what you remember."}</p><Input aria-label={current?.type==="numeric"?"Numeric answer":"Your answer"} inputMode={current?.type==="numeric"?"decimal":undefined} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder={current?.type==="numeric"?"Enter a number…":"Type your answer…"} disabled={revealed} onKeyDown={e=>{if(e.key==="Enter"&&answer&&!revealed)grade()}}/>{!revealed&&<Button className="split-submit" disabled={!answer} onClick={()=>grade()}>Check answer</Button>}</div>}
          {result!==null&&<div className={`${result?styles.feedbackGood:styles.feedbackBad} split-feedback`} role="status"><div className={styles.feedbackIcon}>{result?<CheckCircle2/>:<XCircle/>}</div><div className={styles.feedbackCopy}><strong>{result?(results[results.length-1]?.grading==="typo"?"Accepted — likely typo":"Correct!"):"Not quite"}</strong>{!result&&<span>Correct answer: {current?.answer}</span>}{current&&<SpeechButton questionId={current.id} role="answer" text={current.answer} label="Read correct answer"/>}</div><Button onClick={next}>{idx+1===review.length?"See results":"Next question"} <ArrowRight size={17}/></Button></div>}
        </section>
      </div><SpeechEvidence/>
    </section></main>
  }

  return <div className={styles.shell}><main className={styles.main}>
    <header><div><img className={styles.brandLogo} src="./public/recallflow-logo.png" alt="RecallFlow logo"/><strong>RecallFlow</strong></div><div className={styles.headerRight}><span className={styles.mini}>{items.length} questions</span><Button variant="ghost" size="icon-md" aria-label="Change theme" onClick={toggleTheme}>{mode==="dark"?<Sun size={18}/>:<Moon size={18}/>}</Button></div></header>
    {showQuizBuilder&&<QuizBuilder items={items} reports={reportHistory} defaults={quizDefaults} onClose={()=>setShowQuizBuilder(false)} onStart={(q,kind)=>{setShowQuizBuilder(false);beginReview(q,kind);}}/>}
    {tab==="home"&&<><section className={styles.intro}><p>Good to see you.</p><h1>Ready for a quick quiz?</h1></section>
      <section className={styles.hero}><div className={styles.heroCopy}><div className={styles.heroLabel}><Sparkles size={14}/> TODAY'S QUIZ</div><strong>{quizSize}</strong><p>{quizSize===1?"question":"questions"} due today</p></div><Button onClick={startReview} disabled={!items.length}>Take quiz <ArrowRight size={18}/></Button></section>
      <section className={styles.streakCard}>
        <button className={styles.streakOpen} onClick={()=>setTab("streak")}>
          <div className={styles.streakTop}><div><span className={styles.streakLabel}><Flame size={16}/> CURRENT STREAK</span><strong>{streak}<small> days</small></strong></div><div className={styles.streakStars}><Star size={18} fill="currentColor"/><span>{streak*10}</span></div></div>
          <div className={styles.week}>{last7.map(d=><div key={d.key}><span>{d.label}</span><div className={streakDays.includes(d.key)?styles.dayDone:(d.key===today()?styles.dayToday:styles.dayMissed)}>{streakDays.includes(d.key)?<Star size={16} fill="currentColor"/>:d.key===today()?<Flame size={15}/>:<XCircle size={14}/>}</div></div>)}</div>
          <span className={styles.streakHint}>View streak details <ArrowRight size={13}/></span>
        </button>
      </section>
      <div className={styles.homeStats}><div><CheckCircle2 size={20}/><strong>{quizCount}</strong><span>Quizzes taken</span></div><div><BookOpen size={20}/><strong>{items.length}</strong><span>Questions</span></div></div>
      <section className={styles.homeAction}><p>Keep the habit going</p><h2>A few minutes a day is enough.</h2><Button onClick={startReview} disabled={!items.length}>Take quiz <ArrowRight size={18}/></Button></section></>}
    {tab==="library"&&<section className="question-library"><div className={styles.pageTitle}><div><p className={styles.eyebrow}>YOUR QUESTIONS</p><h1>Question bank</h1><p className="library-intro">Build your knowledge, one question at a time.</p></div></div><div className={styles.addActions}><Button onClick={()=>openAdd()}><Plus size={17}/> Add question</Button><Button variant="outline" onClick={()=>setShowImport(!showImport)}><Upload size={17}/> Import</Button></div>
      {showAdd&&<div className={styles.questionForm}><div className={styles.formHead}><div><p className={styles.eyebrow}>{editingId?"EDIT":"NEW QUESTION"}</p><h2>{editingId?"Edit question":"Add manually"}</h2></div><button aria-label="Close question editor" onClick={()=>setShowAdd(false)}>×</button></div><label>Question type<select value={draft.type} onChange={e=>setDraft(d=>({...d,type:e.target.value as Item["type"]}))}>{questionTypes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Question<Textarea value={draft.prompt} onChange={e=>setDraft(d=>({...d,prompt:e.target.value}))} placeholder="What is the capital of France?"/></label>{["matching","ordering","cloze","fill_blank_options"].includes(draft.type)?null:draft.type==="multi_select"?<label>Correct answers <small>One correct choice per line</small><Textarea value={draft.answer} onChange={e=>setDraft(d=>({...d,answer:e.target.value}))}/></label>:<label>Correct answer{draft.type==="true_false"?<select value={draft.answer} onChange={e=>setDraft(d=>({...d,answer:e.target.value}))}><option value="">Choose an answer</option><option>True</option><option>False</option></select>:<Input value={draft.answer} onChange={e=>setDraft(d=>({...d,answer:e.target.value}))} placeholder={draft.type==="numeric"?"e.g. 3.14":"Paris"}/>}</label>}{["single_choice","multi_select","fill_blank_options"].includes(draft.type||"")&&<label>Choices <small>One per line — include every correct answer</small><Textarea value={draft.options} onChange={e=>setDraft(d=>({...d,options:e.target.value}))}/></label>}{draft.type==="numeric"&&<label>Accepted tolerance (±)<Input inputMode="decimal" value={draft.numericTolerance} onChange={e=>setDraft(d=>({...d,numericTolerance:e.target.value}))}/><small className="question-help">Use 0 for an exact number. Example: 3.14 ± 0.01.</small></label>}<div className={styles.twoFields}><label>Subject<Input value={draft.subject} onChange={e=>setDraft(d=>({...d,subject:e.target.value}))} placeholder="Geography"/></label><label>Topic<Input value={draft.topic} onChange={e=>setDraft(d=>({...d,topic:e.target.value}))} placeholder="Capitals"/></label></div><ExtendedEditor draft={draft} setDraft={setDraft}/><Button onClick={saveQuestion}>{editingId?"Save changes":"Add question"}</Button></div>}
      {showImport&&<div className={styles.importBox}><p className={styles.eyebrow}>IMPORT MANY</p><h2>Paste question JSON</h2><Textarea value={importText} onChange={e=>setImportText(e.target.value)} placeholder='[{"subject":"Geography","topic":"Capitals","prompt":"Capital of France?","answer":"Paris"}]'/><Button onClick={doImport}>Import questions</Button></div>}
      {message&&<p className={styles.note}>{message}</p>}
      <div className="library-toolbar"><div className="library-search"><Search size={17}/><Input aria-label="Search questions" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Search questions, answers or topics"/>{librarySearch&&<button aria-label="Clear search" onClick={()=>setLibrarySearch("")}>×</button>}</div><div className="library-filters"><label>Question type<select value={libraryType} onChange={e=>setLibraryType(e.target.value)}><option value="all">All types</option>{questionTypes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Subject<select value={librarySubject} onChange={e=>setLibrarySubject(e.target.value)}><option value="all">All subjects</option>{subjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select></label></div></div><div className="learning-grid"><label>Tag<select value={libraryTag} onChange={e=>setLibraryTag(e.target.value)}><option value="">All tags</option>{[...new Set(items.flatMap(x=>x.tags||[]))].map(tag=><option key={tag}>{tag}</option>)}</select></label><label>Sort<select value={librarySort} onChange={e=>setLibrarySort(e.target.value)}><option value="recent">Newest first</option><option value="prompt">Question A–Z</option><option value="due">Due date</option></select></label><label className="learning-check"><input type="checkbox" checked={duplicatesOnly} onChange={e=>setDuplicatesOnly(e.target.checked)}/>Duplicates only ({duplicateIds(items).size})</label></div><div className="library-results"><span role="status" aria-live="polite">{libraryFiltered?`${visibleItems.length} of ${items.length}`:items.length} {visibleItems.length===1&&!libraryFiltered?"question":"questions"}</span>{libraryFiltered&&<button onClick={clearLibraryFilters}>Reset filters</button>}</div>{!visibleItems.length&&<div className="library-empty"><Search size={28}/><h2>{items.length?"No questions found":"Your bank starts here"}</h2><p>{items.length?"Try another search or loosen your filters.":"Add your first question or import a collection."}</p>{libraryFiltered&&<Button variant="outline" onClick={clearLibraryFilters}>Clear filters</Button>}</div>}<div className={styles.cards}>{visibleItems.map(x=><article key={x.id}><div className={styles.cardTop}><div><span>{x.subject}</span><small>{x.topic}</small></div><div className={styles.cardTools}><button aria-label="Edit question" onClick={()=>openAdd(x)}><Pencil size={15}/></button><button aria-label="Delete question" onClick={()=>setDeleteId(x.id)}><Trash2 size={15}/></button></div></div><h3>{x.prompt}</h3>{x.image&&<img className="question-media" src={x.image} alt="Question illustration"/>}<small>{(x.tags||[]).join(" · ")}{duplicateIds(items).has(x.id)?" · Possible duplicate":""}</small><div className="library-card-footer"><em>{typeLabel(x.type)}</em><details><summary>View answer <ChevronDown size={13}/></summary><p>{x.answer}</p></details></div>{deleteId===x.id&&<div className="library-delete-confirm" role="group" aria-label="Confirm question deletion"><p>Delete this question? This cannot be undone.</p><div><Button variant="destructive" onClick={()=>{deleteQuestion(x.id);setDeleteId(null);}}>Delete question</Button><Button variant="outline" onClick={()=>setDeleteId(null)}>Cancel</Button></div></div>}</article>)}</div></section>}
    {tab==="results"&&<section className={styles.reportsPage}><div className={styles.pageTitle}><div><p className={styles.eyebrow}>YOUR QUIZ RECORDS</p><h1>Reports</h1></div></div>
      <AnalyticsPanel reports={reportHistory}/>{reportHistory.length>0?<><div className={styles.reportOverview}><div><strong>{reportHistory.length}</strong><span>Quizzes</span></div><div><strong>{Math.round(reportHistory.reduce((a,r)=>a+r.accuracy,0)/reportHistory.length)}%</strong><span>Avg. accuracy</span></div><div><strong>{reportHistory.reduce((a,r)=>a+r.questions.filter(q=>!q.correct).length,0)}</strong><span>Total misses</span></div></div>
      <div className={styles.reportList}>{reportHistory.map((r,i)=><article className={styles.reportCard} key={r.id}>
        <button className={styles.reportHead} onClick={()=>setOpenReportId(openReportId===r.id?null:r.id)}>
          <div className={styles.reportDate}><span>{r.mode==="retry_mistakes"?"RETRY":i===0?"LATEST":"QUIZ"}</span><strong>{new Date(r.date).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}</strong><small>{new Date(r.date).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</small></div>
          <div className={styles.reportScore}><strong>{r.accuracy}%</strong><span>{r.correct}/{r.total}</span></div>
        </button>
        {openReportId===r.id&&<div className={styles.reportDetails}>
          <div className={styles.reportMiniStats}><div><b>{r.correct}</b><span>Correct</span></div><div><b>{r.total-r.correct}</b><span>Missed</span></div><div><b>{Math.round(r.duration_seconds/60)}m</b><span>Time</span></div></div>
          <div className={styles.reportQuestions}>{r.questions.map((q,qi)=><div className={q.correct?styles.reportQuestionGood:styles.reportQuestionBad} key={qi}><span>{q.correct?<CheckCircle2 size={16}/>:<XCircle size={16}/>}</span><div><b>{q.prompt}</b><small>Your answer: {q.user_answer || "No answer"}</small>{!q.correct&&<small>Correct: {q.correct_answer}</small>}</div><em>{q.response_time_seconds}s</em></div>)}</div>
          {missedItems(r.questions,items).length>0&&<Button onClick={()=>retryMistakes(r.questions,r.id)}>Retry mistakes ({missedItems(r.questions,items).length})</Button>}
          <Button variant="outline" onClick={()=>copySavedReport(r)}><Download size={16}/> Copy full report</Button>
        </div>}
      </article>)}</div></>:<div className={styles.emptyReports}><History size={34}/><h2>No reports yet</h2><p>Finish your first quiz and its full report will appear here automatically.</p><Button onClick={startReview} disabled={!items.length}><Play size={16} fill="currentColor"/> Take a quiz</Button></div>}
      {message&&<p className={styles.note}>{message}</p>}
    </section>}
    {tab==="settings"&&<section className="settings-page"><div className={styles.pageTitle}><div><p className={styles.eyebrow}>RECALLFLOW</p><h1>Settings</h1><p className="settings-intro">Your voice. Your pace. Your space.</p></div></div><div className="settings-appearance"><button onClick={toggleTheme}><span>{mode==="dark"?<Sun size={19}/>:<Moon size={19}/>} Theme</span><b>{mode==="dark"?"Dark":"Light"}</b></button></div><KokoroPanel/><QuizSettings onSaved={setQuizDefaults}/><StorageSettings questions={items} reports={reportHistory} quizCount={quizCount} streakDays={streakDays} theme={mode}/><BackupRestore/><OfflineSettings/><p className={styles.note}>Settings and data are local to this browser.</p></section>}
    {tab==="streak"&&<section className={styles.streakPage}><button className={styles.backButton} onClick={()=>setTab("home")}>← Home</button><div className={styles.streakPageHero}><Flame size={34}/><p className={styles.eyebrow}>YOUR STREAK</p><h1>{streak} <small>day streak</small></h1><p>Complete a quiz each day to keep it going.</p></div><div className={styles.streakSummary}><div><strong>{streak}</strong><span>Current</span></div><div><strong>{longest}</strong><span>Longest</span></div><div><strong>{streakDays.length}</strong><span>Active days</span></div></div><div className={styles.streakHistoryCard}><div className={styles.historyTitle}><strong>Recent activity</strong><span><i className={styles.dotDone}/>Done <i className={styles.dotMissed}/>Missed <i className={styles.dotToday}/>Today</span></div><div className={styles.historyGrid}>{history14.map(d=><div key={d.key} className={d.done?styles.historyDone:d.today?styles.historyToday:styles.historyMissed}><span>{d.label}</span>{d.done?<Star size={15} fill="currentColor"/>:d.today?<Flame size={15}/>:<XCircle size={14}/>}</div>)}</div></div></section>}
  </main>
  <nav className={styles.nav}><button className={tab==="home"?styles.active:""} onClick={()=>setTab("home")}><Home/><span>Home</span></button><button className={tab==="library"?styles.active:""} onClick={()=>setTab("library")}><Library/><span>Questions</span></button><button className={styles.quizNav} onClick={startReview}><Play className={styles.plus} fill="currentColor"/><span>Quiz</span></button><button className={tab==="results"?styles.active:""} onClick={()=>setTab("results")}><History/><span>Report</span></button><button className={tab==="settings"?styles.active:""} onClick={()=>setTab("settings")}><Settings/><span>Settings</span></button></nav>
  </div>
}
