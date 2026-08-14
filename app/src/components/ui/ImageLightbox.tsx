"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import lb from "./imageLightbox.module.css";

export interface LightboxImage {
  url: string;
  alt?: string;
}

/**
 * Visualizador de imagem em tamanho grande — clicar numa miniatura abre
 * isso em vez de uma nova aba (evoluções) ou nada (galeria). Reaproveitado
 * pelas duas telas: quem chama passa a lista de imagens do GRUPO atual
 * (mesma evolução, ou mesma data na galeria) pra dar setas de
 * anterior/próxima sem fechar e abrir de novo.
 */
export function ImageLightbox({
  open,
  onClose,
  images,
  index,
  onIndexChange,
}: {
  open: boolean;
  onClose: () => void;
  images: LightboxImage[];
  index: number;
  onIndexChange: (next: number) => void;
}) {
  const hasPrev = index > 0;
  const hasNext = index < images.length - 1;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, index, hasPrev, hasNext, onClose, onIndexChange]);

  if (!open || typeof document === "undefined") return null;
  const current = images[index];
  if (!current) return null;

  return createPortal(
    <div
      className={lb.overlay}
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <button type="button" className={lb.close} onClick={onClose} aria-label="Fechar">
        ×
      </button>
      {hasPrev && (
        <button
          type="button"
          className={`${lb.nav} ${lb.navPrev}`}
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index - 1);
          }}
          aria-label="Imagem anterior"
        >
          ‹
        </button>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={current.url} alt={current.alt ?? ""} className={lb.image} onClick={(e) => e.stopPropagation()} />
      {hasNext && (
        <button
          type="button"
          className={`${lb.nav} ${lb.navNext}`}
          onClick={(e) => {
            e.stopPropagation();
            onIndexChange(index + 1);
          }}
          aria-label="Próxima imagem"
        >
          ›
        </button>
      )}
      {current.alt && <span className={lb.caption}>{current.alt}</span>}
      {images.length > 1 && (
        <span className={lb.counter}>
          {index + 1} / {images.length}
        </span>
      )}
    </div>,
    document.body
  );
}
