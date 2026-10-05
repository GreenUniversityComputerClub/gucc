/**
 * A QR code as one SVG path (runs of dark modules), so it stays sharp at any size, prints well
 * and becomes vector shapes in a PDF.
 */
import QRCode from "qrcode";

export function qrPath(text: string): { size: number; d: string } {
  const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
  const { size, data } = qr.modules as unknown as { size: number; data: Uint8Array };
  let d = "";
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y * size + x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return { size, d };
}
