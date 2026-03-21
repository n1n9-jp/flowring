"use client";

import { useEffect, useState } from "react";
import type { FeatureCollection } from "geojson";

export function useEmdGeojson() {
  const [geojson, setGeojson] = useState<FeatureCollection | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/emd.geojson");
        const data: FeatureCollection = await res.json();
        if (!cancelled) {
          console.log(`[emd-geojson] loaded ${data.features.length} features`);
          setGeojson(data);
        }
      } catch (err) {
        console.error("[emd-geojson] failed to load:", err);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  return geojson;
}
