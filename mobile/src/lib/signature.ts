/** Same cap as the web `readSignatureFile` in `src/lib/storage.ts`. */
export const SIGNATURE_MAX_WIDTH = 900;

/**
 * Pixel size the web canvas uses: scale down only when wider than 900,
 * round each side, and never go below 1px.
 */
export function signaturePixelSize(width: number, height: number): { width: number; height: number } {
  const sourceWidth = width > 0 ? width : 1;
  const sourceHeight = height > 0 ? height : 1;
  const scale = Math.min(1, SIGNATURE_MAX_WIDTH / sourceWidth);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

/**
 * Browser path. Matches `readSignatureFile`: PNG data URL at `signaturePixelSize`,
 * or the original file as a data URL when the canvas cannot be drawn.
 */
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

type SizedUri = { width?: number; height?: number };

/**
 * Native path. Re-encodes to a PNG data URL at the same pixel size as the web canvas.
 * Falls back to the original bytes as a data URL, matching the web catch path.
 */
export async function readSignatureUri(uri: string, known?: SizedUri): Promise<string> {
  try {
    const { ImageManipulator, SaveFormat } = await import("expo-image-manipulator");
    let width = known?.width && known.width > 0 ? known.width : 0;
    let height = known?.height && known.height > 0 ? known.height : 0;
    if (width === 0 || height === 0) {
      const probe = await ImageManipulator.manipulate(uri).renderAsync();
      width = probe.width;
      height = probe.height;
      releaseImage(probe);
    }
    const size = signaturePixelSize(width, height);
    const rendered = await ImageManipulator.manipulate(uri, {
      maxWidth: size.width,
      maxHeight: size.height,
    })
      .resize(size)
      .renderAsync();
    try {
      const saved = await rendered.saveAsync({ format: SaveFormat.PNG, base64: true, compress: 1 });
      if (saved.base64) return `data:image/png;base64,${saved.base64}`;
      return await readUriAsDataUrl(saved.uri, "image/png");
    } finally {
      releaseImage(rendered);
    }
  } catch {
    return readUriAsDataUrl(uri, mimeFromUri(uri));
  }
}

function releaseImage(image: { release?: () => void }) {
  try {
    image.release?.();
  } catch {
    // The native image may already have been released with the file save.
  }
}

async function readUriAsDataUrl(uri: string, mime: string): Promise<string> {
  if (uri.startsWith("data:")) return uri;
  try {
    const { File } = await import("expo-file-system");
    const bytes = new Uint8Array(await new File(uri).arrayBuffer());
    return `data:${mime};base64,${bytesToBase64(bytes)}`;
  } catch {
    const legacy = await import("expo-file-system/legacy");
    const base64 = await legacy.readAsStringAsync(uri, { encoding: "base64" });
    return `data:${mime};base64,${base64}`;
  }
}

function mimeFromUri(uri: string): string {
  const clean = uri.split("?")[0]?.toLowerCase() ?? "";
  if (clean.endsWith(".png")) return "image/png";
  if (clean.endsWith(".webp")) return "image/webp";
  if (clean.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}
