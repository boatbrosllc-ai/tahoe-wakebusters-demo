/**
 * Generate PDF from waiver HTML.
 * Production (e.g. Netlify serverless): set PDFSHIFT_API_KEY (https://pdfshift.io) or another
 * HTML-to-PDF REST API — Playwright/Chromium is not available in typical serverless runtimes.
 * Local/dev: Playwright is used when no API key is set and playwright is installed.
 */

/**
 * Generate a PDF buffer from full HTML string.
 * @param html - Complete HTML document string (e.g. from buildWaiverHtml).
 * @returns PDF as Buffer.
 */
export async function generateWaiverPdf(html: string): Promise<Buffer> {
  const apiKey = process.env.PDFSHIFT_API_KEY?.trim();
  if (apiKey) {
    const res = await fetch("https://api.pdfshift.io/v3/convert/pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({ source: html }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`PDFShift failed: HTTP ${res.status} ${errText.slice(0, 200)}`);
    }
    const arr = await res.arrayBuffer();
    return Buffer.from(arr);
  }

  let chromium: typeof import("playwright").chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `Waiver PDF: set PDFSHIFT_API_KEY for serverless PDF generation, or install Playwright for local dev. ${msg}`
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
