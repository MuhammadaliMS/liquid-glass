import { describe, expect, it, vi } from 'vitest';
import { AUDIO_FREQUENCIES, createMicrophoneController, extractFrequencyBands, getVoiceBreath } from '../src/core/audio';

/** Produce a spectrum with one isolated tone at a sample-rate-correct bin. */
function tone(frequency: number, sampleRate: number, fftSize: number): Uint8Array {
  const spectrum = new Uint8Array(fftSize / 2);
  spectrum[Math.round(frequency / (sampleRate / fftSize))] = 255;
  return spectrum;
}

describe('extractFrequencyBands', () => {
  it.each([44100, 48000])('separates all six tones at %s Hz sample rate', (sampleRate) => {
    const frequencies = [70, 200, 500, 1000, 2500, 6000];
    frequencies.forEach((frequency, band) => {
      const levels = extractFrequencyBands(tone(frequency, sampleRate, 4096), sampleRate, 4096);
      expect(levels[band]).toBeGreaterThan(0.5);
      levels.forEach((level, index) => { if (index !== band) expect(level).toBe(0); });
    });
  });
  it('returns zero for silence and does not count the DC bin as sub-bass', () => {
    const spectrum = new Uint8Array(2048);
    spectrum[0] = 255;
    expect([...extractFrequencyBands(spectrum, 48000, 4096)]).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('reuses its output buffer and stays within a normalized range', () => {
    const output = new Float32Array(6);
    expect(extractFrequencyBands(new Uint8Array(2048).fill(255), 48000, 4096, output)).toBe(output);
    expect([...output].every((level) => level >= 0 && level <= 1)).toBe(true);
  });
  it('handles frequency bands beyond Nyquist without NaN', () => {
    const levels = extractFrequencyBands(new Uint8Array(256).fill(128), 8000, 512);
    expect(levels[5]).toBe(0);
    expect([...levels].every(Number.isFinite)).toBe(true);
  });
  it.each([[0, 4096], [NaN, 4096], [48000, 0], [48000, 4095]])('rejects invalid analysis dimensions', (sampleRate, fftSize) => {
    expect(() => extractFrequencyBands(new Uint8Array(2048), sampleRate, fftSize)).toThrow(RangeError);
  });
  it('rejects a spectrum with the wrong length', () => {
    expect(() => extractFrequencyBands(new Uint8Array(10), 48000, 4096)).toThrow(RangeError);
  });
  it('defines six contiguous frequency ranges in Hertz', () => {
    expect(AUDIO_FREQUENCIES).toHaveLength(6);
    AUDIO_FREQUENCIES.slice(1).forEach((range, index) => expect(range[0]).toBe(AUDIO_FREQUENCIES[index][1]));
  });
});

describe('getVoiceBreath', () => {
  it('responds to live amplitude and low-frequency energy', () => {
    const result = getVoiceBreath({ bands: new Float32Array([1, 0.7, 0, 0, 0, 0]), level: 0.7 });
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
  it('is still in silence', () => expect(getVoiceBreath({ bands: new Float32Array(6), level: 0 })).toEqual({ width: 0, height: 0 }));
  it('disables breathing with reduced motion', () => expect(getVoiceBreath({ bands: new Float32Array(6).fill(1), level: 1 }, true)).toEqual({ width: 0, height: 0 }));
  it('caps even excessive input to a subtle expansion', () => {
    const result = getVoiceBreath({ bands: new Float32Array(6).fill(100), level: 100 });
    expect(result.width).toBeLessThanOrEqual(10);
    expect(result.height).toBeLessThanOrEqual(6);
  });
  it('does not propagate nonfinite device input into the geometry', () => {
    expect(getVoiceBreath({ bands: new Float32Array(6).fill(NaN), level: NaN })).toEqual({ width: 0, height: 0 });
  });
});

/** Model only the native audio/device boundary; all session logic remains real. */
function audioDevice() {
  const track = { stop: vi.fn(), addEventListener: vi.fn((_event: string, _listener: () => void) => undefined) };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] } as unknown as MediaStream;
  const analyser = {
    fftSize: 4096, frequencyBinCount: 2048, smoothingTimeConstant: 0, minDecibels: 0, maxDecibels: 0,
    getByteFrequencyData: vi.fn((data: Uint8Array) => { data.fill(0); data[Math.round(500 / (48000 / 4096))] = 255; }),
    getFloatTimeDomainData: vi.fn((data: Float32Array) => data.fill(0.08)), disconnect: vi.fn(),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  const context = { sampleRate: 48000, state: 'running', resume: vi.fn(async (): Promise<void> => undefined), close: vi.fn(async (): Promise<void> => undefined), createAnalyser: () => analyser, createMediaStreamSource: () => source };
  const dependencies = { getUserMedia: vi.fn(async () => stream), createAudioContext: () => context as unknown as AudioContext };
  return { track, stream, analyser, source, context, dependencies };
}

describe('microphone lifecycle', () => {
  it('does not request microphone access until start is explicitly called', () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    expect(device.dependencies.getUserMedia).not.toHaveBeenCalled();
    expect(mic.getState().status).toBe('idle');
  });
  it('analyses the stream locally without connecting to the audio destination', async () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    expect(await mic.start()).toBe(true);
    expect(mic.getState().status).toBe('live');
    for (let index = 0; index < 20; index += 1) mic.read(1 / 60);
    const frame = mic.read(1 / 60);
    expect(frame.bands[2]).toBeGreaterThan(0.5);
    expect(frame.level).toBeGreaterThan(0);
    expect(device.source.connect).toHaveBeenCalledWith(device.analyser);
    expect(device.analyser.disconnect).not.toHaveBeenCalled();
  });
  it('releases microphone tracks, nodes and context on stop and clears the glow', async () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    await mic.start();
    await mic.stop();
    expect(device.track.stop).toHaveBeenCalledOnce();
    expect(device.source.disconnect).toHaveBeenCalledOnce();
    expect(device.analyser.disconnect).toHaveBeenCalledOnce();
    expect(device.context.close).toHaveBeenCalledOnce();
    expect(mic.getState().status).toBe('idle');
    expect([...mic.read(1 / 60).bands]).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('handles denied permission without replacing the page with an alert', async () => {
    const device = audioDevice();
    device.dependencies.getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const mic = createMicrophoneController(device.dependencies);
    expect(await mic.start()).toBe(false);
    expect(mic.getState().status).toBe('denied');
    expect(mic.getState().message).toMatch(/allow|permission/i);
    expect(device.context.close).toHaveBeenCalledOnce();
  });
  it('recognizes native permission errors from another browser realm', async () => {
    const device = audioDevice();
    device.dependencies.getUserMedia.mockRejectedValue({ name: 'NotAllowedError', message: 'Denied in another realm' });
    const mic = createMicrophoneController(device.dependencies);
    expect(await mic.start()).toBe(false);
    expect(mic.getState().status).toBe('denied');
  });
  it('handles an unavailable device', async () => {
    const device = audioDevice();
    device.dependencies.getUserMedia.mockRejectedValue(new DOMException('No device', 'NotFoundError'));
    const mic = createMicrophoneController(device.dependencies);
    expect(await mic.start()).toBe(false);
    expect(mic.getState().message).toMatch(/microphone/i);
  });
  it('deduplicates a pending permission request', async () => {
    const device = audioDevice();
    let resolveStream!: (stream: MediaStream) => void;
    device.dependencies.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const mic = createMicrophoneController(device.dependencies);
    const first = mic.start();
    const second = mic.start();
    expect(device.dependencies.getUserMedia).toHaveBeenCalledOnce();
    resolveStream(device.stream);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
  });
  it('stops a stream that arrives after a pending request was cancelled', async () => {
    const device = audioDevice();
    let resolveStream!: (stream: MediaStream) => void;
    device.dependencies.getUserMedia.mockReturnValue(new Promise((resolve) => { resolveStream = resolve; }));
    const mic = createMicrophoneController(device.dependencies);
    const pending = mic.start();
    await mic.stop();
    resolveStream(device.stream);
    expect(await pending).toBe(false);
    expect(device.track.stop).toHaveBeenCalledOnce();
    expect(mic.getState().status).toBe('idle');
  });
  it('can be stopped repeatedly without throwing', async () => {
    const mic = createMicrophoneController(audioDevice().dependencies);
    await mic.stop();
    await expect(mic.stop()).resolves.toBeUndefined();
  });
  it('exposes a usable unavailable state without browser audio support', async () => {
    const mic = createMicrophoneController({});
    expect(await mic.start()).toBe(false);
    expect(mic.getState().status).toBe('unavailable');
  });
  it('stops if the browser ends the microphone track', async () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    await mic.start();
    const callback = device.track.addEventListener.mock.calls.find((call) => call[0] === 'ended')?.[1];
    expect(callback).toBeTypeOf('function');
    callback!();
    expect(mic.getState().status).toBe('idle');
  });
  it('does not reopen an already active microphone', async () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    await mic.start();
    expect(await mic.start()).toBe(true);
    expect(device.dependencies.getUserMedia).toHaveBeenCalledOnce();
  });
  it('lets real silence settle the glow and breathing completely', async () => {
    const device = audioDevice();
    const mic = createMicrophoneController(device.dependencies);
    await mic.start();
    for (let index = 0; index < 30; index += 1) mic.read(1 / 60);
    device.analyser.getByteFrequencyData.mockImplementation((data) => { data.fill(0); });
    device.analyser.getFloatTimeDomainData.mockImplementation((data) => data.fill(0));
    for (let index = 0; index < 180; index += 1) mic.read(1 / 60);
    const frame = mic.read(1 / 60);
    expect(frame.level).toBeLessThan(0.001);
    expect(Math.max(...frame.bands)).toBeLessThan(0.001);
    expect(getVoiceBreath(frame).height).toBeLessThan(0.001);
  });
  it('gates the spectrum of quiet device noise as well as the broadband level', async () => {
    const device = audioDevice();
    device.analyser.getFloatTimeDomainData.mockImplementation((data) => data.fill(0.001));
    const mic = createMicrophoneController(device.dependencies);
    await mic.start();
    for (let index = 0; index < 60; index += 1) mic.read(1 / 60);
    const frame = mic.read(1 / 60);
    expect(frame.level).toBe(0);
    expect([...frame.bands]).toEqual([0, 0, 0, 0, 0, 0]);
  });
  it('releases the stream if the audio context cannot resume', async () => {
    const device = audioDevice();
    device.context.resume.mockRejectedValue(new Error('Audio context blocked'));
    const mic = createMicrophoneController(device.dependencies);
    expect(await mic.start()).toBe(false);
    expect(device.track.stop).toHaveBeenCalledOnce();
    expect(mic.getState().status).toBe('error');
  });
  it('preserves cancellation if permission cleanup resolves later', async () => {
    const device = audioDevice();
    let finishClose!: () => void;
    device.context.close.mockReturnValue(new Promise<void>((resolve) => { finishClose = resolve; }));
    device.dependencies.getUserMedia.mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
    const mic = createMicrophoneController(device.dependencies);
    const opening = mic.start();
    await Promise.resolve();
    await Promise.resolve();
    await mic.stop();
    finishClose();
    await opening;
    expect(mic.getState().status).toBe('idle');
  });
});
