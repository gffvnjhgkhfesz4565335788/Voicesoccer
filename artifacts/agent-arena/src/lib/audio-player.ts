export class AudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlayingAudio: boolean = false;
  private sources: AudioBufferSourceNode[] = [];
  /** Pending drain promises waiting for sources to empty */
  private drainResolvers: Array<() => void> = [];
  /** Total seconds of audio scheduled (for logging) */
  private totalScheduledSecs: number = 0;

  constructor() {}

  private initContext() {
    if (!this.context) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.context = new AudioCtx();
      }
    }
  }

  enqueueChunk(base64Pcm: string): void {
    this.initContext();
    if (!this.context) return;

    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    try {
      const binaryStr = atob(base64Pcm);
      const len = binaryStr.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }

      const int16 = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / 32768.0;
      }

      // Gemini Live audio: 24 kHz, mono, PCM16
      const audioBuffer = this.context.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = this.context.createGain();
      gainNode.gain.value = 1.0;
      source.connect(gainNode);
      gainNode.connect(this.context.destination);

      if (this.nextStartTime < this.context.currentTime) {
        this.nextStartTime = this.context.currentTime + 0.05; // slight buffer on first chunk
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.totalScheduledSecs += audioBuffer.duration;
      this.isPlayingAudio = true;
      this.sources.push(source);

      source.onended = () => {
        const idx = this.sources.indexOf(source);
        if (idx !== -1) this.sources.splice(idx, 1);
        if (this.sources.length === 0) {
          this.isPlayingAudio = false;
          // Resolve all pending drain promises
          const resolvers = this.drainResolvers.splice(0);
          resolvers.forEach(r => r());
        }
      };
    } catch (err) {
      console.error('[AudioPlayer] enqueueChunk error:', err);
    }
  }

  /**
   * Returns a promise that resolves once all currently queued audio has
   * finished playing. Resolves immediately if nothing is queued.
   */
  waitForDrain(): Promise<void> {
    if (this.sources.length === 0) {
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.drainResolvers.push(resolve);
    });
  }

  stop(): void {
    this.sources.forEach(source => {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // ignore — already stopped
      }
    });
    this.sources = [];
    this.nextStartTime = 0;
    this.isPlayingAudio = false;
    this.totalScheduledSecs = 0;
    // Resolve pending drains so callers aren't left hanging
    const resolvers = this.drainResolvers.splice(0);
    resolvers.forEach(r => r());
  }

  get isPlaying(): boolean {
    return this.isPlayingAudio;
  }

  get scheduledSeconds(): number {
    return this.totalScheduledSecs;
  }
}
