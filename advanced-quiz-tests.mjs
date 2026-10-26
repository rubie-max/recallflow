import assert from 'node:assert/strict';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const {filterQuiz,secondsPerQuestion,quizMinutes,itemMedia}=await import('./src/learning-core.js');
const {normalizeControls,validateSetups,writeSetups,readSetups,dropPicked,dropPickedFromSetups,prunePickedSetups,setupNameError,setupKey}=await import('./src/quiz-setups.js');

const today='2026-10-26';
const q=(id,o={})=>({id,prompt:id,answer:'a',type:'short_answer',subject:'Biology',topic:'Cells',due:'2026-10-20',attempts:1,...o});
const bank=[
  q('b1',{tags:['exam']}),
  q('b2',{topic:'Genetics',due:'2026-11-05',image:'https://example.com/x.png'}),
  q('h1',{subject:'History',topic:'Rome',tags:['exam','hard'],type:'single_choice',options:['a','b']}),
  q('h2',{subject:'History',topic:'Rome',due:'2026-12-01',audio:'https://example.com/a.mp3'}),
  q('m1',{subject:'Maths',topic:'Algebra',attempts:0,due:undefined}),
  q('m2',{subject:'Maths',topic:'Algebra',due:'2026-10-01',answerVideo:'https://example.com/v.mp4'}),
];
const r=(id,correct)=>({knowledge_id:id,correct,prompt:id,response_time_seconds:20});
const reports=[{id:'r2',questions:[r('h1',false),r('b1',true)]},{id:'r1',questions:[r('h1',false),r('m2',false),r('m2',true),r('m2',true),r('b2',true)]}];
const base={mode:'all',count:0,types:[],order:'bank'};
const ids=c=>filterQuiz(bank,reports,{...base,...c},today).map(x=>x.id);

// Old-style controls keep their meaning.
assert.deepEqual(ids({mode:'daily',subject:'',topic:'',shuffle:false,focus:'all',order:undefined}),['m1','m2','b1','h1']);
assert.deepEqual(ids({focus:'weak',subject:'',topic:'',shuffle:false,order:undefined}),['h1','m2']);
assert.deepEqual(ids({focus:'mistakes',subject:'',topic:'',shuffle:false,order:undefined}),['h1']);
assert.deepEqual(ids({subject:'History',topic:'',focus:'all',shuffle:false}),['h1','h2']);
console.log('PASS: old controls (daily, weak, single subject) behave as before.');

// Several choices in one filter = any; different filters = all.
assert.deepEqual(ids({subjects:['Biology','Maths']}),['b1','b2','m1','m2']);
assert.deepEqual(ids({subjects:['Biology','History'],tags:['exam']}),['b1','h1']);
assert.deepEqual(ids({topics:['Rome','Genetics']}),['b2','h1','h2']);
assert.deepEqual(ids({types:['single_choice']}),['h1']);
assert.deepEqual(ids({media:['picture','sound']}),['b2','h2']);
assert.deepEqual(ids({media:['video']}),['m2']);
assert.deepEqual([...itemMedia(bank[0])],[]);
console.log('PASS: subjects, topics, tags, types and media combine as any-within, all-across.');

// New, Weak and Mistakes add together; Due narrows them.
assert.deepEqual(ids({groups:['new']}),['m1']);
assert.deepEqual(ids({groups:['weak']}),['h1','m2']);
assert.deepEqual(ids({groups:['mistakes']}),['h1']);
assert.deepEqual(ids({groups:['new','mistakes']}),['h1','m1']);
assert.deepEqual(ids({mode:'daily',groups:['weak'],subjects:['History','Maths'],media:['video']}),['m2']);
assert.deepEqual(ids({mode:'daily',groups:['new','weak']}),['h1','m1','m2']);
assert.deepEqual(ids({mode:'daily',subjects:['History']}),['h1']);
assert.deepEqual(ids({mode:'daily',groups:[]}),['b1','h1','m1','m2']);
console.log('PASS: New / Weak / Mistakes combine, and Due keeps only questions due now.');

// Picked questions: added on top of the filters, or the whole quiz.
assert.deepEqual(ids({subjects:['Maths'],picked:['h2']}),['h2','m1','m2']);
assert.deepEqual(ids({subjects:['Maths'],picked:['h2'],count:2}),['h2','m1']);
assert.deepEqual(ids({mode:'daily',subjects:['Maths'],picked:['h2'],pickedMode:'only'}),['h2']);
assert.deepEqual(ids({picked:['gone'],pickedMode:'only',subjects:['Maths']}),['m1','m2']);
console.log('PASS: picked questions are added or used alone, and missing picks fall back to filters.');

