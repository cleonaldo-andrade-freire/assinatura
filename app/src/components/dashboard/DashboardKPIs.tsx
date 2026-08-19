"use client";

import { useState, useEffect } from "react";
import styles from "@/styles/shell.module.css";
import { formatMoneyDisplay } from "@/lib/money";
import { useMobileV2Active } from "@/lib/useMobileV2Active";

interface DashboardKPIsProps {
  monthlyRevenue: number;
  monthlyExpense: number;
  monthlyBalance: number;
  dailyRevenue: number;
  dailyExpense: number;
  dailyBalance: number;
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const DASHBOARD_KPIS_VISIBLE_KEY = "dentalagil_dashboard_kpis_visible";

export function DashboardKPIs({
  monthlyRevenue,
  monthlyExpense,
  monthlyBalance,
  dailyRevenue,
  dailyExpense,
  dailyBalance,
}: DashboardKPIsProps) {
  const mobileV2 = useMobileV2Active();
  const [visible, setVisible] = useState(true);

  // No mobile v2 os cards já são pequenos (2 colunas) — o prefixo "R$" repetido
  // 6 vezes só disputa espaço com o número, que é a informação que importa.
  // Contexto (clínica odontológica brasileira) deixa a moeda óbvia sem ele.
  function formatMoney(value: number): string {
    return mobileV2 ? formatMoneyDisplay(value) : `R$ ${formatMoneyDisplay(value)}`;
  }

  useEffect(() => {
    const saved = localStorage.getItem(DASHBOARD_KPIS_VISIBLE_KEY);
    if (saved === "0") setVisible(false);
  }, []);

  function toggleVisibility() {
    setVisible((prev) => {
      const next = !prev;
      localStorage.setItem(DASHBOARD_KPIS_VISIBLE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        onClick={toggleVisibility}
        className={styles.iconActionBtn}
        style={{
          position: "absolute",
          top: "-52px", // Moves it into the .pageHeader area
          right: "0",
          width: "32px",
          height: "32px",
          background: "none",
          border: "none",
          color: "var(--ink-soft)",
          zIndex: 10,
        }}
        title={visible ? "Ocultar valores financeiros" : "Mostrar valores financeiros"}
      >
        {visible ? <EyeOffIcon /> : <EyeIcon />}
      </button>

      {visible && (
        <div className={`${styles.statGrid} ${styles.statGridDashboard}`}>
          <div className={styles.statCard}>
            <div className={styles.statValue}>{formatMoney(dailyRevenue)}</div>
            <div className={styles.statLabel}>Receitas do dia</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: "var(--danger)" }}>
              {formatMoney(dailyExpense)}
            </div>
            <div className={styles.statLabel}>Despesas do dia</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: dailyBalance < 0 ? "var(--danger)" : "var(--brand-deep)" }}>
              {formatMoney(dailyBalance)}
            </div>
            <div className={styles.statLabel}>Saldo do dia</div>
          </div>

          <div className={styles.statCard}>
            <div className={styles.statValue}>{formatMoney(monthlyRevenue)}</div>
            <div className={styles.statLabel}>Receitas do mês</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: "var(--danger)" }}>
              {formatMoney(monthlyExpense)}
            </div>
            <div className={styles.statLabel}>Despesas do mês</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValue} style={{ color: monthlyBalance < 0 ? "var(--danger)" : "var(--brand-deep)" }}>
              {formatMoney(monthlyBalance)}
            </div>
            <div className={styles.statLabel}>Saldo do mês</div>
          </div>
        </div>
      )}
    </div>
  );
}
