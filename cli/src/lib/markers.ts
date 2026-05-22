export const BLOCK_START = "# TON AI Access — auto-configured";
export const BLOCK_END = "# ///TON AI Access";

export function hasMarkerBlock(content: string): boolean {
  return content.includes(BLOCK_START) && content.includes(BLOCK_END);
}

export function hasFileMarker(content: string): boolean {
  return content.trimStart().startsWith(BLOCK_START);
}

export function makeBlockStart(target: string, model: string, date: string): string {
  return `${BLOCK_START} — ${date} | target: ${target} | model: ${model}`;
}
