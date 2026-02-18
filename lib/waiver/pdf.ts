/**
 * Generate PDF from waiver HTML.
 * Uses Playwright (Chromium). If Playwright is not installed or fails (e.g. in serverless),
 * throws with a clear message; consider a fallback (e.g. puppeteer, or external PDF service).
 */

/**
 * Generate a PDF buffer from full HTML string.
 * @param html - Complete HTML document string (e.g. from buildWaiverHtml).
 * @returns PDF as Buffer.
 */
export async function generateWaiverPdf(html: string): Promise<Buffer> {
  let chromium: typeof import("playwright").chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Waiver PDF generation requires Playwright. Install with: npm install playwright. ${msg}`
    );
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, {
      waitUntil: "load",
      timeout: 15000,
    });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", right: "20px", bottom: "20px", left: "20px" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
