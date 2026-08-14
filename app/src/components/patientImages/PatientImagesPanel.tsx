"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { UploadImagesModal } from "@/components/patientImages/UploadImagesModal";
import type { PatientImage } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";
import pi from "./patientImages.module.css";

function groupByDate(images: PatientImage[]): { label: string; items: PatientImage[] }[] {
  const groups = new Map<string, PatientImage[]>();
  for (const img of images) {
    const label = new Date(img.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" });
    const list = groups.get(label) ?? [];
    list.push(img);
    groups.set(label, list);
  }
  return Array.from(groups.entries()).map(([label, items]) => ({ label, items }));
}

export function PatientImagesPanel({ clinicId, patientId }: { clinicId: string; patientId: string }) {
  const [images, setImages] = useState<PatientImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ groupLabel: string; index: number } | null>(null);
  const [editingDescriptionId, setEditingDescriptionId] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingDescriptionId, setSavingDescriptionId] = useState<string | null>(null);
  const { toasts, push, dismiss } = useToasts();

  useEffect(() => {
    fetch(`/api/clinics/${clinicId}/patients/${patientId}/images`)
      .then((res) => res.json())
      .then((data) => setImages(data.images ?? []))
      .catch(() => push("Falha ao carregar as imagens."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clinicId, patientId]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/images/${id}`, { method: "DELETE" });
      if (!res.ok) {
        push("Falha ao excluir. Tenta de novo.");
        return;
      }
      setImages((prev) => prev.filter((img) => img.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  }

  function startEditDescription(img: PatientImage) {
    setEditingDescriptionId(img.id);
    setDescriptionDraft(img.description ?? "");
  }

  async function handleSaveDescription(id: string) {
    setSavingDescriptionId(id);
    try {
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/images/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: descriptionDraft }),
      });
      const data = await res.json();
      if (!res.ok) {
        push("Falha ao salvar a descrição. Tenta de novo.");
        return;
      }
      setImages((prev) => prev.map((img) => (img.id === id ? (data.image as PatientImage) : img)));
      setEditingDescriptionId(null);
    } finally {
      setSavingDescriptionId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? images.filter((img) => img.file_name.toLowerCase().includes(q)) : images;
  }, [images, search]);
  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  return (
    <div>
      <div className={pi.toolbar}>
        <div className={styles.searchBox} style={{ maxWidth: 280 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.7" />
            <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome do arquivo…" className={styles.searchInput} />
        </div>
        <button type="button" onClick={() => setUploadOpen(true)} className={`${styles.btn} ${styles.btnPrimary}`}>
          + Novo
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--ink-soft)", fontSize: 13.5 }}>Carregando…</p>
      ) : groups.length === 0 ? (
        <div className={styles.emptyState}>{search ? `Nenhuma imagem encontrada pra "${search}".` : "Nenhuma imagem enviada ainda."}</div>
      ) : (
        groups.map((group) => (
          <div key={group.label} className={pi.dateGroup}>
            <p className={pi.dateLabel}>{group.label}</p>
            <div className={pi.grid}>
              {group.items.map((img, imgIndex) => {
                const url = `/api/clinics/${clinicId}/patients/${patientId}/images/${img.id}`;
                const isEditingDescription = editingDescriptionId === img.id;
                return (
                  <div key={img.id} className={pi.tile}>
                    <div
                      className={pi.thumbFrame}
                      onClick={() => setLightbox({ groupLabel: group.label, index: imgIndex })}
                      style={{ cursor: "pointer" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={img.file_name} />
                      <div className={pi.thumbOverlay}>
                        <a
                          href={url}
                          download={img.file_name}
                          className={pi.thumbAction}
                          aria-label="Baixar"
                          title="Baixar"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 4v11M12 15l-4-4M12 15l4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d="M5 19h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                          </svg>
                        </a>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(img.id);
                          }}
                          className={`${pi.thumbAction} ${pi.thumbActionDanger}`}
                          aria-label="Excluir"
                          title="Excluir"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path
                              d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0v12a1 1 0 001 1h6a1 1 0 001-1V7"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    <p className={pi.fileName} title={img.file_name}>
                      {img.file_name}
                    </p>
                    {isEditingDescription ? (
                      <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                        <input
                          type="text"
                          autoFocus
                          className={styles.input}
                          style={{ fontSize: 11.5, padding: "4px 6px" }}
                          value={descriptionDraft}
                          onChange={(e) => setDescriptionDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveDescription(img.id);
                            if (e.key === "Escape") setEditingDescriptionId(null);
                          }}
                          onBlur={() => handleSaveDescription(img.id)}
                          disabled={savingDescriptionId === img.id}
                          placeholder="Descrição…"
                        />
                      </div>
                    ) : (
                      <p
                        className={pi.description}
                        title={img.description ?? "Adicionar descrição"}
                        onClick={() => startEditDescription(img)}
                      >
                        {img.description || "+ Adicionar descrição"}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      <UploadImagesModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        clinicId={clinicId}
        patientId={patientId}
        onUploaded={(newImages) => setImages((prev) => [...newImages, ...prev])}
      />

      <ImageLightbox
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        images={(groups.find((g) => g.label === lightbox?.groupLabel)?.items ?? []).map((img) => ({
          url: `/api/clinics/${clinicId}/patients/${patientId}/images/${img.id}`,
          alt: img.description || img.file_name,
        }))}
        index={lightbox?.index ?? 0}
        onIndexChange={(next) => setLightbox((prev) => (prev ? { ...prev, index: next } : prev))}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Excluir imagem"
        message="Isso remove a imagem da ficha do paciente. Não é possível desfazer."
        confirmLabel="Excluir"
        cancelLabel="Cancelar"
        danger
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
