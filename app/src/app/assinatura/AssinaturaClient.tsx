"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { jsPDF } from "jspdf";
import { formatCPF, isValidCPF } from "@/lib/validation";
import { SignatureMark } from "@/components/SignatureMark";

function draftKey(token: string) {
  return `assinatura-draft:${token}`;
}

interface Draft {
  fullName: string;
  cpf: string;
  consent: boolean;
  signatureDataUrl: string | null;
}

interface Answer {
  question: string;
  answer: string;
}

interface Record_ {
  clinic_name: string;
  clinic_logo_url: string | null;
  patient_name: string;
  answers: Answer[];
  already_signed: boolean;
}

type Status = "loading" | "error" | "form" | "sending" | "success" | "send-error" | "already-signed";
type FormStep = "review" | "sign";

function demoData(): Record_ {
  return {
    clinic_name: "Clínica de exemplo",
    clinic_logo_url: null,
    patient_name: "Paciente Exemplo",
    already_signed: false,
    answers: [
      { question: "Está em tratamento médico atualmente?", answer: "Não" },
      { question: "Possui alguma alergia a medicamentos ou anestésicos?", answer: "Não" },
      { question: "Possui diabetes ou hipertensão?", answer: "Hipertensão controlada" },
      { question: "Faz uso de algum medicamento contínuo?", answer: "Losartana 50mg" },
    ],
  };
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.error("Falha ao carregar o logo da clínica:", err);
    return null;
  }
}

