import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reminderDue,cleanReminderSettings,validReminderTime,reminderDaysLabel,formatReminderTime,msUntilNextReminder,reminderMessage,WEEKDAYS} from './src/reminders.js';
import {validateAppPreferences,appDefaults} from './src/app-preferences.js';
import {removeWithPositions,restoreRemoved} from './src/undo-delete.js';

// 19:30 IST on Monday 26 Oct 2026 is 14:00 UTC.
const at=(utc)=>new Date(utc);
const mon1930=at('2026-10-26T14:00:00Z'),mon1830=at('2026-10-26T13:00:00Z'),sun2000=at('2026-10-25T14:30:00Z');
const on={reminder:true,reminderTime:'19:00',reminderDays:[0,1,2,3,4,5,6],reminderOnlyDue:true,reminderSkipDone:true};

assert.equal(reminderDue({now:mon1930,settings:on,dueCount:4}),true);
assert.equal(reminderDue({now:mon1830,settings:on,dueCount:4}),false,'before the chosen time');
assert.equal(reminderDue({now:mon1930,settings:{...on,reminder:false},dueCount:4}),false,'switched off');
assert.equal(reminderDue({now:mon1930,settings:on,dueCount:0}),false,'nothing due');
assert.equal(reminderDue({now:mon1930,settings:{...on,reminderOnlyDue:false},dueCount:0}),true,'remind even when nothing is due');
assert.equal(reminderDue({now:mon1930,settings:on,dueCount:4,lastShown:'2026-10-26'}),false,'once a day');
assert.equal(reminderDue({now:mon1930,settings:on,dueCount:4,lastShown:'2026-10-25'}),true);
assert.equal(reminderDue({now:mon1930,settings:on,dueCount:4,practisedDay:'2026-10-26'}),false,'already practised');
assert.equal(reminderDue({now:mon1930,settings:{...on,reminderSkipDone:false},dueCount:4,practisedDay:'2026-10-26'}),true);
assert.equal(reminderDue({now:sun2000,settings:{...on,reminderDays:WEEKDAYS},dueCount:4}),false,'weekdays only');
assert.equal(reminderDue({now:mon1930,settings:{...on,reminderDays:WEEKDAYS},dueCount:4}),true);
assert.equal(reminderDue({now:mon1930,settings:{...on,reminderDays:[]},dueCount:4}),false,'no days picked');
// 00:10 IST Tuesday is still Monday in UTC; the IST day decides.
assert.equal(reminderDue({now:at('2026-10-26T18:40:00Z'),settings:{...on,reminderTime:'00:05',reminderDays:[2]},dueCount:1}),true);

assert.equal(validReminderTime('07:05'),true);
for(const bad of ['7:05','24:00','12:60','','noon',null])assert.equal(validReminderTime(bad),false);
assert.deepEqual(cleanReminderSettings({reminder:'yes',reminderTime:'25:00',reminderDays:[5,'1',1,9,-1,2.5],reminderOnlyDue:0}),{reminder:false,reminderTime:'19:00',reminderDays:[1,5],reminderOnlyDue:true,reminderSkipDone:true});
assert.deepEqual(cleanReminderSettings({reminderDays:'mon'}).reminderDays,[0,1,2,3,4,5,6]);
assert.deepEqual(cleanReminderSettings({reminderOnlyDue:false,reminderSkipDone:false}),{reminder:false,reminderTime:'19:00',reminderDays:[0,1,2,3,4,5,6],reminderOnlyDue:false,reminderSkipDone:false});

assert.equal(reminderDaysLabel([0,1,2,3,4,5,6]),'every day');
assert.equal(reminderDaysLabel([5,4,3,2,1]),'weekdays');
assert.equal(reminderDaysLabel([6,0]),'weekends');
assert.equal(reminderDaysLabel([1,3]),'Mon, Wed');
assert.equal(formatReminderTime('00:05'),'12:05 am');
assert.equal(formatReminderTime('12:00'),'12:00 pm');
assert.equal(formatReminderTime('19:30'),'7:30 pm');
assert.equal(reminderMessage(1).title,'1 question due');
assert.equal(reminderMessage(3).title,'3 questions due');
assert.equal(reminderMessage(0).title,'Time to practise');

assert.equal(msUntilNextReminder(mon1830,on),30*60000,'later today');
assert.equal(msUntilNextReminder(mon1930,on),(24*60-30)*60000,'tomorrow');
assert.equal(msUntilNextReminder(at('2026-10-30T14:00:00Z'),{...on,reminderDays:WEEKDAYS}),(2*24*60+23*60+30)*60000,'Friday evening jumps to Monday');
assert.equal(msUntilNextReminder(mon1930,{...on,reminder:false}),null);
assert.equal(msUntilNextReminder(mon1930,{...on,reminderDays:[]}),null);

const prefs=validateAppPreferences({reminder:true,reminderTime:'06:45',reminderDays:[1,2],soundEffects:'off'});
assert.equal(prefs.reminder,true);assert.equal(prefs.reminderTime,'06:45');assert.deepEqual(prefs.reminderDays,[1,2]);assert.equal(prefs.soundEffects,'off');
assert.equal(validateAppPreferences({}).reminder,false);
assert.equal(appDefaults.reminderTime,'19:00');

// sw.js carries its own copy of reminderDue (service workers here are classic scripts); both must agree.
const sw=readFileSync(new URL('./sw.js',import.meta.url),'utf8');
const body=sw.match(/function reminderDue\([\s\S]*?\n}\n/);assert.ok(body,'reminderDue in sw.js');
const swDue=new Function('IST_OFFSET',`${body[0]};return reminderDue;`)(330*60000);
const cases=[];
for(const now of [mon1930,mon1830,sun2000,at('2026-10-26T18:40:00Z'),at('2026-10-27T03:00:00Z')])
 for(const time of ['00:05','08:00','19:00','23:59'])
  for(const days of [[0,1,2,3,4,5,6],WEEKDAYS,[2],[]])
   for(const dueCount of [0,3])
    for(const extra of [{},{lastShown:'2026-10-26'},{practisedDay:'2026-10-26'},{reminderOnlyDue:false,reminderSkipDone:false}])
     cases.push({now,settings:cleanReminderSettings({...on,reminderTime:time,reminderDays:days,...extra}),dueCount,lastShown:extra.lastShown||'',practisedDay:extra.practisedDay||''});
for(const c of cases)assert.equal(swDue(c),reminderDue(c),JSON.stringify(c));
assert.match(sw,/addEventListener\('periodicsync'/);
assert.match(sw,/addEventListener\('notificationclick'/);

const list=['a','b','c','d','e'].map(id=>({id}));
const {kept,removed}=removeWithPositions(list,['b','d']);
assert.deepEqual(kept.map(x=>x.id),['a','c','e']);
assert.deepEqual(restoreRemoved(kept,removed).map(x=>x.id),['a','b','c','d','e']);
assert.deepEqual(restoreRemoved([...kept,{id:'new'}],removed).map(x=>x.id),['a','b','c','d','e','new'],'items added meanwhile are kept');
assert.deepEqual(restoreRemoved([kept[0]],removed).map(x=>x.id),['a','b','d'],'positions past the end go last');
assert.deepEqual(restoreRemoved([...kept,{id:'b'}],removed).map(x=>x.id).filter(id=>id==='b').length,1,'no duplicates');
assert.deepEqual(removeWithPositions(list,['zz']).removed,[]);

console.log(`PASS: reminder timing in IST, days, due-only and practised-today rules, settings validation, next-reminder delay, sw.js parity (${cases.length} cases) and undo restoring order.`);
