import { createSupabaseServerClient } from "@/lib/supabase/server";
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
];

const PLANS = [
  {
    name: "Starter",
    price: "39,90",
    limit: 20,
    features: ["1 número de WhatsApp", "Modelo de perguntas padrão"],
  },
  {
    name: "Basic",
    price: "59,90",
    limit: 40,
    features: ["1 número de WhatsApp", "Modelo de perguntas padrão"],
  },
  {
    name: "Standard",
    price: "79,90",
    limit: 60,
    features: ["Perguntas personalizáveis", "Suporte prioritário"],
  },
  {
    name: "Plus",
    price: "99,90",
    limit: 80,
    features: ["Perguntas personalizáveis", "Múltiplos usuários na recepção", "Suporte prioritário"],
  },
  {
    name: "Pro",
    price: "129,90",
    limit: 120,
    features: ["Perguntas personalizáveis", "Múltiplos usuários na recepção", "Suporte prioritário"],
    featured: true,
  },
  {
    name: "Enterprise",
    price: "199,00",
    limit: 20,
    features: ["Múltiplas unidades/números", "Relatórios de uso", "Suporte prioritário dedicado"],
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
          <p className={styles.sectionSubtitle}>Sem contrato de fidelidade. Cancele quando quiser.</p>
          <div className={styles.pricingGrid}>
            {PLANS.map((p) => (
              <div key={p.name} className={p.featured ? `${styles.plan} ${styles.planFeatured}` : styles.plan}>
                {p.featured && <span className={styles.planBadge}>Mais popular</span>}
                <span className={styles.planName}>{p.name}</span>
                <span className={styles.planPrice}>
                  R$ {p.price}
                  <span>/mês</span>
                </span>
                <ul className={styles.planList}>
                  <li>Até {p.limit} anamneses/mês</li>
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
          <div className={styles.trust}>
            <p className={styles.trustText}>
              A assinatura eletrônica gerada é válida no Brasil pela MP 2.200-2/2001 e pela Lei nº 14.063/2020. Cada
              documento assinado guarda hash SHA-256, IP, data/hora e dispositivo do paciente como trilha de
              auditoria — a mesma evidência que sustenta a validade em caso de contestação.
            </p>
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
