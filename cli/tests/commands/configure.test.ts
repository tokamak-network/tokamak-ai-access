import { describe, it, expect, vi, afterEach } from "vitest";
import { runConfigure } from "../../src/commands/configure.js";

vi.mock("../../src/targets/claude.js", () => ({ configure: vi.fn() }));
vi.mock("../../src/targets/codex.js", () => ({ configure: vi.fn() }));
vi.mock("../../src/targets/openclaw.js", () => ({ configure: vi.fn() }));
vi.mock("../../src/targets/hermes.js", () => ({ configure: vi.fn() }));
vi.mock("../../src/lib/litellm.js", () => ({ fetchModels: vi.fn() }));

const callOrder: string[] = [];

vi.mock("../../src/lib/prompts.js", () => ({
  promptTarget: vi.fn(async () => { callOrder.push("target"); return "codex"; }),
  promptModel: vi.fn(async () => { callOrder.push("model"); return "qwen-3.6"; }),
  promptApiKey: vi.fn(async () => { callOrder.push("apiKey"); return "sk-test"; }),
}));

afterEach(() => { callOrder.length = 0; });

describe("runConfigure interactive prompt order", () => {
  it("prompts model before apiKey (prevents stdin buffering bug)", async () => {
    // stdin.isTTY must be true so nonInteractive=false → all three prompts fire
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: true, configurable: true });

    await runConfigure({});

    Object.defineProperty(process.stdin, "isTTY", { value: origIsTTY, configurable: true });

    const modelIdx = callOrder.indexOf("model");
    const apiKeyIdx = callOrder.indexOf("apiKey");
    expect(modelIdx).toBeGreaterThanOrEqual(0);
    expect(apiKeyIdx).toBeGreaterThanOrEqual(0);
    expect(modelIdx).toBeLessThan(apiKeyIdx);
  });
});
