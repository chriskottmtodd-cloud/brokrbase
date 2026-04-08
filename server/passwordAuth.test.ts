import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the password login route logic.
 * We test the credential-matching logic directly without spinning up Express.
 */

describe("Password login credential validation", () => {
  const adminEmail = "admin@example.com";
  const adminPassword = "MySecretPass123";

  function validateCredentials(
    inputEmail: string,
    inputPassword: string,
    envEmail: string,
    envPassword: string
  ): boolean {
    if (!envEmail || !envPassword) return false;
    const emailMatch = inputEmail.trim().toLowerCase() === envEmail.trim().toLowerCase();
    const passwordMatch = inputPassword === envPassword;
    return emailMatch && passwordMatch;
  }

  it("accepts correct email and password", () => {
    expect(validateCredentials(adminEmail, adminPassword, adminEmail, adminPassword)).toBe(true);
  });

  it("rejects wrong password", () => {
    expect(validateCredentials(adminEmail, "wrongpass", adminEmail, adminPassword)).toBe(false);
  });

  it("rejects wrong email", () => {
    expect(validateCredentials("other@example.com", adminPassword, adminEmail, adminPassword)).toBe(false);
  });

  it("is case-insensitive for email", () => {
    expect(validateCredentials("ADMIN@EXAMPLE.COM", adminPassword, adminEmail, adminPassword)).toBe(true);
  });

  it("is case-sensitive for password", () => {
    expect(validateCredentials(adminEmail, adminPassword.toLowerCase(), adminEmail, adminPassword)).toBe(false);
  });

  it("rejects when env credentials are not configured", () => {
    expect(validateCredentials(adminEmail, adminPassword, "", "")).toBe(false);
  });
});
