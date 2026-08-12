"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "@/styles/shell.module.css";

function AnamnesesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M8 3h8a2 2 0 012 2v14a2 2 0 01-2 2H8a2 2 0 01-2-2V5a2 2 0 012-2zM9 8h6M9 12h6M9 16h3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CertificateIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 3h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M9.5 15.5l1.6 1.6L14.5 13.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PrescriptionIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 17.5l6-6a3 3 0 114.24 4.24l-6 6a3 3 0 01-4.24-4.24z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M11 8.5L15.5 13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 20h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function PatientsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="3.4" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M4.5 20c1-3.6 4-5.6 7.5-5.6s6.5 2 7.5 5.6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 6h9M17 6h3M4 12h3M9 12h11M4 18h13M21 18h-2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="13" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16" cy="18" r="2.2" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function BillingIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18M7 15h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M15 17l5-5-5-5M20 12H9M12 19H6a2 2 0 01-2-2V7a2 2 0 012-2h6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Anamneses", icon: AnamnesesIcon },
  { href: "/dashboard/atestados", label: "Atestados", icon: CertificateIcon },
  { href: "/dashboard/prescricoes", label: "Prescrições", icon: PrescriptionIcon },
  { href: "/dashboard/pacientes", label: "Pacientes", icon: PatientsIcon },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: SettingsIcon },
  { href: "/billing", label: "Assinatura", icon: BillingIcon },
];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

interface ClinicShellProps {
  clinicName: string;
  clinicLogoUrl?: string | null;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function ClinicShell({ clinicName, clinicLogoUrl, title, subtitle, actions, children }: ClinicShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            {clinicLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={clinicLogoUrl} alt="" className={styles.brandLogo} />
            ) : (
              initials(clinicName)
            )}
          </div>
          <span className={styles.brandName}>{clinicName}</span>
        </div>

        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                title={item.label}
                className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
              >
                <Icon />
                <span className={styles.navLabel}>{item.label}</span>
              </a>
            );
          })}
        </nav>

        <div className={styles.sidebarFooter}>
          <button type="button" title="Sair" className={styles.logoutLink} onClick={handleLogout}>
            <LogoutIcon />
            <span className={styles.navLabel}>Sair</span>
          </button>
        </div>
      </aside>

      <div className={styles.main}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>{title}</h1>
            {subtitle && <p className={styles.pageSubtitle}>{subtitle}</p>}
          </div>
          {actions}
        </div>
        <div className={styles.content}>{children}</div>
      </div>
    </div>
  );
}
