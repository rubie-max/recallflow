// Lets Settings pull the newest version on demand. The service worker skips waiting and claims clients
// when it activates, so a freshly deployed sw.js takes control as soon as it installs; here we just ask
// the browser to check, nudge any waiting worker, and reload the page once the new worker is in charge.

let refreshing=false;

if(typeof navigator!=='undefined'&&'serviceWorker'in navigator){
  // Fires when a new service worker takes control. Only reload if the user asked to update, so the first
  // install on a fresh visit doesn't bounce the page.
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(refreshing)window.location.reload();});
}

// Returns 'current' (already newest), 'updating' (new version found, page will reload), 'unsupported', or 'error'.
export async function checkForUpdate(){
  if(typeof navigator==='undefined'||!('serviceWorker'in navigator))return 'unsupported';
  const reg=await navigator.serviceWorker.getRegistration().catch(()=>null);
  if(!reg)return 'unsupported';
  try{await reg.update();}catch{return 'error';}
  const pending=reg.installing||reg.waiting;
  if(!pending)return 'current';
  refreshing=true;
  if(reg.waiting)reg.waiting.postMessage({type:'SKIP_WAITING'});
  // controllerchange reloads once the new worker claims the page; this is a fallback if it never fires.
  setTimeout(()=>{if(refreshing)window.location.reload();},2500);
  return 'updating';
}
