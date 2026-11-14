// Decoding helpers for the /api/patch payload (see docs/patch-api.md).

export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Little-endian float32, row-major. Reads through a DataView, so alignment never matters. */
export function decodeFloat32(b64: string, expected?: number): Float32Array {
  const bytes = base64ToBytes(b64);
  if (bytes.length % 4 !== 0) throw new Error('Image data has an unexpected length.');
  const n = bytes.length / 4;
  if (expected !== undefined && n !== expected) throw new Error(`Expected ${expected} pixels, got ${n}.`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getFloat32(i * 4, true);
  return out;
}

export function decodeUint8(b64: string, expected?: number): Uint8Array {
  const bytes = base64ToBytes(b64);
  if (expected !== undefined && bytes.length !== expected) throw new Error(`Expected ${expected} flags, got ${bytes.length}.`);
  return bytes;
}

export function encodeFloat32(values: ArrayLike<number>): string {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true);
  return bytesToBase64(bytes);
}
