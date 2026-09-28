import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClinicLocation } from "@/lib/database.types";

type LocationAddress = Pick<ClinicLocation, "street" | "number" | "complement" | "neighborhood" | "city" | "state" | "cep">;

/** "Rua X, 123, Sala 4 — Centro, Aracaju/SE" — campos vazios somem sem deixar vírgula sobrando. */
export function formatLocationAddress(loc: LocationAddress): string {
  const firstLine = [loc.street, loc.number, loc.complement].map((p) => p?.trim()).filter(Boolean).join(", ");
  const cityState = `${loc.city.trim()}/${loc.state.trim().toUpperCase()}`;
  const secondLine = [loc.neighborhood?.trim(), cityState].filter(Boolean).join(", ");
  return `${firstLine} — ${secondLine}`;
}

/**
 * Link de "como chegar". Usa o link colado pela clínica quando existe (ex.:
 * um pin exato do Google Maps, útil quando o endereço sozinho cai no lugar
 * errado); senão gera a URL de busca oficial do Maps a partir do endereço —
 * não precisa de chave de API e abre no app do Maps no celular.
 */
export function locationMapsUrl(loc: LocationAddress & Pick<ClinicLocation, "maps_url">): string {
  if (loc.maps_url?.trim()) return loc.maps_url.trim();
  const query = [formatLocationAddress(loc), loc.cep?.trim()].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Bloco pronto pra colar no fim de uma mensagem de WhatsApp — nome, endereço e link. */
export function locationMessageBlock(loc: ClinicLocation): string {
  return `📍 *${loc.name}*\n${formatLocationAddress(loc)}\nComo chegar: ${locationMapsUrl(loc)}`;
}

/**
 * Local a gravar num agendamento novo. `undefined` (campo omitido) = local
 * padrão da clínica, ou nenhum se ela não tem locais; `null` = sem local de
 * propósito; id = só vale se for um local ATIVO desta clínica — `false`
 * sinaliza id inválido pra rota responder 400.
 */
export async function resolveAppointmentLocation(
  supabase: SupabaseClient,
  clinicId: string,
  requested: string | null | undefined
): Promise<string | null | false> {
  if (requested === null) return null;
  if (requested === undefined) {
    const { data } = await supabase
      .from("clinic_locations")
      .select("id")
      .eq("clinic_id", clinicId)
      .eq("is_default", true)
      .eq("active", true)
      .maybeSingle();
    return data?.id ?? null;
  }
  const { data } = await supabase
    .from("clinic_locations")
    .select("id")
    .eq("id", requested)
    .eq("clinic_id", clinicId)
    .eq("active", true)
    .maybeSingle();
  return data ? data.id : false;
}

/** Busca um local da clínica pelo id — `null` se o id for nulo ou não pertencer à clínica. */
export async function getClinicLocation(
  supabase: SupabaseClient,
  clinicId: string,
  locationId: string | null | undefined
): Promise<ClinicLocation | null> {
  if (!locationId) return null;
  const { data } = await supabase
    .from("clinic_locations")
    .select("*")
    .eq("id", locationId)
    .eq("clinic_id", clinicId)
    .maybeSingle();
  return (data as ClinicLocation | null) ?? null;
}
