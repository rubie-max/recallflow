const DAY=86400000;
// Study days, due dates, streaks and every shown time use India Standard Time,
// whatever timezone the device is set to. IST has no daylight saving, so a fixed offset is exact.
export const APP_TIME_ZONE='Asia/Kolkata';
const IST_OFFSET=330*60000;
// A Date whose UTC fields (getUTCHours, getUTCDay…) read as IST wall-clock values.
export function istClock(date=new Date()){return new Date(new Date(date).getTime()+IST_OFFSET);}
export function localDay(date=new Date()){const d=istClock(date);return Number.isFinite(d.getTime())?d.toISOString().slice(0,10):'';}export function streakStats(days,today=localDay()) {
  const end=Date.parse(today+'T00:00:00Z');
  const timestamps=[...new Set(days.filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)).filter(d=>{const t=Date.parse(d+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;}).map(d=>Date.parse(d+'T00:00:00Z')).filter(t=>t<=end))].sort((a,b)=>a-b);
  const active=new Set(timestamps);let cursor=active.has(end)?end:end-DAY,current=0,longest=0,run=0,previous;
  while(active.has(cursor)){current++;cursor-=DAY;}
  for(const t of timestamps){run=previous!==undefined&&t-previous===DAY?run+1:1;longest=Math.max(longest,run);previous=t;}
  return {current,longest,total:active.size};
}
