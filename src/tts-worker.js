import { KokoroTTS } from '../public/vendor/kokoro.web.js';

const modelId = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let tts, device, lastBackend;
const report = (type, data = {}) => self.postMessage({type, ...data});
async function load(target) {
  report('status', {message: `Loading Kokoro · ${target.toUpperCase()}… First use downloads model files.`});
  tts = await KokoroTTS.from_pretrained(modelId, {
    device: target, dtype: target === 'webgpu' ? 'fp32' : 'q8',
    progress_callback: p => {
      if (p.status === 'progress') report('status', {message: `Loading ${p.file} · ${Math.round(p.progress || 0)}%`});
    },
  });
  device = target;
}
self.onmessage = async ({data}) => {
  try {
    const start = performance.now();
    if (tts && lastBackend === 'wasm' && data.backend !== 'wasm') {
      await tts.model?.dispose?.(); tts = undefined;
    }
    lastBackend = data.backend;
    if (data.backend === 'wasm' && device !== 'wasm') {
      await tts?.model?.dispose?.(); tts = undefined; await load('wasm');
    }
    if (!tts) {
      let target = 'wasm';
      if (data.backend !== 'wasm' && self.navigator.gpu) {
        try { if (await self.navigator.gpu.requestAdapter()) target = 'webgpu'; } catch {}
      }
      try { await load(target); }
      catch (e) {
        if (target === 'wasm') throw e;
        report('fallback', {message: `WebGPU unavailable: ${e.message}. Loading Kokoro with WASM.`});
        await load('wasm');
      }
    }
    report('status', {message: `Generating speech with Kokoro · ${device.toUpperCase()}…`});
    const speechText = data.spokenText || data.text;
    let result;
    try { result = await tts.generate(speechText, {voice: data.voice, speed: data.speed}); }
    catch (e) {
      if (device !== 'webgpu') throw e;
      report('fallback', {message: `WebGPU generation failed: ${e.message}. Retrying with Kokoro WASM.`});
      await tts?.model?.dispose?.(); tts = undefined; await load('wasm');
      result = await tts.generate(speechText, {voice: data.voice, speed: data.speed});
    }
    const samples = result.audio;
    if (!samples?.length || !samples.every(Number.isFinite)) throw new Error('Kokoro returned invalid audio.');
    let sum = 0, peak = 0;
    for (const sample of samples) { sum += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
    const rms = Math.sqrt(sum / samples.length);
    if (rms < 0.00001) throw new Error('Kokoro returned silent audio.');
    report('audio', {samples, sampleRate: result.sampling_rate, device, rms, peak, elapsed: (performance.now()-start)/1000});
  } catch (e) { report('error', {message: e.message || String(e)}); }
};