export function AssinaturaClient() {
  const params = useSearchParams();
  const token = params.get("token");

  const [status, setStatus] = useState<Status>("loading");
  const [demo, setDemo] = useState(false);
  const [record, setRecord] = useState<Record_ | null>(null);

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [consent, setConsent] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [signatureThumb, setSignatureThumb] = useState<string | null>(null);
  const [formStep, setFormStep] = useState<FormStep>("review");
  const [isOnline, setIsOnline] = useState(true);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const drawingRef = useRef(false);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const lastPdfBlobRef = useRef<Blob | null>(null);
  const submitPayloadRef = useRef<{ name: string; cpf: string } | null>(null);
  const restoredSignatureRef = useRef<string | null>(null);
  // Guarda o último traço desenhado como imagem — o <canvas> desmonta ao
  // voltar da tela de assinatura pra revisão (é um passo condicional, não
  // só escondido por CSS), então sem isso o traço se perderia ao avançar
  // de novo mesmo com hasSignature ainda true.
  const signatureSnapshotRef = useRef<string | null>(null);

  function startEdit(i: number) {
    if (!record) return;
    setEditingIndex(i);
    setEditDraft(record.answers[i].answer);
    setEditError("");
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditError("");
  }

  async function saveEdit(i: number) {
    if (!record) return;
    setSavingEdit(true);
    setEditError("");
    try {
      const nextAnswers = record.answers.map((qa, idx) => (idx === i ? { ...qa, answer: editDraft } : qa));
      if (!demo && token) {
        const res = await fetch(`/api/anamnesis/${encodeURIComponent(token)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: nextAnswers }),
        });
        if (!res.ok) {
          setEditError("Não deu pra salvar a correção agora. Tenta de novo.");
          return;
        }
      }
      setRecord({ ...record, answers: nextAnswers });
      setEditingIndex(null);
    } finally {
      setSavingEdit(false);
    }
  }

  useEffect(() => {
    function goOnline() {
      setIsOnline(true);
    }
    function goOffline() {
      setIsOnline(false);
    }
    setIsOnline(navigator.onLine);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Salva nome, CPF, consentimento e a assinatura desenhada a cada mudança,
  // pra não perder o que o paciente já preencheu se a página recarregar
  // sozinha numa conexão instável.
  useEffect(() => {
    if (!token || demo || status !== "form") return;
    try {
      const draft: Draft = {
        fullName,
        cpf,
        consent,
        // Se uma assinatura restaurada da sessão anterior ainda não foi
        // redesenhada no canvas (só acontece ao chegar na etapa de assinar),
        // mantém o valor restaurado em vez de gravar `null` por cima —
        // senão uma mudança em nome/CPF antes de chegar lá apagaria a
        // assinatura salva.
        signatureDataUrl: hasSignature ? signatureSnapshotRef.current : restoredSignatureRef.current,
      };
      sessionStorage.setItem(draftKey(token), JSON.stringify(draft));
    } catch {
      // sessionStorage indisponível (modo privado etc.) — segue sem persistir.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, demo, status, fullName, cpf, consent, hasSignature]);

  function currentSignatureDataUrl(): string | null {
    if (canvasRef.current) return canvasRef.current.toDataURL("image/png");
    return signatureSnapshotRef.current;
  }

  function clearDraft() {
    if (!token) return;
    try {
      sessionStorage.removeItem(draftKey(token));
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    async function load() {
      if (!token) {
        setRecord(demoData());
        setDemo(true);
        setStatus("form");
        return;
      }
      try {
        const res = await fetch(`/api/anamnesis/${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data = (await res.json()) as Record_;
        setRecord(data);
        setFullName(data.patient_name || "");

        try {
          const raw = sessionStorage.getItem(draftKey(token));
          if (raw) {
            const draft = JSON.parse(raw) as Draft;
            if (draft.fullName) setFullName(draft.fullName);
            if (draft.cpf) setCpf(draft.cpf);
            if (draft.consent) setConsent(draft.consent);
            if (draft.signatureDataUrl) restoredSignatureRef.current = draft.signatureDataUrl;
          }
        } catch {
          // draft corrompido ou sessionStorage indisponível — segue sem restaurar.
        }

        setStatus(data.already_signed ? "already-signed" : "form");
      } catch (err) {
        console.error("Falha ao carregar anamnese:", err);
        setRecord(demoData());
        setDemo(true);
        setStatus("form");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    if (status !== "form" || formStep !== "sign" || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1E2B27";
    ctxRef.current = ctx;

    // Restaura o traço de uma sessão anterior (recarregou a página) ou de
    // um "Voltar pra revisão" seguido de "Continuar" nesta mesma sessão —
    // o <canvas> é um nó novo em qualquer um dos dois casos.
    const toRestore = restoredSignatureRef.current ?? signatureSnapshotRef.current;
    if (toRestore) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 0, 0, rect.width, rect.height);
        signatureSnapshotRef.current = toRestore;
        setHasSignature(true);
      };
      img.src = toRestore;
      restoredSignatureRef.current = null;
    }
  }, [status, formStep]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function startStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = true;
    lastPosRef.current = pos(e);
    canvasRef.current?.setPointerCapture(e.pointerId);
  }

  function moveStroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !ctxRef.current) return;
    const p = pos(e);
    const ctx = ctxRef.current;
    ctx.beginPath();
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPosRef.current = p;
    if (!hasSignature) setHasSignature(true);
  }

  function endStroke() {
    drawingRef.current = false;
    if (canvasRef.current) signatureSnapshotRef.current = canvasRef.current.toDataURL("image/png");
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    if (!canvas || !ctxRef.current) return;
    const rect = canvas.getBoundingClientRect();
    ctxRef.current.clearRect(0, 0, rect.width, rect.height);
    signatureSnapshotRef.current = null;
    setHasSignature(false);
  }

  function validateForm(): boolean {
    return fullName.trim().length >= 3 && isValidCPF(cpf) && hasSignature && consent;
  }

  function buildPdf(clinicName: string, answers: Answer[], logoDataUrl: string | null): jsPDF {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 48;
    let y = 60;

    if (logoDataUrl) {
      // jsPDF sabe embutir PNG/JPEG/WEBP, mas não SVG — nesse caso o logo continua
      // aparecendo no topo da página, só não vai pro PDF gerado.
      const format = logoDataUrl.match(/^data:image\/(png|jpe?g|webp)/i)?.[1]?.toUpperCase().replace("JPG", "JPEG");
      if (format) {
        try {
          doc.addImage(logoDataUrl, format, pageW - margin - 42, 26, 42, 42);
        } catch (err) {
          console.error("Falha ao embutir o logo no PDF:", err);
        }
      }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Termo de Anamnese e Consentimento", margin, y);
    y += 20;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(90, 90, 90);
    doc.text(clinicName, margin, y);
    y += 28;

    doc.setTextColor(20, 20, 20);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Paciente: ", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(fullName.trim(), margin + 58, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text("CPF: ", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(cpf, margin + 30, y);
    y += 16;
    doc.setFont("helvetica", "bold");
    doc.text("Data/hora: ", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(new Date().toLocaleString("pt-BR"), margin + 62, y);
    y += 26;

    doc.setDrawColor(220, 220, 220);
    doc.line(margin, y, pageW - margin, y);
    y += 22;

    function ensureSpace(needed: number) {
      if (y + needed > doc.internal.pageSize.getHeight() - 60) {
        doc.addPage();
        y = 60;
      }
    }

    answers.forEach((qa) => {
      const qLines = doc.splitTextToSize(qa.question, pageW - margin * 2) as string[];
      const aLines = doc.splitTextToSize(String(qa.answer || "—"), pageW - margin * 2) as string[];
      ensureSpace(qLines.length * 13 + aLines.length * 13 + 14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.text(qLines, margin, y);
      y += qLines.length * 13 + 3;
      doc.setFont("helvetica", "normal");
      doc.text(aLines, margin, y);
      y += aLines.length * 13 + 12;
    });

    ensureSpace(140);
    y += 10;
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    const declText =
      "Declaro que as informações acima são verdadeiras e completas. Reconheço a assinatura abaixo como manifestação eletrônica da minha vontade, com validade jurídica nos termos da MP 2.200-2/2001 e da Lei nº 14.063/2020.";
    const declLines = doc.splitTextToSize(declText, pageW - margin * 2) as string[];
    doc.text(declLines, margin, y);
    y += declLines.length * 12 + 20;

    const sigDataUrl = canvasRef.current!.toDataURL("image/png");
    doc.addImage(sigDataUrl, "PNG", margin, y, 200, 70);
    y += 78;
    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, margin + 220, y);
    y += 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(60, 60, 60);
    doc.text(`${fullName.trim()}  —  CPF ${cpf}`, margin, y);

    return doc;
  }

  async function sendSignature(pdfBlob: Blob) {
    const reader = new FileReader();
    const base64: string = await new Promise((resolve, reject) => {
      reader.onloadend = () => resolve((reader.result as string).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(pdfBlob);
    });

    const res = await fetch(`/api/anamnesis/${encodeURIComponent(token || "")}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: submitPayloadRef.current!.name,
        cpf: submitPayloadRef.current!.cpf,
        signed_at_client: new Date().toISOString(),
        pdf_base64: base64,
      }),
    });
    if (!res.ok) throw new Error(`status ${res.status}`);
  }

  async function handleSubmit() {
    if (!validateForm()) {
      setShowErrors(true);
      return;
    }
    if (demo) {
      setStatus("send-error");
      return;
    }

    setStatus("sending");
    submitPayloadRef.current = { name: fullName.trim(), cpf };
    setSignatureThumb(currentSignatureDataUrl());

    const logoDataUrl = record!.clinic_logo_url ? await loadImageAsDataUrl(record!.clinic_logo_url) : null;
    const doc = buildPdf(record!.clinic_name, record!.answers, logoDataUrl);
    const pdfBlob = doc.output("blob");
    lastPdfBlobRef.current = pdfBlob;

    try {
      await sendSignature(pdfBlob);
      setPdfUrl(URL.createObjectURL(pdfBlob));
      clearDraft();
      setStatus("success");
    } catch (err) {
      console.error("Falha ao enviar assinatura:", err);
      setStatus("send-error");
    }
  }

  async function handleRetry() {
    if (!lastPdfBlobRef.current) {
      setStatus("form");
      return;
    }
    setStatus("sending");
    try {
      await sendSignature(lastPdfBlobRef.current);
      setPdfUrl(URL.createObjectURL(lastPdfBlobRef.current));
      clearDraft();
      setStatus("success");
    } catch {
      setStatus("send-error");
    }
  }

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {record?.clinic_logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={record.clinic_logo_url}
            alt=""
            style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
          />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {record?.clinic_name || "Clínica"}
        </span>
      </header>

      {demo && (
        <div
          style={{
            background: "#f7ecd9",
            border: "1px solid #e9d2a3",
            color: "#7a5a17",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          Modo de visualização — nenhum token válido foi encontrado, então esta página está mostrando dados de
          exemplo.
        </div>
      )}

      {status === "loading" && (
        <div className="card" style={{ textAlign: "center", padding: "48px 20px", color: "var(--ink-soft)" }}>
          Carregando sua anamnese…
        </div>
      )}

      {status === "already-signed" && (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Documento já assinado</h1>
          <p style={{ color: "var(--ink-soft)" }}>Esta anamnese já foi assinada anteriormente.</p>
        </div>
      )}

      {!isOnline && (status === "form" || status === "sending") && (
        <div
          style={{
            background: "var(--sign-tint)",
            border: "1px solid var(--sign-line)",
            color: "var(--sign)",
            borderRadius: "var(--radius-sm)",
            padding: "10px 14px",
            fontSize: 13,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          Você está sem conexão agora. O que você já preencheu fica salvo neste aparelho — pode continuar
          respondendo e assinando; o envio conclui automaticamente quando a internet voltar.
        </div>
      )}

      {status === "form" && formStep === "review" && record && (
        <div style={{ paddingBottom: 96 }}>
          <div className="card">
            <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
              Revisão
            </p>
            <h1>Confira suas respostas</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 10 }}>
              Revise com atenção antes de assinar. Se alguma resposta estiver errada, toque em &quot;Corrigir&quot; pra ajustar.
            </p>
            <p style={{ fontSize: 15, marginBottom: 18 }}>
              Paciente: <strong style={{ color: "var(--brand-deep)" }}>{record.patient_name || "—"}</strong>
            </p>

            <dl style={{ margin: 0, borderTop: "1px solid var(--line)" }}>
              {record.answers.map((qa, i) => (
                <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid var(--line)" }}>
                  <dt style={{ fontSize: 13.5, color: "var(--ink-soft)", margin: "0 0 3px" }}>{qa.question}</dt>
                  {editingIndex === i ? (
                    <dd style={{ margin: 0 }}>
                      <textarea
                        autoFocus
                        rows={2}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        style={{
                          width: "100%",
                          fontSize: 15,
                          fontFamily: "inherit",
                          padding: "8px 10px",
                          borderRadius: 8,
                          border: "1px solid var(--line)",
                          resize: "vertical",
                        }}
                      />
                      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => saveEdit(i)}
                          className="btn-primary"
                          style={{ padding: "6px 14px", fontSize: 13.5 }}
                        >
                          {savingEdit ? "Salvando…" : "Salvar"}
                        </button>
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={cancelEdit}
                          style={{ border: "none", background: "none", color: "var(--ink-soft)", fontSize: 13.5, cursor: "pointer" }}
                        >
                          Cancelar
                        </button>
                      </div>
                      {editError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 6 }}>{editError}</div>}
                    </dd>
                  ) : (
                    <dd style={{ margin: 0, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 500 }}>{qa.answer || "—"}</span>
                      <button
                        type="button"
                        onClick={() => startEdit(i)}
                        style={{ border: "none", background: "none", color: "var(--brand)", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0, padding: 0 }}
                      >
                        Corrigir
                      </button>
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>

          <div className="sticky-actions">
            <div className="sticky-actions-inner">
              <button className="btn-primary" onClick={() => setFormStep("sign")}>
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}

      {(status === "form" || status === "sending") && formStep === "sign" && record && (
        <div style={{ paddingBottom: 96 }}>
          {status === "form" && (
            <button
              type="button"
              onClick={() => setFormStep("review")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                background: "none",
                border: "none",
                color: "var(--ink-soft)",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
                padding: "8px 0",
                marginBottom: 8,
              }}
            >
              ‹ Voltar pra revisão
            </button>
          )}

          <div className="card" style={{ border: "1.5px solid var(--sign-line)" }}>
            <p
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                textTransform: "uppercase",
                fontSize: 11.5,
                fontWeight: 700,
                color: "var(--sign)",
                margin: "0 0 10px",
              }}
            >
              <SignatureMark size={26} />
              Assinatura
            </p>
            <h1>Confirme e assine</h1>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 24 }}>
              Sua assinatura eletrônica será anexada a este documento junto com a data, hora e demais dados de
              identificação.
            </p>

            <div className="field">
              <label htmlFor="fullName">Nome completo</label>
              <input
                id="fullName"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Como no seu documento"
              />
              {showErrors && fullName.trim().length < 3 && (
                <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>Digite seu nome completo.</div>
              )}
            </div>

            <div className="field">
              <label htmlFor="cpf">CPF</label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                value={cpf}
                onChange={(e) => setCpf(formatCPF(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
              />
              {showErrors && !isValidCPF(cpf) && (
                <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>Digite um CPF válido.</div>
              )}
            </div>

            <div className="field">
              <label htmlFor="sigCanvas">Desenhe sua assinatura abaixo</label>
              <div
                style={{
                  position: "relative",
                  border: "1.5px dashed #c9c0ad",
                  borderRadius: "var(--radius-sm)",
                  background:
                    "linear-gradient(0deg, transparent 39px, var(--line) 40px, transparent 41px), #fdfcfa",
                  backgroundSize: "100% 40px",
                  touchAction: "none",
                }}
              >
                <canvas
                  ref={canvasRef}
                  id="sigCanvas"
                  className="sig-canvas"
                  onPointerDown={startStroke}
                  onPointerMove={moveStroke}
                  onPointerUp={endStroke}
                  onPointerLeave={endStroke}
                />
                {!hasSignature && (
                  <span
                    style={{
                      position: "absolute",
                      left: 14,
                      bottom: 10,
                      fontSize: 12.5,
                      color: "#a79e8c",
                      pointerEvents: "none",
                    }}
                  >
                    assine aqui com o dedo ou o mouse
                  </span>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
                <button
                  type="button"
                  onClick={clearSignature}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink-soft)",
                    fontSize: 13.5,
                    fontWeight: 600,
                    cursor: "pointer",
                    textDecoration: "underline",
                  }}
                >
                  Limpar assinatura
                </button>
              </div>
              {showErrors && !hasSignature && (
                <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>
                  Sua assinatura é necessária para confirmar.
                </div>
              )}
            </div>

            <label
              htmlFor="consentCheck"
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                background: "var(--brand-tint)",
                borderRadius: "var(--radius-sm)",
                padding: "14px 15px",
                margin: "20px 0",
                cursor: "pointer",
                minHeight: 44,
              }}
            >
              <input
                type="checkbox"
                id="consentCheck"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ width: 22, height: 22, marginTop: 1, flex: "none", accentColor: "var(--brand)" }}
              />
              <span style={{ fontSize: 13, color: "var(--brand-deep)", lineHeight: 1.5 }}>
                Declaro que as informações prestadas nesta anamnese são verdadeiras e completas, e reconheço esta
                como minha assinatura eletrônica, com validade jurídica nos termos da MP 2.200-2/2001 e da Lei nº
                14.063/2020.
              </span>
            </label>

            <p style={{ fontSize: 12, color: "var(--ink-soft)", textAlign: "center", margin: 0, lineHeight: 1.5 }}>
              Ao confirmar, registramos data, hora, IP e dispositivo como parte da trilha de autenticação deste
              documento.
            </p>
          </div>

          <div className="sticky-actions">
            <div className="sticky-actions-inner">
              <button className="btn-primary" disabled={status === "sending"} onClick={handleSubmit}>
                {status === "sending" ? "Enviando…" : "Confirmar e assinar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {status === "success" && (
        <div className="card" style={{ textAlign: "center", padding: "20px 4px" }}>
          {signatureThumb && (
            <div
              style={{
                display: "inline-block",
                margin: "0 auto 16px",
                padding: "10px 18px",
                background: "var(--sign-tint)",
                border: "1px solid var(--sign-line)",
                borderRadius: "var(--radius-sm)",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={signatureThumb} alt="Sua assinatura" style={{ display: "block", maxWidth: 200, maxHeight: 70 }} />
            </div>
          )}
          <h1>Documento assinado</h1>
          <p style={{ color: "var(--ink-soft)", fontSize: 14.5, marginBottom: 22 }}>
            Obrigado! Sua anamnese foi enviada e assinada com sucesso. A clínica já recebeu uma cópia.
          </p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              download="anamnese-assinada.pdf"
              style={{
                display: "inline-block",
                background: "var(--surface)",
                border: "1.5px solid var(--line)",
                color: "var(--ink)",
                borderRadius: "var(--radius-sm)",
                padding: "12px 20px",
                fontSize: 14.5,
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Baixar minha cópia em PDF
            </a>
          )}
        </div>
      )}

      {status === "send-error" && (
        <div className="card">
          <div className="error-box">
            Não conseguimos enviar seu documento agora. Verifique sua internet e tente novamente — sua assinatura
            não foi perdida.
          </div>
          <button className="btn-primary" style={{ marginTop: 14 }} onClick={handleRetry}>
            Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
