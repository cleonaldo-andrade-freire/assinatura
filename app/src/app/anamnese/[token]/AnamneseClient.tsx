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
  patient_phone: string | null;
  patient_rg: string | null;
  patient_birth_date: string | null;
  patient_occupation: string | null;
  patient_address: string | null;
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
  const [cep, setCep] = useState("");
  const [street, setStreet] = useState("");
  const [addressNumber, setAddressNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const [isFetchingCep, setIsFetchingCep] = useState(false);
  const [phone, setPhone] = useState("");
  const [occupation, setOccupation] = useState("");

  const [mainComplaint, setMainComplaint] = useState("");

  // Formulário - Saúde dinâmico (carregado do banco)
  const [questions, setQuestions] = useState<{ question: string; answer: string }[]>([]);
  const [healthAnswers, setHealthAnswers] = useState<Record<number, { yesNo?: "Sim" | "Não", text: string }>>({});
  
  // Assinatura
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [signError, setSignError] = useState("");
  const [signatureSnapshot, setSignatureSnapshot] = useState<string | null>(null);

  // Erro de validação de formulário
  const [formError, setFormError] = useState("");

  async function handleCepChange(val: string) {
    const raw = val.replace(/\D/g, "").slice(0, 8);
    let masked = raw;
    if (raw.length > 5) masked = raw.replace(/^(\d{5})(\d)/, "$1-$2");
    setCep(masked);

    if (raw.length === 8) {
      setIsFetchingCep(true);
      try {
        const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setStreet(data.logradouro || "");
          setNeighborhood(data.bairro || "");
          setCity(data.localidade || "");
          setUf(data.uf || "");
        }
      } catch (e) {
        // ignora erro
      } finally {
        setIsFetchingCep(false);
      }
    }
  }

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
        setCpf(data.patient_cpf ? formatCPF(data.patient_cpf) : "");
        setPhone(data.patient_phone ? formatBRPhoneLocal(data.patient_phone) : "");
        setRg(data.patient_rg || "");
        setBirthDate(data.patient_birth_date || "");
        setOccupation(data.patient_occupation || "");
        
        // Se vier com endereço pré-preenchido, a gente pode colocar tudo no "street" ou tentar quebrar
        // Como no backend tá uma string só, vamos jogar no campo da Rua provisoriamente, se não houver cep.
        // Ou melhor, colocar no 'street' para ele conferir.
        if (data.patient_address) {
           setStreet(data.patient_address);
        }

        // Populamos as perguntas originais que vieram do banco
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
    setFormError("");
    if (step === "identificacao") {
      if (!name.trim()) return setFormError("Nome é obrigatório.");
      if (cpf && !isValidCPF(cpf)) return setFormError("CPF inválido. Verifique se a numeração está correta.");
      
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
    setFormError("");
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

    // Monta o endereço final
    const parts = [];
    if (street) parts.push(street);
    if (addressNumber) parts.push(addressNumber);
    if (complement) parts.push(`- ${complement}`);
    if (neighborhood) parts.push(neighborhood);
    if (city) parts.push(`${city} - ${uf}`);
    
    const finalAddress = parts.length > 0 ? `${cep ? cep + ' - ' : ''}${parts.join(", ")}` : undefined;

    try {
      const res = await fetch(`/api/anamnesis/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name.trim(),
          patient_cpf: cpf.replace(/\D/g, "") || undefined,
          patient_phone: phone ? toE164BR(phone) : undefined,
          birth_date: birthDate || undefined,
          rg: rg.trim() || undefined,
          occupation: occupation.trim() || undefined,
          address: finalAddress,
          answers,
          signature: {
            signerName: name.trim(),
            signerCpf: cpf.replace(/\D/g, "") || "",
            dataUrl: signature.dataUrl,
            strokeData: signature.strokeData,
          },
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

            <div className={styles.formRow}>
              <div style={{ flex: "0 0 120px" }}>
                <label className={styles.label}>CEP (opcional)</label>
                <input type="text" inputMode="numeric" className={styles.input} value={cep} onChange={e => handleCepChange(e.target.value)} placeholder="00000-000" maxLength={9} />
              </div>
              <div>
                <label className={styles.label}>Endereço Residencial (Rua/Av) {isFetchingCep && <span style={{fontSize:12, color:"#6b7280"}}>(Buscando...)</span>}</label>
                <input type="text" className={styles.input} value={street} onChange={e => setStreet(e.target.value)} placeholder="Rua..." />
              </div>
            </div>

            <div className={styles.formRow}>
              <div style={{ flex: "0 0 100px" }}>
                <label className={styles.label}>Número</label>
                <input type="text" className={styles.input} value={addressNumber} onChange={e => setAddressNumber(e.target.value)} placeholder="123" />
              </div>
              <div>
                <label className={styles.label}>Complemento / Bairro</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="text" className={styles.input} value={complement} onChange={e => setComplement(e.target.value)} placeholder="Apto 1" style={{ flex: 1 }} />
                  <input type="text" className={styles.input} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} placeholder="Bairro" style={{ flex: 2 }} />
                </div>
              </div>
            </div>

            <div className={styles.formRow}>
              <div>
                <label className={styles.label}>Cidade</label>
                <input type="text" className={styles.input} value={city} onChange={e => setCity(e.target.value)} placeholder="Cidade" />
              </div>
              <div style={{ flex: "0 0 80px" }}>
                <label className={styles.label}>UF</label>
                <input type="text" className={styles.input} value={uf} onChange={e => setUf(e.target.value.toUpperCase())} placeholder="SP" maxLength={2} />
              </div>
            </div>
            <div className={styles.formGroup}>
              <label className={styles.label}>Queixa Principal (Opcional)</label>
              <textarea className={`${styles.input} ${styles.textarea}`} value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} placeholder="Descreva brevemente o motivo da consulta..." />
            </div>

            {formError && <div className={styles.errorMessage}>{formError}</div>}

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
