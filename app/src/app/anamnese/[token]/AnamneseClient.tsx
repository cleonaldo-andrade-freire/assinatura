"use client";

import { useEffect, useRef, useState } from "react";
import { SignatureMark } from "@/components/SignatureMark";
import { SignatureCanvas, type SignatureResult } from "@/components/SignatureCanvas";
import { formatCPF, isValidCPF } from "@/lib/validation";

// Tipagem base
interface AnamnesisData {
  clinic_name: string;
  clinic_logo_url: string | null;
  patient_name: string;
  patient_cpf: string | null;
  answers: { question: string; answer: string }[];
  already_signed: boolean;
}

type Step = "loading" | "error" | "identificacao" | "saude" | "assinatura" | "submitting" | "success" | "already-signed";

const DEFAULT_QUESTIONS = [
  { id: "q1", label: "Dor de dente", type: "text" as const },
  { id: "q2", label: "Está em tratamento médico atualmente?", type: "yesno" as const },
  { id: "q3", label: "Está fazendo uso de alguma medicação?", type: "yesno" as const },
  { id: "q4", label: "Tem alguma alergia?", type: "yesno" as const },
  { id: "q5", label: "Fuma?", type: "yesno" as const },
  { id: "q6", label: "Ingere bebida alcoólica?", type: "yesno" as const },
];

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

  // Formulário - Saúde
  const [healthAnswers, setHealthAnswers] = useState<Record<string, { yesNo?: "Sim" | "Não", text: string }>>({});
  
  // Assinatura
  const [signature, setSignature] = useState<SignatureResult | null>(null);
  const [hasSignature, setHasSignature] = useState(false);
  const [signError, setSignError] = useState("");
  const [signatureSnapshot, setSignatureSnapshot] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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
        
        // Populamos o dicionário de respostas de saúde vazio
        const initialH: Record<string, { text: string }> = {};
        for (const q of DEFAULT_QUESTIONS) {
          initialH[q.id] = { text: "" };
        }
        setHealthAnswers(initialH);

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
      setStep("saude");
    } else if (step === "saude") {
      setStep("assinatura");
    }
  }

  function handleBack() {
    if (step === "saude") setStep("identificacao");
    if (step === "assinatura") setStep("saude");
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

    for (const q of DEFAULT_QUESTIONS) {
      const ans = healthAnswers[q.id];
      if (q.type === "yesno") {
        if (ans?.yesNo === "Sim") {
          answers.push({ question: q.label, answer: `Sim\nObs: ${ans.text || "Nenhuma observação."}` });
        } else {
          answers.push({ question: q.label, answer: ans?.yesNo || "Não" });
        }
      } else {
        answers.push({ question: q.label, answer: ans?.text || "-" });
      }
    }

    try {
      const res = await fetch(`/api/anamnesis/${token}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_name: name,
          patient_cpf: cpf,
          patient_phone: phone,
          birth_date: birthDate,
          rg,
          occupation,
          address,
          answers,
          signature: {
            signerName: name,
            signerCpf: cpf || "Não informado",
            dataUrl: signatureSnapshot,
            strokeData: signature.strokeData
          }
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to submit");
      }
      setStep("success");
    } catch (e) {
      console.error(e);
      setSignError("Falha ao salvar. Tente novamente.");
      setStep("assinatura");
    }
  }

  if (step === "loading") {
    return <div className="flex h-screen items-center justify-center bg-[#f7f9fa]"><p className="text-gray-500 animate-pulse">Carregando...</p></div>;
  }
  if (step === "error") {
    return <div className="flex h-screen items-center justify-center bg-[#f7f9fa]"><p className="text-red-500">Documento não encontrado ou inválido.</p></div>;
  }
  if (step === "already-signed") {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[#f7f9fa] py-16 px-4">
        <div className="w-full max-w-2xl bg-white shadow-sm rounded-xl p-8 text-center border border-gray-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-6">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Ficha já preenchida!</h2>
          <p className="text-gray-500">Sua anamnese já foi assinada e salva com sucesso.</p>
        </div>
      </div>
    );
  }
  if (step === "success") {
    return (
      <div className="flex min-h-screen flex-col items-center bg-[#f7f9fa] py-16 px-4">
        <div className="w-full max-w-2xl bg-white shadow-sm rounded-xl p-8 text-center border border-gray-100">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 mb-6">
            <svg className="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Concluído!</h2>
          <p className="text-gray-500 mb-6">Sua anamnese foi assinada eletronicamente e salva com sucesso.</p>
          <a href={`/api/anamnesis/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex justify-center rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500">
            Baixar cópia em PDF
          </a>
        </div>
      </div>
    );
  }

  const stepsCount = 3;
  const currentStep = step === "identificacao" ? 1 : step === "saude" ? 2 : 3;

  return (
    <div className="min-h-screen bg-[#f7f9fa] text-gray-900 font-sans pb-20">
      {/* Header Estilo Documento */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {clinicLogo ? <img src={clinicLogo} alt="Logo" className="h-8" /> : <div className="h-8 w-8 bg-gray-200 rounded-md"></div>}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900 leading-tight">FICHA DE ANAMNESE</span>
              <span className="text-xs text-gray-500">{clinicName}</span>
            </div>
          </div>
          <div className="flex space-x-2">
            {[1, 2, 3].map(s => (
              <div key={s} className={`h-6 w-6 flex items-center justify-center rounded-full text-xs font-semibold ${s === currentStep ? "bg-blue-600 text-white" : s < currentStep ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-400"}`}>
                {s < currentStep ? "✓" : s}
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        <div className="bg-white shadow-sm ring-1 ring-gray-900/5 sm:rounded-xl overflow-hidden">
          
          {step === "identificacao" && (
            <div className="p-6 sm:p-8">
              <h2 className="text-sm font-bold tracking-widest text-gray-400 uppercase mb-6 pb-2 border-b border-gray-100">01. Identificação do Paciente</h2>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Nome Completo</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="Digite seu nome" />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">CPF</label>
                  <input type="text" value={cpf} onChange={e => setCpf(formatCPF(e.target.value))} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="000.000.000-00" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Data de Nascimento</label>
                  <input type="date" value={birthDate} onChange={e => setBirthDate(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">RG</label>
                  <input type="text" value={rg} onChange={e => setRg(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="Opcional" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Celular</label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="(00) 00000-0000" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Ocupação / Profissão</label>
                  <input type="text" value={occupation} onChange={e => setOccupation(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="Profissão" />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-1">Endereço Residencial</label>
                  <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg font-medium" placeholder="Rua, Número, Bairro, Cidade - UF" />
                </div>

                <div className="sm:col-span-2 mt-4 border-l-4 border-blue-100 pl-4 py-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Queixa Principal e Evolução da Doença</label>
                  <textarea rows={3} value={mainComplaint} onChange={e => setMainComplaint(e.target.value)} className="block w-full resize-none border-0 bg-gray-50 rounded-md p-3 text-gray-900 focus:ring-2 focus:ring-inset focus:ring-blue-600 sm:text-sm" placeholder="Descreva brevemente a queixa ou deixe em branco..." />
                </div>
              </div>
            </div>
          )}

          {step === "saude" && (
            <div className="p-6 sm:p-8">
              <h2 className="text-sm font-bold tracking-widest text-gray-400 uppercase mb-6 pb-2 border-b border-gray-100">02. Questionário de Saúde</h2>
              
              <div className="space-y-8">
                {DEFAULT_QUESTIONS.map(q => {
                  const ans = healthAnswers[q.id];
                  return (
                    <div key={q.id} className="group">
                      <label className="block text-sm font-bold text-gray-800 uppercase mb-3">{q.label}</label>
                      
                      {q.type === "yesno" ? (
                        <div className="flex flex-col space-y-4">
                          <div className="flex space-x-6">
                            <label className="flex items-center cursor-pointer">
                              <input type="radio" name={`q-${q.id}`} value="Sim" checked={ans?.yesNo === "Sim"} onChange={() => setHealthAnswers(prev => ({...prev, [q.id]: {...prev[q.id], yesNo: "Sim"}}))} className="h-5 w-5 text-blue-600 border-gray-300 focus:ring-blue-600 cursor-pointer" />
                              <span className="ml-3 text-gray-900 font-medium">SIM</span>
                            </label>
                            <label className="flex items-center cursor-pointer">
                              <input type="radio" name={`q-${q.id}`} value="Não" checked={ans?.yesNo === "Não"} onChange={() => setHealthAnswers(prev => ({...prev, [q.id]: {...prev[q.id], yesNo: "Não", text: ""}}))} className="h-5 w-5 text-gray-400 border-gray-300 focus:ring-blue-600 cursor-pointer" />
                              <span className="ml-3 text-gray-600">NÃO</span>
                            </label>
                          </div>
                          
                          {/* Campo dinâmico para "SIM" */}
                          {ans?.yesNo === "Sim" && (
                            <div className="animate-in fade-in slide-in-from-top-2 duration-300 border-l-2 border-blue-500 pl-4 py-1 ml-1">
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Qual/Quais? (Detalhe a resposta)</label>
                              <input type="text" value={ans.text || ""} onChange={e => setHealthAnswers(prev => ({...prev, [q.id]: {...prev[q.id], text: e.target.value}}))} className="block w-full border-0 border-b border-gray-200 bg-gray-50 px-3 py-2 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-sm" placeholder="Descreva aqui..." autoFocus />
                            </div>
                          )}
                        </div>
                      ) : (
                        <input type="text" value={ans?.text || ""} onChange={e => setHealthAnswers(prev => ({...prev, [q.id]: {...prev[q.id], text: e.target.value}}))} className="block w-full border-0 border-b border-gray-200 bg-transparent py-2 px-0 text-gray-900 focus:border-blue-600 focus:ring-0 sm:text-lg" placeholder="Sua resposta..." />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {(step === "assinatura" || step === "submitting") && (
            <div className="p-6 sm:p-8 flex flex-col items-center">
              <h2 className="text-xl font-semibold text-gray-900 mb-2 self-start">Assinatura do Paciente</h2>
              <p className="text-sm text-gray-500 self-start mb-6">
                Ao assinar abaixo, você confirma que todas as informações fornecidas são verdadeiras e que concorda com o Termo de Consentimento apresentado.
              </p>

              <div className="w-full relative border-2 border-dashed border-gray-300 rounded-xl bg-gray-50/50 mb-2" style={{ height: "240px", touchAction: "none" }}>
                <SignatureCanvas 
                  ref={canvasRef as any}
                  onDrawEnd={result => {
                    setSignature(result);
                    setHasSignature(true);
                    if (canvasRef.current) setSignatureSnapshot(canvasRef.current.toDataURL("image/png"));
                    setSignError("");
                  }}
                  onClear={() => {
                    setSignature(null);
                    setHasSignature(false);
                    setSignatureSnapshot(null);
                  }}
                />
                
                {!hasSignature && (
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center opacity-30">
                    <span className="text-lg font-bold uppercase tracking-widest text-gray-400">Assine Aqui</span>
                  </div>
                )}
                
                <div className="pointer-events-none absolute inset-x-0 bottom-6 border-b border-gray-300 opacity-50 px-12" />
              </div>
              
              <div className="flex w-full justify-between px-2 mb-6 text-sm text-gray-500">
                <span>Use o dedo (celular) ou o mouse (computador)</span>
                {hasSignature && (
                  <button type="button" onClick={() => (canvasRef.current as any)?.clear()} className="font-semibold text-blue-600 hover:text-blue-500">
                    Limpar
                  </button>
                )}
              </div>

              {signError && <p className="text-red-500 text-sm font-semibold mb-4 bg-red-50 px-4 py-2 rounded-lg self-start w-full border border-red-100">{signError}</p>}

              <SignatureMark />
            </div>
          )}
          
          <div className="bg-gray-50 px-6 py-4 flex items-center justify-between sm:px-8 border-t border-gray-100">
            {step !== "identificacao" ? (
              <button type="button" disabled={step === "submitting"} onClick={handleBack} className="text-sm font-semibold text-gray-600 hover:text-gray-900 disabled:opacity-50">
                Voltar
              </button>
            ) : <div />}
            
            {step !== "assinatura" && step !== "submitting" ? (
              <button type="button" onClick={handleNext} className="rounded-lg bg-gray-900 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-gray-800">
                Continuar
              </button>
            ) : (
              <button type="button" disabled={step === "submitting" || !hasSignature} onClick={handleSubmit} className="rounded-lg bg-blue-600 px-8 py-3 text-sm font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 flex items-center">
                {step === "submitting" ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Salvando...
                  </>
                ) : "Finalizar e Assinar"}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
