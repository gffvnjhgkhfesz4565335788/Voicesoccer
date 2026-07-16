import { useEffect, useRef } from 'react';
import { useAgentConversation, AgentState } from '../hooks/useAgentConversation';
import { WaveformBars } from '../components/WaveformBars';
import { Power, SquareSquare } from 'lucide-react';

function AgentPanel({ 
  name, 
  state, 
  colorHex, 
  glowClass, 
  textGlowClass 
}: { 
  name: string; 
  state: AgentState; 
  colorHex: string; 
  glowClass: string; 
  textGlowClass: string; 
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [state.transcript, state.liveChunk]);

  const isActive = state.status === 'speaking' || state.status === 'connecting';
  const isListening = state.status === 'listening';
  
  return (
    <div className={`flex flex-col h-full bg-card border border-border rounded-xl overflow-hidden transition-all duration-500 relative ${isActive ? glowClass : (isListening ? 'border-opacity-50 border-primary/50' : '')}`}>
      
      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.03] bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px] z-10" />

      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-black/20">
        <h2 className={`text-xl font-bold tracking-widest uppercase ${isActive ? textGlowClass : 'text-muted-foreground'} transition-colors duration-300`} style={{ color: isActive ? colorHex : undefined }}>
          {name}
        </h2>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold tracking-widest uppercase px-2 py-1 rounded bg-black/40 ${state.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {state.status}
          </span>
          <div className={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : 'opacity-30'}`} style={{ backgroundColor: colorHex }} />
        </div>
      </div>

      {/* Visualizer Area */}
      <div className="flex-shrink-0 flex items-center justify-center h-32 bg-black/40 border-b border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/20" />
        <WaveformBars isActive={state.isSpeaking} color={colorHex} count={32} />
      </div>

      {/* Transcript Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm leading-relaxed relative z-20">
        {state.transcript.map((t, idx) => (
          <div key={idx} className="opacity-90">
            <span style={{ color: colorHex }} className="mr-2 opacity-70">[{new Date(t.timestamp).toLocaleTimeString()}]</span>
            <span className="text-foreground/90">{t.text}</span>
          </div>
        ))}
        
        {state.liveChunk && (
          <div className="text-foreground/80">
            <span style={{ color: colorHex }} className="mr-2 opacity-50">[{new Date().toLocaleTimeString()}]</span>
            {state.liveChunk}
            <span className="inline-block w-2 h-4 ml-1 bg-current animate-pulse align-middle" />
          </div>
        )}

        {state.transcript.length === 0 && !state.liveChunk && state.status !== 'error' && (
          <div className="text-muted-foreground/30 italic flex h-full items-center justify-center">
            Awaiting input sequence...
          </div>
        )}
      </div>
    </div>
  );
}

export function Arena() {
  const {
    alphaState,
    betaState,
    conversationStatus,
    error,
    startConversation,
    stopConversation
  } = useAgentConversation();

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-mono selection:bg-primary/30">
      
      {/* Header */}
      <header className="flex-shrink-0 p-6 flex flex-col items-center justify-center border-b border-border bg-black/20">
        <h1 className="text-3xl font-bold tracking-[0.2em] text-white text-glow-blue mb-2">AGENT ARENA</h1>
        <p className="text-xs text-muted-foreground tracking-widest uppercase">Gemini Live · AI-to-AI Dialogue</p>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 lg:p-8 flex flex-col lg:flex-row gap-6 max-w-[1800px] mx-auto w-full">
        <div className="flex-1 min-h-[400px]">
          <AgentPanel 
            name="Agent Alpha" 
            state={alphaState} 
            colorHex="#3b82f6" 
            glowClass="glow-blue border-[#3b82f6]/30"
            textGlowClass="text-glow-blue"
          />
        </div>
        
        {/* Mobile controls usually stack, desktop goes between or below. Let's put controls center-bottom below panels or inline if narrow. But flex-col lg:flex-row is good. We'll put controls in a fixed bottom bar or below the panels. */}
        <div className="flex-1 min-h-[400px]">
          <AgentPanel 
            name="Agent Beta" 
            state={betaState} 
            colorHex="#f59e0b" 
            glowClass="glow-amber border-[#f59e0b]/30"
            textGlowClass="text-glow-amber"
          />
        </div>
      </main>

      {/* Control Bar */}
      <div className="flex-shrink-0 p-6 border-t border-border bg-card/50 flex flex-col items-center justify-center gap-4">
        {error && (
          <div className="text-destructive bg-destructive/10 px-4 py-2 rounded-md border border-destructive/20 text-sm max-w-2xl text-center">
            SYS_ERR: {error}
          </div>
        )}

        {conversationStatus === 'idle' || conversationStatus === 'error' || conversationStatus === 'stopping' ? (
          <button
            onClick={startConversation}
            disabled={conversationStatus === 'stopping'}
            className="group relative px-8 py-4 bg-green-500/10 text-green-500 border border-green-500/50 hover:bg-green-500/20 hover:border-green-400 hover:text-white transition-all duration-300 rounded-lg flex items-center gap-3 font-bold tracking-widest uppercase glow-green disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Power className="w-5 h-5 group-hover:animate-pulse" />
            Initialize Sequence
          </button>
        ) : (
          <button
            onClick={stopConversation}
            className="group relative px-8 py-4 bg-destructive/10 text-destructive border border-destructive/50 hover:bg-destructive/20 hover:border-destructive hover:text-white transition-all duration-300 rounded-lg flex items-center gap-3 font-bold tracking-widest uppercase glow-red"
          >
            <SquareSquare className="w-5 h-5" />
            Terminate Sequence
          </button>
        )}
      </div>

      {/* Footer */}
      <footer className="py-4 text-center border-t border-border/50">
        <p className="text-[10px] text-muted-foreground/50 tracking-[0.3em] uppercase">Powered by Gemini Live API</p>
      </footer>
    </div>
  );
}
