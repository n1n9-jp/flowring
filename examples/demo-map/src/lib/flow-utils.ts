// 都道コード統合: 旧都道 → 特別自治道に置換
// 江原道(42)→江原特別自治道(51), 全羅北道(45)→全北特別自治道(52), 済州道(49)→済州特別自治道(50)
const SIDO_MERGE: Record<number, number> = { 42: 51, 45: 52, 49: 50 };

function getSido(code: number): number {
  const len = String(code).length;
  if (len <= 2) return code;
  if (len <= 5) return Math.floor(code / 1000);
  return Math.floor(code / 100000000);
}

/** コードの先頭2桁(都道)を特別自治道に置換したコードを返す */
export function mergeSido(code: number): number {
  const sido = getSido(code);
  const merged = SIDO_MERGE[sido];
  if (!merged) return code;
  const len = String(code).length;
  if (len <= 2) return merged;
  if (len <= 5) return merged * 1000 + (code % 1000);
  return merged * 100000000 + (code % 100000000);
}

/** データ配列のori/desを都道統合し、同一になった行はflowを合算 */
export function mergeRows<T extends { ori: number; des: number; flow: number }>(
  rows: T[],
): T[] {
  const map = new Map<string, T>();
  for (const row of rows) {
    const ori = mergeSido(row.ori);
    const des = mergeSido(row.des);
    const key = `${ori}-${des}`;
    const prev = map.get(key);
    if (prev) {
      prev.flow += row.flow;
    } else {
      map.set(key, { ...row, ori, des });
    }
  }
  return Array.from(map.values());
}
