import styles from "./DailyMatchesComplete.module.css";

export function DailyMatchesComplete() {
  return (
    <div className="border-y border-border py-10 sm:py-12" role="status" aria-live="polite">
      <div className="mx-auto grid max-w-2xl items-center justify-center gap-8 sm:grid-cols-[180px_auto] sm:gap-12">
        <div className="grid justify-items-center">
          <div className={styles.stage} aria-hidden="true">
            <span className={`${styles.document} ${styles.documentOne}`} />
            <span className={`${styles.document} ${styles.documentTwo}`} />
            <span className={`${styles.document} ${styles.documentThree}`} />
            <span className={`${styles.document} ${styles.documentFour}`} />

            <svg className={styles.mark} viewBox="0 0 100 100">
              <path d="M32.81 8 L76.01 8 L75.17 16 L31.97 16 Z" />
              <path d="M27.53 24 L77.93 24 L77.09 32 L26.69 32 Z" />
              <path d="M22.25 40 L79.85 40 L79.01 48 L21.41 48 Z" />
              <path d="M16.97 56 L81.77 56 L80.93 64 L16.13 64 Z" />
              <path d="M11.69 72 L83.69 72 L81.59 92 L9.59 92 Z" />
            </svg>
          </div>
          <span className={styles.name}>Litos</span>
        </div>

        <p className={`${styles.message} text-heading font-medium tracking-[-0.01em] text-ink`}>
          No matches left for the day.
        </p>
      </div>
    </div>
  );
}
