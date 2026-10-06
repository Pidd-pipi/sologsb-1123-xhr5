/** 生成本地唯一 id */
export function newId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 下一个航点序号 */
export function nextSeq(existing: number[]): number {
  return existing.length === 0 ? 1 : Math.max(...existing) + 1;
}

export function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
