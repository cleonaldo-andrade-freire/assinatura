import { SupabaseClient } from "@supabase/supabase-js";

// Sem 0/O e sem 1/I/L — evita confusão comum quando alguém digita o código à mão.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 8;

function randomCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

/** Formata pra exibição/impressão: "ABCD1234" → "ABCD-1234". */
export function formatValidationCode(code: string): string {
  return code.match(/.{1,4}/g)?.join("-") ?? code;
}

/** Desfaz `formatValidationCode` e normaliza o que o usuário digitou (maiúsculas, sem hífen/espaço). */
export function normalizeValidationCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Gera um código curto e garante que não colide com nenhum já existente —
 * `certificates` e `prescriptions` são tabelas independentes, então a checagem
 * cruzada é necessária pra um código nunca acabar apontando pra dois
 * documentos diferentes.
 */
export async function ensureUniqueValidationCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCode();
    const [{ data: cert }, { data: rx }] = await Promise.all([
      supabase.from("certificates").select("id").eq("validation_code", candidate).maybeSingle(),
      supabase.from("prescriptions").select("id").eq("validation_code", candidate).maybeSingle(),
    ]);
    if (!cert && !rx) return candidate;
  }
  throw new Error("Não foi possível gerar um código de validação único depois de várias tentativas.");
}

/** Mesma ideia de `ensureUniqueValidationCode`, mas pro código embutido no
 * manifesto de assinatura da evolução clínica (tabela própria, não
 * `certificates`/`prescriptions`). */
export async function ensureUniqueEvolutionSignatureCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCode();
    const { data } = await supabase.from("treatment_evolution_signatures").select("id").eq("verification_code", candidate).maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("Não foi possível gerar um código de verificação único depois de várias tentativas.");
}

/** Mesma ideia, pro código de validação pública da anamnese (`signatures.verification_code`, migration 060). */
export async function ensureUniqueAnamnesisSignatureCode(supabase: SupabaseClient): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomCode();
    const { data } = await supabase.from("signatures").select("id").eq("verification_code", candidate).maybeSingle();
    if (!data) return candidate;
  }
  throw new Error("Não foi possível gerar um código de verificação único depois de várias tentativas.");
}
