import { describe, it, expect } from "vitest";
import { MODELS, CHAT_MODELS, getContextWindow } from "../../src/lib/models.js";

describe("models registry", () => {
  it("CHAT_MODELS excludes image models", () => {
    expect(CHAT_MODELS.some((m) => m.type === "image")).toBe(false);
    expect(CHAT_MODELS.map((m) => m.value)).toEqual([
      "qwen-3.6",
      "gemma-4",
      "deepseek-v4-flash",
      "glm-5.2",
    ]);
  });

  it("registers the three image models with no context window", () => {
    for (const v of ["z-image", "flux-2-klein", "krea-2-turbo"]) {
      const m = MODELS.find((x) => x.value === v);
      expect(m?.type).toBe("image");
      expect(m?.contextWindow).toBeUndefined();
      expect(getContextWindow(v)).toBeUndefined();
    }
  });

  it("keeps chat models' context window", () => {
    expect(getContextWindow("qwen-3.6")).toBe(262144);
  });
});
