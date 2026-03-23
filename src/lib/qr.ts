import QRCode from "qrcode";

export async function generateQrDataUri(
  text: string,
  size: number = 200,
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: size,
    margin: 1,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
