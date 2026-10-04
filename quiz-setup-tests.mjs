import assert from 'node:assert/strict';
import {readSetups,writeSetups,validateSetups,setupKey} from './src/quiz-setups.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const setup={id:'a',name:'Biology recall',controls:{mode:'all',count:7,subject:'Biology',topic:'Cells',types:['short_answer'],shuffle:true,focus:'weak'}};
assert.deepEqual(readSetups(),[]);writeSetups([setup]);assert.deepEqual(readSetups(),[setup]);assert.equal(readSetups()[0].controls.count,7);
assert.throws(()=>validateSetups([setup,{...setup,id:'b',name:' BIOLOGY RECALL '}]));assert.throws(()=>validateSetups([{...setup,controls:{...setup.controls,count:-1}}]));assert.throws(()=>validateSetups([{...setup,controls:{...setup.controls,mode:'unknown'}}]));
writeSetups([{...setup,name:'Renamed',controls:{...setup.controls,shuffle:false}}]);assert.equal(readSetups()[0].name,'Renamed');assert.equal(readSetups()[0].controls.shuffle,false);
storage.set(setupKey,'invalid');assert.deepEqual(readSetups(),[]);assert.equal(storage.get(setupKey),'invalid');
console.log('PASS: named setup persistence, edits, duplicate names, invalid controls and damaged storage.');

const {validateBackup,restoreBackup}=await import('./src/learning-core.js');
const backup={app:'RecallFlow',version:1,questions:[],reports:[],streakDays:[],quizCount:0,preferences:{theme:'dark',voice:'af_heart',speed:1,quiz:{count:0,shuffle:true},quizSetups:[setup]}};
restoreBackup(validateBackup(backup,x=>x));assert.deepEqual(readSetups(),[setup]);
assert.throws(()=>validateBackup({...backup,preferences:{...backup.preferences,quizSetups:[setup,setup]}},x=>x));
const legacy={...backup,preferences:{...backup.preferences}};delete legacy.preferences.quizSetups;assert.doesNotThrow(()=>validateBackup(legacy,x=>x));
console.log('PASS: setup backup/restore and legacy backup compatibility.');
