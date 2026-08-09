export function isValidCPF(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf.charAt(i), 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(cpf.charAt(9), 10)) return false;

  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf.charAt(i), 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(cpf.charAt(10), 10);
}

export function isValidCNPJ(raw: string): boolean {
  const cnpj = raw.replace(/\D/g, "");
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;

  function checkDigit(base: string): number {
    let pos = base.length - 7;
    let sum = 0;
    for (let i = base.length; i >= 1; i--) {
      sum += parseInt(base.charAt(base.length - i), 10) * pos--;
      if (pos < 2) pos = 9;
    }
    const result = sum % 11;
    return result < 2 ? 0 : 11 - result;
  }

  const d1 = checkDigit(cnpj.substring(0, 12));
  if (d1 !== parseInt(cnpj.charAt(12), 10)) return false;

  const d2 = checkDigit(cnpj.substring(0, 13));
  return d2 === parseInt(cnpj.charAt(13), 10);
}

/** Aceita CPF (11 dígitos) ou CNPJ (14 dígitos), validando o algoritmo certo pra cada um. */
export function isValidCpfCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11) return isValidCPF(raw);
  if (digits.length === 14) return isValidCNPJ(raw);
  return false;
}

export function formatCPF(raw: string): string {
  let v = raw.replace(/\D/g, "").slice(0, 11);
  if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, "$1.$2.$3-$4");
  else if (v.length > 6) v = v.replace(/(\d{3})(\d{3})(\d{1,3})/, "$1.$2.$3");
  else if (v.length > 3) v = v.replace(/(\d{3})(\d{1,3})/, "$1.$2");
  return v;
}

export function formatCNPJ(raw: string): string {
  let v = raw.replace(/\D/g, "").slice(0, 14);
  if (v.length > 12) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})/, "$1.$2.$3/$4-$5");
  else if (v.length > 8) v = v.replace(/(\d{2})(\d{3})(\d{3})(\d{1,4})/, "$1.$2.$3/$4");
  else if (v.length > 5) v = v.replace(/(\d{2})(\d{3})(\d{1,3})/, "$1.$2.$3");
  else if (v.length > 2) v = v.replace(/(\d{2})(\d{1,3})/, "$1.$2");
  return v;
}

/**
 * Formata progressivamente enquanto o usuário digita: até 11 dígitos usa a
 * máscara de CPF, a partir do 12º dígito passa a usar a máscara de CNPJ.
 */
export function formatCpfCnpj(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits.length > 11 ? formatCNPJ(raw) : formatCPF(raw);
}

/**
 * Formata um número de WhatsApp brasileiro **sem** o DDI (55) — nosso público é só
 * brasileiro, então não faz o usuário digitar/ver o "+55": "(79) 99861-6410".
 * Distingue celular (9 dígitos locais) de fixo (8 dígitos locais) pelo total de dígitos.
 * Se o texto colado já vier com um "55" na frente (ex.: valor antigo salvo com DDI),
 * remove antes de formatar, pra não exibir "(55) 79998..." por engano.
 */
export function formatBRPhoneLocal(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);

  if (d.length <= 2) return d;
  if (rest.length <= 4) return `(${ddd}) ${rest}`;
  if (rest.length >= 9) return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
  if (rest.length === 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4, 8)}`;

  const firstLen = Math.min(rest.length, 5);
  return `(${ddd}) ${rest.slice(0, firstLen)}${rest.length > firstLen ? "-" + rest.slice(firstLen) : ""}`;
}

/** Converte um número local formatado ("(79) 99861-6410") pro formato completo com DDI (55...), usado ao salvar/enviar. */
export function toE164BR(localFormatted: string): string {
  const d = localFormatted.replace(/\D/g, "");
  return d.startsWith("55") ? d : `55${d}`;
}

/** Formato exato do uuid v4 (`gen_random_uuid()` no Postgres) usado pros tokens de anamnese. */
const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidToken(token: string): boolean {
  return TOKEN_PATTERN.test(token);
}
