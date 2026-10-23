/* Speech to text for captions. Runs in a worker so the editor stays smooth.
   Model: OpenAI Whisper tiny (multilingual, word timestamps), self-hosted, run with ONNX Runtime Web. Nothing is sent anywhere. */
import { pipeline, env } from '/tools/vendor/transformers/transformers.min.js';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = '/tools/vendor/whisper/';
env.useBrowserCache = true;
env.backends.onnx.wasm.wasmPaths = '/tools/vendor/transformers/';
env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 2) : 1;

let asr = null;
const send = (type, data) => self.postMessage({ type, data });

self.onmessage = async (e) => {
  const m = e.data;
  if (m.type !== 'run') return;
  try {
    if (!asr) {
      asr = await pipeline('automatic-speech-recognition', 'tiny', {
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (p) => send('load', p)
      });
    }
    send('listening', null);
    const out = await asr(m.audio, {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: 'word',
      task: 'transcribe',
      language: m.language || null,
      chunk_callback: () => send('chunk', null)
    });
    send('done', out);
  } catch (err) {
    send('error', String((err && err.message) || err));
  }
};
