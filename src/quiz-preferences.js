export const quizDefaults={count:0,shuffle:false};
export function validateQuizPreferences(value) {
  if(!Number.isInteger(value.count)||value.count<0||value.count>1000||typeof value.shuffle!=='boolean')throw new Error('Choose a whole number between 1 and 1000, or select all questions.');
  return {count:value.count,shuffle:value.shuffle};
}
export function quizPreferences() {
  try{return validateQuizPreferences(JSON.parse(localStorage.getItem('recallflow_quiz_preferences_v1')||JSON.stringify(quizDefaults)));}catch{return {...quizDefaults};}
}
export function saveQuizPreferences(value) {const clean=validateQuizPreferences(value);localStorage.setItem('recallflow_quiz_preferences_v1',JSON.stringify(clean));return clean;}
export function prepareQuiz(items,preferences,random=Math.random) {
  const result=items.slice();
  if(preferences.shuffle)for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return preferences.count?result.slice(0,preferences.count):result;
}
