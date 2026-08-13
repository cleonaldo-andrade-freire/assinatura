import { notFound } from "next/navigation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";
import { formatBRDate, formatBRTime, formatBRWeekday } from "@/lib/date";
import { ConfirmationActions } from "@/components/ConfirmationActions";
import type { Appointment } from "@/lib/database.types";

// Sem cookies/headers/searchParams, o Next trataria essa rota como estática
// por padrão (cacheia o HTML renderizado e as respostas de fetch do
// Supabase) — errado aqui: status e horário mudam a qualquer momento
// (paciente confirma, clínica remarca), e "horário já passou" é calculado
// no render. Sem isso, um link de WhatsApp podia servir pra sempre a
// primeira resposta que o Next cacheou, nunca refletindo remarcação nem
// fazendo o link expirar de verdade.
export const dynamic = "force-dynamic";

export default async function ConfirmacaoPage({ params }: { params: { token: string } }) {
  if (!isValidToken(params.token)) notFound();

  const supabase = createSupabaseAdminClient();
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("confirm_token", params.token)
    .maybeSingle();
  if (!appointment) notFound();
  const a = appointment as Appointment;

  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", a.clinic_id).single();

  const expired = new Date(a.scheduled_at).getTime() < Date.now();

  return (
    <div className="wrap">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        {clinic?.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={clinic.logo_url}
            alt=""
            style={{ width: 32, height: 32, objectFit: "contain", borderRadius: 6 }}
          />
        )}
        <span style={{ fontFamily: "Georgia, serif", fontWeight: 600, fontSize: 17, color: "var(--brand-deep)" }}>
          {clinic?.name || "Clínica"}
        </span>
      </header>

      {a.status === "confirmado" ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Você já confirmou</h1>
          <p style={{ color: "var(--ink-soft)" }}>
            Sua presença já está confirmada pra {formatBRWeekday(a.scheduled_at, "long")}, {formatBRDate(a.scheduled_at)} às{" "}
            {formatBRTime(a.scheduled_at)}.
          </p>
        </div>
      ) : a.status === "cancelado_paciente" || a.status === "cancelado_dentista" ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Agendamento cancelado</h1>
          <p style={{ color: "var(--ink-soft)" }}>Este agendamento já foi cancelado. Se quiser remarcar, chame a clínica pelo WhatsApp.</p>
        </div>
      ) : a.status === "atendido" ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Consulta já realizada</h1>
          <p style={{ color: "var(--ink-soft)" }}>Este atendimento já foi concluído.</p>
        </div>
      ) : expired ? (
        <div className="card" style={{ textAlign: "center" }}>
          <h1>Horário já passou</h1>
          <p style={{ color: "var(--ink-soft)" }}>Este link não vale mais — fale com a clínica pra reagendar.</p>
        </div>
      ) : (
        <>
          <div className="card">
            <p style={{ textTransform: "uppercase", fontSize: 11.5, fontWeight: 700, color: "var(--brand)", margin: "0 0 10px" }}>
              Confirmação de consulta
            </p>
            <h1>Você confirma sua presença?</h1>
            <p style={{ fontSize: 15, marginBottom: 4 }}>
              <strong style={{ color: "var(--brand-deep)" }}>{a.patient_name}</strong>
            </p>
            <p style={{ color: "var(--ink-soft)", fontSize: 14.5 }}>
              {formatBRWeekday(a.scheduled_at, "long")}, {formatBRDate(a.scheduled_at)} às {formatBRTime(a.scheduled_at)}
              {a.professional_name && ` — ${a.professional_name}`}
            </p>
          </div>

          <ConfirmationActions token={params.token} />
        </>
      )}
    </div>
  );
}
