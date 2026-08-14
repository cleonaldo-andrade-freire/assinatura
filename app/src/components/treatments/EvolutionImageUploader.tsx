"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/styles/shell.module.css";
import tp from "./treatments.module.css";

export interface EvolutionImageItem {
  file: File;
  description: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Seletor de imagens novas da evolução — lista com miniatura, nome do
 * arquivo e descrição opcional por foto (não um grid compacto, porque o
 * campo de descrição precisa de espaço). Componente controlado: quem usa
 * guarda a lista de itens {file, description}.
 */
export function EvolutionImageUploader({
  items,
  onChange,
  max,
}: {
  items: EvolutionImageItem[];
  onChange: (next: EvolutionImageItem[]) => void;
  max: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const urls = items.map((it) => URL.createObjectURL(it.file));
    setPreviews(urls);
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [items]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    if (picked.length === 0) return;
    const room = Math.max(0, max - items.length);
    onChange([...items, ...picked.slice(0, room).map((file) => ({ file, description: "" }))]);
    e.target.value = "";
  }

  function removeAt(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function setDescriptionAt(index: number, value: string) {
    onChange(items.map((it, i) => (i === index ? { ...it, description: value } : it)));
  }

  return (
    <div>
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 10 }}>
          {items.map((item, i) => (
            <div key={i} className={tp.evolutionFileRow}>
              <div className={tp.evolutionFileThumb}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previews[i]} alt="" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.file.name}</span>
                  <span style={{ fontSize: 11.5, color: "var(--ink-faint)", flexShrink: 0 }}>{formatSize(item.file.size)}</span>
                </div>
                <textarea
                  className={styles.input}
                  rows={2}
                  placeholder="Descrição (opcional)"
                  value={item.description}
                  onChange={(e) => setDescriptionAt(i, e.target.value)}
                />
              </div>
              <button type="button" className={tp.imageRemove} style={{ position: "static", flexShrink: 0 }} onClick={() => removeAt(i)} aria-label="Remover imagem" title="Remover">
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {items.length < max && (
        <button type="button" onClick={() => inputRef.current?.click()} className={`${styles.btn} ${styles.btnGhost}`}>
          + Adicionar imagem ({items.length}/{max})
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={handlePick} />
    </div>
  );
}
