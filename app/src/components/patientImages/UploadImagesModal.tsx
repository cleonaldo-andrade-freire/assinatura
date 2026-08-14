"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import type { PatientImage } from "@/lib/database.types";
import uiStyles from "@/components/ui/ui.module.css";
import styles from "@/styles/shell.module.css";
import pi from "./patientImages.module.css";

const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp"];

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Modal de envio — escolher ou arrastar arquivos, revisar a lista antes de
 * enviar (sem as opções de compartilhamento do app de referência, fora de
 * escopo aqui). */
export function UploadImagesModal({
  open,
  onClose,
  clinicId,
  patientId,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  clinicId: string;
  patientId: string;
  onUploaded: (images: PatientImage[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [descriptions, setDescriptions] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    if (!open) {
      setFiles([]);
      setDescriptions([]);
      setDragActive(false);
    }
  }, [open]);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  function addFiles(list: FileList | File[]) {
    const picked = Array.from(list).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (picked.length === 0) {
      push("Formato não suportado — use PNG, JPEG ou WEBP.");
      return;
    }
    setFiles((prev) => [...prev, ...picked]);
    setDescriptions((prev) => [...prev, ...picked.map(() => "")]);
  }

  function removeAt(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setDescriptions((prev) => prev.filter((_, i) => i !== index));
  }

  function setDescriptionAt(index: number, value: string) {
    setDescriptions((prev) => prev.map((d, i) => (i === index ? value : d)));
  }

  async function handleUpload() {
    if (files.length === 0) return;
    setUploading(true);
    try {
      const form = new FormData();
      files.forEach((f, i) => {
        form.append("images", f);
        form.append("descriptions", descriptions[i] ?? "");
      });
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/images`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao enviar. Tenta de novo.");
        return;
      }
      onUploaded(data.images as PatientImage[]);
      onClose();
    } finally {
      setUploading(false);
    }
  }

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className={uiStyles.overlay} onClick={onClose}>
      <div className={`${uiStyles.dialog} ${uiStyles.dialogWide}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 14, flexShrink: 0 }}>
          <h3 className={uiStyles.dialogTitle}>Enviar imagens</h3>
          <button type="button" className={uiStyles.toastClose} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>

        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {files.length === 0 ? (
            <div
              className={`${pi.dropzone} ${dragActive ? pi.dropzoneActive : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                addFiles(e.dataTransfer.files);
              }}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 16V4M12 4l-5 5M12 4l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--ink)" }}>Escolha ou arraste as imagens aqui mesmo</p>
              <p style={{ margin: 0, fontSize: 12.5 }}>Tamanho máximo por arquivo: 8MB · Formatos aceitos: PNG, JPEG, WEBP</p>
              <button type="button" onClick={() => inputRef.current?.click()} className={`${styles.btn} ${styles.btnPrimary}`} style={{ marginTop: 6 }}>
                Escolher arquivos
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {files.map((file, i) => (
                <div key={i} className={pi.fileRow}>
                  <div className={pi.fileRowThumb}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[i]} alt="" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.name}</span>
                      <span style={{ fontSize: 12, color: "var(--ink-faint)", flexShrink: 0 }}>{formatSize(file.size)}</span>
                    </div>
                    <label className={styles.label} style={{ marginBottom: 4 }}>
                      Descrição
                    </label>
                    <input
                      type="text"
                      className={styles.input}
                      placeholder="Ex.: radiografia panorâmica, foto do sorriso…"
                      value={descriptions[i] ?? ""}
                      onChange={(e) => setDescriptionAt(i, e.target.value)}
                    />
                  </div>
                  <button type="button" onClick={() => removeAt(i)} className={pi.fileRowRemove} aria-label="Remover" title="Remover">
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => inputRef.current?.click()} className={`${styles.btn} ${styles.btnGhost}`} style={{ marginTop: 12, alignSelf: "flex-start" }}>
                + Adicionar mais
              </button>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 14, marginTop: 10, borderTop: "1px solid var(--line-soft)" }}>
          <button type="button" onClick={onClose} className={`${styles.btn} ${styles.btnGhost}`}>
            Fechar
          </button>
          {files.length > 0 && (
            <button type="button" disabled={uploading} onClick={handleUpload} className={`${styles.btn} ${styles.btnPrimary}`}>
              {uploading ? "Enviando…" : `Enviar ${files.length} arquivo${files.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>,
    document.body
  );
}
