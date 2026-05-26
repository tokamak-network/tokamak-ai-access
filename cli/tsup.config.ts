import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("./package.json", "utf-8")) as { version: string };

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs"],
  target: "node18",
  bundle: true,
  minify: false,
  sourcemap: true,
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [/.*/],
  shims: true,
  define: { __PKG_VERSION__: JSON.stringify(version) },
});
