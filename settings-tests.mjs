import assert from 'node:assert/strict';
import {prepareQuiz,validateQuizPreferences,quizPreferences,saveQuizPreferences} from './src/quiz-preferences.js';
const stored=new Map();globalThis.localStorage={getItem:key=>stored.get(key)??null,setItem:(key,value)=>stored.set(key,value)};
const items=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}];
assert.deepEqual(prepareQuiz(items,{count:0,shuffle:false}),items);
assert.deepEqual(prepareQuiz(items,{count:2,shuffle:false}),items.slice(0,2));
assert.equal(prepareQuiz(items,{count:100,shuffle:false}).length,4);
const shuffled=prepareQuiz(items,{count:0,shuffle:true},()=>0);
assert.notDeepEqual(shuffled,items);assert.deepEqual(new Set(shuffled),new Set(items));assert.deepEqual(items.map(x=>x.id),['a','b','c','d']);
for(const count of [-1,1.5,1001,NaN,Infinity,'2'])assert.throws(()=>validateQuizPreferences({count,shuffle:false}));
assert.deepEqual(quizPreferences(),{count:0,shuffle:true});saveQuizPreferences({count:2,shuffle:true});assert.deepEqual(quizPreferences(),{count:2,shuffle:true});
stored.set('recallflow_quiz_preferences_v1','invalid');assert.deepEqual(quizPreferences(),{count:0,shuffle:true});
console.log('PASS: saved quiz defaults, count limits, shuffle permutation, bank preservation, validation and damaged preferences.');

stored.delete('recallflow_quiz_shuffle_default_v2');stored.set('recallflow_quiz_preferences_v1',JSON.stringify({count:7,shuffle:false}));assert.deepEqual(quizPreferences(),{count:7,shuffle:true});saveQuizPreferences({count:7,shuffle:false});assert.deepEqual(quizPreferences(),{count:7,shuffle:false});
