import React, { useEffect, useMemo, useState, useRef } from "react";
import { BookOpen, Download, Upload, ArrowRight, Home, Library, History, ChartNoAxesColumnIncreasing, Check, CheckCircle2, XCircle, Flame, Sparkles, Moon, Sun, Star, Play, Settings, Plus, Pencil, Trash2, Volume2, Search, ChevronDown, MoreHorizontal, X, FileUp, FileDown, CopyCheck, Layers, SlidersHorizontal, Copy, LayoutDashboard, CalendarDays, Lightbulb, CircleDot, ListChecks, Hash, ArrowLeftRight, ListOrdered, Puzzle, ToggleLeft, PenLine, TextCursorInput, GalleryVerticalEnd, Brackets, CalendarClock, Image as ImageIcon, Shuffle, ArrowUpDown, RotateCcw } from "lucide-react";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Textarea } from "../components/Textarea";
import { useThemeMode } from "../helpers/themeMode";
import styles from "./_index.module.css";
import {SpeechButton} from "../KokoroPanel";
import {SettingsPage} from "../SettingsPage";
import {TransferPage} from "../TransferPage";
import {appPreferences, applyAppPreferences} from "../../app-preferences.js";
import {resolveVariant, seededShuffle, itemTypes, draftFromSpec, specFromDraft, isPictureLabel} from "../../question-variants.js";
import {audioCache} from "../../audio-cache.js";
import {quizPreferences, prepareQuiz} from "../../quiz-preferences.js";
import {kokoroVoice} from "../../kokoro-service.js";
import {speechEngine} from "../../voice-preferences.js";
import {questionTypes, typeLabel, validateQuestion, gradeQuestion, missedItems} from "../../question-types.js";

