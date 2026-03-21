"use client";

import dynamic from "next/dynamic";

const MapContainer = dynamic(
  () => import("@/components/map/map-container"),
  { ssr: false }
);

export function AppShell() {
  return (
    <div className="h-screen w-screen overflow-hidden">
      <MapContainer />
    </div>
  );
}
