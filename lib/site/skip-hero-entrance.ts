/**
 * One-shot flag: after waiver success (or similar), skip Framer Motion entrance on the home Hero
 * so client navigation does not replay the logo spring pop-in.
 */

const SESSION_KEY = "bb-skip-hero-logo-motion";

export function scheduleSkipHeroEntranceOnce(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
}

/** Read and clear. Call from Hero in useLayoutEffect before paint. */
export function consumeSkipHeroEntranceOnce(): boolean {
  try {
    if (sessionStorage.getItem(SESSION_KEY) !== "1") return false;
    sessionStorage.removeItem(SESSION_KEY);
    return true;
  } catch {
    return false;
  }
}
