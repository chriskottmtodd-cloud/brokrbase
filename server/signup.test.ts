import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import type { Server } from "http";
import { registerPasswordAuthRoutes } from "./passwordAuth";

describe("Public sign-up is closed", () => {
  let server: Server;
  let base = "";
  beforeAll(() => {
    delete process.env.ALLOW_SIGNUP;
    const app = express();
    app.use(express.json());
    registerPasswordAuthRoutes(app);
    server = app.listen(0);
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it("rejects registration with 403", async () => {
    const res = await fetch(`${base}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Stranger", email: "stranger@example.com", password: "hunter22" }),
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/invite-only/);
  });
});
