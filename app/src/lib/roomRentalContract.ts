import { formatDateOnlyBR } from "@/lib/date";
import { formatMoneyDisplay } from "@/lib/money";
import { formatCpfCnpj } from "@/lib/validation";
import { shortTime } from "@/lib/roomRental";

/**
 * Contrato de locação da sala por turno (migration 075) — só a parte pura:
 * dados congelados, cláusulas e mensagem do WhatsApp. O contrato é gerado e
 * enviado à mão pela clínica (botão no detalhe da locação), nunca
 * automaticamente — regra do WhatsApp da clínica.
 *
 * Para mudar o texto do contrato, mexa em `contractClauses`. Contratos já
 * enviados não mudam: a página mostra o texto gerado a partir do snapshot,
 * e o hash do snapshot é conferido na assinatura.
 */

export interface RentalContractSnapshot {
  schema: "contrato-locacao/v1";
  lessor: {
    clinicName: string;
    dentistName: string | null;
    cro: string | null;
    croUf: string | null;
    cnpj: string | null;
    address: string | null;
  };
  tenant: { name: string; document: string | null; cro: string | null; croUf: string | null };
  rental: {
    date: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    amount: number;
  };
}

export interface ContractClause {
  title: string;
  paragraphs: string[];
}

export function formatContractAmount(value: number): string {
  return `R$ ${formatMoneyDisplay(value)}`;
}

/** "Tarde (14:00 às 18:00)". */
export function contractShiftLabel(r: RentalContractSnapshot["rental"]): string {
  return `${r.shiftName} (${shortTime(r.startTime)} às ${shortTime(r.endTime)})`;
}

/** Qualificação de uma das partes numa linha: nome, documento e CRO quando houver. */
export function partyLine(name: string, document: string | null, cro: string | null, croUf: string | null): string {
  const parts = [name];
  if (document) parts.push(`${document.replace(/\D/g, "").length > 11 ? "CNPJ" : "CPF"} ${formatCpfCnpj(document)}`);
  if (cro) parts.push(`CRO ${cro}${croUf ? `/${croUf}` : ""}`);
  return parts.join(", ");
}

export function lessorLine(l: RentalContractSnapshot["lessor"]): string {
  const name = l.dentistName ? `${l.dentistName} (${l.clinicName})` : l.clinicName;
  return partyLine(name, l.cnpj, l.cro, l.croUf);
}

export function contractClauses(s: RentalContractSnapshot): ContractClause[] {
  const place = s.lessor.address ? `situada em ${s.lessor.address}` : "do consultório da LOCADORA";
  return [
    {
      title: "Objeto",
      paragraphs: [
        `A LOCADORA cede ao LOCATÁRIO, de forma temporária, o uso da sala de atendimento odontológico ${place}, ` +
          `no dia ${formatDateOnlyBR(s.rental.date)}, turno ${contractShiftLabel(s.rental)}, exclusivamente para ` +
          `atendimentos odontológicos realizados pelo LOCATÁRIO.`,
        "O LOCATÁRIO deve iniciar e encerrar o uso dentro do horário do turno, deixando a sala livre ao final.",
      ],
    },
    {
      title: "Valor",
      paragraphs: [`Pelo uso da sala no turno acima, o LOCATÁRIO pagará à LOCADORA ${formatContractAmount(s.rental.amount)}, na forma combinada entre as partes.`],
    },
    {
      title: "Materiais da LOCADORA",
      paragraphs: [
        "O LOCATÁRIO traz os próprios materiais, insumos, instrumentais e medicamentos necessários aos seus atendimentos.",
        "É proibido usar materiais, insumos, instrumentais e medicamentos de propriedade da LOCADORA, salvo autorização dela por escrito.",
      ],
    },
    {
      title: "Equipamentos",
      paragraphs: [
        "O LOCATÁRIO se responsabiliza pelo uso correto dos equipamentos da sala (cadeira odontológica, equipo, " +
          "fotopolimerizador, compressor, autoclave e demais aparelhos) durante a locação.",
        "Se algum equipamento apresentar defeito por mau uso, o LOCATÁRIO arcará com o conserto ou, não sendo possível, " +
          "com a reposição ou o ressarcimento do valor à LOCADORA.",
        "Qualquer problema percebido em equipamento deve ser comunicado à LOCADORA no mesmo dia.",
      ],
    },
    {
      title: "Limpeza e lixo",
      paragraphs: [
        "O LOCATÁRIO devolverá a sala limpa, organizada e em condições de uso, da mesma forma que a recebeu.",
        "Todo o lixo gerado nos atendimentos durante a locação deve ser recolhido e levado pelo LOCATÁRIO, sem deixar " +
          "resíduos nas lixeiras da sala. Resíduos infectantes e perfurocortantes devem ser acondicionados e descartados " +
          "conforme as normas sanitárias.",
      ],
    },
    {
      title: "Ao sair",
      paragraphs: ["Ao final do atendimento, o LOCATÁRIO se compromete a desligar os disjuntores e fechar o registro de água da sala."],
    },
    {
      title: "Responsabilidade profissional",
      paragraphs: [
        "O LOCATÁRIO é o único responsável, técnica, ética e civilmente, pelos atendimentos que realizar e pelos seus " +
          "pacientes, que não têm vínculo com a LOCADORA.",
      ],
    },
    {
      title: "Assinatura eletrônica",
      paragraphs: [
        "As partes aceitam a assinatura eletrônica deste contrato, feita na tela do celular ou do computador, como válida " +
          "entre elas. Junto com a assinatura ficam registrados data, hora, IP e dispositivo.",
      ],
    },
  ];
}

/** Mensagem que a clínica manda (à mão) pelo WhatsApp com o link do contrato. */
export function contractWhatsappMessage(s: RentalContractSnapshot, link: string): string {
  const firstName = s.tenant.name.trim().split(/\s+/)[0] ?? s.tenant.name;
  return (
    `📄 Olá, ${firstName}! Segue o contrato da locação da sala na ${s.lessor.clinicName}:\n\n` +
    `📅 ${formatDateOnlyBR(s.rental.date)} · ${contractShiftLabel(s.rental)}\n` +
    `💰 ${formatContractAmount(s.rental.amount)}\n\n` +
    `Leia e assine pelo link (dá pra assinar com o dedo na tela):\n${link}`
  );
}

export function contractLink(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL}/contrato-locacao/${token}`;
}
