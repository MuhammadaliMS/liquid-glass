export const AUDIO_FREQUENCIES = [[30, 120], [120, 300], [300, 700], [700, 1600], [1600, 4000], [4000, 10000]] as const;
export type MicrophoneStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error';
export interface AudioFrame { bands: Float32Array; level: number; }
export interface MicrophoneState { status: MicrophoneStatus; message: string; }
export interface MicrophoneDependencies {
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  createAudioContext?: () => AudioContext;
}
export interface MicrophoneController {
  start: () => Promise<boolean>;
  stop: () => Promise<void>;
  read: (deltaSeconds: number) => AudioFrame;
  getState: () => MicrophoneState;
}

/** Extract six normalized frequency ranges using the actual sample rate. */
export function extractFrequencyBands(data: Uint8Array, sampleRate: number, fftSize: number, output = new Float32Array(6)): Float32Array {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0 || !Number.isInteger(fftSize) || fftSize < 32 || fftSize > 32768 || (fftSize & (fftSize - 1)) !== 0 || data.length !== fftSize / 2 || output.length < 6) {
    throw new RangeError('Audio analysis needs a valid sample rate, power-of-two FFT and matching spectrum.');
  }
  const binWidth = sampleRate / fftSize;
  AUDIO_FREQUENCIES.forEach(([lower, upper], band) => {
    const start = Math.max(1, Math.ceil(lower / binWidth));
    const end = Math.min(data.length, Math.ceil(upper / binWidth));
    let energy = 0;
    let peak = 0;
    for (let bin = start; bin < end; bin += 1) {
      const value = data[bin] / 255;
      energy += value * value;
      peak = Math.max(peak, value);
    }
    const rms = end > start ? Math.sqrt(energy / (end - start)) : 0;
    output[band] = Math.min(1, (rms * 0.4 + peak * 0.6) * 1.3);
  });
  return output;
}

/** Bound audio-driven expansion and respect reduced motion. */
export function getVoiceBreath(frame: AudioFrame, reducedMotion = false): { width: number; height: number } {
  if (reducedMotion) return { width: 0, height: 0 };
  const raw = frame.level * 0.45 + (frame.bands[0] ?? 0) * 0.3 + (frame.bands[1] ?? 0) * 0.25;
  const amount = Number.isFinite(raw) ? Math.min(1, Math.max(0, raw)) : 0;
  return { width: amount * 9, height: amount * 5 };
}

