"use client";

import MapView from "@/components/MapView";
import type { Job } from "@/types";

export interface MapWorkspaceProps {
  jobs: Job[];
  selectedJobId: string | null;
  onSelect: (job: Job) => void;
}

export function MapWorkspace({
  jobs,
  selectedJobId,
  onSelect,
}: MapWorkspaceProps) {
  return (
    <div className="relative h-full w-full overflow-hidden">
      <MapView
        jobs={jobs}
        selectedJobId={selectedJobId}
        onSelectJob={onSelect}
      />
    </div>
  );
}

export default MapWorkspace;
