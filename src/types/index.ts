export type JobStatus =
  | "Available"
  | "Applied"
  | "Interview"
  | "Rejected"
  | "Inactive"
  | "Expired"
  | "Closed";
export type WorkType = "Remote" | "Hybrid" | "On-site";

/** Job filters: only title and job function (A–Z). */
export interface JobSearchFilters {
  title: string;
  jobFunctions: string[];
}

export const INITIAL_JOB_FILTERS: JobSearchFilters = {
  title: "",
  jobFunctions: [],
};

export interface JobViewport {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
}

/** A camera target produced by the location search. */
export interface MapTarget {
  center: [number, number];
  zoom: number;
  bbox?: [number, number, number, number];
  /** Changes on every search so selecting the same place twice still flies. */
  nonce: number;
}

export interface Job {
  id: string;
  company: string;
  title: string;
  location_label: string;
  coords: [number, number];
  status?: JobStatus;
  salary: string;
  workType: WorkType;
  description?: string;
  initials?: string;
  color?: string;
  application_url?: string;
  jobFunction?: string;
  industry?: string;
  jobType?: string;
  experienceLevel?: string;
}
