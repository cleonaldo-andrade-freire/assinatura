"use client";

import Link from "next/link";
import { Sheet } from "./Sheet";
import { CalendarPlusIcon, PatientPlusIcon, AnamnesisSendIcon, CertificateIcon, PrescriptionIcon } from "./icons";
import styles from "@/styles/shellMobileV2.module.css";

const ACTIONS = [
  { href: "/dashboard/agenda/new", label: "Novo agendamento", icon: CalendarPlusIcon },
  { href: "/dashboard/pacientes?new=1", label: "Novo paciente", icon: PatientPlusIcon },
  { href: "/dashboard/anamneses?new=1", label: "Enviar anamnese", icon: AnamnesisSendIcon },
  { href: "/dashboard/atestados?new=1", label: "Novo atestado", icon: CertificateIcon },
  { href: "/dashboard/prescricoes?new=1", label: "Nova prescrição", icon: PrescriptionIcon },
];

/**
 * Sheet do botão [+] central da tab bar — o atalho que garante a meta de
 * até 3 toques pras 3 tarefas de criação (hoje escondidas atrás do menu
 * "Mais", ver docs/mobile-audit.md §2). Cada item navega pra rota existente
 * do recurso, que já abre o formulário sozinho via ?new=1 (NewXTrigger
 * autoOpen) — nenhuma lógica de criação duplicada aqui.
 */
export function ActionSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Nova ação">
      <ul className={styles.actionList}>
        {ACTIONS.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link href={href} className={styles.actionItem} onClick={onClose}>
              <span className={styles.actionIcon}>
                <Icon />
              </span>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
