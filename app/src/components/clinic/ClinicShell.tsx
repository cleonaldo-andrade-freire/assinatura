"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import styles from "@/styles/shell.module.css";

function DashboardIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

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

function ProsthesisIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 20l1-6 4-4 4 4 1 6M11 10V5a2 2 0 114 0v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="4" r="1.4" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function ExpensesIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="6" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path d="M3 10h18" stroke="currentColor" strokeWidth="1.7" />
      <circle cx="16.5" cy="14.5" r="1.4" fill="currentColor" />
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

function CollapseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

// Ordem canônica — vale pra sidebar de desktop, que mostra tudo inline sem
// distinção (tem espaço de sobra pros oito destinos).
const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: DashboardIcon },
  { href: "/dashboard/agenda", label: "Agenda", icon: AgendaIcon },
  { href: "/dashboard/anamneses", label: "Anamneses", icon: AnamnesesIcon },
  { href: "/dashboard/atestados", label: "Atestados", icon: CertificateIcon },
  { href: "/dashboard/prescricoes", label: "Prescrições", icon: PrescriptionIcon },
  { href: "/dashboard/pacientes", label: "Pacientes", icon: PatientsIcon },
  { href: "/dashboard/proteses", label: "Próteses", icon: ProsthesisIcon },
  { href: "/dashboard/despesas", label: "Despesas", icon: ExpensesIcon },
  { href: "/dashboard/configuracoes", label: "Configurações", icon: SettingsIcon },
];

// No celular a barra fixa só tem espaço confortável pra 3 destinos + "Mais"
// — Agenda e Pacientes são as telas mais checadas na correria da recepção,
// Configurações entra fixa por pedido explícito. O resto (Anamneses,
// Atestados, Prescrições, Próteses) vive atrás do "Mais" só no celular; no
// desktop a sidebar mostra todo mundo inline, sem essa distinção.
const MOBILE_PRIMARY_HREFS = new Set(["/dashboard/agenda", "/dashboard/pacientes", "/dashboard/configuracoes"]);
const MORE_NAV_ITEMS = NAV_ITEMS.filter((item) => !MOBILE_PRIMARY_HREFS.has(item.href));

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
  // Só lê localStorage depois de montar (evita mismatch de hidratação entre
  // servidor e cliente — o servidor não tem como saber a preferência salva).
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

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
      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""}`}>
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
          {NAV_ITEMS.map((item) => renderNavLink(item, MOBILE_PRIMARY_HREFS.has(item.href) ? undefined : styles.navExtra))}
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
          <button
            type="button"
            title={collapsed ? "Expandir menu" : "Recolher menu"}
            className={`${styles.logoutLink} ${styles.sidebarToggle} ${collapsed ? styles.sidebarToggleCollapsed : ""}`}
            onClick={toggleCollapsed}
          >
            <CollapseIcon />
            <span className={styles.navLabel}>Recolher menu</span>
          </button>
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
