let audioContext: AudioContext | null = null;
let audioUnlocked = false;

export async function unlockCombatAudio(): Promise<boolean> {
  const context = getAudioContext();
  if (!context) return false;
  try {
    if (context.state === 'suspended') await context.resume();
    audioUnlocked = context.state === 'running';
    return audioUnlocked;
  } catch {
    return false;
  }
}

export function playRifleShot(): void {
  const context = getAudioContext();
  if (!context || !audioUnlocked || context.state !== 'running') return;

  const started = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, started);
  master.gain.exponentialRampToValueAtTime(0.65, started + 0.002);
  master.gain.exponentialRampToValueAtTime(0.0001, started + 0.18);
  master.connect(context.destination);

  const crack = context.createOscillator();
  const crackGain = context.createGain();
  crack.type = 'square';
  crack.frequency.setValueAtTime(145, started);
  crack.frequency.exponentialRampToValueAtTime(58, started + 0.09);
  crackGain.gain.setValueAtTime(0.38, started);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, started + 0.11);
  crack.connect(crackGain);
  crackGain.connect(master);
  crack.start(started);
  crack.stop(started + 0.12);

  const noiseDuration = 0.12;
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
  noiseFilter.frequency.setValueAtTime(700, started);
  noiseGain.gain.setValueAtTime(0.52, started);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, started + noiseDuration);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(started);
  noise.stop(started + noiseDuration);

  window.setTimeout(() => master.disconnect(), 300);
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === 'undefined') return null;
  const AudioContextConstructor = window.AudioContext
    ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}