// Order.
assert.deepEqual(ids({order:'due',subjects:['Maths','Biology']}),['m1','m2','b1','b2']);
let seed=1;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
const shuffled=filterQuiz(bank,reports,{...base,order:'shuffle'},today,random).map(x=>x.id);
assert.deepEqual([...shuffled].sort(),bank.map(x=>x.id).sort());assert.notDeepEqual(shuffled,bank.map(x=>x.id));
console.log('PASS: oldest-due, bank and shuffle orders.');

// Time estimate.
assert.equal(secondsPerQuestion([]),30);assert.equal(secondsPerQuestion(reports),20);assert.equal(quizMinutes(9,reports),3);assert.equal(quizMinutes(1,[]),1);
console.log('PASS: time estimate uses the median answer time, or 30 seconds with no history.');

// Setups: old ones convert; new ones keep the old fields for older app versions.
const old=normalizeControls({mode:'daily',count:10,subject:'Biology',topic:'',types:[],shuffle:true,focus:'weak'});
assert.deepEqual([old.groups,old.subjects,old.topics,old.order,old.pickedMode,old.picked],[['weak'],['Biology'],[],'shuffle','add',[]]);
const fresh=normalizeControls({mode:'all',count:0,types:[],groups:['weak','mistakes'],subjects:['History','Maths'],topics:[],order:'bank'});
assert.deepEqual([fresh.focus,fresh.subject,fresh.shuffle,fresh.mode],['all','History',false,'all']);
assert.equal(normalizeControls({mode:'all',count:0,types:[],groups:['mistakes']}).focus,'mistakes');
assert.throws(()=>normalizeControls({mode:'all',count:0,groups:['bogus']}));
assert.throws(()=>normalizeControls({mode:'all',count:0,media:['smell']}));
assert.throws(()=>normalizeControls({mode:'all',count:0,order:'random'}));
assert.throws(()=>normalizeControls({mode:'all',count:0,pickedMode:'some'}));
assert.throws(()=>normalizeControls({mode:'all',count:0,tags:'exam'}));
console.log('PASS: old setups convert, new setups keep old fields, bad values are rejected.');

// Names, rename and delete.
const setups=validateSetups([{id:'a',name:'Biology · exam',controls:{mode:'daily',count:10,types:[],subjects:['Biology'],picked:['b1','h2'],pickedMode:'only'}},{id:'b',name:'Hard ones',controls:{mode:'all',count:0,types:[],picked:['h2']}}]);
assert.equal(setupNameError(setups,'  '),'Give it a name.');
assert.equal(setupNameError(setups,'hard ONES'),'You already have a setup with this name.');
assert.equal(setupNameError(setups,'Hard ones','b'),'');
assert.equal(setupNameError(setups,'x'.repeat(51)),'Use 50 characters or fewer.');
writeSetups(setups);
writeSetups(readSetups().map(p=>p.id==='b'?{...p,name:'Tough ones'}:p));assert.deepEqual(readSetups().map(p=>p.name),['Biology · exam','Tough ones']);
writeSetups(readSetups().filter(p=>p.id!=='b'));assert.deepEqual(readSetups().map(p=>p.id),['a']);
writeSetups(setups);
console.log('PASS: duplicate and empty names are caught; rename and delete persist.');

// Deleted questions leave saved setups.
assert.equal(dropPickedFromSetups([]),0);
assert.equal(dropPickedFromSetups(['nothing']),0);
assert.equal(dropPickedFromSetups(['h2']),2);
let saved=readSetups();assert.deepEqual(saved[0].controls.picked,['b1']);assert.equal(saved[0].controls.pickedMode,'only');assert.deepEqual(saved[1].controls.picked,[]);
dropPickedFromSetups(['b1']);saved=readSetups();assert.deepEqual(saved[0].controls.picked,[]);assert.equal(saved[0].controls.pickedMode,'add');
assert.equal(dropPicked(setups,()=>false).changed,0);
assert.equal(prunePickedSetups(setups,[]).changed,0);
const pruned=prunePickedSetups(setups,[{id:'b1'}]);assert.equal(pruned.changed,2);assert.deepEqual(pruned.setups[0].controls.picked,['b1']);assert.deepEqual(pruned.setups[1].controls.picked,[]);
assert.equal(prunePickedSetups(setups,[{id:'b1'}],['h2']).changed,0);
storage.set(setupKey,'broken');assert.equal(dropPickedFromSetups(['b1']),0);assert.equal(storage.get(setupKey),'broken');
console.log('PASS: deleted questions are removed from setups, "only these" falls back, and an empty bank wipes nothing.');
