import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type Server } from "node:http";
import { after, before, describe, it } from "node:test";
import express from "express";
import { UserRole, UserStatus } from "../src/generated/prisma/enums.js";
import { createAuthRouter } from "../src/auth/auth.routes.js";
import type {
  AuthStore,
  AuthUser,
  AuthUserRecord,
  NewAuthSession,
  NewAuthUser,
} from "../src/auth/auth-store.js";

class MemoryAuthStore implements AuthStore {
  private readonly users = new Map<string, AuthUserRecord>();
  private readonly sessions = new Map<
    string,
    NewAuthSession & { revokedAt: Date | null }
  >();

  async findUserByPhone(phone: string): Promise<AuthUserRecord | null> {
    return [...this.users.values()].find((user) => user.phone === phone) ?? null;
  }

  async createUser(input: NewAuthUser): Promise<AuthUserRecord> {
    const now = new Date();
    const user: AuthUserRecord = {
      id: `test-user-${this.users.size + 1}`,
      ...input,
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      phoneVerified: false,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async createSession(input: NewAuthSession): Promise<void> {
    this.sessions.set(input.tokenHash, { ...input, revokedAt: null });
  }

  async findActiveSession(
    tokenHash: string,
    now: Date,
  ): Promise<{ user: AuthUser; expiresAt: Date } | null> {
    const session = this.sessions.get(tokenHash);
    if (!session || session.revokedAt || session.expiresAt <= now) {
      return null;
    }
    const user = this.users.get(session.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      return null;
    }

    const { passwordHash: _passwordHash, ...safeUser } = user;
    return { user: safeUser, expiresAt: session.expiresAt };
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.get(tokenHash);
    if (session) {
      session.revokedAt = now;
    }
  }
}

describe("authentication routes", () => {
  const store = new MemoryAuthStore();
  let server: Server;
  let baseUrl: string;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/auth", createAuthRouter(store, false));
    server = createServer(app).listen(0);
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    baseUrl = `http://127.0.0.1:${address.port}/api/auth`;
  });

  after(async () => {
    if (server.listening) {
      server.close();
      await once(server, "close");
    }
  });

  it("rejects an invalid Bangladesh phone number", async () => {
    const response = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        phone: "12345",
        password: "Str0ng!TestPass123",
      }),
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "Invalid Bangladesh mobile number",
    });
  });

  it("rejects client-supplied privileged roles", async () => {
    const response = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        phone: "01712345678",
        password: "Str0ng!TestPass123",
        role: "ADMIN",
      }),
    });

    assert.equal(response.status, 400);
  });

  it("rejects state-changing requests from untrusted browser origins", async () => {
    const response = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { origin: "https://untrusted.example" },
    });

    assert.equal(response.status, 403);
  });

  it("registers with a canonical phone and safe customer data", async () => {
    const response = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        phone: "01712345678",
        password: "Str0ng!TestPass123",
      }),
    });
    const body = (await response.json()) as {
      user: Record<string, unknown>;
    };

    assert.equal(response.status, 201);
    assert.equal(body.user.phone, "+8801712345678");
    assert.equal(body.user.role, UserRole.CUSTOMER);
    assert.equal(body.user.phoneVerified, false);
    assert.equal("passwordHash" in body.user, false);
  });

  it("rejects duplicate canonical phone numbers", async () => {
    const response = await fetch(`${baseUrl}/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Duplicate User",
        phone: "+8801712345678",
        password: "Str0ng!TestPass123",
      }),
    });

    assert.equal(response.status, 409);
  });

  it("returns generic invalid credentials for a failed login", async () => {
    const response = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "01812345678",
        password: "WrongPassword123!",
      }),
    });

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      error: "Invalid phone or password",
    });
  });

  it("requires auth for me and revokes a logged-in session on logout", async () => {
    const unauthenticated = await fetch(`${baseUrl}/me`);
    assert.equal(unauthenticated.status, 401);

    const login = await fetch(`${baseUrl}/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        phone: "+8801712345678",
        password: "Str0ng!TestPass123",
      }),
    });
    assert.equal(login.status, 200);
    const cookieHeader = login.headers.get("set-cookie");
    assert.ok(cookieHeader);
    const sessionCookie = cookieHeader.split(";")[0];
    assert.ok(sessionCookie.startsWith("amrhishab_session="));
    assert.match(cookieHeader, /HttpOnly/i);

    const me = await fetch(`${baseUrl}/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(me.status, 200);
    const meBody = (await me.json()) as { user: Record<string, unknown> };
    assert.equal(meBody.user.phone, "+8801712345678");
    assert.equal("passwordHash" in meBody.user, false);

    const logout = await fetch(`${baseUrl}/logout`, {
      method: "POST",
      headers: { cookie: sessionCookie },
    });
    assert.equal(logout.status, 204);
    assert.match(
      logout.headers.get("set-cookie") ?? "",
      /Expires=Thu, 01 Jan 1970/i,
    );

    const afterLogout = await fetch(`${baseUrl}/me`, {
      headers: { cookie: sessionCookie },
    });
    assert.equal(afterLogout.status, 401);
  });
});
