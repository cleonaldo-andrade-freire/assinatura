"use client";

import styles from "@/styles/shellMobileV2.module.css";

/** Banner "continuar de onde parou" (prompt §7.7) — só aparece quando
 * useDraftAutosave encontra um rascunho salvo em localStorage. */
export function DraftBanner({ onRestore, onDiscard }: { onRestore: () => void; onDiscard: () => void }) {
  return (
    <div className={styles.draftBanner} role="status">
      <span>Você tem um rascunho salvo desta tela.</span>
      <div className={styles.draftBannerActions}>
        <button type="button" onClick={onDiscard} className={styles.draftBannerGhost}>
          Descartar
        </button>
        <button type="button" onClick={onRestore} className={styles.draftBannerPrimary}>
          Continuar de onde parou
        </button>
      </div>
    </div>
  );
}
