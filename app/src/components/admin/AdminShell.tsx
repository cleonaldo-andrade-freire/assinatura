"use client";

import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./admin.module.css";

function ClinicsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 21V8l8-5 8 5v13M4 21h16M4 21v-8h16v8M10 21v-5h4v5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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

interface AdminShellProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ title, subtitle, actions, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();

  async function handleLogout() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M12 2c-2.2 0-3.4 1.1-4.5 1.1C6.3 3.1 5 2 3.6 2 1.9 2 1 3.6 1 5.8c0 3 1.4 6.9 2.3 9.4.6 1.7 1.1 3.6 2.4 3.6 1.6 0 1.5-2.4 1.9-4.3.3-1.4.7-2.6 1.4-2.6.8 0 1.1 1.3 1.4 2.6.4 1.9.3 4.3 1.9 4.3 1.3 0 1.8-1.9 2.4-3.6.9-2.5 2.3-6.4 2.3-9.4C23 3.6 22.1 2 20.4 2c-1.4 0-2.7 1.1-3.9 1.1C15.4 3.1 14.2 2 12 2z"
                fill="#fff"
                fillOpacity="0.9"
              />
            </svg>
          </div>
          <span className={styles.brandName}>Anamnese Admin</span>
        </div>

        <nav className={styles.nav}>
          <a href="/admin/clinics" className={`${styles.navLink} ${pathname?.startsWith("/admin/clinics") ? styles.navLinkActive : ""}`}>
            <ClinicsIcon />
            Clínicas
          </a>
        </nav>

        <div className={styles.sidebarFooter}>
          <button type="button" className={styles.logoutLink} onClick={handleLogout}>
            <LogoutIcon />
            Sair
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
