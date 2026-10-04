import assert from 'node:assert/strict';
import {validateQuestion,gradeQuestion} from './src/question-types.js';
const base={type:'fill_blank_options',prompt:'Water freezes at ___ and boils at ___.',blanks:['0','100'],options:['0','25','100']};
const item=validateQuestion(base);assert.equal(item.answer,'0; 100');assert.equal(gradeQuestion(item,['0','100']),true);assert.equal(gradeQuestion(item,['100','0']),false);assert.equal(gradeQuestion(item,['0']),false);
assert.throws(()=>validateQuestion({...base,options:['0','25']}));assert.throws(()=>validateQuestion({...base,options:['0','0','100']}));assert.throws(()=>validateQuestion({...base,blanks:['0']}));
const repeated=validateQuestion({...base,blanks:['0','0']});assert.equal(gradeQuestion(repeated,['0','0']),true);
const single=validateQuestion({...base,prompt:'Capital of France: ___',blanks:['Paris'],options:['Paris','Rome']});assert.equal(gradeQuestion(single,['Paris']),true);
console.log('PASS: word-bank single/multiple gaps, ordered grading, repeated choices and validation.');
