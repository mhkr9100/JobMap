export type { Job, JobSearchFilters, JobStatus, WorkType } from "@/types";

import type { Job, JobSearchFilters } from "@/types";

const INACTIVE_STATUSES = new Set(["Inactive", "Expired", "Closed", "Rejected"]);

/** Job boards / ATS hosts — their domain is not the employer's domain. */
const JOB_BOARD_HOSTS = [
  "indeed.",
  "linkedin.",
  "glassdoor.",
  "ziprecruiter.",
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.",
  "workday.",
  "icims.",
  "smartrecruiters.",
  "jobvite.",
  "ashbyhq.",
  "remotive.",
  "google.",
  "monster.",
  "careerbuilder.",
  "simplyhired.",
  "usajobs.",
];

export function getJobApplicationLink(job: Job): string {
  if (job.application_url) return job.application_url;
  return `https://www.google.com/search?q=${encodeURIComponent(
    `${job.company} ${job.title} careers apply`,
  )}`;
}

/** Best-effort employer domain used for the logo on map pins. */
export function guessCompanyDomain(company: string, applicationUrl?: string): string {
  if (applicationUrl) {
    try {
      const host = new URL(applicationUrl).hostname.replace(/^www\./, "");
      if (!JOB_BOARD_HOSTS.some((board) => host.includes(board))) {
        const parts = host.split(".");
        return parts.slice(-2).join(".");
      }
    } catch {
      // fall through to name-based guess
    }
  }
  const slug = company
    .toLowerCase()
    .replace(/\b(inc|llc|ltd|corp|corporation|co|company|group|the|of|and)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
  return slug ? `${slug}.com` : "";
}

/** Logo URL (DuckDuckGo icon service returns 404 for unknown → initials fallback). */
export function companyLogoUrl(company: string, applicationUrl?: string): string | null {
  const domain = guessCompanyDomain(company, applicationUrl);
  return domain ? `https://icons.duckduckgo.com/ip3/${domain}.ico` : null;
}

export function normalizeJobStatus(status: unknown): Job["status"] {
  const value = String(status ?? "").toLowerCase();
  if (value === "applied") return "Applied";
  if (value === "interview") return "Interview";
  if (value === "rejected") return "Rejected";
  if (value === "inactive") return "Inactive";
  if (value === "expired") return "Expired";
  if (value === "closed") return "Closed";
  return "Available";
}

function extractCoordinates(row: Record<string, unknown>): [number, number] | null {
  if (
    Array.isArray(row.coords) &&
    typeof row.coords[0] === "number" &&
    typeof row.coords[1] === "number"
  ) {
    return [row.coords[0], row.coords[1]];
  }
  const loc = row.location;
  if (typeof loc === "string") {
    const match = loc.match(/POINT\(([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\)/i);
    if (match) return [parseFloat(match[1]), parseFloat(match[2])];
  } else if (loc && typeof loc === "object" && "coordinates" in loc) {
    const coordinates = (loc as { coordinates: unknown }).coordinates;
    if (
      Array.isArray(coordinates) &&
      typeof coordinates[0] === "number" &&
      typeof coordinates[1] === "number"
    ) {
      return [coordinates[0], coordinates[1]];
    }
  }
  return null;
}

export function mapSupabaseJob(row: Record<string, unknown>, index: number): Job | null {
  const coords = extractCoordinates(row);
  if (!coords) return null;

  const company = String(row.company ?? "Unknown").trim();
  const workTypeRaw = String(row.workType ?? row.worktype ?? row.work_type ?? "");
  const workType =
    workTypeRaw === "Remote" || workTypeRaw === "On-site" ? workTypeRaw : "Hybrid";
  const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);

  return {
    id: String(row.id ?? index),
    company,
    title: String(row.title ?? "Open role").trim(),
    location_label: text(row.location_label) ?? "Unknown location",
    coords,
    status: normalizeJobStatus(row.status),
    salary: row.salary && row.salary !== "Not Listed" ? String(row.salary) : "",
    workType,
    description: text(row.description),
    initials: company.slice(0, 1).toUpperCase(),
    application_url: text(row.application_url),
    jobFunction: text(row.job_function),
    industry: text(row.industry),
    jobType: text(row.job_type),
    experienceLevel: text(row.experience_level),
  };
}

export function isActiveJob(job: Job): boolean {
  return !INACTIVE_STATUSES.has(job.status ?? "Available");
}

export function filterJobs(jobs: Job[], filters: JobSearchFilters): Job[] {
  const title = filters.title.trim().toLowerCase();
  const functions = new Set(filters.jobFunctions);
  return jobs.filter((job) => {
    if (!isActiveJob(job)) return false;
    if (title && !job.title.toLowerCase().includes(title)) return false;
    if (functions.size > 0 && !functions.has(job.jobFunction ?? "Other")) return false;
    return true;
  });
}

/** Distinct job functions A→Z with counts (respecting the title filter only). */
export function jobFunctionCounts(jobs: Job[], titleFilter: string): [string, number][] {
  const title = titleFilter.trim().toLowerCase();
  const counts = new Map<string, number>();
  for (const job of jobs) {
    if (!isActiveJob(job)) continue;
    if (title && !job.title.toLowerCase().includes(title)) continue;
    const fn = job.jobFunction ?? "Other";
    counts.set(fn, (counts.get(fn) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

export function isInViewport(
  job: Job,
  viewport: { minLng: number; minLat: number; maxLng: number; maxLat: number },
): boolean {
  const [lng, lat] = job.coords;
  return (
    lng >= viewport.minLng &&
    lng <= viewport.maxLng &&
    lat >= viewport.minLat &&
    lat <= viewport.maxLat
  );
}
