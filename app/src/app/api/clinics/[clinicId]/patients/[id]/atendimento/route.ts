import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { requestEvolutionSignature } from "@/lib/evolutionSignature";
import { recordAppointmentEvent } from "@/lib/appointments";
import { MAX_EVOLUTION_IMAGES, deleteEvolutionImages, saveEvolutionImage } from "@/lib/treatmentEvolutionStorage";
import type { Appointment, Treatment, TreatmentDebit } from "@/lib/database.types";

const bodySchema = z.object({
  treatment_ids: z.array(z.string().uuid()).min(1),
  evolution_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  evolution_text: z.string().trim().min(1),
  finalize: z.boolean(),
  notify_patient: z.boolean().default(false),
  /** null = não receber agora. Só pagamento integral — parcial continua na aba Débitos. */
  payment_method: z.string().min(1).nullable(),
  /** Agendamento de onde o atendimento foi iniciado ("Iniciar atendimento" na agenda) — vira "atendido" no fim. */
  appointment_id: z.string().uuid().nullable().optional(),
});

/**
 * Agendamento que este atendimento encerra: o informado pelo client (veio
 * do "Iniciar atendimento") ou, se não veio, o agendamento do paciente
 * ainda "em atendimento" nas últimas 24h — cobre quem fechou a tela e
 * registrou depois pelo botão da ficha, pra ele não ficar preso nesse status.
 */
async function findAppointmentToClose(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  clinicId: string,
  patientId: string,
  appointmentId: string | null | undefined
): Promise<Appointment | null> {
  if (appointmentId) {
    const { data } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", appointmentId)
      .eq("clinic_id", clinicId)
      .eq("patient_id", patientId)
      .maybeSingle();
    const appointment = data as Appointment | null;
    // Já encerrado (atendido, falta, cancelado) — não mexe.
    return appointment && ["agendado", "confirmado", "em_atendimento"].includes(appointment.status) ? appointment : null;
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("appointments")
    .select("*")
    .eq("clinic_id", clinicId)
    .eq("patient_id", patientId)
    .eq("status", "em_atendimento")
    .gte("scheduled_at", since)
    .order("scheduled_at", { ascending: false })
    .limit(1);
  return ((data as Appointment[] | null) ?? [])[0] ?? null;
}

/** Tratamentos em aberto do paciente + débitos em aberto ligados a eles — o que o modal "Registrar atendimento" precisa pra montar a tela. */
export async function GET(_req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: treatments, error } = await supabase
    .from("treatments")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .eq("status", "aberto")
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });

  const ids = (treatments ?? []).map((t) => t.id);
  if (ids.length === 0) return NextResponse.json({ treatments: [], debits: [] });

  const { data: debits, error: debitsError } = await supabase
    .from("treatment_debits")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("status", "aberto")
    .in("treatment_id", ids);
  if (debitsError) return NextResponse.json({ error: "query_failed", message: debitsError.message }, { status: 500 });

  return NextResponse.json({ treatments: treatments ?? [], debits: debits ?? [] });
}

/**
 * Registra um atendimento inteiro de uma vez (multipart/form-data: campo
 * `payload` com o JSON do bodySchema, mais até 5 `images` e uma
 * `new_image_descriptions` por imagem): UMA evolução vinculada a
 * todos os tratamentos escolhidos, opcionalmente finalizando-os, e
 * opcionalmente dando baixa (integral) nos débitos em aberto deles. Sem
 * transação no client do Supabase — a ordem é evolução → finalização →
 * pagamento, e se uma etapa falha as anteriores são desfeitas, pra nunca
 * sobrar meio atendimento gravado (tratamento finalizado sem evolução,
 * evolução sem o pagamento que a recepção achou que lançou etc.).
 */
