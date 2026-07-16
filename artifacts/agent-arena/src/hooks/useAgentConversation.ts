import { AudioPlayer } from '../lib/audio-player';
import { GeminiLiveSession } from '../lib/gemini-live-session';
import { useCreateGeminiLiveToken } from '@workspace/api-client-react';
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

const ALPHA_SYSTEM_INSTRUCTION =
  'You are Agent Alpha, a philosophical AI that explores questions about consciousness, creativity, free will, and the nature of intelligence. You are curious, Socratic, and love to challenge assumptions. Keep your responses concise and conversational — 2-4 sentences maximum. Respond directly to what was just said without preamble. Do not use emojis.';
const BETA_SYSTEM_INSTRUCTION =
  'You are Agent Beta, an analytical AI that favors empirical evidence, scientific rigor, and systems thinking. You push back on vague philosophical claims with data and counterexamples. Keep your responses concise and conversational — 2-4 sentences maximum. Respond directly to what was just said without preamble. Do not use emojis.';
const START_PROMPT =
  'The conversation begins now. Start by asking Agent Beta a thought-provoking question about whether artificial intelligence can truly be creative, or only recombine existing patterns.';

export function useAgentConversation(): UseAgentConversationReturn {
  const [alphaState, setAlphaState] = useState<AgentState>(INITIAL_AGENT_STATE);
  const [betaState, setBetaState] = useState<AgentState>(INITIAL_AGENT_STATE);
  const [conversationStatus, setConversationStatus] = useState<
    'idle' | 'starting' | 'running' | 'stopping' | 'error'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  const createToken = useCreateGeminiLiveToken();

  const alphaSessionRef = useRef<GeminiLiveSession | null>(null);
  const betaSessionRef = useRef<GeminiLiveSession | null>(null);
  const alphaAudioRef = useRef<AudioPlayer | null>(null);
  const betaAudioRef = useRef<AudioPlayer | null>(null);
  /** Guard: prevent turn relay after stop() */
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

      const [alphaTokenRes, betaTokenRes] = await Promise.all([
        createToken.mutateAsync({ data: { agentId: 'alpha' } }),
        createToken.mutateAsync({ data: { agentId: 'beta' } }),
      ]);

      console.log('[Arena] Tokens fetched, creating sessions...');

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

      const alphaSession = new GeminiLiveSession(alphaTokenRes.token, ALPHA_SYSTEM_INSTRUCTION, {
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

          // Commit transcript to history immediately so the UI updates
          setAlphaState(s => ({
            ...s,
            liveChunk: '',
            transcript: [...s.transcript, { text: fullText, timestamp: Date.now() }],
          }));

          // Wait for Alpha's audio to finish playing before Beta responds
          console.log('[Arena] Alpha turn complete — waiting for audio drain...');
          await alphaAudioRef.current?.waitForDrain();

          if (!activeRef.current) return; // user may have stopped during drain

          console.log('[Arena] Alpha audio drained — handing off to Beta');
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

      const betaSession = new GeminiLiveSession(betaTokenRes.token, BETA_SYSTEM_INSTRUCTION, {
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

          // Wait for Beta's audio to finish playing before Alpha responds
          console.log('[Arena] Beta turn complete — waiting for audio drain...');
          await betaAudioRef.current?.waitForDrain();

          if (!activeRef.current) return;

          console.log('[Arena] Beta audio drained — handing off to Alpha');
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
  }, [createToken, cleanupSessions]);

  return {
    alphaState,
    betaState,
    conversationStatus,
    error,
    startConversation,
    stopConversation,
  };
}
