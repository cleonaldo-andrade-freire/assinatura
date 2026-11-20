"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ToastStack, useToasts } from "@/components/ui/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import {
  CAMPAIGN_AUDIENCE_LABEL,
  CAMPAIGN_CONTENT_MAX_CHARS,
  CAMPAIGN_DAILY_LIMIT,
  CAMPAIGN_MEDIA_MAX_BYTES,
  CAMPAIGN_MEDIA_TYPES,
  DEFAULT_INVITE_TEXT,
  renderCampaignText,
} from "@/lib/campaigns";
import type { CampaignAudience } from "@/lib/database.types";
import styles from "@/styles/shell.module.css";

const MEDIA_BUCKET = "campaign-media";

function Bubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "var(--brand-tint)",
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 13.5,
        whiteSpace: "pre-wrap",
        lineHeight: 1.45,
        maxWidth: 420,
      }}
    >
      {children}
    </div>
  );
}

/** Nova campanha — salva como rascunho; o envio só começa no "Iniciar envio" da tela da campanha. */
export function CampaignForm({ clinicId, clinicName }: { clinicId: string; clinicName: string }) {
  const router = useRouter();
  const { toasts, push, dismiss } = useToasts();
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [audience, setAudience] = useState<CampaignAudience>("pacientes");
  // Ligado por padrão: paciente já atendido conhece a clínica e quase nunca denuncia.
  const [onlyAttended, setOnlyAttended] = useState(true);
  const [inviteText, setInviteText] = useState(DEFAULT_INVITE_TEXT);
  const [contentText, setContentText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [audienceCount, setAudienceCount] = useState<{ count: number; days: number } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAudienceCount(null);
    const qs = new URLSearchParams({ audience, only_attended: onlyAttended && audience !== "leads" ? "1" : "0" });
    fetch(`/api/clinics/${clinicId}/campaigns/audience?${qs}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && data && setAudienceCount(data))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [clinicId, audience, onlyAttended]);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = "";
    if (!picked) return;
    if (!(picked.type in CAMPAIGN_MEDIA_TYPES)) {
      push("Use imagem JPG, PNG, WEBP ou vídeo MP4.");
      return;
    }
    if (picked.size > CAMPAIGN_MEDIA_MAX_BYTES) {
      push("Arquivo acima de 16MB — o WhatsApp não entrega vídeo maior que isso.");
      return;
    }
    setFile(picked);
  }

  const canSave = name.trim() && inviteText.trim() && contentText.trim() && !saving && (audienceCount?.count ?? 1) > 0;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    try {
      let media: { key: string; mime: string; name: string } | null = null;
      if (file) {
        const res = await fetch(`/api/clinics/${clinicId}/campaigns/media-upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mime: file.type, size: file.size }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          push(data?.message || "Não foi possível preparar o envio da mídia.");
          return;
        }
        const { error } = await createSupabaseBrowserClient().storage.from(MEDIA_BUCKET).uploadToSignedUrl(data.path, data.token, file, { contentType: file.type });
        if (error) {
          push(`Falha ao enviar a mídia: ${error.message}`);
          return;
        }
        media = { key: data.path, mime: file.type, name: file.name };
      }

      const res = await fetch(`/api/clinics/${clinicId}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, audience, only_attended: onlyAttended, invite_text: inviteText, content_text: contentText, media }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        push(data?.message || "Não foi possível salvar a campanha.");
        return;
      }
      router.push(`/dashboard/campanhas/${data.campaign.id}`);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const sample = { name: "Maria Souza", clinicName };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 380px)", gap: 20, alignItems: "start" }} className="campaignFormGrid">
      <style>{`@media (max-width: 900px) { .campaignFormGrid { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
      <div className={styles.panel}>
        <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div className={styles.field}>
            <label className={styles.label}>Nome da campanha* (só a clínica vê)</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Clareamento dezembro" maxLength={120} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Para quem*</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {(Object.keys(CAMPAIGN_AUDIENCE_LABEL) as CampaignAudience[]).map((a) => (
                <label key={a} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                  <input type="radio" name="audience" checked={audience === a} onChange={() => setAudience(a)} style={{ accentColor: "var(--brand)" }} />
                  {CAMPAIGN_AUDIENCE_LABEL[a]}
                </label>
              ))}
            </div>
            {audience !== "leads" && (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer", marginTop: 8 }}>
                <input type="checkbox" checked={onlyAttended} onChange={(e) => setOnlyAttended(e.target.checked)} style={{ accentColor: "var(--brand)" }} />
                Só pacientes que já foram atendidos (recomendado)
              </label>
            )}
            <p className={styles.hint} style={{ margin: "8px 0 0", fontSize: 13, color: "var(--ink-soft)" }}>
              {audienceCount === null
                ? "Contando contatos…"
                : audienceCount.count === 0
                  ? "Nenhum contato nesse público."
                  : `${audienceCount.count} contato${audienceCount.count > 1 ? "s" : ""} · cerca de ${audienceCount.days} dia${audienceCount.days > 1 ? "s" : ""} úteis de envio (${CAMPAIGN_DAILY_LIMIT} por dia). Quem pediu para sair já fica de fora.`}
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>1. Convite* (vai para todos)</label>
            <textarea className={styles.input} rows={4} value={inviteText} onChange={(e) => setInviteText(e.target.value)} maxLength={500} />
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-faint)" }}>
              Curto e pessoal. Use {"{{nome}}"} (primeiro nome) e {"{{clinica}}"}. Evite &quot;oferta imperdível&quot;, CAIXA ALTA e links — parecem spam.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>2. Conteúdo* (só para quem responder SIM)</label>
            <textarea
              className={styles.input}
              rows={6}
              value={contentText}
              onChange={(e) => setContentText(e.target.value)}
              maxLength={CAMPAIGN_CONTENT_MAX_CHARS}
              placeholder="Detalhes da oferta: o que inclui, valor, validade e como agendar."
            />
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-faint)" }}>
              {contentText.length}/{CAMPAIGN_CONTENT_MAX_CHARS} — com mídia, este texto vai como legenda.
            </p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Imagem ou vídeo (opcional)</label>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,video/mp4" onChange={handlePick} style={{ display: "none" }} />
            {file ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13.5 }}>
                  {file.name} · {(file.size / (1024 * 1024)).toFixed(1)} MB
                </span>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setFile(null)}>
                  Remover
                </button>
              </div>
            ) : (
              <div>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={() => fileRef.current?.click()}>
                  Escolher arquivo
                </button>
                <span style={{ marginLeft: 10, fontSize: 12.5, color: "var(--ink-faint)" }}>JPG, PNG, WEBP ou MP4 até 16MB</span>
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, borderTop: "1px solid var(--line-soft)", paddingTop: 14 }}>
            <a href="/dashboard/campanhas" className={`${styles.btn} ${styles.btnGhost}`}>
              Cancelar
            </a>
            <button type="button" disabled={!canSave} onClick={handleSave} className={`${styles.btn} ${styles.btnPrimary}`}>
              {saving ? "Salvando…" : "Salvar rascunho"}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.panel}>
        <div className={styles.panelBody} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: "var(--ink-soft)" }}>Prévia no WhatsApp</div>
          <Bubble>{renderCampaignText(inviteText, sample) || "…"}</Bubble>
          <div style={{ alignSelf: "flex-end", background: "var(--surface-sunken)", borderRadius: 10, padding: "8px 12px", fontSize: 13.5 }}>Sim</div>
          <Bubble>
            {preview && file?.type.startsWith("image/") && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" style={{ width: "100%", borderRadius: 6, marginBottom: 8, display: "block" }} />
            )}
            {preview && file?.type.startsWith("video/") && <video src={preview} controls style={{ width: "100%", borderRadius: 6, marginBottom: 8, display: "block" }} />}
            {renderCampaignText(contentText, sample) || "…"}
          </Bubble>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--ink-faint)" }}>
            Quem responder NÃO ou SAIR recebe uma confirmação e nunca mais entra em campanha. Outras respostas viram mensagem no quadro de Leads.
          </p>
        </div>
      </div>
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}
