export class AudioPlayer {
  private context: AudioContext | null = null;
  private nextStartTime: number = 0;
  private isPlayingAudio: boolean = false;
  private sources: AudioBufferSourceNode[] = [];

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

      const audioBuffer = this.context.createBuffer(1, float32.length, 24000);
      audioBuffer.getChannelData(0).set(float32);

      const source = this.context.createBufferSource();
      source.buffer = audioBuffer;

      const gainNode = this.context.createGain();
      gainNode.gain.value = 1.0;

      source.connect(gainNode);
      gainNode.connect(this.context.destination);

      if (this.nextStartTime < this.context.currentTime) {
        this.nextStartTime = this.context.currentTime + 0.05; // slight buffer
      }

      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      this.isPlayingAudio = true;
      this.sources.push(source);

      source.onended = () => {
        const idx = this.sources.indexOf(source);
        if (idx !== -1) {
          this.sources.splice(idx, 1);
        }
        if (this.sources.length === 0) {
          this.isPlayingAudio = false;
        }
      };
    } catch (err) {
      console.error("AudioPlayer enqueueChunk error", err);
    }
  }

  stop(): void {
    this.sources.forEach((source) => {
      try {
        source.stop();
        source.disconnect();
      } catch (e) {
        // ignore
      }
    });
    this.sources = [];
    this.nextStartTime = 0;
    this.isPlayingAudio = false;
  }

  get isPlaying(): boolean {
    return this.isPlayingAudio;
  }
}
