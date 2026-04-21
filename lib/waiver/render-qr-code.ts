/**
 * PNG / SVG QR output for admin downloads.
 */

import "server-only";
import QRCode from "qrcode";

export async function waiverQrToPngBuffer(signUrl: string): Promise<Buffer> {
  return QRCode.toBuffer(signUrl, {
    type: "png",
    width: 640,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#001c30ff", light: "#ffffffff" },
  });
}

export async function waiverQrToSvgString(signUrl: string): Promise<string> {
  return QRCode.toString(signUrl, {
    type: "svg",
    width: 640,
    margin: 2,
    errorCorrectionLevel: "M",
  });
}
