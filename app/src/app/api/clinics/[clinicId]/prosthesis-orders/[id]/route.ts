import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { recordProsthesisOrderEvent, notifyProsthesisStageChange } from "@/lib/prosthesisOrders";
import type { ProsthesisOrder, ProsthesisStage } from "@/lib/database.types";

const STAGE_VALUES: [ProsthesisStage, ...ProsthesisStage[]] = ["pre_laboratorio", "laboratorio", "agenda", "realizado"];

const patchSchema = z.object({
  stage: z.enum(STAGE_VALUES).optional(),
  description: z.string().min(1).optional(),
  expected_delivery_date: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: { clinicId: string; id: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: current } = await supabase
    .from("prosthesis_orders")
    .select("*")
    .eq("id", params.id)
    .eq("clinic_id", clinic.id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const order = current as ProsthesisOrder;

  const stageChanged = input.stage !== undefined && input.stage !== order.stage;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.description !== undefined) update.description = input.description;
  if (input.expected_delivery_date !== undefined) update.expected_delivery_date = input.expected_delivery_date || null;
  if (input.notes !== undefined) update.notes = input.notes;
  if (stageChanged) {
    update.stage = input.stage;
    update.stage_since = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from("prosthesis_orders")
    .update(update)
    .eq("id", order.id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "update_failed", message: error?.message }, { status: 500 });
  }

  if (stageChanged) {
    await recordProsthesisOrderEvent(supabase, {
      prosthesisOrderId: order.id,
      clinicId: clinic.id,
      fromStage: order.stage,
      toStage: updated.stage,
      actor: "recepcao",
    });
    // Best-effort — mesmo padrão do resto do app: uma falha de WhatsApp não
    // pode impedir a movimentação do card de ter sido salva.
    try {
      await notifyProsthesisStageChange(supabase, clinic, updated as ProsthesisOrder);
    } catch (err) {
      console.error("Falha ao avisar o paciente sobre a mudança de estágio da prótese por WhatsApp:", err);
    }
  }

  return NextResponse.json({ order: updated });
}
