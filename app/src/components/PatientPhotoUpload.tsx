"use client";

import { useRef, useState } from "react";
import styles from "@/styles/shell.module.css";

export function PatientPhotoUpload({
  clinicId,
  patientId,
  hasPhoto,
}: {
  clinicId: string;
  patientId: string;
  hasPhoto: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoVersion, setPhotoVersion] = useState(0);
  const [visible, setVisible] = useState(hasPhoto);

  const photoUrl = visible
    ? `/api/clinics/${clinicId}/patients/${patientId}/photo?v=${photoVersion}`
    : null;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch(`/api/clinics/${clinicId}/patients/${patientId}/photo`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao enviar a foto.");
        return;
      }
      setVisible(true);
      setPhotoVersion((v) => v + 1);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>Foto (opcional)</label>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <label
          htmlFor="patient-photo-upload"
          title={photoUrl ? "Clique pra trocar a foto" : "Clique pra enviar uma foto"}
          style={{ cursor: uploading ? "default" : "pointer", position: "relative", display: "block" }}
        >
          {photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photoUrl}
              alt=""
              style={{
                width: 64,
                height: 64,
                objectFit: "cover",
                borderRadius: 12,
                border: "1px solid var(--line)",
                background: "var(--surface-sunken)",
              }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 12,
                border: "1.5px dashed var(--line)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10.5,
                fontWeight: 600,
                color: "var(--ink-faint)",
                textAlign: "center",
                lineHeight: 1.3,
              }}
            >
              sem
              <br />
              foto
            </div>
          )}
        </label>

        <input
          id="patient-photo-upload"
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: "none" }}
        />

        <div>
          <p className={styles.hint}>
            Clique na foto pra {photoUrl ? "trocar" : "enviar"}. PNG, JPEG ou WEBP — guardada em local privado, nunca
            fica com link público.
          </p>
          {uploading && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>Enviando…</p>}
          {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: "4px 0 0" }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
