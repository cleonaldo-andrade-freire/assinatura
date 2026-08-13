"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import styles from "@/styles/shell.module.css";

function AgendaIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="8" cy="14.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="14.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

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

function MoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="5" cy="12" r="1.8" fill="currentColor" />
      <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      <circle cx="19" cy="12" r="1.8" fill="currentColor" />
    </svg>
  );
}

// Assinatura/cobrança agora mora dentro de Configurações (não é mais rota
// própria), então sobra só um item "extra" — não vale a pena um menu "Mais"
// pra revelar um único destino. As cinco abas cabem direto na barra do
// celular (rótulo mais comprido, "Configurações", ainda encolhe com
// segurança via min-width:0 + reticências no CSS).
// Agenda entra na barra fixa — pra quem faz recepção é provavelmente a tela
// mais checada do dia, junto de Anamneses. Configurações volta pro "Mais":
// com 6 destinos reais não cabem todos com rótulo por extenso na barra do
// celular (é o mesmo estouro que já aconteceu uma vez com 6 itens), e
// Configurações continua sendo o de uso mais esporádico dos seis.
const PRIMARY_NAV_ITEMS = [
  { href: "/dashboard/agenda", label: "Agenda", icon: AgendaIcon },
  { href: "/dashboard", label: "Anamneses", icon: AnamnesesIcon },
  { href: "/dashboard/atestados", label: "Atestados", icon: CertificateIcon },
  { href: "/dashboard/prescricoes", label: "Prescrições", icon: PrescriptionIcon },
  { href: "/dashboard/pacientes", label: "Pacientes", icon: PatientsIcon },
];

const MORE_NAV_ITEMS = [{ href: "/dashboard/configuracoes", label: "Configurações", icon: SettingsIcon }];

const NAV_ITEMS = [...PRIMARY_NAV_ITEMS, ...MORE_NAV_ITEMS];

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
  const [moreOpen, setMoreOpen] = useState(false);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function isActive(href: string) {
    return href === "/dashboard" ? pathname === "/dashboard" : pathname?.startsWith(href);
  }

  function renderNavLink(item: (typeof NAV_ITEMS)[number], extraClassName?: string, onClick?: () => void) {
    const Icon = item.icon;
    return (
      <a
        key={item.href}
        href={item.href}
        title={item.label}
        onClick={onClick}
        className={`${styles.navLink} ${isActive(item.href) ? styles.navLinkActive : ""} ${extraClassName ?? ""}`}
      >
        <Icon />
        <span className={styles.navLabel}>{item.label}</span>
      </a>
    );
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
          {PRIMARY_NAV_ITEMS.map((item) => renderNavLink(item))}
          {MORE_NAV_ITEMS.map((item) => renderNavLink(item, styles.navExtra))}
          {MORE_NAV_ITEMS.length > 0 && (
            <button
              type="button"
              title="Mais"
              aria-expanded={moreOpen}
              className={`${styles.navLink} ${styles.navMoreToggle}`}
              onClick={() => setMoreOpen((v) => !v)}
            >
              <MoreIcon />
              <span className={styles.navLabel}>Mais</span>
            </button>
          )}
        </nav>

        {MORE_NAV_ITEMS.length > 0 && moreOpen && (
          <>
            <button
              type="button"
              aria-label="Fechar menu"
              className={styles.navMoreOverlay}
              onClick={() => setMoreOpen(false)}
            />
            <div className={styles.navMorePanel} role="menu">
              {MORE_NAV_ITEMS.map((item) => renderNavLink(item, styles.navMorePanelLink, () => setMoreOpen(false)))}
            </div>
          </>
        )}

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
