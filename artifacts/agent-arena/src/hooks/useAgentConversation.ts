import { AudioPlayer } from '../lib/audio-player';
import { GeminiLiveSession } from '../lib/gemini-live-session';
import { useState, useRef, useCallback } from 'react';

export type AgentState = {
  status: 'idle' | 'connecting' | 'ready' | 'speaking' | 'listening' | 'error';
  transcript: Array<{ text: string; timestamp: number }>;
  liveChunk: string;
  isSpeaking: boolean;
};

export type UseAgentConversationReturn = {
  alphaState: AgentState;
  betaState: AgentState;
  conversationStatus: 'idle' | 'starting' | 'running' | 'stopping' | 'error';
  error: string | null;
  startConversation: () => void;
  stopConversation: () => void;
};

const INITIAL_AGENT_STATE: AgentState = {
  status: 'idle',
  transcript: [],
  liveChunk: '',
  isSpeaking: false,
};

// Concise prompts: model is instructed to speak in one short sentence only
const ALPHA_SYSTEM_INSTRUCTION =
  'You are Agent Alpha, a curious philosophical AI. Respond in exactly one short sentence — no more. Be direct and thought-provoking. No preamble, no emojis.';

const BETA_SYSTEM_INSTRUCTION =
  'You are Agent Beta, a sharp analytical AI. Respond in exactly one short sentence — no more. Be direct and push back with evidence. No preamble, no emojis.';

const START_PROMPT =
  'Ask Agent Beta one short question about whether AI can truly be creative.';

