/**
 * Catálogo de especialidades e tratamentos odontológicos comuns, usado pra
 * popular uma tabela de preço nova sem digitar tudo do zero — só nomes
 * (terminologia clínica padrão), NUNCA valores: preço odontológico varia
 * demais por região/porte de clínica pra existir uma "tabela pública" de
 * referência confiável, e inventar números que parecem reais seria
 * enganoso. A clínica preenche o valor de cada item e desativa o que não
 * usa (ver `active` em `price_table_items`).
 */
export const DENTAL_TREATMENT_SEED: { specialty: string; name: string }[] = [
  { specialty: "Dentística", name: "Restauração em resina 1 face" },
  { specialty: "Dentística", name: "Restauração em resina 2 faces" },
  { specialty: "Dentística", name: "Restauração em resina 3 faces" },
  { specialty: "Dentística", name: "Clareamento dental caseiro" },
  { specialty: "Dentística", name: "Clareamento dental em consultório" },
  { specialty: "Dentística", name: "Faceta em resina direta" },
  { specialty: "Dentística", name: "Lente de contato dental (por unidade)" },

  { specialty: "Endodontia", name: "Tratamento de canal — unirradicular" },
  { specialty: "Endodontia", name: "Tratamento de canal — birradicular" },
  { specialty: "Endodontia", name: "Tratamento de canal — multirradicular" },
  { specialty: "Endodontia", name: "Retratamento de canal" },
  { specialty: "Endodontia", name: "Pulpotomia" },

  { specialty: "Periodontia", name: "Profilaxia (limpeza)" },
  { specialty: "Periodontia", name: "Raspagem e alisamento radicular (por quadrante)" },
  { specialty: "Periodontia", name: "Gengivoplastia" },
  { specialty: "Periodontia", name: "Cirurgia periodontal" },

  { specialty: "Cirurgia", name: "Extração simples" },
  { specialty: "Cirurgia", name: "Extração de dente incluso/impactado" },
  { specialty: "Cirurgia", name: "Extração de siso" },
  { specialty: "Cirurgia", name: "Frenectomia" },
  { specialty: "Cirurgia", name: "Biópsia" },

  { specialty: "Prótese", name: "Prótese total (por arcada)" },
  { specialty: "Prótese", name: "Prótese parcial removível" },
  { specialty: "Prótese", name: "Coroa em porcelana" },
  { specialty: "Prótese", name: "Coroa em resina" },
  { specialty: "Prótese", name: "Faceta em porcelana" },
  { specialty: "Prótese", name: "Prótese sobre implante" },

  { specialty: "Ortodontia", name: "Instalação de aparelho fixo" },
  { specialty: "Ortodontia", name: "Manutenção mensal de aparelho" },
  { specialty: "Ortodontia", name: "Instalação de aparelho removível" },
  { specialty: "Ortodontia", name: "Contenção ortodôntica" },
  { specialty: "Ortodontia", name: "Documentação ortodôntica" },

  { specialty: "Odontopediatria", name: "Aplicação de flúor" },
  { specialty: "Odontopediatria", name: "Selante de fóssulas e fissuras" },
  { specialty: "Odontopediatria", name: "Restauração em dente decíduo" },
  { specialty: "Odontopediatria", name: "Pulpotomia em decíduo" },

  { specialty: "Implantodontia", name: "Implante dentário unitário" },
  { specialty: "Implantodontia", name: "Enxerto ósseo" },
  { specialty: "Implantodontia", name: "Cirurgia de levantamento de seio maxilar" },

  { specialty: "Radiologia", name: "Radiografia periapical" },
  { specialty: "Radiologia", name: "Radiografia panorâmica" },
  { specialty: "Radiologia", name: "Tomografia computadorizada" },

  { specialty: "DTM e Disfunção", name: "Placa de mordida/bruxismo" },

  { specialty: "Urgência", name: "Consulta de urgência" },
  { specialty: "Urgência", name: "Curativo de urgência" },
];
