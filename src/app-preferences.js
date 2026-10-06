export const appPreferencesKey='recallflow_app_preferences_v1';
export const textSizes=[['small','Small',.92],['default','Default',1],['large','Large',1.1],['larger','Larger',1.2]];
export const appDefaults={name:'Kaizen',textSize:'default',reduceMotion:false,countdown:true,autoRead:false,shuffleChoices:false,autoAdvance:false,confirmExit:true};

export function validateAppPreferences(value){
  const v={...appDefaults,...(value&&typeof value==='object'?value:{})};
  return {
    name:String(v.name??'').trim().slice(0,40),
    textSize:textSizes.some(([id])=>id===v.textSize)?v.textSize:'default',
    reduceMotion:v.reduceMotion===true,
    countdown:v.countdown!==false,
    autoRead:v.autoRead===true,
    shuffleChoices:v.shuffleChoices===true,
    autoAdvance:v.autoAdvance===true,
    confirmExit:v.confirmExit!==false,
  };
}
export function appPreferences(){try{return validateAppPreferences(JSON.parse(localStorage.getItem(appPreferencesKey)||'{}'));}catch{return {...appDefaults};}}
export function saveAppPreferences(value){const clean=validateAppPreferences(value);localStorage.setItem(appPreferencesKey,JSON.stringify(clean));applyAppPreferences(clean);window.dispatchEvent(new CustomEvent('recallflow:preferences',{detail:clean}));return clean;}
export function applyAppPreferences(p=appPreferences()){
  if(typeof document==='undefined')return;
  const scale=textSizes.find(([id])=>id===p.textSize)?.[2]||1;
  document.documentElement.style.setProperty('--rf-text-scale',String(scale));
  document.documentElement.dataset.textSize=p.textSize;
  document.documentElement.classList.toggle('rf-reduce-motion',p.reduceMotion);
}
export function displayName(p=appPreferences()){return p.name||'there';}
