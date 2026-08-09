import { describe, expect, it } from "vitest";
import {
  formatBRPhoneLocal,
  formatCNPJ,
  formatCPF,
  formatCpfCnpj,
  isValidCNPJ,
  isValidCpfCnpj,
  isValidCPF,
  isValidToken,
  toE164BR,
} from "./validation";

describe("isValidCPF", () => {
  it("aceita um CPF válido conhecido", () => {
    expect(isValidCPF("529.982.247-25")).toBe(true);
    expect(isValidCPF("52998224725")).toBe(true);
  });

  it("rejeita CPFs com dígitos repetidos", () => {
    expect(isValidCPF("111.111.111-11")).toBe(false);
  });

  it("rejeita CPFs com dígito verificador errado", () => {
    expect(isValidCPF("529.982.247-26")).toBe(false);
  });

  it("rejeita entradas com tamanho errado", () => {
    expect(isValidCPF("123")).toBe(false);
    expect(isValidCPF("")).toBe(false);
  });
});

describe("formatCPF", () => {
  it("formata progressivamente enquanto digita", () => {
    expect(formatCPF("529")).toBe("529");
    expect(formatCPF("529982")).toBe("529.982");
    expect(formatCPF("529982247")).toBe("529.982.247");
    expect(formatCPF("52998224725")).toBe("529.982.247-25");
  });

  it("ignora caracteres não numéricos e limita a 11 dígitos", () => {
    expect(formatCPF("529.982.247-25999")).toBe("529.982.247-25");
  });
});

describe("isValidCNPJ", () => {
  it("aceita CNPJs válidos conhecidos", () => {
    expect(isValidCNPJ("11.222.333/0001-81")).toBe(true);
    expect(isValidCNPJ("11444777000161")).toBe(true);
  });

  it("rejeita CNPJs com dígitos repetidos", () => {
    expect(isValidCNPJ("00.000.000/0000-00")).toBe(false);
  });

  it("rejeita CNPJs com dígito verificador errado", () => {
    expect(isValidCNPJ("11.222.333/0001-80")).toBe(false);
  });

  it("rejeita entradas com tamanho errado", () => {
    expect(isValidCNPJ("123")).toBe(false);
    expect(isValidCNPJ("")).toBe(false);
  });
});

describe("formatCNPJ", () => {
  it("formata progressivamente enquanto digita", () => {
    expect(formatCNPJ("11")).toBe("11");
    expect(formatCNPJ("11222")).toBe("11.222");
    expect(formatCNPJ("11222333")).toBe("11.222.333");
    expect(formatCNPJ("112223330001")).toBe("11.222.333/0001");
    expect(formatCNPJ("11222333000181")).toBe("11.222.333/0001-81");
  });
});

describe("formatCpfCnpj / isValidCpfCnpj", () => {
  it("usa máscara de CPF até 11 dígitos e de CNPJ a partir do 12º", () => {
    expect(formatCpfCnpj("52998224725")).toBe("529.982.247-25");
    expect(formatCpfCnpj("11222333000181")).toBe("11.222.333/0001-81");
  });

  it("valida CPF ou CNPJ conforme a quantidade de dígitos", () => {
    expect(isValidCpfCnpj("529.982.247-25")).toBe(true);
    expect(isValidCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(isValidCpfCnpj("123")).toBe(false);
  });
});

describe("formatBRPhoneLocal", () => {
  it("formata um celular completo (9 dígitos locais), sem DDI", () => {
    expect(formatBRPhoneLocal("79998616410")).toBe("(79) 99861-6410");
  });

  it("formata um fixo completo (8 dígitos locais), sem DDI", () => {
    expect(formatBRPhoneLocal("1932221234")).toBe("(19) 3222-1234");
  });

  it("remove um DDI (55) colado por engano antes de formatar", () => {
    expect(formatBRPhoneLocal("5579998616410")).toBe("(79) 99861-6410");
  });

  it("ignora caracteres não numéricos e limita a 11 dígitos locais", () => {
    expect(formatBRPhoneLocal("(79) 99861-6410 99")).toBe("(79) 99861-6410");
  });
});

describe("toE164BR", () => {
  it("adiciona o DDI 55 na frente do número local", () => {
    expect(toE164BR("(79) 99861-6410")).toBe("5579998616410");
  });

  it("não duplica o DDI se ele já estiver presente", () => {
    expect(toE164BR("5579998616410")).toBe("5579998616410");
  });
});

describe("isValidToken", () => {
  it("aceita um uuid v4 válido", () => {
    expect(isValidToken("9744d202-35ce-4e6c-8691-c59630c65203")).toBe(true);
  });

  it("rejeita tentativas de path traversal ou texto arbitrário", () => {
    expect(isValidToken("../../etc/passwd")).toBe(false);
    expect(isValidToken("not-a-uuid")).toBe(false);
    expect(isValidToken("")).toBe(false);
  });
});
