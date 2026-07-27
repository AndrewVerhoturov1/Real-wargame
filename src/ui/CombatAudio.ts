let audioContext: AudioContext | null = null;
let audioUnlocked = false;
let combatAudioEnabled = true;
let pendingShotCount = 0;
let unlockPromise: Promise<boolean> | null = null;

export function setCombatAudioEnabled(enabled: boolean): void {
  combatAudioEnabled = enabled;
  if (!enabled) pendingShotCount = 0;
}

export function isCombatAudioEnabled(): boolean {
  return combatAudioEnabled;
}

export async function unlockCombatAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context || !combatAudioEnabled) return false;
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
      if (audioUnlocked) flushPendingShots(context);
      return audioUnlocked;
    } catch {
      return false;
    } finally {
      unlockPromise = null;
    }
  })();
  return unlockPromise;
}

/**
 * Browsers allow sound only after a user action. The first pointer or keyboard
 * action silently unlocks the shared combat sound for both the ordinary game
 * and Combat Lab. The player never has to enable it separately.
 */
export function installCombatAudioUnlock(target: Window = window): () => void {
  let destroyed = false;
  let unlocking = false;

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
  };
}

export function playRifleShot(): void {
  if (!combatAudioEnabled) return;
  const context = getAudioContext();
  if (!context) return;
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
    window.setTimeout(() => playRifleShotNow(context), index * 38);
  }
}

function playRifleShotNow(context: AudioContext): void {
  if (!combatAudioEnabled || context.state !== 'running') return;
  const started = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, started);
  master.gain.exponentialRampToValueAtTime(0.92, started + 0.002);
  master.gain.exponentialRampToValueAtTime(0.0001, started + 0.24);
  master.connect(context.destination);

  const crack = context.createOscillator();
  const crackGain = context.createGain();
  crack.type = 'square';
  crack.frequency.setValueAtTime(175, started);
  crack.frequency.exponentialRampToValueAtTime(62, started + 0.105);
  crackGain.gain.setValueAtTime(0.44, started);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, started + 0.13);
  crack.connect(crackGain);
  crackGain.connect(master);
  crack.start(started);
  crack.stop(started + 0.14);

  const thump = context.createOscillator();
  const thumpGain = context.createGain();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(82, started);
  thump.frequency.exponentialRampToValueAtTime(38, started + 0.16);
  thumpGain.gain.setValueAtTime(0.38, started);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, started + 0.18);
  thump.connect(thumpGain);
  thumpGain.connect(master);
  thump.start(started);
  thump.stop(started + 0.19);

  const noiseDuration = 0.16;
  const noiseBuffer = context.createBuffer(1, Math.ceil(context.sampleRate * noiseDuration), context.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    const envelope = 1 - index / samples.length;
    samples[index] = (Math.random() * 2 - 1) * envelope;
  }
  const noise = context.createBufferSource();
  const noiseFilter = context.createBiquadFilter();
  const noiseGain = context.createGain();
  noise.buffer = noiseBuffer;
  noiseFilter.type = 'highpass';
  noiseFilter.frequency.setValueAtTime(620, started);
  noiseGain.gain.setValueAtTime(0.7, started);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, started + noiseDuration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(started);
  noise.stop(started + noiseDuration);

  window.setTimeout(() => master.disconnect(), 360);
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor({ latencyHint: 'interactive' });
  audioUnlocked = audioContext.state === 'running';
  return audioContext;
}
