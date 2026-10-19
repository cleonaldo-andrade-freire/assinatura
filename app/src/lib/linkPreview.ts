import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isValidToken } from "@/lib/validation";

const DESCRIPTION = "O consultório odontológico sem papel, tudo pelo WhatsApp: agenda, anamnese, atestados, receituários e orçamentos.";

/** Tabela e coluna onde cada página pública acha o documento pelo token. */
const TOKEN_SOURCES = {
  anamnese: ["anamneses", "token"],
  evolucao: ["treatment_evolutions", "signature_token"],
  atestado: ["certificates", "token"],
  prescricao: ["prescriptions", "token"],
  orcamento: ["budgets", "token"],
  recibo: ["receipts", "token"],
  confirmacao: ["appointments", "confirm_token"],
} as const;

/**
 * Prévia do link (og:image) com a logo da clínica, para as páginas que vão
 * por WhatsApp. A Evolution só monta o cartão de prévia quando a página tem
 * imagem — e no iPhone o cartão é o que deixa o link clicável inteiro para
 * quem não tem a clínica nos contatos. Sem logo, cai no ícone do app.
 */
export async function clinicLinkPreview(source: keyof typeof TOKEN_SOURCES, token: string | undefined): Promise<Metadata> {
  const fallback = `${process.env.NEXT_PUBLIC_APP_URL}/icons/icon-512.png`;
  let title = "DentalAgil";
  let image = fallback;

  if (token && isValidToken(token)) {
    const [table, column] = TOKEN_SOURCES[source];
    const supabase = createSupabaseAdminClient();
    const { data: doc } = await supabase.from(table).select("clinic_id").eq(column, token).maybeSingle();
    if (doc) {
      const { data: clinic } = await supabase.from("clinics").select("name, logo_url").eq("id", doc.clinic_id).maybeSingle();
      if (clinic) {
        title = clinic.name;
        image = clinic.logo_url || fallback;
      }
    }
  }

  return { openGraph: { title, description: DESCRIPTION, images: [image] } };
}