/** Own a visitor-initiated microphone analysis session. */
export function createMicrophoneController(dependencies: MicrophoneDependencies): MicrophoneController {
  const supported = !!dependencies.getUserMedia && !!dependencies.createAudioContext;
  let state: MicrophoneState = { status: supported ? 'idle' : 'unavailable', message: supported ? '' : 'Microphone analysis is not supported in this browser. The visual demo still works.' };
  let context: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let analyser: AnalyserNode | null = null;
  let frequencyData = new Uint8Array(0);
  let waveform = new Float32Array(0);
  const targets = new Float32Array(6);
  const frame: AudioFrame = { bands: new Float32Array(6), level: 0 };
  let generation = 0;
  let pending: Promise<boolean> | null = null;

  /** Release owned resources before resolving, including partially opened sessions. */
  async function release(): Promise<void> {
    const oldContext = context;
    const oldStream = stream;
    const oldSource = source;
    const oldAnalyser = analyser;
    context = null;
    stream = null;
    source = null;
    analyser = null;
    oldSource?.disconnect();
    oldAnalyser?.disconnect();
    oldStream?.getTracks().forEach((track) => track.stop());
    frame.bands.fill(0);
    frame.level = 0;
    if (oldContext && oldContext.state !== 'closed') await oldContext.close().catch(() => undefined);
  }

  /** Stop immediately and invalidate any permission response still in flight. */
  async function stop(): Promise<void> {
    generation += 1;
    state = { status: supported ? 'idle' : 'unavailable', message: supported ? '' : state.message };
    await release();
  }

  /** Request a stream only in response to the visitor's explicit activation. */
  function start(): Promise<boolean> {
    if (!supported) return Promise.resolve(false);
    if (state.status === 'live') return Promise.resolve(true);
    if (state.status === 'requesting' && pending) return pending;
    const request = ++generation;
    state = { status: 'requesting', message: 'Allow microphone access in your browser, or cancel to keep exploring.' };
    const operation = (async () => {
      try {
        const nextContext = dependencies.createAudioContext!();
        context = nextContext;
        // Resume during the gesture, before the permission prompt can consume it.
        const resumed = nextContext.resume().then(() => null, (error: unknown) => error);
        const nextStream = await dependencies.getUserMedia!({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
        if (request !== generation) {
          nextStream.getTracks().forEach((track) => track.stop());
          return false;
        }
        stream = nextStream;
        const resumeError = await resumed;
        if (resumeError) throw resumeError;
        if (request !== generation) return false;
        source = nextContext.createMediaStreamSource(nextStream);
        analyser = nextContext.createAnalyser();
        analyser.fftSize = 4096;
        analyser.minDecibels = -90;
        analyser.maxDecibels = -15;
        analyser.smoothingTimeConstant = 0.55;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);
        waveform = new Float32Array(analyser.fftSize);
        // Deliberately never connect to destination: no playback or feedback.
        source.connect(analyser);
        nextStream.getAudioTracks().forEach((track) => track.addEventListener('ended', () => { void stop(); }, { once: true }));
        state = { status: 'live', message: 'Microphone on. Audio is analysed on this device; nothing is saved or uploaded.' };
        return true;
      } catch (error) {
        if (request !== generation) return false;
        await release();
        if (request !== generation) return false;
        const name = error && typeof error === 'object' && 'name' in error && typeof error.name === 'string' ? error.name : '';
        state = name === 'NotAllowedError' || name === 'SecurityError'
          ? { status: 'denied', message: 'Microphone permission was not allowed. You can allow it in your browser and try again; the demo still works.' }
          : { status: 'error', message: name === 'NotFoundError' ? 'No microphone was found. Connect one and try again, or use the visual demo.' : 'The microphone could not be started. Check your device and browser permissions, then try again.' };
        return false;
      }
    })();
    pending = operation;
    void operation.finally(() => { if (pending === operation) pending = null; });
    return operation;
  }

  /** Read and smooth six spectral energies and the broadband input envelope. */
  function read(deltaSeconds: number): AudioFrame {
    if (state.status !== 'live' || !analyser || !context) return frame;
    return readSpectrum(analyser, context.sampleRate, deltaSeconds, frame, targets, frequencyData, waveform);
  }

  return { start, stop, read, getState: () => ({ ...state }) };
}

/** Smooth one analyser reading into a frame: quick attack, slow release, gated below the noise floor. */
export function readSpectrum(analyser: AnalyserNode, sampleRate: number, deltaSeconds: number, frame: AudioFrame, targets: Float32Array, frequencyData: Uint8Array, waveform: Float32Array): AudioFrame {
  analyser.getByteFrequencyData(frequencyData);
  analyser.getFloatTimeDomainData(waveform);
  extractFrequencyBands(frequencyData, sampleRate, analyser.fftSize, targets);
  let sum = 0;
  for (const sample of waveform) sum += sample * sample;
  const rms = Math.sqrt(sum / waveform.length);
  const noiseGate = Math.min(1, Math.max(0, (rms - 0.006) / 0.012));
  const dt = Math.min(0.1, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  targets.forEach((energy, index) => {
    const target = energy * noiseGate;
    const timeConstant = target > frame.bands[index] ? 0.045 : 0.23;
    frame.bands[index] += (target - frame.bands[index]) * (1 - Math.exp(-dt / timeConstant));
  });
  const targetLevel = Math.min(1, Math.max(0, (rms - 0.006) * 9));
  frame.level += (targetLevel - frame.level) * (1 - Math.exp(-dt / (targetLevel > frame.level ? 0.04 : 0.2)));
  return frame;
}

export interface NodeListener {
  read: (deltaSeconds: number) => AudioFrame;
  disconnect: () => void;
}

/** Listen to any Web Audio node (a player, a synth, an <audio> element's source) without changing what it plays. */
export function listenToNode(node: AudioNode): NodeListener {
  const analyser = node.context.createAnalyser();
  analyser.fftSize = 4096;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -15;
  analyser.smoothingTimeConstant = 0.55;
  node.connect(analyser);
  const frame: AudioFrame = { bands: new Float32Array(6), level: 0 };
  const targets = new Float32Array(6);
  const frequencyData = new Uint8Array(analyser.frequencyBinCount);
  const waveform = new Float32Array(analyser.fftSize);
  let connected = true;
  return {
    read: (deltaSeconds) => connected ? readSpectrum(analyser, node.context.sampleRate, deltaSeconds, frame, targets, frequencyData, waveform) : frame,
    disconnect: () => {
      if (!connected) return;
      connected = false;
      try { node.disconnect(analyser); } catch { /* already disconnected */ }
      frame.bands.fill(0);
      frame.level = 0;
    },
  };
}
