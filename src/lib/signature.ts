export const SIGNATURE_MAX_WIDTH = 900;

export function signaturePixelSize(width: number, height: number): { width: number; height: number } {
  const sourceWidth = width > 0 ? width : 1;
  const sourceHeight = height > 0 ? height : 1;
  const scale = Math.min(1, SIGNATURE_MAX_WIDTH / sourceWidth);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export async function readSignatureFile(file: Blob): Promise<string> {
  try {
    if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
      throw new Error("canvas");
    }
    const bitmap = await createImageBitmap(file);
    const size = signaturePixelSize(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}

export async function readSignatureUri(uri: string): Promise<string> {
  return uri;
}
