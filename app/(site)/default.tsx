/**
 * Default component for the (site) segment when Next.js cannot determine
 * the active state (e.g. during navigation or refresh). Renders nothing so
 * the layout doesn't fall back to the NotFound boundary.
 */
export default function Default() {
  return null;
}