import {WordBankAnswer,InlineBlankAnswer} from '../QuestionInteractions';
import {QuizBuilder,StructuredAnswer} from '../LearningFeatures';
import {scheduled,textGrade,duplicateIds,filterQuiz,analytics} from '../../learning-core.js';
import {streakStats} from '../../streak-stats.js';
import {QuestionEditor} from '../QuestionEditor';
import {DiscardChangesDialog} from "../DiscardChangesDialog";
import {Brand} from "../BrandIcon";
import {ZoomableImage,openZoom} from "../ImageViewer";
import {StreakPage} from '../StreakPage';
type Item = { [key:string]:any;
  id: string; subject: string; topic: string; prompt: string; answer: string;
  type?: "short_answer" | "fill_blank" | "single_choice" | "flashcard" | "true_false" | "multi_select" | "numeric" | "matching" | "ordering" | "cloze" | "fill_blank_options";
  options?: string[]; correctAnswers?:string[]; numericTolerance?:number; alt?: string; due?: string; interval?: number;
};
const typeIcons:Record<string,any>={short_answer:PenLine,fill_blank:TextCursorInput,single_choice:CircleDot,flashcard:GalleryVerticalEnd,true_false:ToggleLeft,multi_select:ListChecks,numeric:Hash,matching:ArrowLeftRight,ordering:ListOrdered,cloze:Brackets,fill_blank_options:Puzzle};
function dueBadge(item:Item){if(!item.due)return {state:"new",label:"New"};if(item.due<=today())return {state:"due",label:"Due"};const days=Math.max(1,Math.round((Date.parse(item.due)-Date.parse(today()))/864e5));return {state:"later",label:days<30?`In ${days}d`:`In ${Math.round(days/30)}mo`};}
function questionCardDetail(item:Item){if(item.type==="single_choice")return `${item.options?.length||0} choices`;if(item.type==="matching")return `${item.pairs?.length||0} pairs`;if(item.type==="ordering")return `${item.sequence?.length||0} steps`;if(["cloze","fill_blank_options"].includes(item.type||""))return `${item.blanks?.length||0} blanks`;if(item.type==="multi_select")return `${item.options?.length||0} options`;return "";}
function prepareForQuiz(q:Item[],types:string[]=[]){const prefs=appPreferences(),seed=String(Date.now());return q.map(item=>{const shaped:Item={...resolveVariant(item,types),shuffleSeed:seed};if(prefs.shuffleChoices&&["single_choice","multi_select","fill_blank_options"].includes(shaped.type||"")&&shaped.options)shaped.options=seededShuffle(shaped.options,shaped.id+seed);return shaped;});}
type Result = { grading?:string; knowledge_id:string; subject:string; topic:string; type:string; prompt:string; correct_answer:string; user_answer:string; correct:boolean; response_time_seconds:number; selected_answers?:string[] };
type QuizReport = { id:string; date:string; duration_seconds:number; total:number; correct:number; accuracy:number; questions:Result[]; mode?:"all"|"retry_mistakes"|"daily"|"due"; source_report_id?:string };
function ReportHistoryCard({report:r,index:i,openId,setOpenId,items,retry,copy}:{report:QuizReport;index:number;openId:string|null;setOpenId:(id:string|null)=>void;items:Item[];retry:(attempts:Result[],source?:string)=>void;copy:(report:QuizReport)=>void}){return <article className={styles.reportCard}>
  <button className={styles.reportHead} onClick={()=>setOpenId(openId===r.id?null:r.id)} aria-expanded={openId===r.id}>
    <div className={styles.reportDate}><span>{r.mode==="retry_mistakes"?"RETRY":i===0?"LATEST":"QUIZ"}</span><strong>{new Date(r.date).toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}</strong><small>{new Date(r.date).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</small></div>
    <div className={styles.reportScore}><strong>{r.accuracy}%</strong><span>{r.correct}/{r.total}</span></div>
  </button>
  {openId===r.id&&<div className={styles.reportDetails}><div className={styles.reportMiniStats}><div><b>{r.correct}</b><span>Correct</span></div><div><b>{r.total-r.correct}</b><span>Missed</span></div><div><b>{Math.round(r.duration_seconds/60)}m</b><span>Time</span></div></div>
    <div className={styles.reportQuestions}>{r.questions.map((q,qi)=><div className={q.correct?styles.reportQuestionGood:styles.reportQuestionBad} key={qi}><span>{q.correct?<CheckCircle2 size={16}/>:<XCircle size={16}/>}</span><div><b>{q.prompt}</b><small>Your answer: {q.user_answer||"No answer"}</small>{!q.correct&&<small>Correct: {q.correct_answer}</small>}</div><em>{q.response_time_seconds}s</em></div>)}</div>
    {missedItems(r.questions,items).length>0&&<Button onClick={()=>retry(r.questions,r.id)}>Retry mistakes ({missedItems(r.questions,items).length})</Button>}<Button variant="outline" onClick={()=>copy(r)}><Copy size={16}/> Copy full report</Button>
  </div>}
</article>}

const starter: Item[] = [
  {id:"demo_short",subject:"Demo",topic:"Type Answer",prompt:"What is the capital of Japan?",answer:"Tokyo",type:"short_answer"},
  {id:"demo_fill",subject:"Demo",topic:"Fill in the Blank",prompt:"World War II ended in _____.",answer:"1945",type:"fill_blank"},
  {id:"demo_choice",subject:"Demo",topic:"Multiple Choice",prompt:"Which planet is the largest in our Solar System?",answer:"Jupiter",type:"single_choice",options:["Mars","Jupiter","Saturn","Earth"]},
  {id:"demo_flash",subject:"Demo",topic:"Flashcard",prompt:"Which organelle is often called the powerhouse of the cell?",answer:"Mitochondrion",type:"flashcard"},
];

function editorRoute(){
  const path=location.hash.slice(2);
  if(path==='questions/new')return {id:null};
  if(path.startsWith('questions/edit/')){try{return {id:decodeURIComponent(path.slice(15))};}catch{return null;}}
  return null;
}
const today=()=>new Date().toISOString().slice(0,10);

export default function IndexPage(){
  const { mode, switchToDarkMode, switchToLightMode, switchToAutoMode } = useThemeMode();
  const isDark=mode==="dark"||(mode==="auto"&&document.body.classList.contains("dark"));
  const [themeChoice,setThemeChoice]=useState<string>(()=>{try{return localStorage.getItem("recallflow_theme")||"light";}catch{return "light";}});
  const [prefs,setPrefs]=useState(appPreferences);
  useEffect(()=>{applyAppPreferences(prefs);const sync=(e:any)=>setPrefs(e.detail);window.addEventListener("recallflow:preferences",sync);return()=>window.removeEventListener("recallflow:preferences",sync);},[]);
  const [transferTab,setTransferTab]=useState<"import"|"export">("import"),[transferSelection,setTransferSelection]=useState<string[]>([]);
  const [confirmLeaveQuiz,setConfirmLeaveQuiz]=useState(false);
  const [showQuizBuilder,setShowQuizBuilder]=useState(location.hash==="#/quiz-settings");
  const [libraryTag,setLibraryTag]=useState(""),[librarySort,setLibrarySort]=useState("recent"),[duplicatesOnly,setDuplicatesOnly]=useState(false);
  const [items,setItems]=useState<Item[]>(()=>{try{const x=localStorage.getItem("recallflow_bank_v2");return x?JSON.parse(x):starter;}catch{return starter;}});
  const [quizCount,setQuizCount]=useState(()=>{try{return Number(localStorage.getItem("recallflow_quiz_count")||0)||0;}catch{return 0;}});
  const [streakDays,setStreakDays]=useState<string[]>(()=>{try{return JSON.parse(localStorage.getItem("recallflow_streak_days")||"[]");}catch{return [];}});
  const [tab,setTab]=useState<"home"|"library"|"results"|"settings"|"streak"|"transfer">((({questions:"library",reports:"results",settings:"settings",streak:"streak",transfer:"transfer"} as any)[location.hash.slice(2)]||"home"));
  const [review,setReview]=useState<Item[]|null>(null);
  const [countdown,setCountdown]=useState<number|null>(null);
  const [caughtUp,setCaughtUp]=useState(false);
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
  const [reportHistory,setReportHistory]=useState<QuizReport[]>(()=>{try{return JSON.parse(localStorage.getItem("recallflow_reports")||"[]");}catch{return [];}});
  const [openReportId,setOpenReportId]=useState<string|null>(null);
  const [reportView,setReportView]=useState<"overview"|"history"|"progress"|"mistakes"|"activity"|"insights">("overview");
  const [importText,setImportText]=useState("");
  const [showImport,setShowImport]=useState(false);
  const [showQuestionTools,setShowQuestionTools]=useState(false);
  const [showQuestionExport,setShowQuestionExport]=useState(false);
  const [selectionMode,setSelectionMode]=useState(false),[selectedQuestionIds,setSelectedQuestionIds]=useState<string[]>([]),[bulkDelete,setBulkDelete]=useState(false);
  const [bulkEdit,setBulkEdit]=useState<""|"move"|"tag">(""),[bulkSubject,setBulkSubject]=useState(""),[bulkTopic,setBulkTopic]=useState(""),[bulkTags,setBulkTags]=useState("");
  function exitSelection(){setSelectionMode(false);setSelectedQuestionIds([]);setBulkDelete(false);setBulkEdit("");}
  function openBulk(which:""|"move"|"tag"){setBulkDelete(false);setBulkEdit(e=>e===which?"":which);setBulkSubject("");setBulkTopic("");setBulkTags("");}
  function moveSelected(){const ids=new Set(selectedQuestionIds),subject=bulkSubject.trim(),topic=bulkTopic.trim();if(!subject&&!topic)return;setItems(xs=>xs.map(x=>ids.has(x.id)?{...x,...(subject?{subject}:{}),...(topic?{topic}:{})}:x));setMessage(`${ids.size} ${ids.size===1?"question":"questions"} moved.`);setBulkEdit("");}
  function tagSelected(){const ids=new Set(selectedQuestionIds),add=bulkTags.split(",").map(t=>t.trim()).filter(Boolean);if(!add.length)return;setItems(xs=>xs.map(x=>ids.has(x.id)?{...x,tags:[...new Set([...(x.tags||[]),...add])]}:x));setMessage(`Tags added to ${ids.size} ${ids.size===1?"question":"questions"}.`);setBulkEdit("");}
  function toggleSelected(id:string){setBulkDelete(false);setSelectedQuestionIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id]);}
  const [showAdvancedFilters,setShowAdvancedFilters]=useState(false),[withImagesOnly,setWithImagesOnly]=useState(false),[dueOnly,setDueOnly]=useState(false),[performanceFilter,setPerformanceFilter]=useState<"all"|"weak"|"mistakes">("all"),[multiTypeOnly,setMultiTypeOnly]=useState(false);
  const [showAdd,setShowAdd]=useState(!!editorRoute());
  const [editingId,setEditingId]=useState<string|null>(editorRoute()?.id||null);
  const [draft,setDraft]=useState<any>({subject:"",topic:"",prompt:"",answer:"",type:"short_answer" as Item["type"],options:"",numericTolerance:"0"});
  const [message,setMessage]=useState("");
  const [savingQuestion,setSavingQuestion]=useState(false),[saveStatus,setSaveStatus]=useState(""),[savedQuestion,setSavedQuestion]=useState<Item|null>(null),[prepareAudio,setPrepareAudio]=useState(true);
  const [draftBaseline,setDraftBaseline]=useState(()=>JSON.stringify({subject:"",topic:"",prompt:"",answer:"",type:"short_answer",options:"",numericTolerance:"0"}));
  const [pendingLeave,setPendingLeave]=useState<{action:()=>void}|null>(null);
  const navIndex=useRef(Number(history.state?.recallflowIndex)||0),activeHash=useRef(location.hash||'#/home'),restoringHistory=useRef(false),allowHistoryLeave=useRef(false);
  const unsaved=showAdd&&!savedQuestion&&JSON.stringify(draft)!==draftBaseline;
  function requestLeave(action:()=>void){if(savingQuestion)return;if(unsaved)setPendingLeave({action});else action();}
  function goHome(){kokoroVoice.stop();setShowAdd(false);setSavedQuestion(null);setEditingId(null);setShowQuizBuilder(false);setCaughtUp(false);setCountdown(null);setReview(null);setTab('home');setMessage('');window.scrollTo({top:0});}
  const [scrolled,setScrolled]=useState(false);
  useEffect(()=>{const check=()=>setScrolled(window.scrollY>4);check();window.addEventListener('scroll',check,{passive:true});return()=>window.removeEventListener('scroll',check);},[]);
  const homeRequest=useRef(()=>{});homeRequest.current=()=>{if(review&&countdown===null&&!showAdd)requestExitQuiz();else requestLeave(goHome);};
  useEffect(()=>{const home=()=>homeRequest.current();window.addEventListener('recallflow-home',home);return()=>window.removeEventListener('recallflow-home',home);},[]);
  useEffect(()=>{if(!showAdd)allowHistoryLeave.current=false;},[showAdd]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(unsaved||savingQuestion){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsaved,savingQuestion]);
  const [loaded,setLoaded]=useState(false);
  const [quizDefaults,setQuizDefaults]=useState(quizPreferences);
  const [librarySearch,setLibrarySearch]=useState(""),[libraryType,setLibraryType]=useState("all"),[librarySubject,setLibrarySubject]=useState("all");
  const [deleteId,setDeleteId]=useState<string|null>(null);
  const [cardMenuId,setCardMenuId]=useState<string|null>(null);
  const performance=useMemo(()=>{const stats=new Map<string,{attempts:number;wrong:number}>();for(const report of reportHistory)for(const result of report.questions||[]){const stat=stats.get(result.knowledge_id)||{attempts:0,wrong:0};stat.attempts++;if(!result.correct)stat.wrong++;stats.set(result.knowledge_id,stat);}return stats;},[reportHistory]);
  const visibleItems=useMemo(()=>items.filter(x=>(libraryType==="all"||itemTypes(x).includes(libraryType))&&(librarySubject==="all"||x.subject===librarySubject)&&[x.prompt,x.answer,x.subject,x.topic,...(x.tags||[])].join(" ").toLowerCase().includes(librarySearch.trim().toLowerCase())).filter(x=>(!libraryTag||(x.tags||[]).includes(libraryTag))&&(!duplicatesOnly||duplicateIds(items).has(x.id))&&(!withImagesOnly||!!x.image||!!x.answerImage||Object.values(x.optionImages||{}).some(Boolean))&&(!dueOnly||!x.due||x.due<=today())&&(!multiTypeOnly||!!x.variants?.length)&&(performanceFilter==="all"||(performanceFilter==="mistakes"?(performance.get(x.id)?.wrong||0)>0:!!performance.get(x.id)&&performance.get(x.id)!.wrong/performance.get(x.id)!.attempts>=.5))).sort((a,b)=>librarySort==="prompt"?(a.prompt||"Picture question").localeCompare(b.prompt||"Picture question"):librarySort==="due"?(a.due||"").localeCompare(b.due||""):items.indexOf(b)-items.indexOf(a)),[items,librarySearch,libraryType,librarySubject,libraryTag,librarySort,duplicatesOnly,withImagesOnly,dueOnly,performanceFilter,performance,multiTypeOnly]);
  const subjects=useMemo(()=>[...new Set(items.map(x=>x.subject))].sort(),[items]);
  const libraryFiltered=!!librarySearch.trim()||libraryType!=="all"||librarySubject!=="all"||!!libraryTag||duplicatesOnly||withImagesOnly||dueOnly||performanceFilter!=="all"||multiTypeOnly;
  const activeFilterCount=[libraryType!=="all",!!libraryTag,duplicatesOnly,withImagesOnly,dueOnly,performanceFilter!=="all",multiTypeOnly].filter(Boolean).length;
  const hasPictures=(x:Item)=>!!x.image||!!x.answerImage||Object.values(x.optionImages||{}).some(Boolean);
  const bankStats=useMemo(()=>({due:items.filter(x=>!x.due||x.due<=today()).length,mistakes:items.filter(x=>(performance.get(x.id)?.wrong||0)>0).length,pictures:items.filter(hasPictures).length,multi:items.filter(x=>!!x.variants?.length).length}),[items,performance]);
  const duplicateSet=useMemo(()=>duplicateIds(items),[items]);
  function clearLibraryFilters(){setLibrarySearch("");setLibraryType("all");setLibrarySubject("all");setLibraryTag("");setDuplicatesOnly(false);setWithImagesOnly(false);setDueOnly(false);setPerformanceFilter("all");setMultiTypeOnly(false);}

  useEffect(()=>{ 
    try{const saved=localStorage.getItem("recallflow_theme");if(saved==="dark")switchToDarkMode();else if(saved==="system")switchToAutoMode();}catch{}finally{setLoaded(true)}
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

  function startReview(){
    if(!items.length){setTab("library");setMessage("Add a question before starting a quiz.");return;}
    const q=filterQuiz(items,reportHistory,{mode:'daily',count:quizDefaults.count,subject:'',topic:'',types:[],shuffle:quizDefaults.shuffle,focus:'all'});
    if(!q.length){setCaughtUp(true);return;}
    beginReview(q,"daily");
  }
  function exitQuiz(){setConfirmLeaveQuiz(false);setCaughtUp(false);kokoroVoice.stop();kokoroVoice.cancelPrefetch();setCountdown(null);setReview(null);setTab("home");}
  function requestExitQuiz(){if(prefs.confirmExit&&review&&idx<review.length&&(idx>0||result!==null))setConfirmLeaveQuiz(true);else exitQuiz();}
  useEffect(()=>{
    if(!prefs.autoRead||!review||countdown!==null||idx>=review.length||result!==null)return;
    const item=review[idx];
    if(!item.prompt)return;const timer=window.setTimeout(()=>kokoroVoice.speak(item.prompt,{questionId:item.id,role:"question",owner:`${item.id}:question`,spokenText:item.type==="fill_blank"?item.prompt.replace(/_{2,}/g,"blank"):undefined}),350);
    return()=>window.clearTimeout(timer);
  },[review,idx,countdown,prefs.autoRead]);
  useEffect(()=>{
    if(!prefs.autoAdvance||result!==true||!review)return;
    const timer=window.setTimeout(()=>next(),1400);
    return()=>window.clearTimeout(timer);
  },[result,idx,prefs.autoAdvance]);
  useEffect(()=>{
    if(!review){kokoroVoice.cancelPrefetch();return;}
    const speech=(item?:Item)=>item?[{questionId:item.id,role:"question",text:item.prompt,spokenText:item.type==="fill_blank"?item.prompt.replace(/_{2,}/g,"blank"):undefined},{questionId:item.id,role:"answer",text:item.answer}].filter(x=>x.text):[];
    kokoroVoice.prefetch([...speech(review[idx]),...speech(review[idx+1])]);
  },[review,idx]);
  function beginReview(q:Item[],kind:"all"|"retry_mistakes"|"daily"|"due",source?:string,types:string[]=[]){
    if(!q.length)return;
    setCaughtUp(false);setShowQuizBuilder(false);setConfirmLeaveQuiz(false);setCountdown(appPreferences().countdown?3:null);window.scrollTo({top:0});
    kokoroVoice.stop();kokoroVoice.warm();setReview(prepareForQuiz(q,types));setReviewKind(kind);setSourceReportId(source);setCompletedReportId(undefined);
    setIdx(0);setResults([]);setAnswer("");setSelected([]);setRevealed(false);setResult(null);setStarted(Date.now());setMessage("");
  }
  useEffect(()=>{
    if(countdown===null)return;
    const timer=window.setTimeout(()=>{if(countdown<=1){setCountdown(null);setStarted(Date.now());}else setCountdown(countdown-1);},1000);
    return()=>window.clearTimeout(timer);
  },[countdown]);
  useEffect(()=>{
    const path=showAdd?(editingId?'questions/edit/'+encodeURIComponent(editingId):'questions/new'):showQuizBuilder?'quiz-settings':caughtUp?'quiz-ready':review?(idx>=review.length?'quiz/results':'quiz'):({home:'home',library:'questions',results:'reports',settings:'settings',streak:'streak',transfer:'transfer'} as const)[tab];
    const hash='#/'+path;if(location.hash!==hash){navIndex.current++;history.pushState({recallflowIndex:navIndex.current},'',hash);}else if(history.state?.recallflowIndex===undefined)history.replaceState({...history.state,recallflowIndex:navIndex.current},'',hash);activeHash.current=hash;
  },[tab,showAdd,editingId,showQuizBuilder,caughtUp,review,idx]);
  useEffect(()=>{
    function navigate(){
      if(location.hash===activeHash.current){restoringHistory.current=false;return;}
      if(restoringHistory.current)return;
      if((unsaved||savingQuestion)&&!allowHistoryLeave.current){
        const target=location.hash,targetIndex=history.state?.recallflowIndex,delta=typeof targetIndex==='number'?navIndex.current-targetIndex:0;
        if(delta){restoringHistory.current=true;history.go(delta);}else history.replaceState({recallflowIndex:navIndex.current},'',activeHash.current);
        if(!savingQuestion)setPendingLeave({action:()=>{allowHistoryLeave.current=true;if(delta)history.go(-delta);else{location.hash=target;}}});
        return;
      }
      activeHash.current=location.hash;navIndex.current=Number(history.state?.recallflowIndex)||0;
      const path=location.hash.slice(2);
      if(path==='quiz'||path==='quiz/results'){if(!review)history.replaceState(null,'','#/home');else return;}
      kokoroVoice.stop();setCaughtUp(false);setCountdown(null);setReview(null);setShowQuizBuilder(path==='quiz-settings');
      const editor=editorRoute();
      if(editor){if(editor.id){const item=items.find(x=>x.id===editor.id);if(item)openAdd(item);else{closeEditor();setMessage('That question could not be found.');}}else openAdd();return;}
      setShowAdd(false);setEditingId(null);
      setTab(({questions:'library',reports:'results',settings:'settings',streak:'streak',transfer:'transfer'} as any)[path]||'home');window.scrollTo({top:0});
    }
    window.addEventListener('popstate',navigate);window.addEventListener('hashchange',navigate);
    return()=>{window.removeEventListener('popstate',navigate);window.removeEventListener('hashchange',navigate);};
  },[review,items,unsaved,savingQuestion]);
  useEffect(()=>{if(loaded){const route=editorRoute();if(route?.id){const item=items.find(x=>x.id===route.id);if(item)openAdd(item);else{closeEditor();setMessage("That question could not be found.");}}}},[loaded]);
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
    setResults(r=>[...r,{grading:category,knowledge_id:current.id,subject:current.subject,topic:current.topic,type:current.type||"short_answer",prompt:current.prompt||"Picture question",correct_answer:current.answer||(current.answerImage?"(answer picture)":""),user_answer:current.type==="flashcard"?(ok?"self-marked: knew":"self-marked: did not know"):["multi_select","matching","ordering","cloze","fill_blank_options"].includes(current.type||"")?(Array.isArray(givenAnswer)?givenAnswer:selected).join("; "):givenAnswer,selected_answers:current.type==="multi_select"?selected:undefined,correct:ok,response_time_seconds:seconds}]);
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
  function importItems(clean:Item[]){
    const next=[...items,...clean];
    try{localStorage.setItem("recallflow_bank_v2",JSON.stringify(next));setItems(next);}
    catch{throw new Error("Storage is full. Remove large images and try again.");}
  }
  function openTransfer(which:"import"|"export"){setTransferSelection(selectionMode?selectedQuestionIds:[]);setTransferTab(which);setShowQuestionTools(false);setCardMenuId(null);setTab("transfer");window.scrollTo({top:0});}
  function chooseTheme(choice:string){
    setThemeChoice(choice);try{localStorage.setItem("recallflow_theme",choice);}catch{}
    if(choice==="dark")switchToDarkMode();else if(choice==="system")switchToAutoMode();else switchToLightMode();
  }
  function resetProgress(){
    const cleared=items.map(({due,interval,lastReviewed,attempts,lapses,...rest})=>rest as Item);
    setItems(cleared);setReportHistory([]);setStreakDays([]);setQuizCount(0);
    try{localStorage.setItem("recallflow_reports","[]");localStorage.setItem("recallflow_streak_days","[]");localStorage.setItem("recallflow_quiz_count","0");}catch{}
  }
  async function deleteEverything(){
    try{await kokoroVoice.clearCache();}catch{}
    try{for(const key of Object.keys(localStorage))if(key.startsWith("recallflow_"))localStorage.removeItem(key);localStorage.setItem("recallflow_bank_v2","[]");}catch{}
    location.hash="#/home";location.reload();
  }
  function exportReport(){
    const report={id:completedReportId,mode:reviewKind,source_report_id:sourceReportId,date:new Date().toISOString(),duration_seconds:results.reduce((a,b)=>a+b.response_time_seconds,0),total:results.length,correct:results.filter(x=>x.correct).length,accuracy:results.length?Math.round(results.filter(x=>x.correct).length/results.length*100):0,questions:results};
    navigator.clipboard?.writeText(JSON.stringify(report,null,2));setMessage("Detailed report copied to clipboard.");
  }
  function copySavedReport(report:QuizReport){navigator.clipboard?.writeText(JSON.stringify(report,null,2));setMessage("Saved report copied to clipboard.")}
  function closeEditor(){setSavedQuestion(null);setSaveStatus("");setShowAdd(false);setEditingId(null);setTab("library");setMessage("");window.scrollTo({top:0});}
  function openAdd(item?:Item){
    setSavedQuestion(null);setSaveStatus("");setMessage("");setTab("library");window.scrollTo({top:0});
    setEditingId(item?.id||null);const nextDraft=item?{...draftFromSpec(item),subject:item.subject,topic:item.topic,tags:(item.tags||[]).join(", "),image:item.image,answerImage:item.answerImage,variants:item.variants?.length?item.variants.map(draftFromSpec):undefined,typeMode:item.variants?.length?item.typeMode||"random":undefined}:{subject:"",topic:"",prompt:"",answer:"",type:"short_answer",options:"",numericTolerance:"0"};setDraft(nextDraft);setDraftBaseline(JSON.stringify(nextDraft));setShowAdd(true);
  }
  async function saveQuestion(){
    if(savingQuestion)return;
    try{
      const variants=(draft.variants||[]).map(specFromDraft);
      const data=validateQuestion({...specFromDraft(draft),subject:draft.subject.trim()||"General",topic:draft.topic.trim()||"General",tags:(draft.tags||"").split(",").map(x=>x.trim()).filter(Boolean),image:draft.image,answerImage:draft.answerImage,variants:variants.length?variants:undefined,typeMode:variants.length?draft.typeMode||"random":undefined});
      const id=editingId||`item_${Date.now()}`;
      const {variants:_oldVariants,typeMode:_oldMode,...previous}=items.find(x=>x.id===id)||{} as Item;
      const saved:Item={...previous,...data,id};
      for(const key of Object.keys(saved))if(saved[key]===undefined)delete saved[key];
      const candidate=editingId?items.map(x=>x.id===id?saved:x):[...items,saved];
      setSavingQuestion(true);setSaveStatus("Saving question…");
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
      localStorage.setItem("recallflow_bank_v2",JSON.stringify(candidate));setItems(candidate);
      let audioNote="";
      if(prepareAudio&&speechEngine()==="kokoro"){
        try{
          for(const [role,text] of [["question",saved.prompt],["answer",saved.answer]]){if(!text)continue;
            setSaveStatus(`Question saved · preparing ${role} voice…`);
            const clip=await kokoroVoice.prepare(text,{questionId:id,role,spokenText:role==="question"&&saved.type==="fill_blank"?saved.prompt.replace(/_{2,}/g,"blank"):undefined},stage=>setSaveStatus(`Question saved · ${stage}`));
            if(clip.cacheWarning)audioNote="Voice is ready, but your browser could not keep its audio cache.";
          }
          audioNote=audioNote||"Question and answer audio are ready.";
        }catch{audioNote="Your question is saved. Voice could not be prepared; use the speaker button to try again.";}
      }
      setSaveStatus(`Saved successfully. ${audioNote}`.trim());setSavedQuestion(saved);window.scrollTo({top:0});
    }catch(error:any){setSaveStatus(error.message||"Could not save. Please try again.");}finally{setSavingQuestion(false);}
  }

  function deleteQuestion(id:string){setItems(xs=>xs.filter(x=>x.id!==id));void kokoroVoice.deleteQuestion(id);setMessage("Question deleted.")}
  function deleteQuestions(ids:string[]){const remove=new Set(ids);setItems(xs=>xs.filter(x=>!remove.has(x.id)));ids.forEach(id=>void kokoroVoice.deleteQuestion(id));setMessage(`${ids.length} ${ids.length===1?"question":"questions"} deleted.`);}
  useEffect(()=>{
    if(!cardMenuId)return;
    const close=(e:PointerEvent)=>{if(!(e.target as HTMLElement).closest?.(".question-card-menu,.question-card-more"))setCardMenuId(null);};
    document.addEventListener("pointerdown",close);return()=>document.removeEventListener("pointerdown",close);
  },[cardMenuId]);
  useEffect(()=>{setCardMenuId(null);setDeleteId(null);if(tab!=="library")exitSelection();},[tab]);
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(e.key!=="Escape")return;
      if(confirmLeaveQuiz){setConfirmLeaveQuiz(false);return;}
      if(cardMenuId){setCardMenuId(null);return;}
      if(showAdvancedFilters){setShowAdvancedFilters(false);return;}
      if(showQuestionTools){setShowQuestionTools(false);setShowQuestionExport(false);return;}
      if(pendingLeave){setPendingLeave(null);return;}
      if(bulkDelete){setBulkDelete(false);return;}
      if(bulkEdit){setBulkEdit("");return;}
      if(deleteId){setDeleteId(null);return;}
      if(selectionMode)exitSelection();
    };
    window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);
  },[cardMenuId,showAdvancedFilters,showQuestionTools,pendingLeave,bulkDelete,bulkEdit,deleteId,selectionMode,confirmLeaveQuiz]);
  function toggleTheme(){chooseTheme(isDark?"light":"dark");}
  const weekStart=new Date(today()+"T00:00:00Z");weekStart.setUTCDate(weekStart.getUTCDate()-(weekStart.getUTCDay()+6)%7);
  const last7=Array.from({length:7},(_,i)=>{const d=new Date(weekStart);d.setUTCDate(d.getUTCDate()+i);return {key:d.toISOString().slice(0,10),label:d.toLocaleDateString(undefined,{weekday:"narrow",timeZone:"UTC"})}});
  const {current:streak}=streakStats(streakDays,today());
  const reportAnalytics=useMemo(()=>analytics(reportHistory),[reportHistory]);
  const reportTotals=useMemo(()=>reportHistory.reduce((a,r)=>({quizzes:a.quizzes+1,answers:a.answers+r.total,correct:a.correct+r.correct,missed:a.missed+r.total-r.correct}),{quizzes:0,answers:0,correct:0,missed:0}),[reportHistory]);
  const missedQuestions=useMemo(()=>{const latest=new Map<string,Result>();for(const report of reportHistory)for(const q of report.questions||[])if(!q.correct)latest.set(q.knowledge_id,q);return [...latest.values()]},[reportHistory]);
  const reportDays=useMemo(()=>{const counts=new Map<string,number>();for(const r of reportHistory){const day=String(r.date).slice(0,10);counts.set(day,(counts.get(day)||0)+1)}return counts},[reportHistory]);




  if(showAdd)return <main className={`${styles.reviewPage} question-editor-page`}><section className="question-editor-shell"><div className="editor-navigation-brand"><Brand/></div><button className="quiz-options-back" disabled={savingQuestion} onClick={()=>requestLeave(closeEditor)}>← Question bank</button><header><p className={styles.eyebrow}>{editingId?"EDIT QUESTION":"NEW QUESTION"}</p><h1>{editingId?"Edit question":"Create a question"}</h1><p>{editingId?"Refine what you learn, one question at a time.":"Turn something worth remembering into practice."}</p></header><QuestionEditor draft={draft} setDraft={setDraft} onSave={saveQuestion} onCancel={()=>requestLeave(closeEditor)} busy={savingQuestion} status={saveStatus} saved={savedQuestion} editing={!!editingId} prepareAudio={prepareAudio} setPrepareAudio={setPrepareAudio} onAnother={()=>openAdd()}/></section>{pendingLeave&&<DiscardChangesDialog onKeep={()=>setPendingLeave(null)} onDiscard={()=>{const action=pendingLeave.action;setPendingLeave(null);action();}}/>}</main>;

  if(caughtUp&&!showQuizBuilder)return <main className="quiz-countdown-page quiz-caught-up-page"><header><span className="caught-up-brand"><Brand size={24}/></span><button onClick={exitQuiz}>← Back home</button></header><section><span className="caught-up-mark"><CheckCircle2 size={29}/></span><p className="caught-up-kicker">DAILY PRACTICE</p><h1>You’re caught up</h1><p>No questions are due today. Keep learning with a practice round from your full question bank.</p><Button onClick={()=>beginReview(prepareQuiz(items,{...quizDefaults,count:0,shuffle:quizDefaults.shuffle}),"all")}>Practice all questions <ArrowRight size={17}/></Button><button className="caught-up-advanced" onClick={()=>setShowQuizBuilder(true)}>Customize practice</button><small>{items.length} {items.length===1?'question':'questions'} in your library</small></section><footer>Nice work keeping your reviews current.</footer></main>;
  if(showQuizBuilder)return <main className={`${styles.reviewPage} quiz-options-page`}><div className="quiz-options-shell"><div className="editor-navigation-brand"><Brand/></div><button className="quiz-options-back" onClick={()=>setShowQuizBuilder(false)}>← Back</button><h1>Advanced quiz settings</h1><p>Choose what to practice, then start your quiz.</p>{message&&<p role="status">{message}</p>}<QuizBuilder items={items} reports={reportHistory} defaults={quizDefaults} onClose={()=>setShowQuizBuilder(false)} onStart={(q:Item[],kind:any,types:string[])=>beginReview(q,kind,undefined,types)}/></div></main>;
  if(review&&countdown!==null)return <main className="quiz-countdown-page quiz-countdown-focus"><header><span className="countdown-brand"><Brand size={24}/></span><button onClick={exitQuiz} aria-label="Cancel quiz">Cancel</button></header><section><h1>{prefs.name?`Get ready, ${prefs.name}`:"Get ready"}</h1><strong key={countdown} role="status" aria-label={`Starting in ${countdown}`}>{countdown}</strong><p className="countdown-motto">Breathe. Recall. Go.</p><p className="countdown-total">{review.length} {review.length===1?'question':'questions'}</p></section></main>;
  if(review){
    if(idx>=review.length){
      const correct=results.filter(x=>x.correct).length;
      const accuracy=results.length?Math.round(correct/results.length*100):0;
      return <main className={styles.reviewPage}><section className={styles.finish}><div className="editor-navigation-brand"><Brand/></div>
        <div className={styles.finishBadge}><Sparkles size={18}/> {reviewKind==="retry_mistakes"?"PRACTICE COMPLETE":"QUIZ COMPLETE"}</div>
        <div className={styles.scoreRing}><strong>{accuracy}%</strong><span>accuracy</span></div>
        <h1>{reviewKind==="retry_mistakes"?"Practice complete.":accuracy>=80?"Great work.":accuracy>=50?"Nice work.":"Keep practising."}</h1>
        <div className={styles.finishStats}><div><b>{correct}</b><span>Correct</span></div><div><b>{results.length-correct}</b><span>Missed</span></div><div><b>{results.length}</b><span>Total</span></div></div>
        {missedItems(results,items).length>0&&<Button onClick={()=>retryMistakes(results,completedReportId)}>Retry mistakes ({missedItems(results,items).length})</Button>}
        <Button onClick={exportReport}><Copy size={17}/> Copy full report</Button>
        <Button variant="outline" onClick={exitQuiz}>Back home</Button>
        {message&&<p className={styles.note}>{message}</p>}
      </section></main>
    }
    const choiceQuestion=current?.type==="single_choice"||current?.type==="true_false";
    const answerTitle=current?.type==="fill_blank_options"?"Choose from the word bank":current?.type==="matching"?"Match the pairs":current?.type==="ordering"?"Arrange in order":current?.type==="cloze"?"Complete the blanks":current?.type==="flashcard"?"How did you do?":current?.type==="multi_select"?"Choose your answers":choiceQuestion?"Choose an answer":"Your answer";
    return <main className={`${styles.reviewPage} quiz-screen split-quiz`}><section className="split-quiz-shell">
      <header className="split-quiz-header"><div className="split-quiz-brand"><Brand size={22}/></div><button className="split-quiz-exit" aria-label="Exit quiz" onClick={requestExitQuiz}>×<span>Exit</span></button><div className="split-quiz-progress"><div className={styles.track} role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={review.length} aria-valuenow={idx+1}><span style={{width:`${((idx+1)/review.length)*100}%`}}/></div><small>{idx+1} of {review.length}{reviewKind==="retry_mistakes"?" · Retry":""}</small></div></header>
      <div className="quiz-workspace">
        <section className="quiz-question-card" aria-label="Question">
          <div className="split-question-meta"><p>{current?.subject} <span>·</span> {current?.topic}</p><span className="split-type-badge">{typeLabel(current?.type)}</span></div>
          {current?.image&&<ZoomableImage className="question-media-zoom" imgClassName="question-media" src={current.image} alt={current.imageAlt||"Question illustration"} label="Enlarge question image"/>}
          {current?.type==="flashcard"?<>
            <div className="flashcard-speech"><SpeechButton questionId={current.id} role={revealed?"answer":"question"} text={revealed?current.answer:current.prompt} label={revealed?"Read flashcard answer":"Read flashcard question"}/></div>
            <button className={`${styles.flipCard} ${revealed?styles.flipped:""}`} onClick={()=>result===null&&setRevealed(v=>!v)} aria-label={revealed?"Show question":"Reveal answer"}>
              <div className={styles.flipInner}><div className={styles.flipFront} aria-hidden={revealed}><span>QUESTION</span><strong>{current.prompt||"What does the picture show?"}</strong><small>Tap to reveal answer</small></div><div className={styles.flipBack} aria-hidden={!revealed}><span>ANSWER</span>{current.answerImage&&<ZoomableImage className="flashcard-answer-zoom" imgClassName="flashcard-answer-media" src={current.answerImage} alt="Answer illustration" label="Enlarge answer image" tapImage={false}/>}<strong>{current.answer}</strong><small>Tap to see question</small></div></div>
            </button>
          </>:<div className="question-with-speech"><h1>{current?.type==="fill_blank_options"?"Choose the missing words.":current?.type==="fill_blank"?"Fill in the missing word.":current?.type==="cloze"?"Fill in the missing words.":current?.prompt||"Look at the picture."}</h1>{current&&<SpeechButton questionId={current.id} text={current.prompt} spokenText={current.type==="fill_blank"?current.prompt.replace(/_{2,}/g,"blank"):undefined}/>}</div>}
        </section>
        <section className="quiz-answer-card" aria-label="Answer area"><h2>{answerTitle}</h2>
          {current?.type==="fill_blank_options"?<WordBankAnswer key={current.id} item={current} value={selected} onChange={setSelected} disabled={revealed} onGrade={values=>{setSelected(values);grade(undefined,values);}}/>:["fill_blank","cloze"].includes(current?.type||"")?<InlineBlankAnswer key={current.id} item={current} value={current.type==="cloze"?selected:answer} onChange={current.type==="cloze"?setSelected:setAnswer} disabled={revealed} onGrade={values=>{if(Array.isArray(values))setSelected(values);else setAnswer(values);grade(undefined,values);}}/>:["matching","ordering"].includes(current?.type||"")?<StructuredAnswer item={current} value={selected} onChange={setSelected} disabled={revealed} onGrade={values=>{setSelected(values);grade(undefined,values);}}/>:current?.type==="flashcard"?<div className="split-flash-actions"><p className="split-answer-help">{revealed?"Mark whether you recalled the answer.":"Recall the answer, then reveal the card."}</p>{!revealed&&<Button onClick={()=>setRevealed(true)}>Reveal answer</Button>}{revealed&&result===null&&<div className={styles.two}><Button variant="outline" onClick={()=>grade(false)}>Didn't know</Button><Button onClick={()=>grade(true)}>Knew it</Button></div>}</div>:current?.type==="multi_select"?<div className={styles.options}><p className="split-answer-help">Select all correct answers.</p>{(current.options||[]).map((o,i)=><label key={o} className="split-choice" data-state={revealed?((current.correctAnswers||current.answer.split('; ')).includes(o)?"correct":selected.includes(o)?"incorrect":"idle"):selected.includes(o)?"selected":"idle"}><input type="checkbox" aria-label={o} checked={selected.includes(o)} disabled={revealed} onChange={e=>setSelected(xs=>e.target.checked?[...xs,o]:xs.filter(x=>x!==o))}/><span className="split-choice-letter">{String.fromCharCode(65+i)}</span><span className="split-choice-text">{current?.optionImages?.[o]&&<ZoomableImage className="choice-media-zoom" imgClassName="choice-media" src={current.optionImages[o]} alt={o} label={`Enlarge picture for ${o}`} tapImage={false}/>} {isPictureLabel(o)&&current.optionImages?.[o]?<span className="visually-hidden">{o}</span>:o}</span><span className="split-choice-indicator" aria-hidden="true"/></label>)}{!revealed&&<Button className="split-submit" disabled={!selected.length} onClick={()=>grade()}>Check selections</Button>}</div>:choiceQuestion?<div className={styles.options}><fieldset className="split-choice-group" data-kind={current?.type==="true_false"?"true-false":undefined} aria-label="Choose an answer">{(current?.type==="true_false"?["True","False"]:current?.options||[]).map((o,i)=><label key={o} className="split-choice" data-state={revealed?(gradeQuestion(current,o)?"correct":answer===o?"incorrect":"idle"):answer===o?"selected":"idle"}><input type="radio" name={`quiz-answer-${current.id}`} aria-label={o} checked={answer===o} disabled={revealed} onChange={()=>setAnswer(o)}/><span className="split-choice-letter">{String.fromCharCode(65+i)}</span><span className="split-choice-text">{current?.optionImages?.[o]&&<ZoomableImage className="choice-media-zoom" imgClassName="choice-media" src={current.optionImages[o]} alt={o} label={`Enlarge picture for ${o}`} tapImage={false}/>} {isPictureLabel(o)&&current.optionImages?.[o]?<span className="visually-hidden">{o}</span>:o}</span><span className="split-choice-indicator" aria-hidden="true"/></label>)}</fieldset>{!revealed&&<Button className="split-submit" disabled={!answer} onClick={()=>grade()}>Check answer</Button>}</div>:<div className={styles.answerArea}><p className="split-answer-help">{current?.type==="numeric"?"Enter a number.":"Write what you remember."}</p><Input aria-label={current?.type==="numeric"?"Numeric answer":"Your answer"} inputMode={current?.type==="numeric"?"decimal":undefined} value={answer} onChange={e=>setAnswer(e.target.value)} placeholder={current?.type==="numeric"?"Enter a number…":"Type your answer…"} disabled={revealed} onKeyDown={e=>{if(e.key==="Enter"&&answer&&!revealed)grade()}}/>{!revealed&&<Button className="split-submit" disabled={!answer} onClick={()=>grade()}>Check answer</Button>}</div>}
          {result!==null&&<div className={`${result?styles.feedbackGood:styles.feedbackBad} split-feedback`} data-result={result?"correct":"incorrect"} role="status"><div className={styles.feedbackIcon}>{result?<CheckCircle2/>:<XCircle/>}</div><div className={styles.feedbackCopy}><strong>{result?(results[results.length-1]?.grading==="typo"?"Accepted — likely typo":"Correct!"):"Not quite"}</strong>{(current?.answer||!current?.answerImage)&&<span>{result?`Answer: ${current?.answer||""}`:`Correct answer: ${current?.answer||""}`}</span>}{current&&<SpeechButton questionId={current.id} role="answer" text={current.answer} label="Read correct answer"/>}{current?.answerImage&&current.type!=="flashcard"&&<ZoomableImage className="feedback-answer-zoom" imgClassName="feedback-answer-media" src={current.answerImage} alt="Answer illustration" label="Enlarge answer image"/>}</div><Button onClick={next}>{idx+1===review.length?"See results":"Continue"} <ArrowRight size={17}/></Button></div>}
        </section>
      </div>
      {confirmLeaveQuiz&&<div className="quiz-leave-layer" role="presentation"><button className="question-tools-scrim" aria-label="Keep practising" onClick={()=>setConfirmLeaveQuiz(false)}/><section className="quiz-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="quiz-leave-title"><h2 id="quiz-leave-title">Leave this quiz?</h2><p>{results.length} of {review.length} answered. Answers so far keep their review dates, but no report is saved.</p><div><Button variant="outline" onClick={()=>setConfirmLeaveQuiz(false)}>Keep going</Button><Button variant="destructive" onClick={exitQuiz}>Leave quiz</Button></div></section></div>}
    </section></main>
  }

  return <div className={styles.shell}><main className={`${styles.main} ${tab==="streak"?'streak-layout-shell':tab==="home"?styles.homeMain:''}`}>
    <header className="app-top-bar" data-scrolled={scrolled||undefined}><div><Brand size={28}/></div><div className={styles.headerRight}>{tab!=="home"&&<span className={styles.mini}>{items.length} questions</span>}<Button variant="ghost" size="icon-md" className={tab==="home"?styles.homeTheme:undefined} aria-label="Change theme" onClick={toggleTheme}>{tab==="home"?<><Sun size={13}/><span className={`${styles.themeSwitch} ${isDark?styles.themeDark:''}`}/><Moon size={13}/></>:isDark?<Sun size={18}/>:<Moon size={18}/>}</Button>{tab==="home"&&<button className={styles.profilePlaceholder} aria-label="Profile settings" title="Profile settings" onClick={()=>{setTab("settings");window.setTimeout(()=>document.getElementById("settings-profile")?.scrollIntoView({block:"start"}),50);}}>{(prefs.name[0]||"?").toUpperCase()}</button>}</div></header>
    {tab==="home"&&<><section className={styles.intro}><h1>Good to see you again{prefs.name?<>, <strong>{prefs.name}</strong></>:""}</h1></section>
      <section className={styles.hero}><span className={styles.homeQuizIcon}><BookOpen size={23}/></span><div className={styles.heroCopy}><div className={styles.homeQuizTitle}><h2>Today's quiz</h2><span>{quizSize} {quizSize===1?'question':'questions'}</span></div><p>A little practice, every day.</p></div><Button onClick={startReview} disabled={!items.length}>Start quiz <ArrowRight size={16}/></Button></section>
      <div className={styles.quickQuizOptions}><button onClick={()=>{setMessage("");setShowQuizBuilder(true);window.scrollTo({top:0});}}>Advanced settings <Settings size={12}/></button></div>
      <section className={styles.streakCard}>
        <button className={styles.streakOpen} onClick={()=>setTab("streak")} aria-label={`Current streak: ${streak} ${streak===1?"day":"days"}. View streak details`}>
          <div className={styles.streakTop}><strong>Your streak</strong><span className={styles.homeStreakBadge}><Flame size={20}/><b>{streak} {streak===1?'day':'days'}</b></span></div>
          <div className={styles.week}>{last7.map(d=><div key={d.key} className={streakDays.includes(d.key)&&d.key<=today()?(d.key===today()?`${styles.homeTileDone} ${styles.homeTileCompletedToday}`:styles.homeTileDone):d.key===today()?styles.homeTileToday:d.key>today()?styles.homeTileUpcoming:styles.homeTile}><span>{d.key===today()?'Today':d.label}</span><div aria-label={`${d.key}${streakDays.includes(d.key)&&d.key<=today()?', studied':d.key===today()?', today':d.key>today()?', upcoming':', no quiz completed'}`} className={streakDays.includes(d.key)&&d.key<=today()?styles.dayDone:(d.key===today()?styles.dayToday:d.key<today()?styles.daySkipped:styles.dayMissed)}>{streakDays.includes(d.key)&&d.key<=today()?<Flame size={20} fill="currentColor" strokeWidth={1.5}/>:d.key<=today()?<Flame size={18}/>:null}</div></div>)}</div>
          <span className={styles.streakHint}>Streak details <ArrowRight size={16}/></span>
        </button>
      </section>
      <div className={styles.homeStats}><div><ChartNoAxesColumnIncreasing size={20}/><strong>{quizCount}</strong><span>Quizzes taken</span></div><div><BookOpen size={20}/><strong>{items.length}</strong><span>Questions</span></div></div>
</>}
    {tab==="library"&&<section className="question-library qb"><div className="qb-head"><div><p className={styles.eyebrow}>YOUR QUESTIONS</p><h1>Question bank</h1><p className="qb-sub">{items.length} {items.length===1?"question":"questions"}{subjects.length?` · ${subjects.length} ${subjects.length===1?"subject":"subjects"}`:""}</p></div><div className="qb-head-actions"><button type="button" className="qb-icon-btn" aria-label="More question actions" title="Import, export, select" aria-haspopup="dialog" onClick={()=>setShowQuestionTools(true)}><MoreHorizontal size={20}/></button><Button onClick={()=>openAdd()}><Plus size={17}/> New<span className="qb-new-word"> question</span></Button></div></div>

      {message&&<p className={styles.note}>{message}</p>}
      {!!items.length&&<div className="qb-stats" role="group" aria-label="Quick filters">{([["due","Due today",bankStats.due,CalendarClock,dueOnly,()=>setDueOnly(v=>!v)],["mistakes","Got wrong",bankStats.mistakes,RotateCcw,performanceFilter==="mistakes",()=>setPerformanceFilter(p=>p==="mistakes"?"all":"mistakes")],["pictures","With pictures",bankStats.pictures,ImageIcon,withImagesOnly,()=>setWithImagesOnly(v=>!v)],["multi","Multi-type",bankStats.multi,Shuffle,multiTypeOnly,()=>setMultiTypeOnly(v=>!v)]] as const).map(([id,label,count,Icon,on,toggle])=><button type="button" key={id} className="qb-stat" data-kind={id} aria-pressed={on} onClick={toggle}><span className="qb-stat-icon"><Icon size={16}/></span><strong>{count}</strong><span>{label}</span></button>)}</div>}<div className="qb-toolbar"><div className="qb-search"><Search size={18} aria-hidden="true"/><input type="search" aria-label="Search questions" value={librarySearch} onChange={e=>setLibrarySearch(e.target.value)} placeholder="Search questions, answers, tags…"/>{librarySearch&&<button type="button" className="qb-search-clear" aria-label="Clear search" onClick={()=>setLibrarySearch("")}><X size={15}/></button>}</div><button type="button" className="qb-filter-btn" data-active={activeFilterCount>0||undefined} aria-expanded={showAdvancedFilters} aria-label={`Filters${activeFilterCount?`, ${activeFilterCount} active`:""}`} onClick={()=>setShowAdvancedFilters(true)}><SlidersHorizontal size={17}/><span>Filters</span>{activeFilterCount>0&&<b>{activeFilterCount}</b>}</button></div>{subjects.length>1&&<div className="qb-chips" role="group" aria-label="Filter by subject"><button type="button" aria-pressed={librarySubject==="all"} onClick={()=>setLibrarySubject("all")}>All</button>{subjects.map(subject=><button type="button" key={subject} aria-pressed={librarySubject===subject} onClick={()=>setLibrarySubject(v=>v===subject?"all":subject)}>{subject}<span>{items.filter(x=>x.subject===subject).length}</span></button>)}</div>}{showAdvancedFilters&&<div className="question-tools-layer"><button className="question-tools-scrim" aria-label="Close advanced filters" onClick={()=>setShowAdvancedFilters(false)}/><section className="question-tools-sheet advanced-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="advanced-filter-title"><div className="question-tools-handle"/><div className="question-tools-heading"><div><h2 id="advanced-filter-title">Advanced filters</h2><p>Find exactly the questions you want.</p></div><button aria-label="Close" onClick={()=>setShowAdvancedFilters(false)}><X size={18}/></button></div><div className="advanced-filter-fields"><label>Question type<select value={libraryType} onChange={e=>setLibraryType(e.target.value)}><option value="all">Any type</option>{questionTypes.map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label>Subject<select value={librarySubject} onChange={e=>setLibrarySubject(e.target.value)}><option value="all">All subjects</option>{subjects.map(subject=><option key={subject} value={subject}>{subject}</option>)}</select></label><label>Tag<select value={libraryTag} onChange={e=>setLibraryTag(e.target.value)}><option value="">All tags</option>{[...new Set(items.flatMap(x=>x.tags||[]))].map(tag=><option key={tag}>{tag}</option>)}</select></label><label>Sort by<select value={librarySort} onChange={e=>setLibrarySort(e.target.value)}><option value="recent">Newest first</option><option value="prompt">Question A–Z</option><option value="due">Due date</option></select></label></div><div className="advanced-filter-checks"><label><input type="checkbox" checked={withImagesOnly} onChange={e=>setWithImagesOnly(e.target.checked)}/> With images</label><label><input type="checkbox" checked={dueOnly} onChange={e=>setDueOnly(e.target.checked)}/> Due</label><label><input type="checkbox" checked={performanceFilter==="weak"} onChange={e=>setPerformanceFilter(e.target.checked?"weak":"all")}/> Weak questions</label><label><input type="checkbox" checked={performanceFilter==="mistakes"} onChange={e=>setPerformanceFilter(e.target.checked?"mistakes":"all")}/> Previous mistakes</label><label><input type="checkbox" checked={duplicatesOnly} onChange={e=>setDuplicatesOnly(e.target.checked)}/> Duplicates only</label><label><input type="checkbox" checked={multiTypeOnly} onChange={e=>setMultiTypeOnly(e.target.checked)}/> Asked in several ways</label></div><div className="advanced-filter-actions"><button onClick={clearLibraryFilters}>Reset all</button><button onClick={()=>setShowAdvancedFilters(false)}>Show {visibleItems.length} questions</button></div></section></div>}<div className="qb-results"><span role="status" aria-live="polite">{libraryFiltered?`Showing ${visibleItems.length} of ${items.length}`:`${items.length} ${items.length===1?"question":"questions"}`}</span>{libraryFiltered&&<button type="button" className="qb-reset" onClick={clearLibraryFilters}>Clear</button>}<label className="qb-sort"><ArrowUpDown size={14} aria-hidden="true"/><select aria-label="Sort questions" value={librarySort} onChange={e=>setLibrarySort(e.target.value)}><option value="recent">Newest</option><option value="prompt">A–Z</option><option value="due">Due first</option></select></label></div>{selectionMode&&(()=>{const count=selectedQuestionIds.length,allSelected=!!visibleItems.length&&visibleItems.every(x=>selectedQuestionIds.includes(x.id));return <div className="question-selection-bar" role="toolbar" aria-label="Selected questions"><div className="selection-bar-info"><button className="selection-bar-close" aria-label="Exit selection" onClick={exitSelection}><X size={17}/></button><strong role="status" aria-live="polite">{count} selected</strong><button className="selection-bar-all" disabled={!visibleItems.length} onClick={()=>{setBulkDelete(false);setSelectedQuestionIds(allSelected?[]:visibleItems.map(x=>x.id));}}>{allSelected?"Clear":"Select all"}</button></div><div className="selection-bar-actions"><button disabled={!count} onClick={()=>{const q=items.filter(x=>selectedQuestionIds.includes(x.id));exitSelection();beginReview(q,"all");}}><Play size={15}/> Practice</button><button disabled={!count} aria-expanded={bulkEdit==="move"} onClick={()=>openBulk("move")}><Layers size={15}/> Move</button><button disabled={!count} aria-expanded={bulkEdit==="tag"} onClick={()=>openBulk("tag")}><Star size={15}/> Tag</button><button disabled={!count} onClick={()=>openTransfer("export")}><Download size={15}/> Export</button><button className="selection-bar-delete" disabled={!count} onClick={()=>{setBulkEdit("");setBulkDelete(true);}}><Trash2 size={15}/> Delete</button></div>{bulkEdit==="move"&&count>0&&<form className="selection-bar-form" onSubmit={e=>{e.preventDefault();moveSelected();}}><p>Move {count} {count===1?"question":"questions"} to a subject or topic. Leave a field empty to keep it.</p><div><label>Subject<input list="bulk-subjects" value={bulkSubject} onChange={e=>setBulkSubject(e.target.value)} placeholder="e.g. Biology"/></label><label>Topic<input list="bulk-topics" value={bulkTopic} onChange={e=>setBulkTopic(e.target.value)} placeholder="e.g. Cells"/></label></div><datalist id="bulk-subjects">{subjects.map(s=><option key={s} value={s}/>)}</datalist><datalist id="bulk-topics">{[...new Set(items.map(x=>x.topic).filter(Boolean))].map(t=><option key={t} value={t}/>)}</datalist><div className="selection-bar-form-actions"><Button type="submit" disabled={!bulkSubject.trim()&&!bulkTopic.trim()}>Move</Button><Button type="button" variant="outline" onClick={()=>setBulkEdit("")}>Cancel</Button></div></form>}{bulkEdit==="tag"&&count>0&&<form className="selection-bar-form" onSubmit={e=>{e.preventDefault();tagSelected();}}><p>Add tags to {count} {count===1?"question":"questions"}. Existing tags are kept.</p><label>Tags<input value={bulkTags} onChange={e=>setBulkTags(e.target.value)} placeholder="e.g. exam, chapter 2"/></label><div className="selection-bar-form-actions"><Button type="submit" disabled={!bulkTags.trim()}>Add tags</Button><Button type="button" variant="outline" onClick={()=>setBulkEdit("")}>Cancel</Button></div></form>}{bulkDelete&&count>0&&<div className="selection-bar-confirm" role="alertdialog" aria-label="Confirm deleting selected questions"><p>Delete {count} {count===1?"question":"questions"}? This cannot be undone.</p><div><Button variant="destructive" onClick={()=>{deleteQuestions(selectedQuestionIds);exitSelection();}}>Delete {count}</Button><Button variant="outline" onClick={()=>setBulkDelete(false)}>Cancel</Button></div></div>}</div>;})()}{!visibleItems.length&&<div className="library-empty"><Search size={28}/><h2>{items.length?"No questions found":"Your bank starts here"}</h2><p>{items.length?"Try another search or loosen your filters.":"Add your first question or import a collection."}</p>{libraryFiltered&&<Button variant="outline" onClick={clearLibraryFilters}>Clear filters</Button>}</div>}<div className="qb-list">{visibleItems.map(x=>{const selected=selectionMode&&selectedQuestionIds.includes(x.id),name=x.prompt||"Picture question",TypeIcon=typeIcons[x.type||"short_answer"]||PenLine,due=dueBadge(x),stat=performance.get(x.id),accuracy=stat?Math.round((stat.attempts-stat.wrong)/stat.attempts*100):null,place=[x.subject&&x.subject!=="General"?x.subject:"",x.topic&&x.topic!=="General"&&x.topic!==x.subject&&x.topic.toLowerCase()!==typeLabel(x.type).toLowerCase()?x.topic:""].filter(Boolean).join(" › "),detail=questionCardDetail(x);return <article key={x.id} className="qb-card" data-question-type={x.type||"short_answer"} data-selecting={selectionMode||undefined} data-selected={selected||undefined} onClick={selectionMode?e=>{if(!(e.target as HTMLElement).closest("input,button,summary,a"))toggleSelected(x.id);}:undefined}>{selectionMode&&<label className="question-select"><input type="checkbox" aria-label={`Select ${name}`} checked={selected} onChange={()=>toggleSelected(x.id)}/><span aria-hidden="true"><Check size={13}/></span></label>}<div className="qb-card-top"><span className="qb-type"><TypeIcon size={14} aria-hidden="true"/>{typeLabel(x.type)}</span>{!!x.variants?.length&&<span className="qb-multi" title={`Also asked as ${x.variants.map((v:any)=>typeLabel(v.type)).join(", ")}${x.typeMode==="primary"?"":" · a random way each quiz"}`}><Shuffle size={12} aria-hidden="true"/>+{x.variants.length} {x.variants.length===1?"way":"ways"}</span>}<span className="qb-due" data-due={due.state}>{due.label}</span>{!selectionMode&&<button type="button" className="qb-more" aria-label={`More actions for ${name}`} aria-expanded={cardMenuId===x.id} onClick={()=>setCardMenuId(id=>id===x.id?null:x.id)}><MoreHorizontal size={18}/></button>}{cardMenuId===x.id&&!selectionMode&&<div className="question-card-menu" role="menu"><button onClick={()=>{setCardMenuId(null);openAdd(x);}}><Pencil size={14}/> Edit</button><button onClick={()=>{setCardMenuId(null);beginReview([x],"all");}}><Play size={14}/> Practice now</button><button className="is-danger" onClick={()=>{setCardMenuId(null);setDeleteId(x.id);}}><Trash2 size={14}/> Delete</button></div>}</div><div className="qb-card-body"><div className="qb-card-text"><h3 data-empty={!x.prompt||undefined}>{name}</h3>{!!x.variants?.length&&<p className="qb-also">Also asked as {x.variants.map((v:any)=>typeLabel(v.type)).join(", ")}</p>}</div>{x.image&&<button type="button" className="qb-thumb" aria-label={`Enlarge picture for ${name}`} onClick={e=>{e.stopPropagation();openZoom(x.image,x.imageAlt||"Question picture");}}><img src={x.image} alt=""/></button>}</div><div className="qb-meta">{place&&<span className="qb-place">{place}</span>}{detail&&<span>{detail}</span>}{(x.tags||[]).map((tag:string)=><span key={tag} className="qb-tag">#{tag}</span>)}{duplicateSet.has(x.id)&&<span className="qb-dup">Possible duplicate</span>}{accuracy!==null&&<span className="qb-acc" data-level={accuracy>=80?"good":accuracy>=50?"ok":"low"}>{accuracy}% right</span>}</div><div className="qb-card-foot"><details className="qb-answer"><summary>Show answer <ChevronDown size={14}/></summary><div className="qb-answer-body">{x.answer&&<p>{x.answer}</p>}{x.answerImage&&<button type="button" className="qb-thumb qb-answer-thumb" aria-label="Enlarge answer picture" onClick={e=>{e.stopPropagation();openZoom(x.answerImage,"Answer picture");}}><img src={x.answerImage} alt=""/></button>}</div></details>{!selectionMode&&<button type="button" className="qb-edit" aria-label={`Edit ${name}`} onClick={()=>openAdd(x)}><Pencil size={14}/> Edit</button>}</div>{deleteId===x.id&&<div className="library-delete-confirm" role="group" aria-label="Confirm question deletion"><p>Delete this question? This cannot be undone.</p><div><Button variant="destructive" onClick={()=>{deleteQuestion(x.id);setDeleteId(null);}}>Delete question</Button><Button variant="outline" onClick={()=>setDeleteId(null)}>Cancel</Button></div></div>}</article>;})}</div>{showQuestionTools&&<div className="question-tools-layer"><button className="question-tools-scrim" aria-label="Close question tools" onClick={()=>setShowQuestionTools(false)}/><section className="question-tools-sheet" role="dialog" aria-modal="true" aria-labelledby="question-tools-title"><div className="question-tools-handle"/><div className="question-tools-heading"><div><h2 id="question-tools-title">Manage questions</h2><p>Import, export and organise your question bank.</p></div><button aria-label="Close" onClick={()=>setShowQuestionTools(false)}><X size={18}/></button></div><button className="question-tools-action" onClick={()=>openTransfer("import")}><FileUp/><span><b>Import questions</b><small>CSV, Anki, JSON or plain text</small></span><ArrowRight/></button><button className="question-tools-action" onClick={()=>openTransfer("export")}><FileDown/><span><b>Export questions</b><small>Spreadsheet, flashcards, printable or backup</small></span><ArrowRight/></button><div className="question-tools-utilities"><button className="question-tools-secondary" onClick={()=>{setSelectionMode(true);setShowQuestionTools(false);setSelectedQuestionIds([]);}}><Layers/> Select multiple</button><button className="question-tools-secondary" onClick={()=>{setDuplicatesOnly(true);setShowQuestionTools(false);}}><CopyCheck/> Find duplicates</button></div><button className="question-tools-cancel" onClick={()=>setShowQuestionTools(false)}>Cancel</button></section></div>}</section>}
    {tab==="results"&&<section className={styles.reportsPage}><div className={styles.pageTitle}><div><p className={styles.eyebrow}>YOUR LEARNING, ORGANIZED</p><h1>Reports</h1></div></div>
      <div className="reports-view-tabs" role="tablist" aria-label="Report sections">{([["overview","Overview",LayoutDashboard],["history","History",History],["progress","Progress",ChartNoAxesColumnIncreasing],["mistakes","Mistakes",XCircle],["activity","Activity",CalendarDays],["insights","Insights",Lightbulb]] as const).map(([id,label,Icon])=><button key={id} role="tab" aria-selected={reportView===id} onClick={()=>setReportView(id)}><Icon size={17} aria-hidden="true"/><span>{label}</span></button>)}</div>
      {!reportHistory.length?<div className={styles.emptyReports}><History size={34}/><h2>No reports yet</h2><p>Finish your first quiz and its report will appear here. Progress, mistakes and activity will fill in as you practice.</p><Button onClick={startReview} disabled={!items.length}><Play size={16} fill="currentColor"/> Take a quiz</Button></div>:<>
        {reportView==="overview"&&<>
          <div className={styles.reportSummary}><div className={styles.reportSummaryLead}><span>OVERALL ACCURACY</span><strong>{reportTotals.answers?Math.round(reportTotals.correct/reportTotals.answers*100):0}%</strong><small>Across {reportTotals.answers} answers in {reportTotals.quizzes} {reportTotals.quizzes===1?"quiz":"quizzes"}</small></div><div className={styles.reportOverview}><div><strong>{reportTotals.quizzes}</strong><span>Quizzes</span></div><div><strong>{reportTotals.answers}</strong><span>Answers</span></div><div><strong>{reportTotals.missed}</strong><span>Missed</span></div></div></div>
          <div className={styles.reportSectionTitle}><strong>Recent quizzes</strong><button onClick={()=>setReportView("history")}>View all <ArrowRight size={13}/></button></div><div className={styles.reportList}>{reportHistory.slice(0,3).map((r,i)=><ReportHistoryCard key={r.id} report={r} index={i} openId={openReportId} setOpenId={setOpenReportId} items={items} retry={retryMistakes} copy={copySavedReport}/>)}</div>
          <div className="report-shortcuts"><button onClick={()=>setReportView("progress")}><ChartNoAxesColumnIncreasing/><span><b>Track progress</b><small>See how accuracy changes</small></span><ArrowRight/></button><button onClick={()=>setReportView("mistakes")}><XCircle/><span><b>Review mistakes</b><small>{missedQuestions.length} {missedQuestions.length===1?"question":"questions"} to revisit</small></span><ArrowRight/></button></div>
        </>}
        {reportView==="history"&&<><div className={styles.reportSectionTitle}><strong>Quiz history</strong><span>{reportHistory.length} completed {reportHistory.length===1?"quiz":"quizzes"} · Select one for answers</span></div><div className={styles.reportList}>{reportHistory.map((r,i)=><ReportHistoryCard key={r.id} report={r} index={i} openId={openReportId} setOpenId={setOpenReportId} items={items} retry={retryMistakes} copy={copySavedReport}/>)}</div></>}
        {reportView==="progress"&&<section className="report-content-card"><div className="report-content-heading"><div><p>ACCURACY OVER TIME</p><h2>Your progress</h2></div><strong>{reportHistory.at(-1)?.accuracy??0}%</strong></div><p className="report-muted">Each point is one completed quiz, shown from oldest to newest.</p>{reportAnalytics.trend.length>1?<div className="report-trend">{reportAnalytics.trend.map((r:any)=><div key={r.id} title={`${new Date(r.date).toLocaleDateString()}: ${r.accuracy}%`}><span>{r.accuracy}%</span><i><b style={{height:`${Math.max(5,r.accuracy)}%`}}/></i><small>{new Date(r.date).toLocaleDateString(undefined,{month:"short",day:"numeric"})}</small></div>)}</div>:<div className="report-inline-empty">Complete another quiz to see your progress trend.</div>}<div className="report-progress-stats"><div><strong>{reportTotals.correct}</strong><span>Correct answers</span></div><div><strong>{reportTotals.missed}</strong><span>Missed answers</span></div><div><strong>{(()=>{const seconds=reportHistory.length?Math.round(reportHistory.reduce((n,r)=>n+r.duration_seconds,0)/reportHistory.length):0;return seconds<60?`${seconds}s`:`${Math.round(seconds/60)}m`})()}</strong><span>Avg. quiz time</span></div></div></section>}
        {reportView==="mistakes"&&<section className="report-content-card"><div className="report-content-heading"><div><p>WHAT TO PRACTICE NEXT</p><h2>Mistake review</h2></div><span className="report-count-pill">{missedQuestions.length} to revisit</span></div>{missedQuestions.length?<><p className="report-muted">Questions you missed at least once, with your latest answer.</p><div className={styles.reportQuestions}>{missedQuestions.map((q,i)=><div className={styles.reportQuestionBad} key={`${q.knowledge_id}-${i}`}><span><XCircle size={16}/></span><div><b>{q.prompt}</b><small>Your answer: {q.user_answer||"No answer"}</small><small>Correct: {q.correct_answer}</small></div><em>{reportAnalytics.mistakes.find((m:any)=>m.prompt===q.prompt)?.count||1}× missed</em></div>)}</div><Button onClick={()=>retryMistakes([...missedQuestions])}><Play size={16} fill="currentColor"/> Practice missed questions</Button></>:<div className="report-inline-empty">No missed answers so far. Nice work!</div>}</section>}
        {reportView==="activity"&&<section className="report-content-card"><div className="report-content-heading"><div><p>YOUR STUDY RHYTHM</p><h2>Activity</h2></div><strong>{streak} day{streak===1?"":"s"}</strong></div><p className="report-muted">Quiz days from the last four weeks.</p><div className="report-activity-weekdays" aria-hidden="true">{["M","T","W","T","F","S","S"].map((d,i)=><span key={i}>{d}</span>)}</div><div className="report-activity-grid">{(()=>{const end=new Date();end.setUTCHours(0,0,0,0);const start=new Date(end);start.setUTCDate(start.getUTCDate()-((end.getUTCDay()+6)%7)-21);return Array.from({length:28},(_,i)=>{const date=new Date(start);date.setUTCDate(start.getUTCDate()+i);const key=date.toISOString().slice(0,10);const count=reportDays.get(key)||0;const future=date.getTime()>end.getTime();return <div key={key} className={count?"is-active":""} data-future={future||undefined} data-today={date.getTime()===end.getTime()||undefined} title={future?key:`${key}: ${count} ${count===1?"quiz":"quizzes"}`}><span>{date.getUTCDate()}</span><b>{count?`${count}×`:""}</b></div>;});})()}</div><div className="report-activity-summary"><strong>{reportDays.size}</strong><span>{reportDays.size===1?"day":"days"} with a quiz in your report history</span><span>{streakDays.length} practice {streakDays.length===1?"day":"days"} tracked</span></div></section>}
        {reportView==="insights"&&<section className="report-content-card"><div className="report-content-heading"><div><p>WHERE YOU’RE STRONG</p><h2>Learning insights</h2></div><Sparkles/></div>{reportAnalytics.total?<><p className="report-muted">Accuracy by subject, topic and question format.</p>{Object.entries(reportAnalytics.groups).map(([key,groups]:any)=><div className="report-insight-group" key={key}><h3>By {key}</h3>{Object.entries(groups).sort(([,a]:any,[,b]:any)=>a.correct/a.total-b.correct/b.total).map(([name,s]:any)=><div className="report-insight-row" key={name}><div><span>{key==="type"?typeLabel(name):name}</span><strong>{Math.round(s.correct/s.total*100)}%</strong></div><div className="report-insight-track"><i style={{width:`${Math.round(s.correct/s.total*100)}%`}}/></div><small>{s.correct}/{s.total} correct · {(s.seconds/s.total).toFixed(1)}s average</small></div>)}</div>)}<h3>Repeated mistakes</h3>{reportAnalytics.mistakes.filter((x:any)=>x.count>1).slice(0,8).map((x:any)=><p className="report-repeat-mistake" key={x.prompt}>{x.prompt}<strong>{x.count} misses</strong></p>)}{!reportAnalytics.mistakes.some((x:any)=>x.count>1)&&<div className="report-inline-empty">No repeated mistakes yet.</div>}</>:<div className="report-inline-empty">Finish a quiz to see learning insights.</div>}</section>}
      </>}
      {message&&<p className={styles.note}>{message}</p>}
    </section>}
    {tab==="settings"&&<SettingsPage items={items} reports={reportHistory} quizCount={quizCount} streakDays={streakDays} theme={themeChoice} onTheme={chooseTheme} onQuizDefaults={setQuizDefaults} onOpenTransfer={()=>openTransfer("import")} onResetProgress={resetProgress} onDeleteAll={deleteEverything}/>}
    {tab==="transfer"&&<TransferPage key={transferTab+transferSelection.join()} items={items} selectedIds={transferSelection} initial={transferTab} onImport={importItems} onBack={()=>{setTab("library");window.scrollTo({top:0});}}/>}
    {tab==="streak"&&<StreakPage days={streakDays} reports={reportHistory} onBack={()=>setTab("home")} onQuiz={startReview}/> }
  </main>
  <nav className={styles.nav}><button className={tab==="home"?styles.active:""} onClick={()=>setTab("home")}><Home/><span>Home</span></button><button className={tab==="library"||tab==="transfer"?styles.active:""} onClick={()=>setTab("library")}><Library/><span>Questions</span></button><button className={styles.quizNav} onClick={startReview}><Play className={styles.plus} fill="currentColor"/><span>Quiz</span></button><button className={tab==="results"?styles.active:""} onClick={()=>setTab("results")}><History/><span>Report</span></button><button className={tab==="settings"?styles.active:""} onClick={()=>setTab("settings")}><Settings/><span>Settings</span></button></nav>
  </div>
}
