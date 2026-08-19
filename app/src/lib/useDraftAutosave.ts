"use client";

import { useEffect, useRef, useState } from "react";

const DRAFT_DEBOUNCE_MS = 500;

/**
 * Rascunho automático em localStorage (prompt de reformulação mobile §7.7):
 * no celular o app perde foco o tempo todo (ligação, WhatsApp, câmera) e
 * perder um atestado/prescrição/anamnese pela metade é inaceitável.
 * Genérico — cada formulário monta seu próprio objeto de valores; a
 * restauração em si (aplicar o rascunho de volta em cada campo) fica a
 * cargo de quem chama, porque só o formulário sabe qual setState usar pra
 * cada chave.
 */
export function useDraftAutosave<T extends Record<string, unknown>>(
  key: string | null,
  values: T,
  options?: { isEmpty?: (values: T) => boolean }
) {
  const isEmpty = options?.isEmpty;
  const [draft, setDraft] = useState<T | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedKeyRef = useRef<string | null>(null);

  // Carrega o rascunho salvo uma única vez por chave, antes de qualquer
  // digitação do usuário nesta sessão de tela.
  useEffect(() => {
    if (!key || loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    try {
      const raw = localStorage.getItem(key);
      if (raw) setDraft(JSON.parse(raw) as T);
    } catch {
      // rascunho corrompido não deve travar o formulário — ignora
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      try {
        if (isEmpty?.(values)) {
          localStorage.removeItem(key);
        } else {
          localStorage.setItem(key, JSON.stringify(values));
        }
      } catch {
        // storage cheio/privado (ex.: aba anônima) — rascunho é
        // conveniência, não requisito; falha silenciosa é o comportamento certo
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, DRAFT_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, JSON.stringify(values)]);

  function clearDraft() {
    if (key) {
      try {
        localStorage.removeItem(key);
      } catch {
        // ver comentário acima
      }
    }
    setDraft(null);
  }

  function dismissDraftPrompt() {
    setDismissed(true);
  }

  return {
    hasDraft: !!draft && !dismissed,
    draft,
    clearDraft,
    dismissDraftPrompt,
  };
}
