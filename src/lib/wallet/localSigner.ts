/**
 * Client-side-only encrypted storage for an Operator's "local hot wallet"
 * private key. This module is never imported by a Server Component, Route
 * Handler, or anything else that runs on the server — it only makes sense
 * running in a browser, and every function here assumes `window`/`crypto`
 * exist.
 *
 * The key is encrypted with AES-GCM using a key derived from a passphrase
 * via PBKDF2, and the encrypted blob lives in this browser's localStorage,
 * keyed by wallet address. MintDash's server and database never see the
 * plaintext key, the passphrase, or the encrypted blob.
 *
 * This is a convenience for automation-heavy workflows (sign N mints
 * without N wallet-extension popups). It is NOT a substitute for a proper
 * key-management system. Only ever import a wallet created specifically
 * for this purpose and funded with just enough ETH for the mints you plan
 * to run — never a wallet holding significant funds or valuable NFTs.
 */

const STORAGE_PREFIX = "mintdash:signer:";
const PBKDF2_ITERATIONS = 250_000;

export interface EncryptedSigner {
  address: string;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

function assertBrowser(): void {
  if (typeof window === "undefined" || !window.crypto?.subtle) {
    throw new Error("localSigner can only run in a browser with Web Crypto support.");
  }
}

function bufToBase64(buf: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i] as number);
  }
  return btoa(binary);
}

function base64ToBuf(b64: string): ArrayBuffer {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptPrivateKey(
  address: string,
  privateKeyHex: string,
  passphrase: string
): Promise<EncryptedSigner> {
  assertBrowser();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(privateKeyHex)
  );
  return {
    address: address.toLowerCase(),
    salt: bufToBase64(salt.buffer),
    iv: bufToBase64(iv.buffer),
    ciphertext: bufToBase64(ciphertextBuf),
  };
}

/** Throws if the passphrase is wrong (AES-GCM authentication tag fails to verify). */
export async function decryptPrivateKey(record: EncryptedSigner, passphrase: string): Promise<string> {
  assertBrowser();
  const salt = new Uint8Array(base64ToBuf(record.salt));
  const iv = new Uint8Array(base64ToBuf(record.iv));
  const key = await deriveKey(passphrase, salt);
  try {
    const plainBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      base64ToBuf(record.ciphertext)
    );
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new Error("Incorrect passphrase.");
  }
}

export function saveEncryptedSigner(record: EncryptedSigner): void {
  assertBrowser();
  window.localStorage.setItem(STORAGE_PREFIX + record.address.toLowerCase(), JSON.stringify(record));
}

export function loadEncryptedSigner(address: string): EncryptedSigner | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_PREFIX + address.toLowerCase());
  return raw ? (JSON.parse(raw) as EncryptedSigner) : null;
}

export function hasEncryptedSigner(address: string): boolean {
  return loadEncryptedSigner(address) !== null;
}

export function removeEncryptedSigner(address: string): void {
  assertBrowser();
  window.localStorage.removeItem(STORAGE_PREFIX + address.toLowerCase());
}
