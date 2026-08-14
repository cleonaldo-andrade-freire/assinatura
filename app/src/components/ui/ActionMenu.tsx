"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import styles from "@/styles/shell.module.css";

export interface ActionMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Botão "⋯" com menu suspenso, renderizado via portal em document.body —
 * um dropdown posicionado com `position: absolute` dentro de um ancestral
 * com `overflow: hidden` (todo `.panel` do projeto tem isso, pro cabeçalho
 * arredondado) fica invisível/cortado assim que o menu é mais alto que o
 * espaço restante do card. Portal + coordenadas reais do botão evita isso.
 */
export function ActionMenu({ items, disabled, label = "Mais ações" }: { items: ActionMenuItem[]; disabled?: boolean; label?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: rect.bottom + 6, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Fecha em vez de reposicionar — mais simples, e evita o menu "flutuar
    // desgrudado" do botão enquanto o modal por trás rola.
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        className={styles.menuTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
      >
        ⋯
      </button>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div ref={panelRef} className={styles.menuPanel} style={{ top: position.top, right: position.right }} role="menu">
            {items.map((item, i) => (
              <div key={i}>
                {item.danger && i > 0 && !items[i - 1].danger && <hr className={styles.menuDivider} />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  className={`${styles.menuItem} ${item.danger ? styles.menuItemDanger : ""}`}
                >
                  {item.label}
                </button>
              </div>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
