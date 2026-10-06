import assert from 'node:assert/strict';
import {validateQuestion,gradeQuestion,imageSafe} from './src/question-types.js';
import {resolveVariant,itemTypes,seededShuffle,draftFromSpec,specFromDraft,emptyDraft} from './src/question-variants.js';
import {filterQuiz} from './src/learning-core.js';
import {serialize,parseImport,detectFormat,parseCSV,csvTemplate} from './src/transfer-formats.js';

// Multi-type questions
const multi=validateQuestion({id:'q1',subject:'Chem',topic:'Symbols',type:'single_choice',prompt:'Symbol for sodium?',answer:'Na',options:['Na','So','Sd'],typeMode:'random',variants:[
  {type:'short_answer',prompt:'',answer:'Na'},
  {type:'matching',prompt:'Match each element to its symbol.',pairs:[{left:'Sodium',right:'Na'},{left:'Iron',right:'Fe'}]},
]});
assert.equal(multi.variants.length,2);
assert.equal(multi.variants[0].prompt,'Symbol for sodium?','empty variant prompts fall back to the main prompt');
assert.equal(multi.variants[1].answer,'Sodium → Na; Iron → Fe');
assert.deepEqual(itemTypes(multi),['single_choice','short_answer','matching']);
assert.throws(()=>validateQuestion({...multi,variants:[{type:'matching',pairs:[{left:'a',right:'b'}]}]}),/Matching \(type 2\)/);
assert.throws(()=>validateQuestion({...multi,variants:Array(6).fill({type:'short_answer',answer:'Na'})}),/up to 5/);
assert.equal(validateQuestion({...multi,variants:[]}).variants,undefined);

const asMatching=resolveVariant(multi,[],()=>.99);
assert.equal(asMatching.type,'matching');assert.equal(asMatching.id,'q1');assert.equal(asMatching.options,undefined,'main type fields are cleared');assert.equal(asMatching.subject,'Chem');
assert.equal(gradeQuestion(asMatching,['Na','Fe']),true);
assert.equal(resolveVariant(multi,[],()=>0).type,'single_choice');
assert.equal(resolveVariant(multi,['short_answer'],()=>.99).type,'short_answer','quiz type filters pick a matching variant');
assert.equal(resolveVariant({...multi,typeMode:'primary'},[],()=>.99).type,'single_choice');
assert.equal(resolveVariant({...multi,typeMode:'primary'},['matching'],()=>0).type,'matching','a filter overrides always-first');
assert.equal(resolveVariant({id:'x',type:'flashcard',prompt:'p',answer:'a'}).type,'flashcard');

const bank=[multi,{id:'q2',subject:'Chem',topic:'Symbols',type:'flashcard',prompt:'Fe?',answer:'Iron'}];
assert.deepEqual(filterQuiz(bank,[],{mode:'all',types:['matching'],focus:'all'}).map(x=>x.id),['q1']);
assert.deepEqual(filterQuiz(bank,[],{mode:'all',types:['flashcard'],focus:'all'}).map(x=>x.id),['q2']);

// Editor drafts round-trip
for(const v of [multi,...multi.variants]){const back=validateQuestion({...specFromDraft(draftFromSpec(v)),prompt:v.prompt||multi.prompt});assert.equal(back.answer,v.answer);assert.equal(back.type,v.type);}
assert.equal(emptyDraft('true_false').answer,'True');

// Seeded shuffle is stable and never returns the original order
const steps=['a','b','c','d'];
assert.deepEqual(seededShuffle(steps,'s1'),seededShuffle(steps,'s1'));
for(const seed of ['1','2','3','x','y','z'])assert.notDeepEqual(seededShuffle(steps,seed),steps);
assert.deepEqual([...seededShuffle(steps,'s1')].sort(),steps);
assert.deepEqual(seededShuffle(['only'],'s'),['only']);

// Image links
assert.equal(imageSafe('https://example.com/a.png'),true);
assert.equal(imageSafe('http://example.com/a.png'),false);
assert.equal(imageSafe('javascript:alert(1)'),false);
assert.equal(imageSafe('https://example.com/"onerror="x'),false);
assert.equal(validateQuestion({type:'short_answer',prompt:'Shape?',answer:'Circle',image:'https://example.com/c.webp'}).image,'https://example.com/c.webp');

// Pictures on matching sides, ordering steps and word-bank words are kept only for text that still exists
const pic='https://example.com/p.png';
assert.deepEqual(Object.keys(specFromDraft({type:'matching',prompt:'p',structured:'Japan | Tokyo\nFrance|Paris',optionImages:{Japan:pic,' Tokyo':pic,Spain:pic}}).optionImages).sort(),['Japan','Tokyo']);
assert.deepEqual(Object.keys(specFromDraft({type:'ordering',prompt:'p',structured:'Egg\nLarva',optionImages:{Egg:pic,Moth:pic}}).optionImages),['Egg']);
assert.deepEqual(Object.keys(specFromDraft({type:'fill_blank_options',prompt:'A ___',structured:'cat',options:'cat\ndog',optionImages:{dog:pic}}).optionImages),['dog']);
assert.equal(specFromDraft({type:'short_answer',prompt:'p',answer:'a',optionImages:{a:pic}}).optionImages,undefined);
const pictured=validateQuestion({...specFromDraft({type:'ordering',prompt:'p',structured:'Egg\nLarva',optionImages:{Egg:pic}})});
assert.equal(draftFromSpec(pictured).optionImages.Egg,pic,'step pictures survive editing again');

// Import & export formats
const items=[multi,validateQuestion({id:'q3',subject:'Geo',topic:'Caps',type:'multi_select',prompt:'Pick "primes", please',options:['2','3','4'],correctAnswers:['2','3'],tags:['math']}),validateQuestion({id:'q4',subject:'Geo',topic:'Steps',type:'ordering',prompt:'Order',sequence:['One','Two, then','Three']})];
const json=serialize(items,'json',{images:false,progress:false});
assert.equal(parseImport(json).records.length,3);assert.equal(parseImport(json).records[0].variants.length,2);
const csv=serialize(items,'csv');
const fromCsv=parseImport(csv,'auto','x.csv').records.map(r=>validateQuestion(r));
assert.deepEqual(fromCsv.map(x=>x.type),['single_choice','multi_select','ordering']);
assert.deepEqual(fromCsv[1].correctAnswers,['2','3']);assert.equal(fromCsv[1].prompt,'Pick "primes", please');assert.deepEqual(fromCsv[2].sequence,['One','Two, then','Three']);
assert.equal(parseImport(csvTemplate,'csv').records.map(r=>validateQuestion(r)).length,4);
assert.deepEqual(parseCSV('a,"b\nc",d\r\n1,2,3'),[['a','b\nc','d'],['1','2','3']]);
const tsv=serialize(items,'tsv');assert.equal(detectFormat(tsv),'tsv');assert.equal(parseImport(tsv).records[0].answer,'Na');
const lines=parseImport('Capital of France? | Paris\nLargest planet :: Jupiter\n# comment\n','auto');
assert.equal(lines.format,'lines');assert.deepEqual(lines.records.map(r=>r.answer),['Paris','Jupiter']);
assert.match(serialize(items,'text'),/\*\*Answer:\*\* Na[\s\S]*Also asked as: Type answer, Matching/);
assert.throws(()=>parseImport('{"nope":1}'),/no questions/);
assert.throws(()=>parseImport('subject,answer\nA,B','csv'),/prompt/);

console.log('PASS: multi-type validation, variant selection and filters, draft round-trip, seeded shuffle, image links, item pictures, and CSV/JSON/TSV/text import-export.');
