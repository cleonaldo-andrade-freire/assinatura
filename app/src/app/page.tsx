import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActivePlans } from "@/lib/plans";
import styles from "./page.module.css";

const WHATSAPP_NUMBER = "5579998616410";
const WHATSAPP_MESSAGE = "Olá! Quero saber mais sobre a anamnese via WhatsApp.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

const BENEFITS = [
  {
    title: "Tudo pelo WhatsApp",
    text: "O paciente responde a anamnese e assina sem baixar app nenhum — só pelo WhatsApp que ele já usa.",
  },
  {
    title: "Assinatura com validade jurídica",
    text: "Assinatura eletrônica simples, válida no Brasil pela MP 2.200-2/2001 e pela Lei 14.063/2020.",
  },
  {
    title: "Menos tempo de recepção",
    text: "Anamnese preenchida antes da consulta, sem papel, sem digitação manual pela equipe.",
  },
  {
    title: "Trilha de auditoria automática",
    text: "Hash do PDF, IP, data/hora e dispositivo registrados a cada assinatura, sem esforço extra.",
  },
  {
    title: "PDFs seguros na nuvem",
    text: "Cada anamnese assinada fica guardada com segurança, disponível a qualquer momento, em qualquer dispositivo.",
  },
  {
    title: "Acesse de onde estiver",
    text: "Painel funciona tanto no computador da recepção quanto no celular — inclusive instalado como app.",
  },
];

const TRUST = [
  {
    title: "Validade jurídica real",
    text: "Assinatura eletrônica simples, válida no Brasil pela MP 2.200-2/2001 e pela Lei nº 14.063/2020.",
  },
  {
    title: "Dados isolados por clínica",
    text: "Cada clínica só acessa os próprios pacientes e documentos — nunca dá pra ver dados de outra clínica.",
  },
  {
    title: "Trilha de auditoria completa",
    text: "Hash SHA-256, IP, data/hora e dispositivo registrados em cada assinatura, disponíveis pra consulta a qualquer momento.",
  },
];

const FAQ = [
  {
    q: "Preciso instalar algum aplicativo?",
    a: "Não. O paciente responde e assina direto pelo WhatsApp que já usa. O painel da clínica funciona no navegador, no computador ou no celular — dá pra instalar como atalho no celular se quiser, mas não é obrigatório.",
  },
  {
    q: "A assinatura eletrônica tem validade jurídica?",
    a: "Sim — é uma assinatura eletrônica simples, válida no Brasil pela MP 2.200-2/2001 e pela Lei nº 14.063/2020 (não é certificado ICP-Brasil).",
  },
  {
    q: "Como funciona o período de teste?",
    a: "3 anamneses grátis, sem pedir cartão de crédito. Depois disso, é só escolher um dos planos.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim, sem contrato de fidelidade nem multa.",
  },
  {
    q: "Preciso trocar o número de WhatsApp da clínica?",
    a: "Não — você conecta o número que a clínica já usa, escaneando um QR Code direto no painel.",
  },
  {
    q: "E se eu passar do limite de anamneses do plano?",
    a: "Não bloqueia. Cada anamnese extra é cobrada à parte, direto na fatura do mês — sem multa nem corte de acesso.",
  },
  {
    q: "Posso mudar de plano depois?",
    a: "Sim, a qualquer momento, direto no painel — a mudança vale a partir da próxima cobrança.",
  },
  {
    q: "Os dados da minha clínica ficam seguros?",
    a: "Sim — cada clínica só acessa os próprios dados, e os PDFs assinados ficam guardados com segurança na nuvem.",
  },
];

const STEPS = [
  { title: "Você envia o link", text: "Direto pelo WhatsApp da clínica, pro paciente que vai ser atendido." },
  { title: "Paciente responde", text: "Perguntas da anamnese, em formato de conversa, no próprio celular." },
  { title: "Confirma e assina", text: "Revisa as respostas e assina na tela, com o dedo ou o mouse." },
  { title: "Clínica recebe o PDF", text: "Documento assinado chega pronto, já com a trilha de auditoria." },
];

