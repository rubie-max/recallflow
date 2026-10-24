import assert from 'node:assert/strict';
import {validateQuestion,gradeQuestion,answerText,describeAnswer,listMatches,toggleMark,passageWords,audioSafe} from './src/question-types.js';
import {specFromDraft,draftFromSpec,emptyDraft,resolveVariant} from './src/question-variants.js';
import {validateBackup} from './src/learning-core.js';

const list=validateQuestion({type:'list_recall',prompt:'Name the primary colours.',listItems:['Red','Blue','Yellow|Yelow'],fuzzy:true});
assert.equal(list.answer,'Red; Blue; Yellow');
assert.equal(gradeQuestion(list,['blue','RED','yelow']),true);
assert.equal(gradeQuestion(list,['blue','blue','red']),false,'a repeated answer counts once');
assert.deepEqual(listMatches(list,['blue','blue','green']),[1,-1,-1]);
const anyTwo=validateQuestion({type:'list_recall',prompt:'Name two.',listItems:['Red','Blue','Yellow'],listCount:2});
assert.equal(gradeQuestion(anyTwo,['yellow','red']),true);assert.match(answerText(anyTwo),/^Any 2 of/);
assert.equal(validateQuestion({type:'list_recall',prompt:'All.',listItems:['A','B'],listCount:2}).listCount,undefined);
assert.throws(()=>validateQuestion({type:'list_recall',prompt:'x',listItems:['A','a']}),/different/);
assert.throws(()=>validateQuestion({type:'list_recall',prompt:'x',listItems:['A','B'],listCount:3}),/how many/);

const sort=validateQuestion({type:'categorize',prompt:'Sort.',groups:[{name:'Fruit',items:['Apple','Pear']},{name:'Veg',items:['Carrot']}]});
assert.equal(gradeQuestion(sort,{Apple:'Fruit',Pear:'Fruit',Carrot:'Veg'}),true);
assert.equal(gradeQuestion(sort,{Apple:'Veg',Pear:'Fruit',Carrot:'Veg'}),false);
assert.equal(describeAnswer(sort,{Apple:'Veg',Pear:'Fruit',Carrot:'Veg'}),'Fruit: Pear; Veg: Apple, Carrot');
assert.throws(()=>validateQuestion({type:'categorize',prompt:'x',groups:[{name:'A',items:['1']}]}),/two to six/);
assert.throws(()=>validateQuestion({type:'categorize',prompt:'x',groups:[{name:'A',items:['1']},{name:'B',items:['1']}]}),/one group/);

let passage='The cat sat on the mat and slept.';passage=toggleMark(toggleMark(passage,2),7);
assert.equal(passage,'The cat *sat* on the mat and *slept*.');
const words=validateQuestion({type:'highlight',prompt:'Tap every verb.',passage});
assert.equal(words.answer,'sat, slept');assert.equal(gradeQuestion(words,[7,2]),true);assert.equal(gradeQuestion(words,[2]),false);assert.equal(gradeQuestion(words,[2,7,1]),false);
assert.equal(passageWords('Hello, world!').map(w=>w.word).join('|'),'Hello|world');
assert.throws(()=>validateQuestion({type:'highlight',prompt:'',passage}),/question/);
assert.throws(()=>validateQuestion({type:'highlight',prompt:'',passage,image:'https://example.com/a.png'}),/instruction/);
assert.throws(()=>validateQuestion({type:'highlight',prompt:'x',passage:'*all* *marked*'}),/unmarked/);

const tap=validateQuestion({type:'image_tap',prompt:'Tap the sun.',image:'https://example.com/sky.png',hotspot:{x:.5,y:.5,r:.1,aspect:.5}});
assert.equal(tap.answer,'The marked spot');
assert.equal(gradeQuestion(tap,{x:.55,y:.55}),true);assert.equal(gradeQuestion(tap,{x:.5,y:.8}),false);assert.equal(gradeQuestion(tap,null),false);
assert.throws(()=>validateQuestion({type:'image_tap',prompt:'x',hotspot:{x:.5,y:.5,r:.1,aspect:1}}),/picture/);
assert.equal(tap.hotspot,undefined,'an old single hotspot is saved as a spot');assert.equal(tap.spots.length,1);
const map={type:'image_tap',prompt:'Find these states.',image:'https://example.com/us.png',spots:[{label:'Texas',x:.45,y:.75,r:.08,aspect:.6},{label:'Ohio',x:.72,y:.4,r:.05,aspect:.6}]};
const find=validateQuestion(map);
assert.equal(find.answer,'Texas; Ohio');assert.equal(find.tapMode,undefined);
assert.equal(gradeQuestion(find,[{x:.46,y:.76},{x:.72,y:.41}]),true);
assert.equal(gradeQuestion(find,[{x:.46,y:.76},{x:.2,y:.2}]),false);
assert.match(describeAnswer(find,[{x:.46,y:.76},{x:.2,y:.2}]),/Found 1 of 2 · missed Ohio/);
const named=validateQuestion({...map,tapMode:'name'});
assert.equal(gradeQuestion(named,['texas','Ohio']),true);assert.equal(gradeQuestion(named,['Ohio','Texas']),false);
assert.throws(()=>validateQuestion({...map,spots:[{...map.spots[0],label:''},map.spots[1]]}),/Name every place/);
assert.throws(()=>validateQuestion({...map,spots:[map.spots[0],{...map.spots[1],label:'texas'}]}),/different name/);
assert.throws(()=>validateQuestion({...map,tapMode:'name',spots:[map.spots[0]]}),/at least two/);

