// The bill a person picks, made small enough to send (client side). A phone's photo is several MB; the site takes at most a few in one go,
// so a picture is drawn smaller (long edge 1800 px, still easy to read) and a file that cannot be made smaller must already be small.
export const MOST_BYTES = 2_500_000;
const LONG_EDGE = 1800;
export type Bill = { b64: string; ext: string; name: string; preview: string | null };

async function base64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let out = "";
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

const ending = (name: string) => (/\.[a-z0-9]+$/i.exec(name)?.[0] ?? "").toLowerCase();

async function smaller(file: File): Promise<Blob | null> {
  try {
    const picture = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, LONG_EDGE / Math.max(picture.width, picture.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(picture.width * scale);
    canvas.height = Math.round(picture.height * scale);
    canvas.getContext("2d")?.drawImage(picture, 0, 0, canvas.width, canvas.height);
    return await new Promise((done) => canvas.toBlob(done, "image/jpeg", 0.82));
  } catch {
    return null; // a picture this browser cannot open (a phone's own format on a desktop): sent as it is when small enough
  }
}

/** → the bill ready to send, or the words saying why it cannot be. */
export async function readBill(file: File): Promise<Bill | { error: string }> {
  const isPicture = file.type.startsWith("image/");
  const shrunk = isPicture ? await smaller(file) : null;
  const blob = shrunk ?? file;
  if (blob.size > MOST_BYTES) return { error: isPicture ? "That photo is too large and could not be made smaller. Take it again, or choose another." : "That file is over 2.5 MB. Photograph the bill instead." };
  const ext = shrunk ? ".jpg" : ending(file.name);
  return { b64: await base64(blob), ext, name: file.name, preview: isPicture && shrunk ? URL.createObjectURL(shrunk) : null };
}
