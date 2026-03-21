"use client";

import { useEffect } from "react";
import { useFlowStore } from "@/stores/flow-store";
import type { AdmCenter } from "@/types/flow";

export function useAdmcenter() {
  const admcenter = useFlowStore((s) => s.admcenter);
  const setAdmcenter = useFlowStore((s) => s.setAdmcenter);

  useEffect(() => {
    if (admcenter.length > 0) return;

    fetch("/center.tsv")
      .then((res) => res.text())
      .then((text) => {
        const lines = text.trim().replace(/\r/g, "").split("\n");
        const headers = lines[0].split("\t");
        const admcdIdx = headers.indexOf("admcd");
        const admnmIdx = headers.indexOf("admnm");
        const lonIdx = headers.indexOf("lon");
        const latIdx = headers.indexOf("lat");

        const centers: AdmCenter[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split("\t");
          if (cols.length < 4) continue;
          centers.push({
            admcd: parseInt(cols[admcdIdx], 10),
            admnm: cols[admnmIdx],
            lon: parseFloat(cols[lonIdx]),
            lat: parseFloat(cols[latIdx]),
          });
        }
        console.log("[admcenter] loaded:", centers.length, "sample:", centers[0], centers[1]);
        setAdmcenter(centers);
      })
      .catch((err) => console.error("Failed to load center.tsv:", err));
  }, [admcenter.length, setAdmcenter]);
}
