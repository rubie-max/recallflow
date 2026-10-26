import assert from 'node:assert/strict';
import {readSetups,writeSetups,validateSetups,setupKey} from './src/quiz-setups.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)};
const setup={id:'a',name:'Biology recall',controls:{mode:'all',count:7,subject:'Biology',topic:'Cells',types:['short_answer'],shuffle:true,focus:'weak'}};
const same=(a,b)=>assert.deepEqual(a.map(p=>({id:p.id,name:p.name,controls:{mode:p.controls.mode,count:p.controls.count,subject:p.controls.subject,topic:p.controls.topic,types:p.controls.types,shuffle:p.controls.shuffle,focus:p.controls.focus}})),b);
assert.deepEqual(readSetups(),[]);writeSetups([setup]);same(readSetups(),[setup]);assert.equal(readSetups()[0].controls.count,7);
assert.deepEqual([readSetups()[0].controls.subjects,readSetups()[0].controls.topics,readSetups()[0].controls.groups,readSetups()[0].controls.order],[['Biology'],['Cells'],['weak'],'shuffle']);
assert.throws(()=>validateSetups([setup,{...setup,id:'b',name:' BIOLOGY RECALL '}]));assert.throws(()=>validateSetups([{...setup,controls:{...setup.controls,count:-1}}]));assert.throws(()=>validateSetups([{...setup,controls:{...setup.controls,mode:'unknown'}}]));
writeSetups([{...setup,name:'Renamed',controls:{...setup.controls,shuffle:false}}]);assert.equal(readSetups()[0].name,'Renamed');assert.equal(readSetups()[0].controls.shuffle,false);
storage.set(setupKey,'invalid');assert.deepEqual(readSetups(),[]);assert.equal(storage.get(setupKey),'invalid');
console.log('PASS: named setup persistence, edits, duplicate names, invalid controls and damaged storage.');

const {validateBackup,restoreBackup}=await import('./src/learning-core.js');
const backup={app:'RecallFlow',version:1,questions:[],reports:[],streakDays:[],quizCount:0,preferences:{theme:'dark',voice:'af_heart',speed:1,quiz:{count:0,shuffle:true},quizSetups:[setup]}};
restoreBackup(validateBackup(backup,x=>x));same(readSetups(),[setup]);
assert.throws(()=>validateBackup({...backup,preferences:{...backup.preferences,quizSetups:[setup,setup]}},x=>x));
const legacy={...backup,preferences:{...backup.preferences}};delete legacy.preferences.quizSetups;assert.doesNotThrow(()=>validateBackup(legacy,x=>x));
console.log('PASS: setup backup/restore and legacy backup compatibility.');
