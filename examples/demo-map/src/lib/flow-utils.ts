// 시도 코드 통합: 구 시도 → 특별자치도로 치환
// 강원도(42)→강원특별자치도(51), 전라북도(45)→전북특별자치도(52), 제주도(49)→제주특별자치도(50)
const SIDO_MERGE: Record<number, number> = { 42: 51, 45: 52, 49: 50 };

function getSido(code: number): number {
  const len = String(code).length;
  if (len <= 2) return code;
  if (len <= 5) return Math.floor(code / 1000);
  return Math.floor(code / 100000000);
}

/** 코드의 앞 2자리(시도)를 특별자치도로 치환한 코드 반환 */
export function mergeSido(code: number): number {
  const sido = getSido(code);
  const merged = SIDO_MERGE[sido];
  if (!merged) return code;
  const len = String(code).length;
  if (len <= 2) return merged;
  if (len <= 5) return merged * 1000 + (code % 1000);
  return merged * 100000000 + (code % 100000000);
}

/** 데이터 배열의 ori/des를 시도 통합하고, 같아진 행은 flow를 합산 */
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
