// Chrome/Edge/Android fire `beforeinstallprompt` once, early in page load — long before the user opens
// Settings. A component that listens in its own effect almost always mounts too late and misses it, so
// the install button never shows. This module captures the event as soon as the bundle evaluates (and
// also reads anything index.html stashed even earlier), holds it, and lets any component read the state.

let deferred=null;        // the saved BeforeInstallPromptEvent, or null once used/unavailable
let installed=false;      // flips true after the browser reports a successful install

function notify(){if(typeof window!=='undefined')window.dispatchEvent(new Event('recallflow:installable'));}

export function isStandalone(){
  if(typeof window==='undefined')return false;
  try{return window.matchMedia?.('(display-mode: standalone)').matches===true||window.navigator?.standalone===true;}catch{return false;}
}

// iOS Safari never fires `beforeinstallprompt` and has no install API — the user must use Share → Add to
// Home Screen. We detect it (including iPadOS, which reports as a Mac with touch) to show that guidance.
export function isIOS(){
  if(typeof navigator==='undefined')return false;
  const ua=navigator.userAgent||'';
  return /iphone|ipad|ipod/i.test(ua)||(navigator.platform==='MacIntel'&&(navigator.maxTouchPoints||0)>1);
}

export function installState(){
  const standalone=isStandalone();
  return {canPrompt:!!deferred&&!standalone,installed:installed||standalone,ios:isIOS()};
}

// Shows the native install dialog. Returns 'accepted', 'dismissed', or 'unavailable'.
export async function promptInstall(){
  if(!deferred)return 'unavailable';
  const evt=deferred;deferred=null;notify();
  try{
    evt.prompt();
    const choice=await evt.userChoice;
    return choice&&choice.outcome==='accepted'?'accepted':'dismissed';
  }catch{return 'dismissed';}
}

function capture(e){e.preventDefault();deferred=e;notify();}

if(typeof window!=='undefined'){
  // index.html may have grabbed the event before this bundle ran; adopt it.
  if(window.__rfInstallEvent){deferred=window.__rfInstallEvent;window.__rfInstallEvent=null;}
  if(isStandalone())installed=true;
  window.addEventListener('beforeinstallprompt',capture);
  window.addEventListener('appinstalled',()=>{installed=true;deferred=null;notify();});
}
