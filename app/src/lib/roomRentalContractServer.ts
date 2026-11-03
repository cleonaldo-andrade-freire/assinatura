import crypto from "crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { computeContentHash } from "@/lib/documentSignatureEvents";
import { sendText } from "@/lib/evolution";
import { contractLink, contractWhatsappMessage, type RentalContractSnapshot } from "@/lib/roomRentalContract";
import type { SignatureResult } from "@/components/SignatureCanvas";
import type { Clinic, RoomRental, RoomRentalShift, RoomTenant } from "@/lib/database.types";

type Admin = ReturnType<typeof createSupabaseAdminClient>;

function buildSnapshot(clinic: Clinic, tenant: RoomTenant, shift: RoomRentalShift, rental: RoomRental): RentalContractSnapshot {
  return {
    schema: "contrato-locacao/v1",
    lessor: {
      clinicName: clinic.name,
      dentistName: clinic.dentist_name,
      cro: clinic.dentist_cro,
      croUf: clinic.dentist_cro_uf,
      cnpj: clinic.cnpj,
      address: clinic.clinic_address,
    },
    tenant: { name: tenant.name, document: tenant.document, cro: tenant.cro, croUf: tenant.cro_uf },
    rental: {
      date: rental.rental_date,
      // Horário da própria locação (snapshot da 073), não do turno ao vivo.
      shiftName: shift.name,
      startTime: new Date(rental.starts_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
      endTime: new Date(rental.ends_at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }),
      amount: Number(rental.amount),
    },
  };
}

export type PrepareContractResult =
  | { ok: true; link: string; sent: boolean; rental: RoomRental }
  | { ok: false; status: number; error: string; message: string };

/**
 * Gera (ou gera de novo) o contrato da locação e, se `send`, manda o link
 * pelo WhatsApp do locatário. Gerar de novo troca o token — link antigo para
 * de valer — e congela os dados atuais. Contrato já assinado só é refeito com
 * `renew` explícito: a assinatura anterior é descartada.
 */
export async function prepareRentalContract(
  clinic: Clinic,
  rentalId: string,
  opts: { send: boolean; renew: boolean }
): Promise<PrepareContractResult> {
  const supabase: Admin = createSupabaseAdminClient();
  const { data: rentalData } = await supabase.from("room_rentals").select("*").eq("id", rentalId).eq("clinic_id", clinic.id).maybeSingle();
  if (!rentalData) return { ok: false, status: 404, error: "not_found", message: "Locação não encontrada." };
  const rental = rentalData as RoomRental;
  if (rental.status === "cancelada") return { ok: false, status: 409, error: "cancelled", message: "Locação cancelada não tem contrato." };
  if (rental.contract_signed_at && !opts.renew) {
    return { ok: false, status: 409, error: "already_signed", message: "O contrato desta locação já foi assinado." };
  }

  const [{ data: tenantData }, { data: shiftData }] = await Promise.all([
    supabase.from("room_tenants").select("*").eq("id", rental.tenant_id).single(),
    supabase.from("room_rental_shifts").select("*").eq("id", rental.shift_id).single(),
  ]);
  if (!tenantData || !shiftData) return { ok: false, status: 404, error: "not_found", message: "Locatário ou turno não encontrado." };
  const tenant = tenantData as RoomTenant;
  if (opts.send && !tenant.phone) {
    return { ok: false, status: 400, error: "tenant_no_phone", message: "Cadastre o WhatsApp do locatário (aba Locatários) para enviar." };
  }

  const snapshot = buildSnapshot(clinic, tenant, shiftData as RoomRentalShift, rental);
  const { data: updated, error } = await supabase
    .from("room_rentals")
    .update({
      contract_token: crypto.randomUUID(),
      contract_snapshot: snapshot,
      contract_hash: computeContentHash(snapshot),
      contract_signed_at: null,
      contract_signature: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", rental.id)
    .select("*")
    .single();
  if (error || !updated) return { ok: false, status: 500, error: "update_failed", message: "Não foi possível gerar o contrato." };

  const link = contractLink(updated.contract_token as string);
  let sent = false;
  if (opts.send) {
    sent = await sendText(clinic, tenant.phone!, contractWhatsappMessage(snapshot, link));
    if (!sent) {
      return { ok: false, status: 502, error: "send_failed", message: "Contrato gerado, mas o WhatsApp falhou. Use “Copiar link” e envie manualmente." };
    }
    const { data: withSent } = await supabase
      .from("room_rentals")
      .update({ contract_sent_at: new Date().toISOString() })
      .eq("id", rental.id)
      .select("*")
      .single();
    return { ok: true, link, sent, rental: (withSent ?? updated) as RoomRental };
  }
  return { ok: true, link, sent, rental: updated as RoomRental };
}

export interface PublicContract {
  rentalId: string;
  clinicName: string;
  clinicLogoUrl: string | null;
  snapshot: RentalContractSnapshot;
  contentHash: string;
  cancelled: boolean;
  signedAt: string | null;
  signatureDataUrl: string | null;
}

/** Contrato pelo token do link — sem login, o token é a credencial. */
export async function getContractByToken(token: string): Promise<PublicContract | null> {
  const supabase = createSupabaseAdminClient();
  const { data } = await supabase.from("room_rentals").select("*").eq("contract_token", token).maybeSingle();
  if (!data || !data.contract_snapshot || !data.contract_hash) return null;
  const rental = data as RoomRental;
  const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", rental.clinic_id).single();
  const signature = rental.contract_signature as { dataUrl?: string } | null;
  return {
    rentalId: rental.id,
    clinicName: clinic?.name ?? "Clínica",
    clinicLogoUrl: clinic?.logo_url ?? null,
    snapshot: rental.contract_snapshot as RentalContractSnapshot,
    contentHash: rental.contract_hash!,
    cancelled: rental.status === "cancelada",
    signedAt: rental.contract_signed_at,
    signatureDataUrl: signature?.dataUrl ?? null,
  };
}

export async function signContract(input: {
  token: string;
  signature: SignatureResult;
  contentHashConfirmed: string;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ ok: true; signedAt: string } | { ok: false; error: "not_found" | "cancelled" | "already_signed" | "content_mismatch" | "update_failed" }> {
  const contract = await getContractByToken(input.token);
  if (!contract) return { ok: false, error: "not_found" };
  if (contract.cancelled) return { ok: false, error: "cancelled" };
  if (contract.signedAt) return { ok: false, error: "already_signed" };
  if (contract.contentHash !== input.contentHashConfirmed) return { ok: false, error: "content_mismatch" };

  const signedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  // Filtros no update fecham a corrida: dois envios simultâneos, ou o token
  // trocado no meio — só um update encontra a linha ainda sem assinatura.
  const { data: updated } = await supabase
    .from("room_rentals")
    .update({
      contract_signed_at: signedAt,
      contract_signature: {
        dataUrl: input.signature.dataUrl,
        strokeData: input.signature.strokeData,
        ip: input.ip,
        userAgent: input.userAgent,
        contentHash: contract.contentHash,
      },
    })
    .eq("contract_token", input.token)
    .eq("contract_hash", input.contentHashConfirmed)
    .is("contract_signed_at", null)
    .select("id")
    .maybeSingle();
  if (!updated) return { ok: false, error: "update_failed" };
  return { ok: true, signedAt };
}
