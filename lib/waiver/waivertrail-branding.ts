/** WaiverTrail attribution on signing UI and signed waiver documents. */
export const WAIVERTRAIL_URL = "https://waivertrail.com/";

/** HTML footer for signed waiver PDFs and stored HTML documents. */
export function waiverTrailPoweredByHtml(): string {
  return `<footer style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;text-align:center;font-size:12px;color:#888;">
  Powered by <a href="${WAIVERTRAIL_URL}" style="color:#555;text-decoration:underline;">WaiverTrail</a>
</footer>`;
}
