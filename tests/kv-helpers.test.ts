import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockKv } = vi.hoisted(() => ({
  mockKv: {
    set: vi.fn(),
    incr: vi.fn(),
    decr: vi.fn(),
    keys: vi.fn(),
  },
}));

vi.mock("@vercel/kv", () => ({ kv: mockKv }));

import { kvSetNx, kvIncr, kvDecr, kvKeys } from "@/lib/kv";

// All wrapper keys are chain-scoped; pin the chain so the prefix is deterministic.
const P = "sepolia:";
beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_CHAIN = "sepolia";
});

describe("kvSetNx", () => {
  it("returns true when key was set (kv returns 'OK')", async () => {
    mockKv.set.mockResolvedValue("OK");
    const result = await kvSetNx("mykey", 1, 10);
    expect(result).toBe(true);
    expect(mockKv.set).toHaveBeenCalledWith(`${P}mykey`, 1, { nx: true, ex: 10 });
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
    expect(mockKv.incr).toHaveBeenCalledWith(`${P}counter`);
  });
});

describe("kvDecr", () => {
  it("calls kv.decr and returns the new value", async () => {
    mockKv.decr.mockResolvedValue(3);
    const result = await kvDecr("counter");
    expect(result).toBe(3);
    expect(mockKv.decr).toHaveBeenCalledWith(`${P}counter`);
  });
});

describe("kvKeys", () => {
  it("prefixes the glob with {chain}: and strips it from returned keys", async () => {
    // Caller passes a bare pattern; underlying kv must see the chain-scoped glob...
    mockKv.keys.mockResolvedValue([`${P}key:0xabc`, `${P}key:0xabc:lock`]);
    const result = await kvKeys("key:*");
    expect(mockKv.keys).toHaveBeenCalledWith(`${P}key:*`);
    // ...and callers get bare keys back, so cron's substring(4)/endsWith(":lock") still hold.
    expect(result).toEqual(["key:0xabc", "key:0xabc:lock"]);
  });
});
