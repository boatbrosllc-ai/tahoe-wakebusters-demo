import type confetti from "canvas-confetti";

/**
 * Dynamic import for canvas-confetti. Next may alias the package to the browser CJS bundle;
 * interop can expose the callable as `default` or as the module namespace — normalize here.
 */
export async function loadConfetti(): Promise<typeof confetti | null> {
  const mod = await import("canvas-confetti");
  const candidate =
    mod != null && typeof mod === "object" && "default" in mod
      ? (mod as { default: unknown }).default
      : mod;
  return typeof candidate === "function" ? (candidate as typeof confetti) : null;
}