export async function POST(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "invalid_body" }, { status: 400 });

  let payload: unknown = null;
  try {
    payload = JSON.parse(String(form.get("payload") ?? ""));
  } catch {
    payload = null;
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", message: parsed.error.issues[0]?.message }, { status: 400 });
  }
  const { treatment_ids, evolution_date, evolution_text, finalize, notify_patient, payment_method, appointment_id } = parsed.data;

  const images = form.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
  if (images.length > MAX_EVOLUTION_IMAGES) {
    return NextResponse.json({ error: "too_many_images", message: `Máximo de ${MAX_EVOLUTION_IMAGES} imagens por evolução.` }, { status: 400 });
  }
  // Mesma ordem/quantidade que `images` (uma entrada por arquivo).
  const imageDescriptions = form.getAll("new_image_descriptions").map((d) => String(d));

  const supabase = await createSupabaseServerClient();
  const { data: treatmentsData, error: treatmentsError } = await supabase
    .from("treatments")
    .select("*")
    .eq("clinic_id", clinic.id)
    .eq("patient_id", params.id)
    .in("id", treatment_ids);
  if (treatmentsError) return NextResponse.json({ error: "query_failed", message: treatmentsError.message }, { status: 500 });

  const treatments = (treatmentsData as Treatment[]) ?? [];
  if (treatments.length !== treatment_ids.length) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (treatments.some((t) => t.status !== "aberto")) {
    return NextResponse.json({ error: "already_finalized", message: "Um ou mais tratamentos já foram finalizados." }, { status: 409 });
  }

  let debits: TreatmentDebit[] = [];
  if (payment_method) {
    const { data, error } = await supabase
      .from("treatment_debits")
      .select("*")
      .eq("clinic_id", clinic.id)
      .eq("status", "aberto")
      .in("treatment_id", treatment_ids);
    if (error) return NextResponse.json({ error: "query_failed", message: error.message }, { status: 500 });
    debits = (data as TreatmentDebit[]) ?? [];
  }

  // 1. Evolução — uma linha só pro grupo inteiro (mesmo padrão de
  // treatments/finalize), pra que uma assinatura cubra todos.
  const { data: evolution, error: evolutionError } = await supabase
    .from("treatment_evolutions")
    .insert({
      clinic_id: clinic.id,
      treatment_id: treatments[0].id, // âncora legada — o grupo completo fica em treatment_evolution_treatments
      patient_id: treatments[0].patient_id,
      evolution_date,
      text: evolution_text,
      image_keys: [],
      notify_patient,
    })
    .select("*")
    .single();
  if (evolutionError || !evolution) {
    return NextResponse.json({ error: "insert_failed", message: evolutionError?.message }, { status: 500 });
  }

  let savedImageKeys: string[] = [];
  async function undoEvolution() {
    await deleteEvolutionImages(savedImageKeys);
    await supabase.from("treatment_evolution_treatments").delete().eq("treatment_evolution_id", evolution.id);
    await supabase.from("treatment_evolutions").delete().eq("id", evolution.id);
  }

  const { error: linkError } = await supabase
    .from("treatment_evolution_treatments")
    .insert(treatments.map((t) => ({ treatment_evolution_id: evolution.id, treatment_id: t.id })));
  if (linkError) {
    await undoEvolution();
    return NextResponse.json({ error: "insert_failed", message: linkError.message }, { status: 500 });
  }

  // 1b. Imagens — diferente da tela de evolução avulsa, aqui uma falha
  // desfaz o atendimento inteiro: a dentista ainda está com a tela aberta
  // e pode tentar de novo, melhor do que achar que as fotos foram salvas.
  let savedEvolution = evolution;
  if (images.length > 0) {
    const results = await Promise.allSettled(images.map((file) => saveEvolutionImage(clinic.id, evolution.id, file)));
    savedImageKeys = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
    if (failed) {
      await undoEvolution();
      const message = failed.reason instanceof Error ? failed.reason.message : "Falha ao salvar as imagens.";
      return NextResponse.json({ error: "images_failed", message }, { status: 400 });
    }
    const { data: updated, error: imagesError } = await supabase
      .from("treatment_evolutions")
      .update({ image_keys: savedImageKeys, image_names: images.map((f) => f.name), image_descriptions: images.map((_, i) => imageDescriptions[i] ?? "") })
      .eq("id", evolution.id)
      .select("*")
      .single();
    if (imagesError || !updated) {
      await undoEvolution();
      return NextResponse.json({ error: "update_failed", message: imagesError?.message }, { status: 500 });
    }
    savedEvolution = updated;
  }

  // 2. Finalização
  const now = new Date().toISOString();
  let finalized: Treatment[] = [];
  if (finalize) {
    const { data, error } = await supabase
      .from("treatments")
      .update({
        status: "finalizado",
        finalized_at: evolution_date,
        evolution_text,
        dentist_name: clinic.dentist_name || clinic.name,
        updated_at: now,
      })
      .in("id", treatment_ids)
      .eq("clinic_id", clinic.id)
      .select("*");
    if (error) {
      await undoEvolution();
      return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
    }
    finalized = (data as Treatment[]) ?? [];
  }

  // 3. Pagamento integral
  let paid: TreatmentDebit[] = [];
  if (payment_method && debits.length > 0) {
    const { data, error } = await supabase
      .from("treatment_debits")
      .update({ status: "pago", payment_method, paid_at: now, updated_at: now })
      .in(
        "id",
        debits.map((d) => d.id)
      )
      .eq("status", "aberto")
      .select("*");
    if (error) {
      if (finalize) {
        await Promise.all(
          treatments.map((t) =>
            supabase
              .from("treatments")
              .update({ status: t.status, finalized_at: t.finalized_at, evolution_text: t.evolution_text, dentist_name: t.dentist_name, updated_at: t.updated_at })
              .eq("id", t.id)
          )
        );
      }
      await undoEvolution();
      return NextResponse.json({ error: "update_failed", message: error.message }, { status: 500 });
    }
    paid = (data as TreatmentDebit[]) ?? [];
  }

  // 4. Agendamento → "atendido". Best-effort: o atendimento já está
  // gravado e é o que importa; se isto falhar, dá pra marcar pela agenda.
  let closedAppointmentId: string | null = null;
  const appointment = await findAppointmentToClose(supabase, clinic.id, params.id, appointment_id);
  if (appointment) {
    const { error } = await supabase
      .from("appointments")
      .update({ status: "atendido", updated_at: now })
      .eq("id", appointment.id)
      .eq("clinic_id", clinic.id);
    if (error) {
      console.error(`Falha ao marcar o agendamento ${appointment.id} como atendido:`, error.message);
    } else {
      closedAppointmentId = appointment.id;
      await recordAppointmentEvent(supabase, {
        appointmentId: appointment.id,
        clinicId: clinic.id,
        eventType: "status_changed",
        fromStatus: appointment.status,
        toStatus: "atendido",
        actor: "recepcao",
        meta: { motivo: "atendimento registrado na ficha" },
      });
    }
  }

  // Só depois de tudo gravado — e só se a caixa foi marcada (envio
  // automático ao paciente é exceção, risco de bloqueio do WhatsApp).
  if (notify_patient) {
    const sent = await requestEvolutionSignature(clinic.id, evolution.id);
    if (!sent.ok) console.error(`Não foi possível solicitar assinatura do atendimento (evolução ${evolution.id}):`, sent.error);
  }

  return NextResponse.json({ evolution: savedEvolution, treatments: finalized, debits: paid, appointment_id: closedAppointmentId }, { status: 201 });
}
