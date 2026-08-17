import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActivePlans } from "@/lib/plans";
import styles from "./page.module.css";

const WHATSAPP_NUMBER = "5579998616410";
const WHATSAPP_MESSAGE = "Olá! Quero saber mais sobre o sistema para consultório odontológico pelo WhatsApp.";
const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(WHATSAPP_MESSAGE)}`;

const MODULES = [
  {
    title: "Agenda com confirmação",
    text: "Paciente confirma a consulta com um toque no WhatsApp. Lembrete automático na véspera e no dia, só pra quem ainda não confirmou — menos falta, sem a recepção ficar ligando.",
  },
  {
    title: "Anamnese e assinatura",
    text: "Paciente responde a anamnese em formato de conversa e assina eletronicamente antes da consulta, direto pelo celular.",
  },
  {
    title: "Atestados e prescrições",
    text: "Emita e envie por WhatsApp, prontos para o paciente baixar — com verificação pública de autenticidade.",
  },
  {
    title: "Orçamentos",
    text: "Monte a partir da sua tabela de preços, envie por WhatsApp e, quando o paciente aprovar, o tratamento já nasce pronto para acompanhar.",
  },
  {
    title: "Tratamentos e evolução",
    text: "Prontuário clínico digital: evolução, fotos e imagens de cada paciente, sem pasta de papel.",
  },
  {
    title: "Financeiro do paciente",
    text: "Débitos, pagamentos parciais e recibo em PDF, enviado por WhatsApp assim que o paciente paga.",
  },
  {
    title: "Próteses",
    text: "Acompanhe o pedido em cada etapa do laboratório — o paciente é avisado automaticamente pelo WhatsApp a cada mudança.",
  },
  {
    title: "Ficha única do paciente",
    text: "Agendamentos, orçamentos, tratamentos, débitos, imagens e documentos — tudo reunido numa só tela.",
  },
];

const BENEFITS = [
  {
    title: "Menos falta na agenda",
    text: "Confirmação e lembrete automático pelo WhatsApp reduzem o paciente esquecido — sem custo de ligação nem trabalho manual da recepção.",
  },
  {
    title: "Sem papel, sem pasta",
    text: "Anamnese, atestado, prescrição, orçamento e recibo nascem digitais e ficam guardados com segurança na nuvem.",
  },
  {
    title: "Tudo pelo WhatsApp que o paciente já usa",
    text: "Sem baixar aplicativo nenhum — o paciente confirma, responde e assina no mesmo WhatsApp de sempre.",
  },
  {
    title: "Assinatura com validade jurídica",
    text: "Assinatura eletrônica simples, válida no Brasil pela MP 2.200-2/2001 e pela Lei 14.063/2020.",
  },
  {
    title: "Um consultório inteiro, um painel só",
    text: "Agenda, prontuário, financeiro e documentos no mesmo lugar — sem planilha solta, sem sistema separado por área.",
  },
  {
    title: "Acesse de onde estiver",
    text: "Painel funciona no computador da recepção ou no celular — inclusive instalado como app.",
  },
];

const NOSHOW_STEPS = [
  { title: "Agendou, já confirma", text: "Assim que marca a consulta, o paciente recebe um link no WhatsApp para confirmar em um toque." },
  { title: "Lembrete na véspera", text: "Quem ainda não confirmou recebe um lembrete no dia anterior — sem repetir para quem já confirmou." },
  { title: "Lembrete no dia", text: "Se mesmo assim não respondeu, chega um último aviso no mesmo dia da consulta." },
  { title: "Confirma, cancela ou remarca", text: "Tudo isso tocando no link ou só respondendo a mensagem — sem baixar nada." },
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
    a: "Não. O paciente confirma consulta, responde anamnese e assina documento direto pelo WhatsApp que já usa. O painel da clínica funciona no navegador, no computador ou no celular — dá pra instalar como atalho se quiser, mas não é obrigatório.",
  },
  {
    q: "Como funciona a confirmação de consulta e a redução de falta?",
    a: "Ao agendar, o paciente recebe um link de confirmação pelo WhatsApp. Se não confirmar, chega um lembrete na véspera e outro no dia da consulta — só pra quem ainda não respondeu. Ele confirma, cancela ou remarca com um toque, ou simplesmente respondendo a mensagem.",
  },
  {
    q: "A assinatura eletrônica tem validade jurídica?",
    a: "Sim — é uma assinatura eletrônica simples, válida no Brasil pela MP 2.200-2/2001 e pela Lei nº 14.063/2020 (não é certificado ICP-Brasil).",
  },
  {
    q: "Como funciona o período de teste?",
    a: "3 anamneses grátis, sem pedir cartão de crédito. As demais funcionalidades (agenda, atestados, prescrições, orçamentos, tratamentos, financeiro, próteses) você já usa sem limite desde o início. Depois do teste, é só escolher um dos planos — e a anamnese também passa a ser ilimitada.",
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
    q: "Tem limite de uso no plano pago?",
    a: "Não. Depois do período de teste, todos os módulos — incluindo anamnese — ficam sem limite de uso em qualquer plano, sem cobrança extra por volume.",
  },
  {
    q: "Posso mudar de plano depois?",
    a: "Sim, a qualquer momento, direto no painel — a mudança vale a partir da próxima cobrança.",
  },
  {
    q: "Os dados da minha clínica ficam seguros?",
    a: "Sim — cada clínica só acessa os próprios dados, e todos os documentos ficam guardados com segurança na nuvem.",
  },
];

const STEPS = [
  { title: "Você aciona pelo painel", text: "Agenda uma consulta, dispara uma anamnese, monta um orçamento ou emite um atestado." },
  { title: "Paciente recebe no WhatsApp", text: "Um link só, sem app pra baixar — confirma, responde ou assina no próprio celular." },
  { title: "O sistema atualiza sozinho", text: "Confirmação registrada, lembrete disparado, assinatura com trilha de auditoria." },
  { title: "Fica tudo no seu painel", text: "Agenda, prontuário, financeiro e documentos organizados, sem papel." },
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
          <span className={styles.brand}>DentalAgil</span>
          <a href={user ? "/dashboard" : "/login"} className={styles.headerCta}>
            {user ? "Ir para o painel" : "Entrar"}
          </a>
        </div>
      </header>

      <section className={styles.hero}>
        <div className={styles.container}>
          <p className={styles.eyebrow}>Sistema para consultório odontológico</p>
          <h1 className={styles.heroTitle}>
            Seu consultório sem papel, tudo integrado pelo WhatsApp
          </h1>
          <p className={styles.heroSubtitle}>
            Agenda com confirmação automática, anamnese, atestados, prescrições, orçamentos, tratamentos e
            financeiro do paciente — em um só painel, com o paciente resolvendo tudo no WhatsApp que já usa.
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
          <h2 className={styles.sectionTitle}>Tudo o que seu consultório precisa</h2>
          <p className={styles.sectionSubtitle}>
            Não é só anamnese — é o consultório inteiro rodando sem papel, com o WhatsApp como canal do paciente.
          </p>
          <div className={styles.grid}>
            {MODULES.map((m) => (
              <div key={m.title} className={styles.benefitCard}>
                <p className={styles.benefitTitle}>{m.title}</p>
                <p className={styles.benefitText}>{m.text}</p>
              </div>
            ))}
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
          <h2 className={styles.sectionTitle}>Menos falta, sem esforço extra</h2>
          <p className={styles.sectionSubtitle}>
            A confirmação pelo WhatsApp roda sozinha — a recepção só cuida de quem realmente precisa de atenção.
          </p>
          <div className={styles.steps}>
            {NOSHOW_STEPS.map((s, i) => (
              <div key={s.title} className={styles.step}>
                <div className={styles.stepNumber}>{i + 1}</div>
                <p className={styles.stepTitle}>{s.title}</p>
                <p className={styles.stepText}>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.container}>
          <h2 className={styles.sectionTitle}>Como funciona</h2>
          <p className={styles.sectionSubtitle}>Do primeiro contato até o documento pronto, em 4 passos.</p>
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
            Agenda, anamnese, atestados, prescrições, orçamentos, tratamentos, financeiro e próteses vêm inclusos em
            qualquer plano, sem limite de uso. Teste grátis com até 3 anamneses, sem cartão de crédito. Sem contrato
            de fidelidade — cancele quando quiser.
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
                  <li>Todos os módulos do sistema, sem limite de uso</li>
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
        <div className={styles.container}>DentalAgil — consultório odontológico sem papel, via WhatsApp. Assinatura eletrônica simples, não é certificado ICP-Brasil.</div>
      </footer>
    </div>
  );
}
