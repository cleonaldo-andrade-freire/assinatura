"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/admin/admin.module.css";

export function LogoUpload({
  clinicId,
  currentLogoUrl,
  uploadUrl,
}: {
  clinicId: string;
  currentLogoUrl: string | null;
  /** Endpoint de upload — o admin e o painel self-service da clínica usam rotas diferentes. */
  uploadUrl?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(uploadUrl ?? `/api/admin/clinics/${clinicId}/logo`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao enviar o logo.");
        return;
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      {currentLogoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={currentLogoUrl}
          alt="Logo da clínica"
          style={{
            width: 56,
            height: 56,
            objectFit: "contain",
            borderRadius: 12,
            border: "1px solid var(--line)",
            background: "var(--surface-sunken)",
          }}
        />
      ) : (
        <div
          style={{
            width: 56,
            height: 56,
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
          logo
        </div>
      )}

      <div>
        <label htmlFor="logo-upload" className={`${styles.btn} ${styles.btnGhost}`} style={{ cursor: "pointer" }}>
          {currentLogoUrl ? "Trocar logo" : "Enviar logo"}
        </label>
        <input
          id="logo-upload"
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml"
          onChange={handleFileChange}
          disabled={uploading}
          style={{ display: "none" }}
        />
        <p style={{ fontSize: 12, color: "var(--ink-faint)", margin: "8px 0 0" }}>PNG, JPEG, WEBP ou SVG</p>
        {uploading && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>Enviando…</p>}
        {error && <p style={{ fontSize: 12.5, color: "var(--danger)", margin: "4px 0 0" }}>{error}</p>}
      </div>
    </div>
  );
}
