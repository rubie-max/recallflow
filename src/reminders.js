import {istClock,localDay} from './streak-stats.js';

export const REMINDER_DAY_NAMES=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export const EVERY_DAY=[0,1,2,3,4,5,6];
export const WEEKDAYS=[1,2,3,4,5];
export const reminderDefaults={reminder:false,reminderTime:'19:00',reminderDays:EVERY_DAY,reminderOnlyDue:true,reminderSkipDone:true};
export const REMINDER_TAG='rf-reminder';
export const REMINDER_CACHE='recallflow-reminder';
export const REMINDER_KEY='./__rf-reminder';

export function validReminderTime(time){return typeof time==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(time);}
export function cleanReminderDays(days){
 if(!Array.isArray(days))return [...EVERY_DAY];
 return [...new Set(days.map(Number).filter(d=>Number.isInteger(d)&&d>=0&&d<=6))].sort((a,b)=>a-b);
}
export function cleanReminderSettings(v={}){
 return {
  reminder:v.reminder===true,
  reminderTime:validReminderTime(v.reminderTime)?v.reminderTime:reminderDefaults.reminderTime,
  reminderDays:cleanReminderDays(v.reminderDays),
  reminderOnlyDue:v.reminderOnlyDue!==false,
  reminderSkipDone:v.reminderSkipDone!==false,
 };
}

// Times and days are India Standard Time, like every other date in the app.
// Keep in step with reminderDue in sw.js; reminder-tests.mjs compares the two.
export function reminderDue({now=new Date(),settings,lastShown='',dueCount=0,practisedDay=''}){
 const s=cleanReminderSettings(settings);
 if(!s.reminder||!s.reminderDays.length)return false;
 const clock=istClock(now),day=localDay(now);
 if(!s.reminderDays.includes(clock.getUTCDay()))return false;
 const [h,m]=s.reminderTime.split(':').map(Number);
 if(clock.getUTCHours()*60+clock.getUTCMinutes()<h*60+m)return false;
 if(lastShown===day)return false;
 if(s.reminderOnlyDue&&!(dueCount>0))return false;
 if(s.reminderSkipDone&&practisedDay===day)return false;
 return true;
}

export function reminderMessage(dueCount){
 return dueCount>0
  ?{title:`${dueCount} ${dueCount===1?'question':'questions'} due`,body:'A few minutes now keeps your streak going.'}
  :{title:'Time to practise',body:'Nothing is due, but a quick round keeps it fresh.'};
}

export function reminderDaysLabel(days){
 const d=cleanReminderDays(days);
 if(d.length===7)return 'every day';
 if(d.join()===WEEKDAYS.join())return 'weekdays';
 if(d.join()==='0,6')return 'weekends';
 if(!d.length)return 'no days';
 return d.map(i=>REMINDER_DAY_NAMES[i]).join(', ');
}

export function formatReminderTime(time){
 if(!validReminderTime(time))return time;
 const [h,m]=time.split(':').map(Number);
 return `${h%12||12}:${String(m).padStart(2,'0')} ${h<12?'am':'pm'}`;
}

// Milliseconds from `now` until the reminder time next comes round on an allowed day.
export function msUntilNextReminder(now,settings){
 const s=cleanReminderSettings(settings);
 if(!s.reminder||!s.reminderDays.length)return null;
 const [h,m]=s.reminderTime.split(':').map(Number);
 const clock=istClock(now),minuteNow=clock.getUTCHours()*60+clock.getUTCMinutes();
 for(let add=0;add<8;add++){
  const dow=(clock.getUTCDay()+add)%7,mins=add*1440+h*60+m-minuteNow;
  if(s.reminderDays.includes(dow)&&mins>0)return mins*60000-clock.getUTCSeconds()*1000;
 }
 return null;
}

/* ───────── browser side ───────── */

export function reminderSupport(){
 if(typeof window==='undefined'||!('Notification' in window)||!('serviceWorker' in navigator))return 'none';
 if(Notification.permission==='denied')return 'blocked';
 return 'ok';
}

async function readState(){
 try{const cache=await caches.open(REMINDER_CACHE),hit=await cache.match(REMINDER_KEY);return hit?await hit.json():{};}catch{return {};}
}
async function writeState(state){
 try{const cache=await caches.open(REMINDER_CACHE);await cache.put(REMINDER_KEY,new Response(JSON.stringify(state),{headers:{'Content-Type':'application/json'}}));}catch{}
}

// The service worker reads this to decide on a reminder while the app is closed.
export async function saveReminderState({settings,dueCount,practisedDay}){
 const old=await readState();
 await writeState({...old,settings:cleanReminderSettings(settings),dueCount,practisedDay});
}
export async function markReminderShown(day=localDay()){const old=await readState();await writeState({...old,lastShown:day});}
export async function lastReminderShown(){return (await readState()).lastShown||'';}

export async function askReminderPermission(){
 if(reminderSupport()==='none')return 'unsupported';
 if(Notification.permission==='granted')return 'granted';
 try{return await Notification.requestPermission();}catch{return 'denied';}
}

// Returns how reminders can arrive on this device: 'closed' (also while the app is closed), 'open' (only while it is open), or a problem.
export async function registerReminderSync(on){
 const support=reminderSupport();
 if(support!=='ok')return support;
 if(on&&Notification.permission!=='granted')return 'permission';
 try{
  const reg=await navigator.serviceWorker.ready;
  const periodic=reg.periodicSync;
  if(!periodic)return 'open';
  if(!on){await periodic.unregister(REMINDER_TAG).catch(()=>{});return 'open';}
  const state=await navigator.permissions?.query({name:'periodic-background-sync'}).catch(()=>null);
  if(state&&state.state!=='granted')return 'install';
  await periodic.register(REMINDER_TAG,{minInterval:60*60*1000});
  return 'closed';
 }catch{return 'open';}
}

export async function showReminder(dueCount,{test=false}={}){
 const reg=await navigator.serviceWorker.ready;
 const msg=test?{title:'Reminders are on',body:'This is how your daily reminder will look.'}:reminderMessage(dueCount);
 await reg.showNotification(msg.title,{body:msg.body,icon:'./public/icon-192.png',badge:'./public/icon-192.png',tag:REMINDER_TAG,data:{url:'./#/home'}});
}
