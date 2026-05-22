import pc from "picocolors";

export const log = {
  info: (msg: string) => console.log(`  ${pc.cyan("[info]")}  ${msg}`),
  ok: (msg: string) => console.log(`  ${pc.green("[ok]")}    ${msg}`),
  warn: (msg: string) => console.log(`  ${pc.yellow("[warn]")}  ${msg}`),
  err: (msg: string) => console.error(`  ${pc.red("[error]")} ${msg}`),
  dry: (msg: string) => console.log(`  ${pc.magenta("[dry-run]")} ${msg}`),
  section: (title: string) => {
    console.log("");
    console.log(pc.bold(pc.blue(`── ${title} ─────────────────────────────────`)));
  },
  diff: (symbol: "+" | "~" | "=" | "-", key: string, value: string) => {
    const colored =
      symbol === "+" ? pc.green(`+  ${key}: ${value}`)
      : symbol === "-" ? pc.red(`-  ${key}: ${value}`)
      : symbol === "~" ? pc.yellow(`~  ${key}: ${value}`)
      : pc.dim(`=  ${key}: ${value}`);
    console.log(`    ${colored}`);
  },
};

export function maskKey(key: string): string {
  if (key.length <= 12) return key;
  return key.slice(0, 12) + "…";
}
