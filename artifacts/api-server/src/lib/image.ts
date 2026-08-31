import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { SynthesisError } from './synthesis-store';

export async function validateImage(dataUrl: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new SynthesisError(400, 'Use a valid JPEG, PNG, or WebP photo.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > 16 * 1024 * 1024) throw new SynthesisError(400, 'The photo must be between 1 byte and 16 MB.');
  if (bytes.toString('base64') !== match[2]) throw new SynthesisError(400, 'The photo encoding is invalid.');
  try {
    const image = sharp(bytes, { failOn: 'warning', limitInputPixels: 25_000_000 });
    const meta = await image.metadata();
    if (meta.format !== match[1] || (meta.pages ?? 1) !== 1) throw new Error('Invalid format');
    // Decode to detect truncation; never send recompressed bytes to the image API.
    await image.timeout({ seconds: 10 }).stats();
  } catch {
    throw new SynthesisError(400, 'The photo is corrupted, animated, or exceeds 25 megapixels. Use a clear JPEG, PNG, or WebP.');
  }
  return { imageHash: createHash('sha256').update(bytes).digest('hex'), dataUrl };
}
