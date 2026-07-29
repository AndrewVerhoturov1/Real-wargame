let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let combatAudioEnabled = true;
let pendingShotCount = 0;
let unlockPromise: Promise<boolean> | null = null;
let rifleShotBuffer: AudioBuffer | null = null;
let outputAnalyser: AnalyserNode | null = null;
let analyserSamples: Float32Array<ArrayBuffer> | null = null;
let analyserFrame = 0;
let analyserDeadlineMs = 0;
let playedShotCount = 0;
let lastOutputPeak = 0;
let lastShotStartedAtMs = 0;
let lastError: string | null = null;

export interface CombatAudioDiagnostics {
  readonly enabled: boolean;
  readonly contextState: AudioContextState | 'unavailable';
  readonly audioUnlocked: boolean;
  readonly bufferReady: boolean;
  readonly bufferDurationSeconds: number;
  readonly pendingShotCount: number;
  readonly playedShotCount: number;
  readonly lastOutputPeak: number;
  readonly lastShotStartedAtMs: number;
  readonly lastError: string | null;
}

type CombatAudioDebugWindow = Window & {
  __realWargameCombatAudio?: {
    read(): CombatAudioDiagnostics;
  };
};

export function setCombatAudioEnabled(enabled: boolean): void {
  combatAudioEnabled = enabled;
  if (!enabled) pendingShotCount = 0;
}

export function isCombatAudioEnabled(): boolean {
  return combatAudioEnabled;
}

export function readCombatAudioDiagnostics(): CombatAudioDiagnostics {
  return {
    enabled: combatAudioEnabled,
    contextState: audioContext?.state ?? 'unavailable',
    audioUnlocked,
    bufferReady: rifleShotBuffer !== null,
    bufferDurationSeconds: rifleShotBuffer?.duration ?? 0,
    pendingShotCount,
    playedShotCount,
    lastOutputPeak,
    lastShotStartedAtMs,
    lastError,
  };
}

export async function unlockCombatAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context || !combatAudioEnabled) return false;
  ensureRifleShotBuffer(context);
  if (context.state === 'running') {
    audioUnlocked = true;
    flushPendingShots(context);
    return true;
  }
  if (unlockPromise) return unlockPromise;

  unlockPromise = (async () => {
    try {
      if (context.state === 'suspended') await context.resume();
      audioUnlocked = context.state === 'running';
      if (audioUnlocked) {
        warmAudioOutput(context);
        flushPendingShots(context);
      }
      return audioUnlocked;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      unlockPromise = null;
    }
  })();
  return unlockPromise;
}

/**
 * Browsers allow sound only after a user action. The shared context and the
 * local rifle buffer are prepared immediately; the first normal pointer or
 * keyboard action only resumes the context. No separate sound button exists.
 */
export function installCombatAudioUnlock(target: Window = window): () => void {
  let destroyed = false;
  let unlocking = false;
  const context = getAudioContext();
  if (context) ensureRifleShotBuffer(context);
  (target as CombatAudioDebugWindow).__realWargameCombatAudio = { read: readCombatAudioDiagnostics };

  const removeListeners = (): void => {
    target.removeEventListener('pointerdown', handleGesture, true);
    target.removeEventListener('pointerup', handleGesture, true);
    target.removeEventListener('keydown', handleGesture, true);
  };
  const handleGesture = (): void => {
    if (destroyed || unlocking || audioUnlocked) {
      if (audioUnlocked) removeListeners();
      return;
    }
    unlocking = true;
    void unlockCombatAudio().then((unlocked) => {
      unlocking = false;
      if (unlocked) removeListeners();
    });
  };

  if (!audioUnlocked) {
    target.addEventListener('pointerdown', handleGesture, { capture: true, passive: true });
    target.addEventListener('pointerup', handleGesture, { capture: true, passive: true });
    target.addEventListener('keydown', handleGesture, true);
  }

  return () => {
    destroyed = true;
    removeListeners();
    delete (target as CombatAudioDebugWindow).__realWargameCombatAudio;
  };
}

export function playRifleShot(): void {
  if (!combatAudioEnabled) return;
  const context = getAudioContext();
  if (!context) return;
  ensureRifleShotBuffer(context);
  if (context.state === 'running') {
    audioUnlocked = true;
    playRifleShotNow(context);
    return;
  }

  pendingShotCount = Math.min(8, pendingShotCount + 1);
  void unlockCombatAudio();
}

function flushPendingShots(context: AudioContext): void {
  if (!combatAudioEnabled || context.state !== 'running' || pendingShotCount === 0) return;
  const count = pendingShotCount;
  pendingShotCount = 0;
  for (let index = 0; index < count; index += 1) {
    window.setTimeout(() => playRifleShotNow(context), index * 55);
  }
}