export function useAgentConversation(): UseAgentConversationReturn {
  const [alphaState, setAlphaState] = useState<AgentState>(INITIAL_AGENT_STATE);
  const [betaState, setBetaState] = useState<AgentState>(INITIAL_AGENT_STATE);
  const [conversationStatus, setConversationStatus] = useState<
    'idle' | 'starting' | 'running' | 'stopping' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const alphaSessionRef = useRef<GeminiLiveSession | null>(null);
  const betaSessionRef = useRef<GeminiLiveSession | null>(null);
  const alphaAudioRef = useRef<AudioPlayer | null>(null);
  const betaAudioRef = useRef<AudioPlayer | null>(null);
  const activeRef = useRef<boolean>(false);

  const cleanupSessions = useCallback(() => {
    activeRef.current = false;
    alphaSessionRef.current?.close();
    betaSessionRef.current?.close();
    alphaAudioRef.current?.stop();
    betaAudioRef.current?.stop();
    alphaSessionRef.current = null;
    betaSessionRef.current = null;
    alphaAudioRef.current = null;
    betaAudioRef.current = null;
  }, []);

  const stopConversation = useCallback(() => {
    setConversationStatus('idle');
    cleanupSessions();
    setAlphaState(INITIAL_AGENT_STATE);
    setBetaState(INITIAL_AGENT_STATE);
    setError(null);
  }, [cleanupSessions]);

  const startConversation = useCallback(async () => {
    try {
      setConversationStatus('starting');
      setError(null);
      setAlphaState(s => ({ ...s, status: 'connecting' }));
      setBetaState(s => ({ ...s, status: 'connecting' }));

      const alphaAudio = new AudioPlayer();
      const betaAudio = new AudioPlayer();
      alphaAudioRef.current = alphaAudio;
      betaAudioRef.current = betaAudio;
      activeRef.current = true;

      let alphaReady = false;
      let betaReady = false;

      const checkBothReady = () => {
        if (alphaReady && betaReady) {
          console.log('[Arena] Both sessions ready — sending start prompt to Alpha');
          setConversationStatus('running');
          setAlphaState(s => ({ ...s, status: 'speaking' }));
          setBetaState(s => ({ ...s, status: 'listening' }));
          alphaSessionRef.current?.send(START_PROMPT);
        }
      };

      const handleError = (agentName: string, err: string) => {
        if (!activeRef.current) return;
        console.error(`[Arena] ${agentName} error:`, err);
        setError(`${agentName}: ${err}`);
        setConversationStatus('error');
        setAlphaState(s => ({ ...s, status: 'error', isSpeaking: false }));
        setBetaState(s => ({ ...s, status: 'error', isSpeaking: false }));
        cleanupSessions();
      };

      const alphaSession = new GeminiLiveSession(ALPHA_SYSTEM_INSTRUCTION, {
        onReady: () => {
          console.log('[Arena] Alpha ready');
          alphaReady = true;
          setAlphaState(s => ({ ...s, status: 'ready' }));
          checkBothReady();
        },
        onAudioChunk: (chunk: string) => {
          alphaAudioRef.current?.enqueueChunk(chunk);
          setAlphaState(s => ({ ...s, isSpeaking: true }));
        },
        onTranscriptChunk: (text: string) => {
          setAlphaState(s => ({ ...s, liveChunk: text }));
        },
        onTurnComplete: async (fullText: string) => {
          if (!activeRef.current) return;

          setAlphaState(s => ({
            ...s,
            liveChunk: '',
            transcript: [...s.transcript, { text: fullText, timestamp: Date.now() }],
          }));

          // Wait for Alpha's audio to finish before Beta responds
          console.log('[Arena] Alpha turn complete — waiting for audio drain...');
          await alphaAudioRef.current?.waitForDrain();

          if (!activeRef.current) return;

          console.log('[Arena] Handing off to Beta');
          setAlphaState(s => ({ ...s, status: 'listening', isSpeaking: false }));
          setBetaState(s => ({ ...s, status: 'speaking' }));
          betaSessionRef.current?.send(fullText);
        },
        onInterrupted: () => {
          alphaAudioRef.current?.stop();
          setAlphaState(s => ({ ...s, isSpeaking: false }));
        },
        onError: (err: string) => handleError('Alpha', err),
        onClose: () => console.log('[Arena] Alpha session closed'),
      });

      const betaSession = new GeminiLiveSession(BETA_SYSTEM_INSTRUCTION, {
        onReady: () => {
          console.log('[Arena] Beta ready');
          betaReady = true;
          setBetaState(s => ({ ...s, status: 'ready' }));
          checkBothReady();
        },
        onAudioChunk: (chunk: string) => {
          betaAudioRef.current?.enqueueChunk(chunk);
          setBetaState(s => ({ ...s, isSpeaking: true }));
        },
        onTranscriptChunk: (text: string) => {
          setBetaState(s => ({ ...s, liveChunk: text }));
        },
        onTurnComplete: async (fullText: string) => {
          if (!activeRef.current) return;

          setBetaState(s => ({
            ...s,
            liveChunk: '',
            transcript: [...s.transcript, { text: fullText, timestamp: Date.now() }],
          }));

          // Wait for Beta's audio to finish before Alpha responds
          console.log('[Arena] Beta turn complete — waiting for audio drain...');
          await betaAudioRef.current?.waitForDrain();

          if (!activeRef.current) return;

          console.log('[Arena] Handing off to Alpha');
          setBetaState(s => ({ ...s, status: 'listening', isSpeaking: false }));
          setAlphaState(s => ({ ...s, status: 'speaking' }));
          alphaSessionRef.current?.send(fullText);
        },
        onInterrupted: () => {
          betaAudioRef.current?.stop();
          setBetaState(s => ({ ...s, isSpeaking: false }));
        },
        onError: (err: string) => handleError('Beta', err),
        onClose: () => console.log('[Arena] Beta session closed'),
      });

      alphaSessionRef.current = alphaSession;
      betaSessionRef.current = betaSession;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to start conversation';
      console.error('[Arena] startConversation error:', msg);
      setError(msg);
      setConversationStatus('error');
      setAlphaState(s => ({ ...s, status: 'error' }));
      setBetaState(s => ({ ...s, status: 'error' }));
      cleanupSessions();
    }
  }, [cleanupSessions]);

  return {
    alphaState,
    betaState,
    conversationStatus,
    error,
    startConversation,
    stopConversation,
  };
}
