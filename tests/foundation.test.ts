import { describe, expect, it } from "vitest";
import { verifyChain } from "../src/lib/audit";
import { openDb } from "../src/lib/db";
import { seedAll } from "../src/lib/seed";

describe("fondasi", () => {
  const db = openDb(":memory:");
  seedAll(db);
  it("mengisi data dasar", () => {
    const n = (t: string) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
    expect(n("facilities")).toBe(7);
    expect(n("participants")).toBeGreaterThan(300);
    expect(n("claims")).toBeGreaterThan(500);
    expect(n("indicator_versions")).toBeGreaterThan(10);
    expect(n("ai_configs")).toBe(1);
  });
  it("rantai audit sah", () => {
    expect(verifyChain(db).ok).toBe(true);
  });
});
