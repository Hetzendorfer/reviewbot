import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKeyBuffer(hexKey: string): Buffer {
  return Buffer.from(hexKey, "hex");
}

export interface EncryptedData {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export function encrypt(plaintext: string, hexKey: string): EncryptedData {
  const key = getKeyBuffer(hexKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
  };
}

export function decrypt(data: EncryptedData, hexKey: string): string {
  const key = getKeyBuffer(hexKey);
  const iv = Buffer.from(data.iv, "hex");
  const authTag = Buffer.from(data.authTag, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(data.ciphertext, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}
