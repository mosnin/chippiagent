'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, MicOff, X, Volume2, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AILoader } from '@/components/ui/ai-loader';

type VoiceState = 'connecting' | 'connected' | 'speaking' | 'idle';

interface VoiceModeProps {
  open: boolean;
  onClose: () => void;
  slug: string;
  onTranscript?: (role: 'user' | 'assistant', text: string) => void;
}

export function VoiceMode({ open, onClose, slug, onTranscript }: VoiceModeProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [error, setError] = useState('');
  const [userText, setUserText] = useState('');
  const [assistantText, setAssistantText] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Cleanup everything
  const cleanup = useCallback(() => {
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.srcObject = null;
      audioElRef.current = null;
    }
    setState('idle');
    setUserText('');
    setAssistantText('');
    setError('');
  }, []);

  // Start WebRTC session
  const connect = useCallback(async () => {
    try {
      setState('connecting');
      setError('');

      // 1. Get ephemeral token from our server
      const tokenRes = await fetch('/api/ai/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to start voice session');
      }
      const { token } = await tokenRes.json();
      if (!token) throw new Error('No session token received');

      // 2. Create peer connection
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // 3. Set up remote audio playback
      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElRef.current = audioEl;

      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0];
      };

      // 4. Capture microphone and add to peer connection
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      stream.getTracks().forEach(track => pc.addTrack(track, stream));

      // 5. Create data channel for events
      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);

          if (event.type === 'response.audio_transcript.delta') {
            setAssistantText(prev => prev + (event.delta || ''));
          }
          if (event.type === 'response.audio_transcript.done') {
            const fullText = event.transcript || '';
            if (fullText) onTranscript?.('assistant', fullText);
            // Reset for next response
            setTimeout(() => setAssistantText(''), 2000);
          }
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            const text = event.transcript || '';
            if (text) {
              setUserText(text);
              onTranscript?.('user', text);
              setTimeout(() => setUserText(''), 3000);
            }
          }
          if (event.type === 'response.audio.started' || event.type === 'output_audio_buffer.started') {
            setState('speaking');
          }
          if (event.type === 'response.audio.done' || event.type === 'response.done') {
            setState('connected');
          }
        } catch {
          // Ignore parse errors
        }
      };

      dc.onopen = () => {
        // Enable input audio transcription so we see what user said
        dc.send(JSON.stringify({
          type: 'session.update',
          session: {
            input_audio_transcription: { model: 'whisper-1' },
          },
        }));
        setState('connected');
      };

      dc.onclose = () => {
        cleanup();
      };

      // 6. Create and set local SDP offer
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // 7. Send offer to OpenAI Realtime API
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      });

      if (!sdpRes.ok) {
        throw new Error('Failed to connect to OpenAI Realtime');
      }

      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

    } catch (err: any) {
      console.error('[voice] connection error:', err);
      setError(err?.message || 'Connection failed');
      cleanup();
    }
  }, [slug, cleanup, onTranscript]);

  // Connect when opened, cleanup when closed
  useEffect(() => {
    if (open && state === 'idle') {
      connect();
    }
    if (!open && state !== 'idle') {
      cleanup();
    }
  }, [open, state, connect, cleanup]);

  // Mute/unmute
  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setIsMuted(!track.enabled);
      }
    }
  }, []);

  const handleClose = () => {
    cleanup();
    onClose();
  };

  const isActive = state === 'connected' || state === 'speaking';

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/95 backdrop-blur-md"
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-6 right-6 w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>

          {/* Status label */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-sm text-muted-foreground mb-8"
          >
            {state === 'connecting' ? 'Connecting…' :
             state === 'speaking' ? 'Speaking' :
             error ? '' :
             'Listening — just speak naturally'}
          </motion.p>

          {/* Main orb */}
          <div className="relative mb-8">
            {/* Outer pulse rings */}
            {state === 'connected' && (
              <>
                <motion.div
                  animate={{ scale: [1, 1.4], opacity: [0.15, 0] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-primary"
                  style={{ width: 160, height: 160, margin: 'auto', top: 0, bottom: 0, left: 0, right: 0 }}
                />
                <motion.div
                  animate={{ scale: [1, 1.25], opacity: [0.1, 0] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.5 }}
                  className="absolute inset-0 rounded-full bg-primary"
                  style={{ width: 160, height: 160, margin: 'auto', top: 0, bottom: 0, left: 0, right: 0 }}
                />
              </>
            )}
            {state === 'speaking' && (
              <motion.div
                animate={{ scale: [1, 1.2, 1.05, 1.15, 1], opacity: [0.2, 0.3, 0.15, 0.25, 0.2] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="absolute inset-0 rounded-full bg-primary"
                style={{ width: 160, height: 160, margin: 'auto', top: 0, bottom: 0, left: 0, right: 0 }}
              />
            )}

            <motion.div
              animate={state === 'speaking' ? { scale: [1, 1.08, 0.96, 1.04, 1] } : { scale: 1 }}
              transition={state === 'speaking' ? { duration: 1.2, repeat: Infinity } : {}}
              className={cn(
                'w-40 h-40 rounded-full flex items-center justify-center transition-colors relative',
                // No backdrop for `connecting` — the AILoader carries its own
                // ring + letters; a muted circle behind it would compete.
                state === 'connecting' ? 'bg-transparent' :
                state === 'speaking' ? 'bg-primary shadow-2xl shadow-primary/30' :
                isActive ? 'bg-primary/90 shadow-xl shadow-primary/20' :
                'bg-muted'
              )}
            >
              {state === 'connecting' ? (
                <AILoader word="Connecting" />
              ) : state === 'speaking' ? (
                <Volume2 size={40} className="text-primary-foreground" />
              ) : (
                <Mic size={40} className={isActive ? 'text-primary-foreground' : 'text-muted-foreground'} />
              )}
            </motion.div>
          </div>

          {/* Error display */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center space-y-3 mb-6"
            >
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={connect}
                className="text-sm font-medium text-primary hover:underline"
              >
                Try again
              </button>
            </motion.div>
          )}

          {/* Transcripts */}
          <div className="max-w-md w-full px-6 text-center space-y-2 min-h-[60px]">
            {userText && (
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-foreground"
              >
                <span className="text-muted-foreground">You: </span>{userText}
              </motion.p>
            )}
            {assistantText && (
              <motion.p
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-primary"
              >
                {assistantText}
              </motion.p>
            )}
          </div>

          {/* Bottom controls */}
          <div className="absolute bottom-10 flex items-center gap-4">
            {isActive && (
              <button
                onClick={toggleMute}
                className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center transition-colors',
                  isMuted
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-card border border-border text-muted-foreground hover:text-foreground'
                )}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
            )}
            <button
              onClick={handleClose}
              className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-lg hover:bg-destructive/90 transition-colors"
            >
              <Phone size={22} className="rotate-[135deg]" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
