import { describe, test, expect } from "bun:test";
import { encrypt, decrypt } from "../src/crypto.js";
import { randomBytes } from "crypto";

const TEST_KEY = randomBytes(32).toString("hex");

describe("crypto", () => {
  test("encrypt and decrypt round-trip", () => {
    const plaintext = "sk-test-api-key-12345";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });

  test("produces different ciphertexts for same input (unique IV)", () => {
    const plaintext = "same-key";
    const a = encrypt(plaintext, TEST_KEY);
    const b = encrypt(plaintext, TEST_KEY);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  test("decrypt fails with wrong key", () => {
    const plaintext = "secret";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const wrongKey = randomBytes(32).toString("hex");
    expect(() => decrypt(encrypted, wrongKey)).toThrow();
  });

  test("decrypt fails with tampered ciphertext", () => {
    const encrypted = encrypt("secret", TEST_KEY);
    encrypted.ciphertext = "00" + encrypted.ciphertext.slice(2);
    expect(() => decrypt(encrypted, TEST_KEY)).toThrow();
  });

  test("handles empty string", () => {
    const encrypted = encrypt("", TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe("");
  });

  test("handles unicode", () => {
    const plaintext = "キー 🔑 مفتاح";
    const encrypted = encrypt(plaintext, TEST_KEY);
    const decrypted = decrypt(encrypted, TEST_KEY);
    expect(decrypted).toBe(plaintext);
  });
});
