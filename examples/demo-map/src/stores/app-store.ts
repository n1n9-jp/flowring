import { create } from "zustand";
import type maplibregl from "maplibre-gl";

interface AppState {
  mapInstance: maplibregl.Map | null;
  setMapInstance: (map: maplibregl.Map | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  mapInstance: null,
  setMapInstance: (map) => set({ mapInstance: map }),
}));
