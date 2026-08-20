// Real "glass knock" click sound (public/sounds/hud-click.mp3, provided by
// the founder) decoded once into an AudioBuffer and replayed via Web Audio
// so rapid clicks can overlap without any playback lag or cutoff.

let audioContext: AudioContext | null = null;
let clickBufferPromise: Promise<AudioBuffer | null> | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioContextCtor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

function loadClickBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  if (!clickBufferPromise) {
    clickBufferPromise = fetch("/sounds/hud-click.mp3")
      .then((res) => res.arrayBuffer())
      .then((data) => ctx.decodeAudioData(data))
      .catch(() => null);
  }
  return clickBufferPromise;
}

// Kicks off the fetch/decode early (e.g. on mount) so the very first click
// doesn't have to wait on network + decode latency.
export function preloadHudClick() {
  const ctx = getAudioContext();
  if (ctx) void loadClickBuffer(ctx);
}

export function playHudClick() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();

  void loadClickBuffer(ctx).then((buffer) => {
    if (!buffer) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.5;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  });
}
