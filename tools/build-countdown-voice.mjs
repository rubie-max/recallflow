// Development-only asset builder: records the spoken 3-2-1-Go countdown with Kokoro on this computer.
// The app only plays the finished files in public/countdown/; it never runs this script.
// Usage: node tools/build-countdown-voice.mjs [voice]
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import os from 'node:os';
import {KokoroTTS} from 'kokoro-js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Windows cannot open the model from the default cache inside node_modules: the path is longer than 260 characters.
const cjs=createRequire(createRequire(import.meta.url).resolve('kokoro-js')).resolve('@huggingface/transformers');
const {env}=await import(pathToFileURL(path.join(path.dirname(cjs),'transformers.node.mjs')).href);
env.cacheDir=path.join(process.env.LOCALAPPDATA||os.tmpdir(),'RecallFlow-kokoro');
const voice=process.argv[2]||'af_heart';
const words=[['three','Three!'],['two','Two!'],['one','One!'],['go','Go!']];

// Cut silence at both ends, fade the edges, and bring the loudest point to about -0.5 dB.
function polish(samples,rate){
  const gate=.02,pad=Math.round(rate*.012);
  let a=0,b=samples.length-1;
  while(a<b&&Math.abs(samples[a])<gate)a++;
  while(b>a&&Math.abs(samples[b])<gate)b--;
  const out=samples.slice(Math.max(0,a-pad),Math.min(samples.length,b+pad*3));
  let peak=0;for(const s of out)peak=Math.max(peak,Math.abs(s));
  if(!peak)throw new Error('Kokoro returned silence');
  const gain=.95/peak,fadeIn=Math.round(rate*.004),fadeOut=Math.round(rate*.03);
  for(let i=0;i<out.length;i++){
    const edge=Math.min(1,i/fadeIn,(out.length-1-i)/fadeOut);
    out[i]*=gain*edge;
  }
  return out;
}

function wav(samples,rate){
  const b=Buffer.alloc(44+samples.length*2);
  b.write('RIFF',0);b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);
  b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);
  b.write('data',36);b.writeUInt32LE(samples.length*2,40);
  samples.forEach((s,i)=>b.writeInt16LE(Math.round(Math.max(-1,Math.min(1,s))*32767),44+i*2));
  return b;
}

const tts=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});
const dir=path.join(root,'public/countdown');
await fs.mkdir(dir,{recursive:true});
for(const [name,text] of words){
  const audio=await tts.generate(text,{voice,speed:1.05});
  const clean=polish(Float32Array.from(audio.audio),audio.sampling_rate);
  await fs.writeFile(path.join(dir,name+'.wav'),wav(clean,audio.sampling_rate));
  console.log(`${name}.wav  ${(clean.length/audio.sampling_rate).toFixed(2)}s`);
}
await fs.writeFile(path.join(dir,'about.json'),JSON.stringify({engine:'Kokoro-82M-v1.0',voice,words:words.map(([n,t])=>({file:n+'.wav',text:t}))},null,2)+'\n');
console.log('Saved to public/countdown/');
