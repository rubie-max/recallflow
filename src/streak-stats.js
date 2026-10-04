const DAY=86400000;
export function streakStats(days,today=new Date().toISOString().slice(0,10)) {
  const end=Date.parse(today+'T00:00:00Z');
  const timestamps=[...new Set(days.filter(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)).filter(d=>{const t=Date.parse(d+'T00:00:00Z');return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===d;}).map(d=>Date.parse(d+'T00:00:00Z')).filter(t=>t<=end))].sort((a,b)=>a-b);
  const active=new Set(timestamps);let cursor=active.has(end)?end:end-DAY,current=0,longest=0,run=0,previous;
  while(active.has(cursor)){current++;cursor-=DAY;}
  for(const t of timestamps){run=previous!==undefined&&t-previous===DAY?run+1:1;longest=Math.max(longest,run);previous=t;}
  return {current,longest,total:active.size};
}
