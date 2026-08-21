import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse/sync";

/**
 * Importa o CSV de dados abertos da Anvisa (registro de medicamentos, sem
 * classificação de controle especial — só nome/princípio ativo/classe) pra
 * alimentar o autocomplete do formulário de prescrição. Rode depois da
 * migration 062. Idempotente: apaga e reimporta tudo a cada execução, pra
 * refletir baixas/novos registros — reexecute periodicamente (o arquivo é um
 * snapshot estático da Anvisa, não uma API ao vivo).
 *
 * O CSV vem em ISO-8859-1 (latin1) e usa ";" como delimitador — alguns campos
 * (ex.: princípio ativo com múltiplas substâncias) contêm ";" dentro de aspas,
 * por isso usamos um parser de CSV de verdade em vez de um split ingênuo.
 */
const CSV_URL = "https://dados.anvisa.gov.br/dados/DADOS_ABERTOS_MEDICAMENTOS.csv";

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface AnvisaRow {
  TIPO_PRODUTO?: string;
  NOME_PRODUTO?: string;
  CATEGORIA_REGULATORIA?: string;
  NUMERO_REGISTRO_PRODUTO?: string;
  CLASSE_TERAPEUTICA?: string;
  SITUACAO_REGISTRO?: string;
  PRINCIPIO_ATIVO?: string;
}

async function main() {
  console.log("Baixando CSV da Anvisa...");
  const res = await fetch(CSV_URL);
  if (!res.ok) throw new Error(`Falha ao baixar CSV da Anvisa: HTTP ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const text = buffer.toString("latin1");

  const rows = parse(text, {
    delimiter: ";",
    columns: true,
    bom: true,
    relax_quotes: true,
    skip_empty_lines: true,
  }) as AnvisaRow[];

  console.log(`${rows.length} linhas no CSV.`);

  // Só medicamentos com registro ativo — evita sugerir produto descontinuado/
  // cancelado no autocomplete. Sem classificação de controle especial aqui:
  // esse dado não existe nesse CSV, a categoria continua autodeclarada pela
  // dentista no formulário (ver lib/prescriptionControl.ts).
  const seen = new Set<string>();
  const toInsert = rows
    .filter((r) => r.TIPO_PRODUTO === "MEDICAMENTO" && r.SITUACAO_REGISTRO === "Ativo" && r.NOME_PRODUTO?.trim())
    .filter((r) => {
      const key = r.NOME_PRODUTO!.trim().toUpperCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      nome_produto: r.NOME_PRODUTO!.trim(),
      principio_ativo: r.PRINCIPIO_ATIVO?.trim() || null,
      classe_terapeutica: r.CLASSE_TERAPEUTICA?.trim() || null,
      numero_registro: r.NUMERO_REGISTRO_PRODUTO?.trim() || null,
    }));

  console.log(`${toInsert.length} medicamentos ativos únicos pra importar.`);

  const { error: deleteError } = await supabase.from("anvisa_medicamentos").delete().gte("id", 0);
  if (deleteError) throw new Error(`Falha ao limpar tabela antes do import: ${deleteError.message}`);

  const CHUNK_SIZE = 1000;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from("anvisa_medicamentos").insert(chunk);
    if (error) throw new Error(`Falha ao inserir lote a partir do índice ${i}: ${error.message}`);
    console.log(`Importados ${Math.min(i + CHUNK_SIZE, toInsert.length)}/${toInsert.length}`);
  }

  console.log("Importação concluída.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
