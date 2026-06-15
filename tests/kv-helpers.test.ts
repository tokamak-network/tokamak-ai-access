import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockKv } = vi.hoisted(() => ({
  mockKv: {
    set: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
  },
}));

vi.mock("@vercel/kv", () => ({ kv: mockKv }));

import { kvSetNx, kvIncr, kvDecr } from "@/lib/kv";

beforeEach(() => vi.clearAllMocks());

describe("kvSetNx", () => {
  it("returns true when key was set (kv returns 'OK')", async () => {
    mockKv.set.mockResolvedValue("OK");
    const result = await kvSetNx("mykey", 1, 10);
    expect(result).toBe(true);
    expect(mockKv.set).toHaveBeenCalledWith("mykey", 1, { nx: true, ex: 10 });
  });

  it("returns false when key already exists (kv returns null)", async () => {
    mockKv.set.mockResolvedValue(null);
    const result = await kvSetNx("mykey", 1, 10);
    expect(result).toBe(false);
  });
});

describe("kvIncr", () => {
  it("calls kv.incr and returns the new value", async () => {
    mockKv.incr.mockResolvedValue(5);
    const result = await kvIncr("counter");
    expect(result).toBe(5);
    expect(mockKv.incr).toHaveBeenCalledWith("counter");
  });
});

describe("kvDecr", () => {
  it("calls kv.decr and returns the new value", async () => {
    mockKv.decr.mockResolvedValue(3);
    const result = await kvDecr("counter");
    expect(result).toBe(3);
    expect(mockKv.decr).toHaveBeenCalledWith("counter");
  });
});
