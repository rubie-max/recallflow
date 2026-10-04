import React,{useEffect,useRef,useState} from 'react';
import {Volume2,Square,LoaderCircle} from 'lucide-react';
import {Button} from './components/Button';

export function VoicePreview({voice,speed}:{voice:string;speed:number}) {
  const audio=useRef<HTMLAudioElement>(null),revision=useRef(0);
  const [phase,setPhase]=useState('idle'),[status,setStatus]=useState('');
  const src=`./public/voice-previews/${voice}.wav`;
  function stop(){revision.current++;audio.current?.pause();setPhase('idle');}
  useEffect(()=>{stop();setStatus('');if(audio.current){audio.current.playbackRate=speed;audio.current.preservesPitch=true;}return()=>{revision.current++;audio.current?.pause();};},[voice,speed]);
  async function play(){
    if(phase==='playing'){stop();setStatus('Preview stopped.');return;}
    const player=audio.current;if(!player)return;
    const token=++revision.current;
    setPhase('loading');setStatus('Opening saved voice sample…');
    try{player.currentTime=0;player.playbackRate=speed;player.preservesPitch=true;await player.play();}
    catch{if(token===revision.current){setPhase('idle');setStatus('Could not play this sample. Tap Preview voice to retry.');}}
  }
  return <div className="voice-preview-control">
    <div className="kokoro-controls"><Button variant="outline" aria-label={phase==='playing'?'Stop preview':'Preview selected voice'} disabled={phase==='loading'} onClick={play}>{phase==='loading'?<LoaderCircle size={16} className="speech-spinner"/>:phase==='playing'?<Square size={16}/>:<Volume2 size={16}/>} {phase==='loading'?'Opening sample…':phase==='playing'?'Stop preview':'Preview voice'}</Button></div>
    <audio ref={audio} src={src} preload="none" data-testid="voice-preview-audio" onPlaying={()=>{setPhase('playing');setStatus('Playing prerecorded voice sample.');}} onEnded={()=>{setPhase('idle');setStatus('Preview completed.');}} onError={()=>{revision.current++;setPhase('idle');setStatus('This voice sample is unavailable. Please reload and retry.');}}/>
    {status&&<p role="status" aria-live="polite">{status}</p>}
    <p>Voice samples are included with RecallFlow. They play instantly without generating speech, and work offline once the app is saved.</p>
  </div>;
}
