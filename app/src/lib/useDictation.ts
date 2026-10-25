import { useEffect, useRef, useState } from "react";

// Web Speech API — sem tipos no lib.dom padrão do TS, e só existe com
// prefixo "webkit" em boa parte dos navegadores (Chrome/Edge/Safari; sem
// suporte no Firefox desktop). Tipagem mínima só do que a gente usa.
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: { [i: number]: { isFinal: boolean; [j: number]: { transcript: string } }; length: number } }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | undefined {
  if (typeof window === "undefined") return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Junta um trecho ditado ao fim do texto já digitado, com um espaço entre os dois. */
export function appendDictated(prev: string, dictated: string): string {
  return prev ? `${prev} ${dictated}` : dictated;
}

/**
 * Ditado por voz (pt-BR) pra campos de texto longos — evolução, finalização,
 * registro de atendimento. `onText` recebe cada trecho final reconhecido; o
 * modal decide como juntar (normalmente `appendDictated`). Quem usa deve
 * chamar `stop()` ao fechar o modal — sem isso o microfone continua
 * escutando em segundo plano.
 */
export function useDictation(onText: (text: string) => void) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const [dictating, setDictating] = useState(false);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  function stop() {
    recognitionRef.current?.stop();
    setDictating(false);
  }

  function toggle() {
    if (dictating) {
      stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognition = new Ctor();
    recognition.lang = "pt-BR";
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.onresult = (event) => {
      let finalText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
      }
      if (finalText.trim()) onTextRef.current(finalText.trim());
    };
    recognition.onend = () => setDictating(false);
    recognition.onerror = () => setDictating(false);
    recognitionRef.current = recognition;
    recognition.start();
    setDictating(true);
  }

  return { supported: getSpeechRecognitionCtor() !== undefined, dictating, toggle, stop };
}
