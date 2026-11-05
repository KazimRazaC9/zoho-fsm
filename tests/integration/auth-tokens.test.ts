/**
 * Acceptance: "refresh tokens rotate" (and a reused token revokes the whole session family).
 * Runs against the seeded dev database.
 */
import { afterAll, describe, expect, it } from "vitest";
import { prismaBase } from "@/lib/db";
import { verifyAccessToken } from "@/lib/tokens";
import { authService } from "@/modules/auth";

const password = process.env.SEED_PASSWORD ?? "";

afterAll(() => prismaBase.$disconnect());

describe("bearer tokens", () => {
  it("rejects a wrong password", async () => {
    await expect(authService.loginForTokens("admin@demo.local", "wrong-password", null)).rejects.toThrow(
      /Invalid email or password/,
    );
  });

  it("issues an access token that carries role and company", async () => {
    const t = await authService.loginForTokens("dispatcher@demo.local", password, "127.0.0.1");
    const claims = await verifyAccessToken(t.accessToken);
    expect(claims?.role).toBe("DISPATCHER");
    expect(claims?.cid).toBe(t.user.companyId);
    expect(await verifyAccessToken(`${t.accessToken}x`)).toBeNull();
  });

  it("rotates refresh tokens and detects reuse", async () => {
    const first = await authService.loginForTokens("admin@demo.local", password, "127.0.0.1");
    const second = await authService.refresh(first.refreshToken, "127.0.0.1");
    expect(second.refreshToken).not.toBe(first.refreshToken);

    // The old token is now revoked: presenting it again is treated as theft…
    await expect(authService.refresh(first.refreshToken, "127.0.0.1")).rejects.toThrow(/already used/);
    // …and every token of that user is revoked, including the newest one.
    await expect(authService.refresh(second.refreshToken, "127.0.0.1")).rejects.toThrow(/already used/);
  });

  it("super admin signs in without a company", async () => {
    const t = await authService.loginForTokens("superadmin@fieldserve.local", password, null);
    expect(t.user.role).toBe("SUPER_ADMIN");
    expect(t.user.companyId).toBeNull();
  });
});
