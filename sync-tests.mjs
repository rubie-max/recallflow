import assert from 'node:assert/strict';
import {mergeLists,mergeState,baseOf,normalizeState,sealVault,openVault,PREF_KEYS} from './src/sync.js';
const q=(id,text='Q '+id)=>({id,type:'short',question:text,answer:'A'});
const prefs=(over={})=>Object.fromEntries(PREF_KEYS.map(k=>[k,over[k]??null]));
const state=(items,over={})=>normalizeState({items,reports:[],streakDays:[],quizCount:0,prefs:prefs(),...over});
const ids=list=>list.map(x=>x.id);

const base=baseOf(state([q('a'),q('b'),q('c')]));
// Edits on different devices both survive; a local edit wins over an untouched remote copy.
let m=mergeLists(base.items,[q('a','edited here'),q('b'),q('c')],[q('a'),q('b','edited there'),q('c')]);
assert.deepEqual(m.map(x=>x.question),['edited here','edited there','Q c']);
// New questions from both sides are kept, remote order first, local additions after.
m=mergeLists(base.items,[q('a'),q('b'),q('c'),q('local')],[q('a'),q('b'),q('c'),q('remote')]);
assert.deepEqual(ids(m),['a','b','c','remote','local']);
// Deletions spread unless the other side edited the question meanwhile.
m=mergeLists(base.items,[q('a'),q('c')],[q('a'),q('b'),q('c','edited there')]);
assert.deepEqual(ids(m),['a','c']);
m=mergeLists(base.items,[q('a'),q('b','edited here'),q('c')],[q('a'),q('c')]);
assert.deepEqual(ids(m),['a','b','c']);
// Deleting everything on one device empties the others.
assert.deepEqual(mergeLists(base.items,[],[q('a'),q('b'),q('c')]),[]);

// First sync on a new device: cloud data plus local questions, without the starter examples.
let s=mergeState(null,state([q('demo_short'),q('mine')],{quizCount:2,streakDays:['2026-10-05'],reports:[{id:'r_5'}]}),state([q('a')],{quizCount:7,streakDays:['2026-10-04'],reports:[{id:'r_9'}],prefs:prefs({recallflow_theme:'dark'})}));
assert.deepEqual(ids(s.items),['a','mine']);
assert.equal(s.quizCount,9);
assert.deepEqual(s.streakDays,['2026-10-04','2026-10-05']);
assert.deepEqual(s.reports.map(r=>r.id),['r_9','r_5']);
assert.equal(s.prefs.recallflow_theme,'dark');

// Later syncs: counts add up, reports stay newest first, changed settings win per key.
const b2=baseOf(state([q('a')],{quizCount:10,reports:[{id:'r_1'}],streakDays:['2026-10-01'],prefs:prefs({recallflow_theme:'light',recallflow_speech_engine:'system'})}));
s=mergeState(b2,
  state([q('a')],{quizCount:12,reports:[{id:'r_3'},{id:'r_1'}],streakDays:['2026-10-01','2026-10-03'],prefs:prefs({recallflow_theme:'dark',recallflow_speech_engine:'system'})}),
  state([q('a')],{quizCount:11,reports:[{id:'r_2'},{id:'r_1'}],streakDays:['2026-10-01','2026-10-02'],prefs:prefs({recallflow_theme:'light',recallflow_speech_engine:'kokoro'})}));
assert.equal(s.quizCount,13);
assert.deepEqual(s.reports.map(r=>r.id),['r_3','r_2','r_1']);
assert.deepEqual(s.streakDays,['2026-10-01','2026-10-02','2026-10-03']);
assert.equal(s.prefs.recallflow_theme,'dark');
assert.equal(s.prefs.recallflow_speech_engine,'kokoro');
// Resetting progress on one device clears reports there and everywhere.
s=mergeState(b2,state([q('a')],{quizCount:0,prefs:b2.prefs}),state([q('a')],{quizCount:10,reports:[{id:'r_1'}],streakDays:['2026-10-01'],prefs:b2.prefs}));
assert.deepEqual([s.reports,s.streakDays,s.quizCount],[[],[],0]);

// The vault opens only with the right login (fewer rounds keep the test quick).
const vault=await sealVault('Kaizen','pass-123',{token:'t',owner:'o',repo:'r'},1000);
assert.deepEqual(await openVault(vault,' kaizen ','pass-123'),{token:'t',owner:'o',repo:'r'});
await assert.rejects(openVault(vault,'Kaizen','wrong'),/Wrong username or password/);
console.log('PASS: three-way merge of questions, deletions, first sync, counts, reports, streaks, settings and the login vault.');
