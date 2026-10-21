// One sample of each newer question type. Sounds and pictures live in public/examples
// so a backup stays the same version 1 file and only stores these short paths.
const file=name=>`./public/examples/${name}`;
const sample=(id,type,topic,extra)=>({id,type,subject:'Examples',topic,due:'2099-01-01',interval:365,tags:['example'],...extra});

export const exampleQuestions=[
  sample('example_audio_name','audio_name','Name this sound',{prompt:'Name this sound.',answer:'Doorbell',acceptedAnswers:['Door bell','Chime'],audio:file('doorbell.wav')}),
  sample('example_audio_voice','audio_voice','Whose voice',{prompt:'Whose voice is this?',answer:'A woman',acceptedAnswers:['Woman','Female'],audio:file('voice-woman.wav')}),
  sample('example_dictation','dictation','Dictation',{prompt:'Type what you hear.',answer:'The Pacific Ocean is the largest ocean.',audio:file('dictation.wav'),fuzzy:false}),
  sample('example_lyric','lyric','Finish the lyric',{prompt:'Finish the line.',answer:'How I wonder what you are',audio:file('lyric.wav')}),
  sample('example_audio_choice','audio_choice','Which clip',{prompt:'Which clip is the high tone?',answer:'High tone',clips:[{label:'Low tone',audio:file('tone-low.wav')},{label:'Middle tone',audio:file('tone-mid.wav')},{label:'High tone',audio:file('tone-high.wav')}]}),
  sample('example_audio_order','audio_order','Order the sounds',{prompt:'Put the sounds in order from low to high.',clips:[{label:'Low tone',audio:file('tone-low.wav')},{label:'Middle tone',audio:file('tone-mid.wav')},{label:'High tone',audio:file('tone-high.wav')}]}),
  sample('example_image_tap','image_tap','Tap the picture',{prompt:'Tap the sun.',image:file('tap-sun.png'),spots:[{x:75,y:30,label:'Sun'}]}),
  sample('example_image_label','image_label','Label the picture',{prompt:'Label each shape.',image:file('label-shapes.png'),spots:[{x:25,y:50,label:'Circle'},{x:70,y:50,label:'Square'}]}),
  sample('example_odd_one_out','odd_one_out','Odd one out',{prompt:'Which one does not belong?',answer:'Banana',options:['Circle','Square','Triangle','Banana']}),
  sample('example_before_after','before_after','Before and after',{prompt:'What changed?',answer:'A star was added',image:file('before-plain.png'),answerImage:file('after-star.png')}),
  sample('example_categorize','categorize','Sort into groups',{prompt:'Sort each animal into the right group.',groups:[{name:'Mammals',items:['Dog','Whale']},{name:'Birds',items:['Eagle','Sparrow']}]}),
  sample('example_timeline','timeline','Timeline',{prompt:'Put these in time order.',sequence:['1492 · Columbus sails west','1969 · Moon landing','2012 · Curiosity lands on Mars']}),
  sample('example_build_answer','build_answer','Build the answer',{prompt:'Build the name of this app.',sequence:['Recall','Flow'],options:['Quiz']}),
  sample('example_two_step','two_step','Two-step',{prompt:'What is the capital of France?',steps:[{prompt:'What is the capital of France?',answer:'Paris'},{prompt:'Which river runs through that city?',answer:'Seine'}]}),
  sample('example_translate','translate','Translate',{prompt:'Translate into French: Good morning',answer:'Bonjour',acceptedAnswers:['Bon jour']}),
  sample('example_spot_mistake','spot_mistake','Spot the mistake',{prompt:'He don\'t like apples.',answer:'He doesn\'t like apples.'}),
];
