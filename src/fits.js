import { extractWcs } from './wcs.js';

// Read only the first science image; skip the large auxiliary FITS extensions.
const block = 2880;
const decoder = new TextDecoder("ascii");

function value(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith("'")) return trimmed.slice(1).split("'")[0].trim();
  const clean = trimmed.split("/")[0].trim();
  if (clean === "T") return true;
  if (clean === "F") return false;
  const number = Number(clean.replace(/[dD]/g, "E"));
  return Number.isNaN(number) ? clean : number;
}

function headerAt(bytes, offset) {
  const header = {};
  for (let cursor = offset; cursor + 80 <= bytes.length; cursor += 80) {
    const card = decoder.decode(bytes.subarray(cursor, cursor + 80));
    const key = card.slice(0, 8).trim();
    if (key === "END") {
      const dataOffset = Math.ceil((cursor + 80) / block) * block;
      const axes = Number(header.NAXIS || 0);
      const dimensions = Array.from({ length: axes }, (_, axis) => Number(header["NAXIS" + (axis + 1)] || 0));
      const bitpix = Number(header.BITPIX || 0);
      const count = axes ? dimensions.reduce((a, b) => a * b, 1) : 0;
      const dataBytes = Math.abs(bitpix) / 8 * Number(header.GCOUNT || 1) * (count + Number(header.PCOUNT || 0));
      if (!Number.isSafeInteger(dataBytes) || dataBytes < 0) throw new Error("Invalid FITS dimensions.");
      return { header, dimensions, bitpix, dataOffset, dataBytes };
    }
    if (key && card[8] === "=") header[key] = value(card.slice(10));
  }
  return null;
}

export async function readSciencePreview(response, signal) {
  if (!response.body) throw new Error("The archive returned an empty FITS file.");
  const reader = response.body.getReader();
  let bytes = new Uint8Array(0);
  let offset = 0;
  let current = null;
  try {
    while (true) {
      signal?.throwIfAborted();
      if (!current) current = headerAt(bytes, offset);
      if (current) {
        const { header, dimensions, bitpix, dataOffset, dataBytes } = current;
        const image = !header.XTENSION || header.XTENSION === "IMAGE";
        const science = !header.EXTNAME || ["IMAGE", "SCI", "SCIENCE"].includes(header.EXTNAME);
        if (image && science && dimensions.length === 2 && dimensions[0] > 0 && dimensions[1] > 0) {
          if (bytes.length >= dataOffset + dataBytes) {
            const [width, height] = dimensions;
            if (width * height > 1000000) throw new Error("This preview is too large. Choose a smaller field.");
            const pixels = new Array(width * height);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            const scale = Number(header.BSCALE ?? 1);
            const zero = Number(header.BZERO ?? 0);
            for (let index = 0; index < pixels.length; index += 1) {
              const position = dataOffset + index * Math.abs(bitpix) / 8;
              let raw;
              if (bitpix === 8) raw = view.getUint8(position);
              else if (bitpix === 16) raw = view.getInt16(position, false);
              else if (bitpix === 32) raw = view.getInt32(position, false);
              else if (bitpix === -32) raw = view.getFloat32(position, false);
              else if (bitpix === -64) raw = view.getFloat64(position, false);
              else throw new Error("Unsupported science image encoding.");
              const calibrated = raw * scale + zero;
              pixels[index] = (header.BLANK != null && raw === header.BLANK) || !Number.isFinite(calibrated) ? null : calibrated;
            }
            const wcs = extractWcs(header);
            return { width, height, pixels, ...(wcs ? { wcs } : {}) };
          }
        } else {
          const next = dataOffset + Math.ceil(dataBytes / block) * block;
          if (bytes.length >= next) {
            offset = next;
            current = null;
            continue;
          }
        }
      }
      const chunk = await reader.read();
      if (chunk.done) throw new Error("The archive returned an incomplete science image.");
      if (bytes.length + chunk.value.length > 32 * 1024 * 1024) throw new Error("FITS headers exceed the preview limit.");
      const combined = new Uint8Array(bytes.length + chunk.value.length);
      combined.set(bytes);
      combined.set(chunk.value, bytes.length);
      bytes = combined;
    }
  } finally {
    // Preview callers never download the remaining uncertainty, PSF and other HDUs.
    try { await reader.cancel(); } catch {}
    reader.releaseLock();
  }
}
