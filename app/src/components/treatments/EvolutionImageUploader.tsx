"use client";

import { useEffect, useRef, useState } from "react";
import tp from "./treatments.module.css";

/**
 * Seletor de imagens da evolução — grade de miniaturas com botão de
 * remover em cada uma, mais um "tile" de adicionar enquanto não atingir o
 * limite. Componente controlado: quem usa guarda a lista de `File`.
 */
export function EvolutionImageUploader({
  files,
  onChange,
  max,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [files]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = Math.max(0, max - files.length);
    onChange([...files, ...picked.slice(0, room)]);
    e.target.value = "";
  }

  function removeAt(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <div className={tp.imageGrid}>
      {files.map((file, i) => (
        <div key={i} className={tp.imageTile}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previews[i]} alt="" />
          <button type="button" className={tp.imageRemove} onClick={() => removeAt(i)} aria-label="Remover imagem" title="Remover">
            ×
          </button>
        </div>
      ))}
      {files.length < max && (
        <button type="button" className={tp.imageAdd} onClick={() => inputRef.current?.click()}>
          <span style={{ fontSize: 22, lineHeight: 1 }}>+</span>
          <span style={{ fontSize: 11 }}>
            {files.length}/{max}
          </span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handlePick} />
    </div>
  );
}
