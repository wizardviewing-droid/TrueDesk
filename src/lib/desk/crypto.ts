const encoder = new TextEncoder();

export type Wrap = { salt: string; iv: string; wrapped: string };

export function randomBytes(size: number): Uint8Array {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytes;
}

function copyBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export function toB64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) {
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  }
  return btoa(binary);
}

export function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function createMaster(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
}

export async function exportMaster(key: CryptoKey): Promise<JsonWebKey> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importMaster(jwk: JsonWebKey): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt",
  ]);
}

async function deriveWrapKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: copyBuffer(salt), iterations: 80000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function wrapMaster(master: CryptoKey, password: string): Promise<Wrap> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", master));
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveWrapKey(password, salt);
  const wrapped = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyBuffer(iv) },
    key,
    copyBuffer(raw),
  );
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(wrapped) };
}

export async function unwrapMaster(password: string, wrap: Wrap): Promise<CryptoKey | null> {
  try {
    const key = await deriveWrapKey(password, fromB64(wrap.salt));
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: copyBuffer(fromB64(wrap.iv)) },
      key,
      copyBuffer(fromB64(wrap.wrapped)),
    );
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, true, [
      "encrypt",
      "decrypt",
    ]);
  } catch {
    return null;
  }
}

export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer,
): Promise<{ iv: string; data: string }> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyBuffer(iv) },
    key,
    data,
  );
  return { iv: toB64(iv), data: toB64(cipher) };
}

export async function decryptBytes(
  key: CryptoKey,
  iv: string,
  data: string,
): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyBuffer(fromB64(iv)) },
    key,
    copyBuffer(fromB64(data)),
  );
}

export async function encryptBlob(key: CryptoKey, data: ArrayBuffer): Promise<{ iv: string; data: ArrayBuffer }> {
  const iv = randomBytes(12);
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: copyBuffer(iv) },
    key,
    data,
  );
  return { iv: toB64(iv), data: cipher };
}

export async function decryptBlob(key: CryptoKey, iv: string, data: ArrayBuffer): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: copyBuffer(fromB64(iv)) },
    key,
    data,
  );
}
