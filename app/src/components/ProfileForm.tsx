"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/styles/shell.module.css";

export function ProfileForm({
  initialName,
  initialAvatarUrl,
  roleLabel,
  email,
}: {
  initialName: string;
  initialAvatarUrl: string | null;
  roleLabel: string;
  email: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/profile/avatar", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || "Falha ao enviar a foto.");
        return;
      }
      setAvatarUrl(data.avatar_url);
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.message || data?.error || "Falha ao salvar o nome.");
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.panelHeader}>
        <p className={styles.panelHeaderTitle}>Meu perfil</p>
      </div>
      <div className={styles.panelBody}>
        <p className={styles.hint} style={{ marginBottom: 14 }}>
          Nome e foto aparecem na barra lateral, pra identificar quem está com a sessão aberta. E-mail:{" "}
          <strong>{email}</strong> · Papel: <strong>{roleLabel}</strong>
        </p>

        {error && <div className="error-box">{error}</div>}
        {saved && (
          <div
            style={{
              background: "var(--brand-tint)",
              color: "var(--brand-deep)",
              borderRadius: "var(--radius-sm)",
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13.5,
            }}
          >
            Nome salvo.
          </div>
        )}

        <div className={styles.field}>
          <label className={styles.label}>Foto (opcional)</label>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <label
              htmlFor="profile-avatar-upload"
              title={avatarUrl ? "Clique pra trocar a foto" : "Clique pra enviar uma foto"}
              style={{ cursor: uploading ? "default" : "pointer", position: "relative", display: "block" }}
            >
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarUrl}
                  alt=""
                  style={{
                    width: 64,
                    height: 64,
                    objectFit: "cover",
                    borderRadius: "999px",
                    border: "1px solid var(--line)",
                    background: "var(--surface-sunken)",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: "999px",
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
              id="profile-avatar-upload"
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handlePhotoChange}
              disabled={uploading}
              style={{ display: "none" }}
            />

            <div>
              <p className={styles.hint}>Clique na foto pra {avatarUrl ? "trocar" : "enviar"}. PNG, JPEG ou WEBP.</p>
              {uploading && <p style={{ fontSize: 12.5, color: "var(--ink-soft)", margin: "4px 0 0" }}>Enviando…</p>}
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="profileName" className={styles.label}>
              Nome de exibição
            </label>
            <input
              id="profileName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Como você quer aparecer no sistema"
              className={styles.input}
            />
          </div>

          <button type="submit" disabled={saving || !name.trim()} className={`${styles.btn} ${styles.btnPrimary}`}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </form>
      </div>
    </div>
  );
}
