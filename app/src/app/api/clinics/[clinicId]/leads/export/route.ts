import { NextRequest, NextResponse } from "next/server";
import { getCurrentClinic } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LEAD_STATUS_LABEL } from "@/lib/leads";
import type { Lead, LeadMessage } from "@/lib/database.types";

const EXPORT_ROW_LIMIT = 2000;

const SENDER: Record<LeadMessage["role"], string> = {
  patient: "Paciente",
  bot: "Assistente",
  staff: "Recepção",
};

function csvField(value: string): string {
  if (/[;"\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function brDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function brShort(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Exporta os leads (todos os status, incluindo arquivados) criados a partir de
 * `?desde=AAAA-MM-DD` — uma linha por lead, com a conversa inteira numa célula.
 * Pro gestor de tráfego cruzar volume/conversão com as campanhas. CSV com
 * separador `;` e BOM, como o export de despesas.
 */
export async function GET(req: NextRequest, { params }: { params: { clinicId: string } }) {
  const clinic = await getCurrentClinic();
  if (!clinic || clinic.id !== params.clinicId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const desdeParam = req.nextUrl.searchParams.get("desde") ?? "";
  const defaultDesde = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(desdeParam) ? desdeParam : defaultDesde;
  const desdeISO = new Date(`${desde}T00:00:00-03:00`).toISOString();

  const supabase = await createSupabaseServerClient();

  const { data: leadsData } = await supabase
    .from("leads")
    .select("*")
    .eq("clinic_id", clinic.id)
    .gte("created_at", desdeISO)
    .order("created_at", { ascending: false })
    .limit(EXPORT_ROW_LIMIT);
  const leads = (leadsData as Lead[]) ?? [];

  const byLead = new Map<string, LeadMessage[]>();
  if (leads.length > 0) {
    const { data: msgData } = await supabase
      .from("lead_messages")
      .select("lead_id, role, content, created_at")
      .in(
        "lead_id",
        leads.map((l) => l.id)
      )
      .order("created_at", { ascending: true });
    for (const m of (msgData as Pick<LeadMessage, "lead_id" | "role" | "content" | "created_at">[]) ?? []) {
      const arr = byLead.get(m.lead_id) ?? [];
      arr.push(m as LeadMessage);
      byLead.set(m.lead_id, arr);
    }
  }

  const header = [
    "Criado em",
    "Nome",
    "Telefone",
    "Status",
    "Arquivado",
    "Motivo",
    "Nº de mensagens",
    "1ª mensagem do paciente",
    "Última atividade",
    "Conversa",
  ];
  const lines = [header.map(csvField).join(";")];

  for (const lead of leads) {
    const msgs = byLead.get(lead.id) ?? [];
    const firstPatient = msgs.find((m) => m.role === "patient")?.content ?? "";
    const conversa = msgs.map((m) => `[${brShort(m.created_at)}] ${SENDER[m.role]}: ${m.content}`).join("\n");
    lines.push(
      [
        brDateTime(lead.created_at),
        lead.patient_name ?? "",
        lead.patient_phone,
        LEAD_STATUS_LABEL[lead.status],
        lead.archived_at ? "Sim" : "Não",
        lead.clinical_summary ?? "",
        String(msgs.length),
        firstPatient,
        brDateTime(lead.last_message_at ?? lead.created_at),
        conversa,
      ]
        .map((v) => csvField(String(v)))
        .join(";")
    );
  }

  const csv = "﻿" + lines.join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-desde-${desde}.csv"`,
    },
  });
}
