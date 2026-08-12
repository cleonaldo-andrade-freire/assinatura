"use client";

import { useState } from "react";
import { formatCNPJ, isValidCNPJ } from "@/lib/validation";
import { formatBRDateTime } from "@/lib/date";
import { PRESCRIPTION_CONTROL_LABEL } from "@/lib/prescriptionControl";
import type { Prescription, PrescriptionItem } from "@/lib/database.types";

export function DispensingForm({
  code,
  prescription,
  clinicName,
}: {
  code: string;
  prescription: Prescription;
  clinicName: string;
}) {
  const [items, setItems] = useState<PrescriptionItem[]>(prescription.items);
  const [crf, setCrf] = useState("");
  const [cnpj, setCnpj] = useState("");
  const [dispensingIndex, setDispensingIndex] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cnpjError = cnpj.trim().length > 0 && !isValidCNPJ(cnpj);
  const identifiedOk = crf.trim().length > 0 && isValidCNPJ(cnpj);

  async function handleDispense(itemIndex: number) {
    if (!identifiedOk) {
      setError("Preenche CRF e um CNPJ válido antes de dar baixa.");
      return;
    }
    setError(null);
    setDispensingIndex(itemIndex);
    try {
      const res = await fetch(`/api/farmacia/${encodeURIComponent(code)}/dispensar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemIndex, crf: crf.trim(), cnpj: cnpj.replace(/\D/g, "") }),
      });
      const data = await res.json();
      if (!res.ok) {
        const messages: Record<string, string> = {
          already_dispensed: "Esse item já tinha sido dispensado (talvez em outra aba/farmácia).",
          rate_limited: "Muitas tentativas em pouco tempo — espera alguns minutos.",
        };
        setError(messages[data.error] || "Falha ao dar baixa. Tenta de novo.");
        return;
      }
      setItems(data.items);
    } catch {
      setError("Falha ao dar baixa. Confere sua conexão e tenta de novo.");
    } finally {
      setDispensingIndex(null);
    }
  }

  return (
    <>
      <div className="card">
        <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
          Prescrição odontológica
        </p>
        <h1>{prescription.patient_name}</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 14 }}>
          {clinicName} — {prescription.dentist_name}, CRO {prescription.dentist_cro}/{prescription.dentist_cro_uf}
        </p>
      </div>

      <div className="card">
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 10 }}>Identificação de quem está dispensando</p>
        <div className="field">
          <label htmlFor="crf">CRF do farmacêutico</label>
          <input id="crf" type="text" value={crf} onChange={(e) => setCrf(e.target.value)} placeholder="Ex.: CRF-SE 12345" />
        </div>
        <div className="field">
          <label htmlFor="cnpj">CNPJ da farmácia</label>
          <input
            id="cnpj"
            type="text"
            inputMode="numeric"
            value={cnpj}
            onChange={(e) => setCnpj(formatCNPJ(e.target.value))}
            placeholder="00.000.000/0000-00"
            maxLength={18}
          />
          {cnpjError && <div style={{ color: "var(--danger)", fontSize: 12.5, marginTop: 5 }}>CNPJ inválido.</div>}
        </div>
      </div>

      {error && (
        <div className="card">
          <div className="error-box">{error}</div>
        </div>
      )}

      <div className="card">
        <p style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 12 }}>Medicamentos</p>
        {items.map((item, i) => (
          <div
            key={i}
            style={{
              padding: "12px 0",
              borderBottom: i < items.length - 1 ? "1px solid var(--line)" : "none",
            }}
          >
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              {i + 1}. {item.drug_name}
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-soft)", marginBottom: 8 }}>
              {item.dosage} — {item.instructions}
              {item.generic_allowed && " · aceita genérico"}
            </div>
            {item.control_type !== "comum" && (
              <p style={{ fontSize: 12.5, fontWeight: 600, margin: "0 0 8px", color: "#7a5a17" }}>
                ⚠️ {PRESCRIPTION_CONTROL_LABEL[item.control_type]}
              </p>
            )}
            {item.dispensed_at ? (
              <p style={{ fontSize: 13, color: "var(--brand)", fontWeight: 600, margin: 0 }}>
                ✅ Dispensado em {formatBRDateTime(item.dispensed_at, "medium")} — CRF {item.dispensed_by_crf}, farmácia
                CNPJ {item.dispensed_by_pharmacy_cnpj && formatCNPJ(item.dispensed_by_pharmacy_cnpj)}
              </p>
            ) : (
              <button
                type="button"
                className="btn-primary"
                disabled={!identifiedOk || dispensingIndex !== null}
                onClick={() => handleDispense(i)}
                style={{ padding: "8px 16px", fontSize: 13.5 }}
              >
                {dispensingIndex === i ? "Dando baixa…" : "Dar baixa"}
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <button type="button" onClick={() => window.print()} className="btn-primary" style={{ background: "var(--surface)", color: "var(--ink)", border: "1.5px solid var(--line)" }}>
          Imprimir comprovante
        </button>
      </div>
    </>
  );
}