const blanks=validateQuestion(specFromDraft({...emptyDraft('fill_blank','___ is the capital of ___.'),structured:'Paris\nFrance|French Republic'}));
assert.deepEqual(blanks.blanks,['Paris','France|French Republic']);assert.equal(blanks.answer,'Paris; France');
assert.equal(gradeQuestion(blanks,['paris','French Republic']),true);assert.equal(gradeQuestion(blanks,['Paris','Spain']),false);
assert.equal(validateQuestion({type:'fill_blank',prompt:'Sky is ___.',answer:'blue',blanks:['x']}).blanks,undefined,'one blank keeps the plain answer');
assert.throws(()=>validateQuestion(specFromDraft({...emptyDraft('fill_blank','___ and ___'),structured:'A'})),/every blank/);
assert.equal(draftFromSpec(blanks).answer,'');

const bank=validateQuestion(specFromDraft({...emptyDraft('fill_blank_options','The ___ sat.'),structured:'cat',options:'dog\nhat'}));
assert.deepEqual(bank.options,['cat','dog','hat'],'blank answers join the word bank');
assert.equal(draftFromSpec(bank).options,'dog\nhat','the editor shows only the extra words');
assert.throws(()=>validateQuestion(specFromDraft({...emptyDraft('fill_blank_options','The ___ sat.'),structured:'cat'})),/extra word/);

const sound='data:audio/webm;base64,AAAA';
const withMedia=validateQuestion(specFromDraft({...emptyDraft('single_choice','Which is a cat?'),options:'Cat\nDog',answer:'Cat',optionMedia:{Cat:{audio:sound},Dog:{},Gone:{audio:sound}}}));
assert.deepEqual(withMedia.optionMedia,{Cat:{audio:sound}},'only current items with media are kept');
assert.throws(()=>validateQuestion({type:'single_choice',prompt:'x',options:['A','B'],answer:'A',optionMedia:{A:{audio:'javascript:x'}}}),/answer sound or video/);
const sortMedia=specFromDraft({...emptyDraft('categorize','Sort.'),groups:[{name:'Fruit',items:'Apple'},{name:'Veg',items:'Carrot'}],optionImages:{Apple:'https://example.com/a.png',Pear:'https://example.com/p.png'}});
assert.deepEqual(sortMedia.optionImages,{Apple:'https://example.com/a.png'},'group items can have pictures');

const slider=validateQuestion(specFromDraft({...emptyDraft('slider','When did WW2 end?'),sliderMin:'1900',sliderMax:'2000',answer:'1945',numericTolerance:'2',unit:'AD'}));
assert.equal(slider.sliderMin,1900);assert.equal(gradeQuestion(slider,1947),true);assert.equal(gradeQuestion(slider,1948),false);
assert.equal(answerText(slider),'1945 AD (± 2)');
assert.throws(()=>validateQuestion({type:'slider',prompt:'x',sliderMin:'0',sliderMax:'10',answer:'11'}),/between/);

for(const item of [list,anyTwo,sort,words,tap,find,named,blanks,bank,withMedia,slider]){
  const again=validateQuestion({...specFromDraft(draftFromSpec(item)),image:item.image});
  for(const key of ['type','answer','options','blanks','optionMedia','listItems','listCount','groups','passage','spots','tapMode','sliderMin','sliderMax','sliderStep','numericTolerance','unit'])assert.deepEqual(again[key],item[key],`${item.type} keeps ${key} through the editor`);
}

const mixed=validateQuestion({type:'short_answer',prompt:'Capital of France?',answer:'Paris',variants:[{type:'list_recall',prompt:'Name two French cities.',listItems:['Paris','Lyon','Nice'],listCount:2}]});
const asList=resolveVariant(mixed,['list_recall']);
assert.equal(asList.type,'list_recall');assert.equal(gradeQuestion(asList,['nice','paris']),true);
assert.equal(resolveVariant(mixed,['short_answer']).listItems,undefined,'other types do not carry list fields');

assert.equal(audioSafe('data:audio/webm;codecs=opus;base64,AAAA'),true);
assert.equal(audioSafe('data:audio/mpeg;base64,'+'A'.repeat(800000)),false);
assert.equal(audioSafe('data:text/html;base64,AAAA'),false);
const withSound=validateQuestion({type:'short_answer',prompt:'Who is speaking?',answer:'Me',audio:'data:audio/mp4;base64,AAAA'});
assert.equal(withSound.audio,'data:audio/mp4;base64,AAAA');
assert.throws(()=>validateQuestion({type:'short_answer',prompt:'x',answer:'y',audio:'javascript:alert(1)'}),/sound/);

const backup={app:'RecallFlow',version:1,questions:[{...list,id:'a'},{...sort,id:'b'},{...withSound,id:'c'}],reports:[],streakDays:[],quizCount:0,preferences:{theme:'dark',voice:'af_heart',speed:1,quiz:{count:0,shuffle:true}}};
assert.equal(validateBackup(backup,validateQuestion).questions.length,3,'backups with the new types and sounds restore');
console.log('PASS: list recall, sort into groups, highlight words, tap the picture, slider estimates, question sounds, editor round trips, variants and backups.');