function playRifleShotNow(context: AudioContext): void {
  if (!combatAudioEnabled || context.state !== 'running') return;
  const buffer = ensureRifleShotBuffer(context);
  const analyser = ensureOutputAnalyser(context);
  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const compressor = context.createDynamicsCompressor();
  const master = context.createGain();

  source.buffer = buffer;
  highpass.type = 'highpass';
  highpass.frequency.value = 32;
  compressor.threshold.value = -14;
  compressor.knee.value = 8;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.12;
  master.gain.value = 0.9;

  source.connect(highpass);
  highpass.connect(compressor);
  compressor.connect(master);
  master.connect(analyser);

  source.addEventListener('ended', () => {
    source.disconnect();
    highpass.disconnect();
    compressor.disconnect();
    master.disconnect();
  }, { once: true });

  lastOutputPeak = 0;
  lastShotStartedAtMs = performance.now();
  playedShotCount += 1;
  source.start(context.currentTime);
  sampleOutputPeak(analyser, buffer.duration * 1000 + 120);
}

function ensureRifleShotBuffer(context: AudioContext): AudioBuffer {
  if (rifleShotBuffer && rifleShotBuffer.sampleRate === context.sampleRate) return rifleShotBuffer;
  const durationSeconds = 0.42;
  const frameCount = Math.max(1, Math.ceil(context.sampleRate * durationSeconds));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const samples = buffer.getChannelData(0);
  let randomState = 0x7f4a7c15;
  let previousNoise = 0;
  let peak = 0;

  for (let index = 0; index < frameCount; index += 1) {
    const time = index / context.sampleRate;
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    const white = randomState / 0xffffffff * 2 - 1;
    const brightNoise = white - previousNoise * 0.55;
    previousNoise = white;

    const crackEnvelope = Math.exp(-time * 34);
    const bodyEnvelope = Math.exp(-time * 11.5);
    const frequency = 96 - 54 * Math.min(1, time / durationSeconds);
    const body = Math.sin(2 * Math.PI * frequency * time) * bodyEnvelope * 0.56;
    const crack = brightNoise * crackEnvelope * 0.82;
    const mechanical = Math.sin(2 * Math.PI * 610 * time) * Math.exp(-time * 48) * 0.18;
    const firstReflection = time > 0.043
      ? Math.sin(2 * Math.PI * 71 * (time - 0.043)) * Math.exp(-(time - 0.043) * 15) * 0.22
      : 0;
    const secondReflection = time > 0.092
      ? brightNoise * Math.exp(-(time - 0.092) * 24) * 0.12
      : 0;
    const value = crack + body + mechanical + firstReflection + secondReflection;
    samples[index] = value;
    peak = Math.max(peak, Math.abs(value));
  }

  const normalization = peak > 0 ? 0.94 / peak : 1;
  for (let index = 0; index < samples.length; index += 1) samples[index] *= normalization;
  rifleShotBuffer = buffer;
  return buffer;
}

function ensureOutputAnalyser(context: AudioContext): AnalyserNode {
  if (outputAnalyser && outputAnalyser.context === context) return outputAnalyser;
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0;
  analyser.connect(context.destination);
  outputAnalyser = analyser;
  analyserSamples = new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
  return analyser;
}

function sampleOutputPeak(analyser: AnalyserNode, durationMs: number): void {
  analyserDeadlineMs = Math.max(analyserDeadlineMs, performance.now() + durationMs);
  if (analyserFrame !== 0) return;

  const sample = (): void => {
    analyserFrame = 0;
    const values = analyserSamples
      ?? new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT));
    analyserSamples = values;
    analyser.getFloatTimeDomainData(values);
    let peak = 0;
    for (let index = 0; index < values.length; index += 1) peak = Math.max(peak, Math.abs(values[index] ?? 0));
    lastOutputPeak = Math.max(lastOutputPeak, peak);
    if (performance.now() < analyserDeadlineMs) analyserFrame = window.requestAnimationFrame(sample);
  };

  analyserFrame = window.requestAnimationFrame(sample);
}

function warmAudioOutput(context: AudioContext): void {
  const source = context.createOscillator();
  const gain = context.createGain();
  source.type = 'sine';
  source.frequency.value = 40;
  gain.gain.value = 0.00001;
  source.connect(gain);
  gain.connect(context.destination);
  source.addEventListener('ended', () => {
    source.disconnect();
    gain.disconnect();
  }, { once: true });
  source.start(context.currentTime);
  source.stop(context.currentTime + 0.01);
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  try {
    audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
    audioUnlocked = audioContext.state === 'running';
    audioContext.addEventListener('statechange', () => {
      audioUnlocked = audioContext?.state === 'running';
    });
    return audioContext;
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    return null;
  }
}
