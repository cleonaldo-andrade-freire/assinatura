"use client";

import { useEffect, useState } from "react";
import { SignatureMark } from "@/components/SignatureMark";
import { SignatureCanvas, type SignatureResult } from "@/components/SignatureCanvas";
import { formatCPF, isValidCPF, formatBRPhoneLocal, toE164BR } from "@/lib/validation";
import styles from "./AnamneseClient.module.css";

interface AnamnesisData {
  clinic_name: string;
  clinic_logo_url: string | null;
  patient_name: string;
  patient_cpf: string | null;
  answers: { question: string; answer: string }[];
  already_signed: boolean;
}

type Step = "loading" | "error" | "identificacao" | "saude" | "assinatura" | "submitting" | "success" | "already-signed";

export function AnamneseClient({ token }: { token: string }) {
  const [step, setStep] = useState<Step>("loading");
  const [clinicName, setClinicName] = useState("");
  const [clinicLogo, setClinicLogo] = useState<string | null>(null);

  // Formulário - Identificação
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [rg, setRg] = useState("");
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");
  const [address, setAddress] = useState("");
  const [mainComplaint, setMainComplaint] = useState("");

  // Formulário - Saúde dinâmico (carregado do banco)
  const [questions, setQuestions] = useState<{ question: string; answer: string }[]>([]);
  const [healthAnswers, setHealthAnswers] = useState<Record<number, { yesNo?: "Sim" | "Não", text: string }>>({});
  
  // Assinatura
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [signError, setSignError] = useState("");
  const [signatureSnapshot, setSignatureSnapshot] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/anamnesis/${token}`);
        if (!res.ok) throw new Error("not_found");
        const data = await res.json() as AnamnesisData;
        
        if (data.already_signed) {
          setStep("already-signed");
          return;
        }

        setClinicName(data.clinic_name);
        setClinicLogo(data.clinic_logo_url);
        setName(data.patient_name || "");
        setCpf(data.patient_cpf || "");
        
        // Populamos as perguntas originais que vieram do banco
        // (A API send-link salvou as perguntas vazias no banco)
        if (data.answers && data.answers.length > 0) {
          setQuestions(data.answers);
          const initialH: Record<number, { text: string }> = {};
          data.answers.forEach((q, i) => {
            initialH[i] = { text: "" };
          });
          setHealthAnswers(initialH);
        }

        setStep("identificacao");
      } catch {
        setStep("error");
      }
    }
    load();
  }, [token]);

  function handleNext() {
    if (step === "identificacao") {
      if (!name.trim()) return alert("Nome é obrigatório.");
      if (cpf && !isValidCPF(cpf)) return alert("CPF inválido.");
      
      // Se não houver perguntas, pula a etapa de saúde direto pra assinatura
      if (questions.length === 0) {
        setStep("assinatura");
      } else {
        setStep("saude");
      }
    } else if (step === "saude") {
      setStep("assinatura");
    }
  }

  function handleBack() {
    if (step === "saude") setStep("identificacao");
    if (step === "assinatura") {
      if (questions.length === 0) setStep("identificacao");
      else setStep("saude");
    }
  }

  async function handleSubmit() {
    if (!signature) {
      setSignError("Por favor, assine o documento.");
      return;
    }

    setStep("submitting");
    setSignError("");

    const answers = [
      { question: "Queixa Principal e Evolução", answer: mainComplaint || "Nenhuma queixa descrita." }
    ];

    questions.forEach((q, i) => {
      const ans = healthAnswers[i];
      if (ans?.yesNo) {
        if (ans.yesNo === "Sim") {
          answers.push({ question: q.question, answer: `Sim\nObs: ${ans.text || "Nenhuma observação."}` });
        } else {
          answers.push({ question: q.question, answer: "Não" });
        }
      } else {
        answers.push({ question: q.question, answer: ans?.text || "-" });
      }
    });

    try {
      const res = await fetch(`/api/anamnesis/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient: {
            name: name.trim(),
            cpf: cpf.replace(/\D/g, "") || undefined,
            birth_date: birthDate || undefined,
            rg: rg.trim() || undefined,
            phone: phone ? toE164BR(phone) : undefined,
            occupation: occupation.trim() || undefined,
            address: address.trim() || undefined,
          },
          answers,
          signature: signature.strokeData,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Falha ao salvar");
      }

      setStep("success");
    } catch (e: any) {
      setSignError(e.message || "Ocorreu um erro ao enviar. Tente novamente.");
      setStep("assinatura");
    }
  }

  if (step === "loading" || step === "submitting") {
    return (
      <div className={styles.container}>
        <div className={styles.loadingWrapper}>
          <div className={styles.spinner}></div>
          <p>{step === "loading" ? "Carregando formulário..." : "Enviando suas respostas..."}</p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className={styles.container}>
        <div className={styles.loadingWrapper}>
          <h2 className={styles.title} style={{ color: "var(--danger)" }}>Erro ao carregar</h2>
          <p>O link acessado é inválido ou já expirou.</p>
        </div>
      </div>
    );
  }

  if (step === "already-signed") {
    return (
      <div className={styles.container}>
        <div className={styles.loadingWrapper}>
          <div className={styles.successIcon} style={{ backgroundColor: "#f3f4f6", color: "#6b7280" }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          </div>
          <h2 className={styles.title}>Ficha Já Assinada</h2>
          <p>Você já preencheu e assinou esta ficha de anamnese.</p>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          {clinicLogo ? <img src={clinicLogo} alt={clinicName} className={styles.logo} /> : <div style={{ fontSize: 20, fontWeight: "bold" }}>{clinicName}</div>}
        </div>
        <div className={styles.main}>
          <div className={styles.card} style={{ textAlign: "center", padding: "40px 20px" }}>
            <div className={styles.successIcon}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className={styles.title}>Ficha Enviada com Sucesso!</h2>
            <p style={{ color: "#6b7280" }}>Obrigado, {name.split(" ")[0]}! Suas respostas e assinatura foram registradas com segurança.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        {clinicLogo ? <img src={clinicLogo} alt={clinicName} className={styles.logo} /> : <div style={{ fontSize: 20, fontWeight: "bold" }}>{clinicName}</div>}
      </header>

      <main className={styles.main}>
        <h1 className={styles.title}>Ficha de Anamnese</h1>

        <div className={styles.steps}>
          <div className={`${styles.step} ${step === "identificacao" ? styles.active : styles.completed}`}>
            <div className={styles.stepCircle}>1</div>
            <span className={styles.stepLabel}>Identificação</span>
          </div>
          <div className={`${styles.step} ${step === "saude" ? styles.active : (step === "assinatura" ? styles.completed : "")}`} style={{ opacity: questions.length === 0 ? 0.3 : 1 }}>
            <div className={styles.stepCircle}>2</div>
            <span className={styles.stepLabel}>Saúde</span>
          </div>
          <div className={`${styles.step} ${step === "assinatura" ? styles.active : ""}`}>
            <div className={styles.stepCircle}>3</div>
            <span className={styles.stepLabel}>Assinatura</span>
          </div>
        </div>

        {step === "identificacao" && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Dados Pessoais</h2>
            
            <div className={styles.formGroup}>
              <label className={styles.label}>Nome Completo</label>
              <input type="text" className={styles.input} value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome completo" />
            </div>

            <div className={styles.formRow}>
              <div>
                <label className={styles.label}>CPF (opcional)</label>
                <input type="text" inputMode="numeric" className={styles.input} value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
              </div>
              <div>
                <label className={styles.label}>Data de Nascimento</label>
                <input type="date" className={styles.input} value={birthDate} onChange={e => setBirthDate(e.target.value)} />
              </div>
            </div>

            <div className={styles.formRow}>
              <div>
                <label className={styles.label}>RG (opcional)</label>
                <input type="text" className={styles.input} value={rg} onChange={e => setRg(e.target.value)} placeholder="0000000" />
              </div>
              <div>
                <label className={styles.label}>Celular</label>
                <input type="text" inputMode="numeric" className={styles.input} value={phone} onChange={e => setPhone(formatBRPhoneLocal(e.target.value))} placeholder="(00) 00000-0000" />
              </div>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Ocupação / Profissão (opcional)</label>
              <input type="text" className={styles.input} value={occupation} onChange={e => setOccupation(e.target.value)} placeholder="Ex: Professor" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Endereço Residencial (opcional)</label>
              <input type="text" className={styles.input} value={address} onChange={e => setAddress(e.target.value)} placeholder="Rua, Número, Bairro, Cidade - UF" />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Queixa Principal (Opcional)</label>
              <textarea className={`${styles.input} ${styles.textarea}`} value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} placeholder="Descreva brevemente o motivo da consulta..." />
            </div>

            <div className={styles.buttonRow}>
              <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}>Continuar</button>
            </div>
          </div>
        )}

        {step === "saude" && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Questionário de Saúde</h2>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 24 }}>Por favor, responda às perguntas abaixo com o máximo de sinceridade. Suas respostas são confidenciais.</p>
            
            {questions.map((q, i) => {
              const ans = healthAnswers[i] || {};
              // Inferência simples para saber se a pergunta é do tipo sim/não ou aberta
              // Como os questionários antigos eram abertos, deixamos o paciente escolher Sim/Não para tudo ou escrever.
              return (
                <div key={i} className={`${styles.questionItem} ${ans.yesNo ? styles.active : ""}`}>
                  <div className={styles.questionLabel}>{q.question}</div>
                  
                  <div className={styles.yesNoGroup}>
                    <button 
                      className={`${styles.yesNoBtn} ${ans.yesNo === "Sim" ? styles.selectedYes : ""}`}
                      onClick={() => setHealthAnswers(prev => ({ ...prev, [i]: { ...prev[i], yesNo: "Sim" } }))}
                    >
                      Sim
                    </button>
                    <button 
                      className={`${styles.yesNoBtn} ${ans.yesNo === "Não" ? styles.selectedNo : ""}`}
                      onClick={() => setHealthAnswers(prev => ({ ...prev, [i]: { ...prev[i], yesNo: "Não", text: "" } }))}
                    >
                      Não
                    </button>
                  </div>

                  <div className={`${styles.detailInputWrapper} ${ans.yesNo === "Sim" ? styles.open : ""}`}>
                    <label className={styles.label} style={{ fontSize: 13, color: "#4b5563" }}>Poderia detalhar?</label>
                    <input 
                      type="text" 
                      className={styles.input} 
                      value={ans.text || ""} 
                      onChange={e => setHealthAnswers(prev => ({ ...prev, [i]: { ...prev[i], text: e.target.value } }))}
                      placeholder="Descreva aqui..."
                    />
                  </div>
                </div>
              );
            })}

            <div className={styles.buttonRow}>
              <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={handleBack}>Voltar</button>
              <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleNext}>Continuar</button>
            </div>
          </div>
        )}

        {step === "assinatura" && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Assinatura Digital</h2>
            
            <div className={styles.termsText}>
              Eu, <strong>{name || "Paciente"}</strong>, inscrito(a) no CPF <strong>{cpf || "___.___.___-__"}</strong>, 
              declaro que as informações aqui prestadas são verdadeiras e me comprometo a informar 
              qualquer alteração no meu estado de saúde em consultas futuras.
            </div>

            <div style={{ marginBottom: 8 }}>
              <SignatureCanvas 
                onChange={result => {
                  setSignature(result);
                  setHasSignature(!!result);
                  setSignatureSnapshot(result?.dataUrl ?? null);
                  setSignError("");
                }}
                height={160}
              />
            </div>

            {signError && <div className={styles.errorMessage}>{signError}</div>}



            <div className={styles.buttonRow}>
              <button className={`${styles.button} ${styles.buttonSecondary}`} onClick={handleBack}>Voltar</button>
              <button className={`${styles.button} ${styles.buttonPrimary}`} onClick={handleSubmit}>Finalizar e Assinar</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
