'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Browser SpeechRecognition isn't typed in lib.dom.d.ts; declare just enough
// to use it without depending on @types/dom-speech-recognition.
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: { [k: number]: { [k: number]: { transcript: string } } } & { length: number } }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionLike;
}

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export interface UseDictationResult {
  /** True if the browser supports SpeechRecognition. False = hide UI / fall back. */
  supported: boolean;
  /** True while the recognizer is actively listening. */
  listening: boolean;
  /** Live transcript — updates while listening, frozen after stop. */
  transcript: string;
  /** Most recent error string (or null). */
  error: string | null;
  /** Begin listening. No-op if already listening or unsupported. */
  start: () => void;
  /** Stop listening. Triggers `onFinal` with the final transcript if present. */
  stop: () => void;
  /** Reset transcript + error to empty. */
  reset: () => void;
}

/**
 * Hold-to-dictate hook backed by the browser's Web Speech API. Returns the
 * transcript live (so callers can show a "listening…" preview) and notifies
 * via `onFinal` when the recognizer commits a result. Used by the chippi-bar
 * mic button: pointerdown → start, pointerup → stop, transfer transcript
 * into the input.
 *
 * Feature-detected. Browsers without SpeechRecognition (Firefox, some
 * webviews) report `supported: false` so the caller can hide the mic UI
 * gracefully.
 */
export function useDictation(opts?: { onFinal?: (text: string) => void; lang?: string }): UseDictationResult {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const recogRef = useRef<SpeechRecognitionLike | null>(null);
  const finalRef = useRef<string>('');

  // Keep onFinal current without re-creating the recognizer.
  const onFinalRef = useRef(opts?.onFinal);
  useEffect(() => {
    onFinalRef.current = opts?.onFinal;
  }, [opts?.onFinal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(!!Ctor);
  }, []);

  const start = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (recogRef.current) return; // already listening
    const Ctor = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Ctor) return;

    const recog = new Ctor();
    recog.continuous = false;
    recog.interimResults = true;
    recog.lang = opts?.lang ?? 'en-US';
    finalRef.current = '';
    setTranscript('');
    setError(null);

    recog.onresult = (e) => {
      let live = '';
      const len = e.results.length;
      for (let i = 0; i < len; i++) {
        const alt = e.results[i][0];
        if (alt?.transcript) live += alt.transcript;
      }
      finalRef.current = live.trim();
      setTranscript(live);
    };
    recog.onerror = (e) => {
      // 'no-speech' fires often on short presses; not an error worth showing.
      if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        setError(e.error);
      }
    };
    recog.onend = () => {
      setListening(false);
      recogRef.current = null;
      const final = finalRef.current.trim();
      if (final) onFinalRef.current?.(final);
    };

    try {
      recog.start();
      recogRef.current = recog;
      setListening(true);
    } catch {
      setListening(false);
      recogRef.current = null;
      setError('Could not start the microphone.');
    }
  }, [opts?.lang]);

  const stop = useCallback(() => {
    if (recogRef.current) {
      try {
        recogRef.current.stop();
      } catch {
        // ignore
      }
    }
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
    finalRef.current = '';
  }, []);

  // Tear down on unmount so a stray recognizer doesn't keep the mic alive.
  useEffect(() => {
    return () => {
      if (recogRef.current) {
        try { recogRef.current.abort(); } catch { /* ignore */ }
        recogRef.current = null;
      }
    };
  }, []);

  return { supported, listening, transcript, error, start, stop, reset };
}
