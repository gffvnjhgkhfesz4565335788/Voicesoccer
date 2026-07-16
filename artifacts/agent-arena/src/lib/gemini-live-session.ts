export type SessionCallbacks = {
  onReady: () => void;
  onAudioChunk: (pcm24kBase64: string) => void;
  onTranscriptChunk: (text: string) => void;
  onTurnComplete: (fullTranscript: string) => void;
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
    // token.name from authTokens.create() is in format "auth_tokens/XXXXX"
    // which is passed directly as the access_token query param
    const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained?access_token=${token}`;
    console.log('[GeminiLive] Connecting to:', url.replace(/access_token=.*/, 'access_token=REDACTED'));

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('[GeminiLive] WebSocket opened, sending setup...');
      const setupMsg = {
        setup: {
          model: 'models/gemini-3.1-flash-live-preview',
          responseModalities: ['AUDIO'],
          outputAudioTranscription: {},
          systemInstruction: {
            parts: [{ text: this.systemInstruction }],
          },
        },
      };
      this.ws?.send(JSON.stringify(setupMsg));
    };

    this.ws.onmessage = (event) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data as string);
      } catch {
        console.warn('[GeminiLive] Failed to parse message:', event.data);
        return;
      }

      console.log('[GeminiLive] Received message keys:', Object.keys(data));

      // Handle server-side errors
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
          this.callbacks.onInterrupted();
        }

        const modelTurn = content.modelTurn as { parts?: Array<{ inlineData?: { data: string; mimeType: string } }> } | undefined;
        if (modelTurn?.parts) {
          for (const part of modelTurn.parts) {
            if (part.inlineData?.data) {
              this.callbacks.onAudioChunk(part.inlineData.data);
            }
          }
        }

        const outputTranscription = content.outputTranscription as { text?: string } | undefined;
        if (outputTranscription?.text) {
          this.accumulatedTranscript += outputTranscription.text;
          this.callbacks.onTranscriptChunk(this.accumulatedTranscript);
        }

        if (content.turnComplete) {
          const finalTranscript = this.accumulatedTranscript.trim();
          if (finalTranscript.length > 0) {
            this.callbacks.onTurnComplete(finalTranscript);
          }
          this.accumulatedTranscript = '';
        }
      }
    };

    this.ws.onerror = (e) => {
      console.error('[GeminiLive] WebSocket error event fired:', e);
      // onerror is always followed by onclose; let onclose provide the details
    };

    this.ws.onclose = (event) => {
      console.warn(
        `[GeminiLive] WebSocket closed — code: ${event.code}, reason: "${event.reason}", wasClean: ${event.wasClean}`,
      );
      this.ready = false;
      if (!this.closed) {
        // Abnormal closure or auth failure
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
    console.log('[GeminiLive] Sending text:', text.slice(0, 80) + (text.length > 80 ? '...' : ''));
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
