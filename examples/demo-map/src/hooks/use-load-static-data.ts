"use client";

import { useEffect } from "react";
import { useFlowStore } from "@/stores/flow-store";
import { mergeRows } from "@/lib/flow-utils";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const UNIT_FILE: Record<string, string> = {
  "市郡区": `${BASE}/netflow-all-sgg.json`,
  "邑面洞": `${BASE}/netflow-all-emd.json`,
};

export function useLoadStaticData() {
  const counterpartyUnit = useFlowStore((s) => s.counterpartyUnit);
  const setNetflowAllRawData = useFlowStore((s) => s.setNetflowAllRawData);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const file = UNIT_FILE[counterpartyUnit];
      if (!file) return;

      try {
        const res = await fetch(file);
        const rawData = await res.json();
        if (cancelled) return;

        const merged = mergeRows(rawData);
        const withId = merged.map((row: { ori: number; des: number; flow: number }, i: number) => ({
          id: String(i + 1),
          ...row,
        }));

        setNetflowAllRawData(withId);
        console.log(`[static-data] loaded ${file}: ${withId.length} rows`);
      } catch (err) {
        console.error("[static-data] failed to load:", err);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [counterpartyUnit, setNetflowAllRawData]);
}
