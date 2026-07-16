export type SessionCallbacks = {
  onReady: () => void;
  onAudioChunk: (pcm24kBase64: string) => void;
  onTranscriptChunk: (text: string) => void;
  /** Called once per turn with the full transcript after generation is complete.
   *  May be async — the session does not await the return value, but the caller
   *  can use it to delay relaying the turn until audio has drained. */
  onTurnComplete: (fullTranscript: string) => void | Promise<void>;
  onInterrupted: () => void;
  onError: (err: string) => void;
  onClose: () => void;
};

export class GeminiLiveSession {
  private ws: WebSocket | null = null;
  private ready: boolean = false;
  private accumulatedTranscript: string = '';
  private closed: boolean = false;

  constructor(
    token: string,
    private systemInstruction: string,
    private callbacks: SessionCallbacks,
  ) {
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
    console.log('[GeminiLive] Connecting to:', url.replace(/access_token=.*/, 'access_token=REDACTED'));

    this.ws = new WebSocket(url);
    this.ws.binaryType = 'blob';

    this.ws.onopen = () => {
      console.log('[GeminiLive] WebSocket opened, sending setup...');
      const setupMsg = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          generationConfig: {
            responseModalities: ['AUDIO'],
          },
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: this.systemInstruction }],
          },
        },
      };
      this.ws?.send(JSON.stringify(setupMsg));
    };

    const messageToString = async (event: MessageEvent): Promise<string | null> => {
      if (event.data instanceof Blob) return await event.data.text();
      if (event.data instanceof ArrayBuffer) return new TextDecoder().decode(event.data);
      if (typeof event.data === 'string') return event.data;
      console.warn('[GeminiLive] Unrecognized message type:', typeof event.data);
      return null;
    };

    this.ws.onmessage = async (event) => {
      const raw = await messageToString(event);
      if (!raw || raw.trim().length === 0) return;

      let data: Record<string, unknown>;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.warn('[GeminiLive] Failed to parse message:', raw.slice(0, 100), err);
        return;
      }

      if (data.error) {
        const err = data.error as { message?: string; code?: number; status?: string };
        const msg = `Server error ${err.code ?? ''}: ${err.message ?? err.status ?? JSON.stringify(err)}`;
        console.error('[GeminiLive] Server error:', msg);
        this.callbacks.onError(msg);
        return;
      }

      if (data.setupComplete !== undefined) {
        console.log('[GeminiLive] Setup complete — session ready');
        this.ready = true;
        this.callbacks.onReady();
      }

      if (data.serverContent) {
        const content = data.serverContent as Record<string, unknown>;

        if (content.interrupted) {
          console.log('[GeminiLive] Interrupted by server');
          this.callbacks.onInterrupted();
        }

        // Audio chunks arrive in modelTurn.parts[].inlineData
        const modelTurn = content.modelTurn as {
          parts?: Array<{ inlineData?: { data: string; mimeType: string }; text?: string }>
        } | undefined;

        if (modelTurn?.parts) {
          let audioChunks = 0;
          for (const part of modelTurn.parts) {
            if (part.inlineData?.data) {
              audioChunks++;
              this.callbacks.onAudioChunk(part.inlineData.data);
            }
          }
          if (audioChunks > 0) {
            console.log(`[GeminiLive] Dispatched ${audioChunks} audio chunk(s)`);
          }
        }

        // Output transcription of the audio (arrives alongside or after audio chunks)
        const outputTranscription = content.outputTranscription as { text?: string } | undefined;
        if (outputTranscription?.text) {
          this.accumulatedTranscript += outputTranscription.text;
          this.callbacks.onTranscriptChunk(this.accumulatedTranscript);
        }

        // turnComplete = model finished generating for this turn.
        // NOTE: audio may still be playing locally — callers must await their
        // AudioPlayer.waitForDrain() before relaying to the other agent.
        if (content.turnComplete) {
          const finalTranscript = this.accumulatedTranscript.trim();
          console.log('[GeminiLive] Turn complete, transcript length:', finalTranscript.length);
          this.accumulatedTranscript = '';
          if (finalTranscript.length > 0) {
            // Fire and forget — caller may return a Promise to do async work
            void this.callbacks.onTurnComplete(finalTranscript);
          }
        }
      }
    };

    this.ws.onerror = (e) => {
      console.error('[GeminiLive] WebSocket error:', e);
    };

    this.ws.onclose = (event) => {
      console.warn(
        `[GeminiLive] WebSocket closed — code: ${event.code}, reason: "${event.reason}", wasClean: ${event.wasClean}`,
      );
      this.ready = false;
      if (!this.closed) {
        if (event.code !== 1000) {
          const reasonText = event.reason
            ? event.reason
            : event.code === 1006
              ? 'Connection dropped (possible auth failure or network issue)'
              : event.code === 4401
                ? 'Unauthorized — token may be invalid or expired'
                : `WebSocket closed with code ${event.code}`;
          this.callbacks.onError(reasonText);
        } else {
          this.callbacks.onClose();
        }
      }
    };
  }

  send(text: string): void {
    if (!this.ready || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[GeminiLive] Cannot send — session not ready');
      return;
    }
    console.log('[GeminiLive] Sending text to model:', text.slice(0, 80) + (text.length > 80 ? '...' : ''));
    this.ws.send(JSON.stringify({ realtimeInput: { text } }));
  }

  close(): void {
    this.closed = true;
    this.ready = false;
    if (this.ws) {
      this.ws.close(1000, 'Session ended by user');
      this.ws = null;
    }
  }

  get isReady(): boolean {
    return this.ready;
  }
}
