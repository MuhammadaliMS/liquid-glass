export declare const AUDIO_FREQUENCIES: readonly [readonly [30, 120], readonly [120, 300], readonly [300, 700], readonly [700, 1600], readonly [1600, 4000], readonly [4000, 10000]];
export type MicrophoneStatus = 'idle' | 'requesting' | 'live' | 'denied' | 'unavailable' | 'error';
export interface AudioFrame {
    bands: Float32Array;
    level: number;
}
export interface MicrophoneState {
    status: MicrophoneStatus;
    message: string;
}
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
export declare function extractFrequencyBands(data: Uint8Array, sampleRate: number, fftSize: number, output?: Float32Array<ArrayBuffer>): Float32Array;
/** Bound audio-driven expansion and respect reduced motion. */
export declare function getVoiceBreath(frame: AudioFrame, reducedMotion?: boolean): {
    width: number;
    height: number;
};
/** Own a visitor-initiated microphone analysis session. */
export declare function createMicrophoneController(dependencies: MicrophoneDependencies): MicrophoneController;
/** Smooth one analyser reading into a frame: quick attack, slow release, gated below the noise floor. */
export declare function readSpectrum(analyser: AnalyserNode, sampleRate: number, deltaSeconds: number, frame: AudioFrame, targets: Float32Array, frequencyData: Uint8Array, waveform: Float32Array): AudioFrame;
export interface NodeListener {
    read: (deltaSeconds: number) => AudioFrame;
    disconnect: () => void;
}
/** Listen to any Web Audio node (a player, a synth, an <audio> element's source) without changing what it plays. */
export declare function listenToNode(node: AudioNode): NodeListener;