export default async function HomePage() {
  const supabase = await createSupabaseServerClient();
  const [
    {
      data: { user },
    },
    plans,
  ] = await Promise.all([supabase.auth.getUser(), getActivePlans(supabase)]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.container} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className={styles.brand}>Anamnese WhatsApp</span>
          <a href={user ? "/dashboard" : "/login"} className={styles.headerCta}>
            {user ? "Ir para o painel" : "Entrar"}
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>Anamnese &amp; assinatura eletrônica</p>
          <h1 className={styles.heroTitle}>
            Anamnese e assinatura direto no WhatsApp do paciente
          </h1>
          <p className={styles.heroSubtitle}>
            Sua clínica manda um link pelo WhatsApp, o paciente responde e assina antes da consulta — sem app, sem
            papel, com validade jurídica.
          </p>
          <div className={styles.heroCtas}>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className={styles.btnPrimaryLg}>
              Falar no WhatsApp
            </a>
            <a href="#planos" className={styles.btnGhostLg}>
              Ver planos
            </a>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Por que usar</h2>
          <p className={styles.sectionSubtitle}>
            Pensado pra clínicas pequenas que querem agilizar o atendimento sem virar um projeto de TI.
          </p>
          <div className={styles.grid}>
            {BENEFITS.map((b) => (
              <div key={b.title} className={styles.benefitCard}>
                <p className={styles.benefitTitle}>{b.title}</p>
                <p className={styles.benefitText}>{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Como funciona</h2>
          <p className={styles.sectionSubtitle}>Do primeiro contato até o PDF assinado, em 4 passos.</p>
          <div className={styles.steps}>
            {STEPS.map((s, i) => (
              <div key={s.title} className={styles.step}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <p className={styles.stepTitle}>{s.title}</p>
                <p className={styles.stepText}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section} id="planos">
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Planos</h2>
          <p className={styles.sectionSubtitle}>
            Teste grátis com até 3 anamneses, sem cartão de crédito. Sem contrato de fidelidade — cancele quando
            quiser.
          </p>
          <div className={styles.pricingGrid}>
            {plans.map((p) => (
              <div key={p.id} className={p.featured ? `${styles.plan} ${styles.planFeatured}` : styles.plan}>
                {p.featured && <span className={styles.planBadge}>Mais popular</span>}
                <span className={styles.planName}>{p.name}</span>
                <span className={styles.planPrice}>
                  R$ {p.monthly_price.toFixed(2).replace(".", ",")}
                  <span>/mês</span>
                </span>
                <ul className={styles.planList}>
                  <li>Até {p.monthly_limit} anamneses/mês</li>
                  {p.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
                <a
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className={p.featured ? `${styles.planCta} ${styles.planCtaFeatured}` : styles.planCta}
                >
                  Falar no WhatsApp
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Segurança e confiança</h2>
          <p className={styles.sectionSubtitle}>
            A mesma evidência que sustenta a validade jurídica em caso de contestação.
          </p>
          <div className={styles.grid}>
            {TRUST.map((t) => (
              <div key={t.title} className={`${styles.benefitCard} ${styles.trustCard}`}>
                <p className={styles.benefitTitle}>{t.title}</p>
                <p className={styles.benefitText}>{t.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Perguntas frequentes</h2>
          <div className={styles.faqList}>
            {FAQ.map((f) => (
              <details key={f.q} className={styles.faqItem}>
                <summary>{f.q}</summary>
                <p className={styles.faqAnswer}>{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Quer ver funcionando na sua clínica?</h2>
          <p className={styles.sectionSubtitle} style={{ marginBottom: 24 }}>
            Fala com a gente pelo WhatsApp — configuramos pra você.
          </p>
          <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className={styles.btnPrimaryLg}>
            Falar no WhatsApp
          </a>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.container}>Anamnese via WhatsApp — assinatura eletrônica simples, não é certificado ICP-Brasil.</div>
      </footer>
    </div>
  );
}
