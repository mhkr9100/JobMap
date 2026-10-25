export type {
  Job,
  JobSearchFilters,
  JobSort,
  JobStatus,
  StatusFilter,
  WorkType,
  JobTypeOption,
  ExperienceLevelOption,
  DatePostedOption,
  RoleTypeOption,
  CompanyStageOption,
} from "@/types";

import type {
  Job,
  JobSearchFilters,
  JobSort,
  StatusFilter,
  CompanyStageOption,
} from "@/types";

export const sampleJobs: Job[] = [
  {
    id: "linear",
    company: "Linear",
    title: "Senior Product Designer",
    location_label: "San Francisco, CA",
    coords: [-122.4194, 37.7749],
    status: "Available",
    salary: "$160k–$200k",
    workType: "Hybrid",
    initials: "L",
    color: "violet",
    addedOrder: 12,
    application_url: "https://linear.app/careers",
    description:
      "Shape thoughtful, beautifully crafted tools that help product teams do their best work. Collaborate with engineering and product to turn complex workflows into simple experiences.",
  },
  {
    id: "notion",
    company: "Notion",
    title: "Frontend Engineer",
    location_label: "New York, NY",
    coords: [-74.006, 40.7128],
    status: "Available",
    salary: "$150k–$190k",
    workType: "Hybrid",
    initials: "N",
    color: "paper",
    addedOrder: 11,
    application_url: "https://www.notion.so/careers",
    description:
      "Build flexible, accessible interfaces that bring notes, knowledge, and projects together. Work across product and engineering to create a connected workspace.",
  },
  {
    id: "vercel",
    company: "Vercel",
    title: "Design Engineer",
    location_label: "Remote",
    coords: [-74.006, 40.7128],
    status: "Available",
    salary: "$170k–$210k",
    workType: "Remote",
    initials: "V",
    color: "paper",
    addedOrder: 10,
    application_url: "https://vercel.com/careers",
    description:
      "Work at the intersection of design and engineering to create delightful developer experiences. Prototype interactions, refine design systems, and bring polished interfaces to production.",
  },
  {
    id: "figma",
    company: "Figma",
    title: "Product Designer",
    location_label: "San Francisco, CA",
    coords: [-122.4313, 37.7739],
    status: "Available",
    salary: "$145k–$185k",
    workType: "Hybrid",
    initials: "F",
    color: "coral",
    addedOrder: 9,
    application_url: "https://www.figma.com/careers",
    description:
      "Help make design accessible and collaborative. Partner with multidisciplinary teams to explore new ideas and create intuitive tools for designers around the world.",
  },
  {
    id: "stripe",
    company: "Stripe",
    title: "Software Engineer",
    location_label: "San Francisco, CA",
    coords: [-122.403, 37.7895],
    status: "Available",
    salary: "$170k–$220k",
    workType: "Hybrid",
    initials: "S",
    color: "violet",
    addedOrder: 8,
    application_url: "https://stripe.com/jobs",
    description:
      "Create dependable, intuitive tools for internet businesses. Solve complex engineering problems and help make financial infrastructure easier to use.",
  },
  {
    id: "airbnb",
    company: "Airbnb",
    title: "Senior UX Researcher",
    location_label: "Remote",
    coords: [-122.4194, 37.7749],
    status: "Available",
    salary: "$140k–$180k",
    workType: "Remote",
    initials: "A",
    color: "coral",
    addedOrder: 7,
    application_url: "https://careers.airbnb.com",
    description:
      "Understand the people behind memorable travel experiences. Bring qualitative and quantitative insights into product decisions across a global marketplace.",
  },
  {
    id: "spotify",
    company: "Spotify",
    title: "Product Design Lead",
    location_label: "New York, NY",
    coords: [-73.9887, 40.7484],
    status: "Available",
    salary: "$180k–$230k",
    workType: "Hybrid",
    initials: "S",
    color: "mint",
    addedOrder: 6,
    application_url: "https://www.lifeatspotify.com",
    description:
      "Lead the design of meaningful listening experiences. Connect user insights, creative exploration, and product strategy across a collaborative team.",
  },
  {
    id: "wise",
    company: "Wise",
    title: "Frontend Developer",
    location_label: "London, UK",
    coords: [-0.1276, 51.5074],
    status: "Available",
    salary: "£80k–£110k",
    workType: "Hybrid",
    initials: "W",
    color: "mint",
    addedOrder: 5,
    application_url: "https://wise.jobs",
    description:
      "Make international money movement feel local. Build accessible, high-performance web experiences with a focus on clarity and customer trust.",
  },
  {
    id: "ramp",
    company: "Ramp",
    title: "Brand Designer",
    location_label: "New York, NY",
    coords: [-74.0099, 40.706],
    status: "Available",
    salary: "$130k–$170k",
    workType: "On-site",
    initials: "R",
    color: "mint",
    addedOrder: 4,
    application_url: "https://ramp.com/careers",
    description:
      "Translate a growing brand into cohesive digital experiences. Collaborate on campaigns, websites, and visual systems that connect with ambitious teams.",
  },
  {
    id: "webflow",
    company: "Webflow",
    title: "Senior Frontend Engineer",
    location_label: "Remote",
    coords: [-122.4194, 37.7749],
    status: "Available",
    salary: "$160k–$205k",
    workType: "Remote",
    initials: "W",
    color: "blue",
    addedOrder: 3,
    application_url: "https://webflow.com/careers",
    description:
      "Empower people to build for the web. Develop powerful visual tools and reliable frontend systems for a collaborative website platform.",
  },
  {
    id: "intercom",
    company: "Intercom",
    title: "Product Designer",
    location_label: "London, UK",
    coords: [-0.1419, 51.5155],
    status: "Available",
    salary: "£85k–£115k",
    workType: "Hybrid",
    initials: "I",
    color: "blue",
    addedOrder: 2,
    application_url: "https://www.intercom.com/careers",
    description:
      "Make customer support more personal and effective. Explore complex service workflows and deliver considered, approachable product experiences.",
  },
  {
    id: "loom",
    company: "Loom",
    title: "UX Engineer",
    location_label: "Remote",
    coords: [-122.4194, 37.7749],
    status: "Available",
    salary: "$145k–$185k",
    workType: "Remote",
    initials: "L",
    color: "violet",
    addedOrder: 1,
    application_url: "https://www.loom.com/careers",
    description:
      "Help teams communicate more naturally through video. Bring prototypes and design systems to life with thoughtful interaction and frontend engineering.",
  },
];

export type WorkTypeFilter = "All" | "Remote" | "Hybrid" | "On-site";

export interface JobFilters {
  query: string;
  location: string;
  workType: WorkTypeFilter;
  sort: JobSort;
}

export function getJobApplicationLink(job: Job): string {
  if (job.application_url) return job.application_url;
  const domainMap: Record<string, string> = {
    linear: "https://linear.app/careers",
    notion: "https://www.notion.so/careers",
    vercel: "https://vercel.com/careers",
    figma: "https://www.figma.com/careers",
    stripe: "https://stripe.com/jobs",
    airbnb: "https://careers.airbnb.com",
    spotify: "https://www.lifeatspotify.com",
    wise: "https://wise.jobs",
    ramp: "https://ramp.com/careers",
    webflow: "https://webflow.com/careers",
    intercom: "https://www.intercom.com/careers",
    loom: "https://www.loom.com/careers",
  };
  const key = job.company.toLowerCase().trim();
  if (domainMap[key]) return domainMap[key];
  return `https://www.google.com/search?q=${encodeURIComponent(job.company + " " + job.title + " careers apply")}`;
}

export function getVisibleJobs(jobs: Job[], filters: JobFilters): Job[] {
  const query = filters.query.trim().toLowerCase();
  return jobs
    .filter(
      (job) =>
        (filters.workType === "All" || job.workType === filters.workType) &&
        (filters.location === "All locations" ||
          job.location_label === filters.location) &&
        `${job.company} ${job.title} ${job.location_label}`
          .toLowerCase()
          .includes(query),
    )
    .sort((a, b) => {
      if (filters.sort === "company") return a.company.localeCompare(b.company);
      if (filters.sort === "role") return a.title.localeCompare(b.title);
      return (b.addedOrder ?? 0) - (a.addedOrder ?? 0);
    });
}

export function normalizeJobStatus(status: unknown): Job["status"] {
  const value = String(status ?? "").toLowerCase();
  if (value === "applied") return "Applied";
  if (value === "interview") return "Interview";
  if (value === "rejected") return "Rejected";
  return "Available";
}

function extractCoordinates(row: Record<string, unknown>): {
  longitude: number | null;
  latitude: number | null;
} {
  if (
    Array.isArray(row.coords) &&
    typeof row.coords[0] === "number" &&
    typeof row.coords[1] === "number"
  ) {
    return { longitude: row.coords[0], latitude: row.coords[1] };
  }

  if (typeof row.longitude === "number" && typeof row.latitude === "number") {
    return { longitude: row.longitude, latitude: row.latitude };
  }

  const loc = row.location;
  if (typeof loc === "string") {
    const match = loc.match(/POINT\(([-+]?\d*\.?\d+)\s+([-+]?\d*\.?\d+)\)/i);
    if (match) {
      return {
        longitude: parseFloat(match[1]),
        latitude: parseFloat(match[2]),
      };
    }
  } else if (
    loc &&
    typeof loc === "object" &&
    "coordinates" in loc &&
    Array.isArray((loc as { coordinates: unknown }).coordinates)
  ) {
    const [longitude, latitude] = (loc as { coordinates: number[] })
      .coordinates;
    return {
      longitude: typeof longitude === "number" ? longitude : null,
      latitude: typeof latitude === "number" ? latitude : null,
    };
  }

  return { longitude: null, latitude: null };
}

function humanLocation(row: Record<string, unknown>): string {
  const loc = row.location;
  if (typeof loc === "string" && !loc.toUpperCase().startsWith("POINT")) {
    return loc;
  }
  if (typeof row.city === "string" && row.city) return row.city;
  if (typeof row.location_label === "string" && row.location_label) {
    return row.location_label;
  }
  return "Unknown location";
}

export function mapSupabaseJob(
  row: Record<string, unknown>,
  index: number,
): Job {
  const company = String(row.company ?? "Unknown");
  const title = String(row.title ?? "Open role");
  const description = String(row.description ?? "");
  const { longitude, latitude } = extractCoordinates(row);
  const workTypeRaw = String(row.workType ?? row.worktype ?? row.work_type ?? "Hybrid");
  const workType =
    workTypeRaw === "Remote" || workTypeRaw === "On-site"
      ? workTypeRaw
      : "Hybrid";

  const salaryMin = typeof row.salary_min === "number" ? row.salary_min : undefined;
  const salaryMax = typeof row.salary_max === "number" ? row.salary_max : undefined;
  const descLower = description.toLowerCase();
  const titleLower = title.toLowerCase();

  const h1bSponsorship =
    typeof row.h1b_sponsorship === "boolean"
      ? row.h1b_sponsorship
      : descLower.includes("h-1b") ||
        descLower.includes("h1b") ||
        descLower.includes("visa sponsorship");

  const h1bSponsorLikely =
    h1bSponsorship ||
    ["google", "meta", "microsoft", "amazon", "apple", "salesforce", "stripe", "uber"].some(
      (tech) => company.toLowerCase().includes(tech),
    ) ||
    descLower.includes("sponsor");

  const requiresSecurityClearance =
    descLower.includes("security clearance") ||
    descLower.includes("polygraph") ||
    descLower.includes("ts/sci") ||
    descLower.includes("secret clearance");

  const usCitizenOnly =
    descLower.includes("us citizen only") ||
    descLower.includes("u.s. citizen only") ||
    descLower.includes("citizenship required") ||
    descLower.includes("us citizenship");

  const roleType = /manager|director|lead|head of|vp|chief|supervisor/i.test(title)
    ? "Manager"
    : "IC";

  const stages: CompanyStageOption[] = ["Early", "Growth", "Late", "Public"];
  const stage = (typeof row.company_stage === "string"
    ? row.company_stage
    : stages[Math.abs((company.length + index) % 4)]) as CompanyStageOption;

  const isStaffingAgency =
    Boolean(row.is_staffing_agency) ||
    /staffing|recruiting|talent|solutions|apex systems|robert half|teksystems|aerotek|cybercoders|insight global/i.test(
      company + " " + title,
    );

  const createdAt = row.created_at ? new Date(String(row.created_at)).getTime() : 0;
  const postedDaysAgo = createdAt > 0
    ? Math.max(0, Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24)))
    : (index % 14) + 1;

  return {
    id: String(row.id ?? index),
    company,
    title,
    location_label: humanLocation(row),
    coords: [longitude ?? 0, latitude ?? 0],
    status: normalizeJobStatus(row.status),
    salary: String(row.salary ?? ""),
    workType,
    description,
    initials: company.slice(0, 1).toUpperCase(),
    color: "paper",
    addedOrder:
      typeof row.addedOrder === "number" ? row.addedOrder : index + 1,
    application_url:
      typeof row.application_url === "string" ? row.application_url : undefined,
    industry: typeof row.industry === "string" ? row.industry : undefined,
    jobFunction:
      typeof row.job_function === "string" ? row.job_function : undefined,
    jobType: typeof row.job_type === "string" ? (row.job_type as Job["jobType"]) : undefined,
    experienceLevel:
      typeof row.experience_level === "string"
        ? (row.experience_level as Job["experienceLevel"])
        : undefined,
    salaryNum: salaryMin ?? salaryMax,
    salaryMin,
    salaryMax,
    h1bSponsorship,
    h1bSponsorLikely,
    requiresSecurityClearance,
    usCitizenOnly,
    roleType,
    companyStage: stage,
    isStaffingAgency,
    turboExclusive: Boolean(row.turbo_exclusive ?? (index % 5 === 0)),
    hiddenJob: Boolean(row.hidden_job ?? (index % 7 === 0)),
    postedDaysAgo,
  };
}

export function filterJobs(jobs: Job[], filters: JobSearchFilters): Job[] {
  const query = filters.query.trim().toLowerCase();
  const excludedTitle = filters.excludedTitle.trim().toLowerCase();
  const requiredExp = filters.requiredExperience.trim();
  const reqExpNum = requiredExp ? parseInt(requiredExp, 10) : NaN;
  const excludedIndustry = filters.excludedIndustry.trim().toLowerCase();
  const skill = filters.skill.trim().toLowerCase();
  const excludedSkill = filters.excludedSkill.trim().toLowerCase();
  const companyName = filters.companyName.trim().toLowerCase();

  return jobs.filter((job) => {
    // 0. General text search query
    if (query) {
      const match =
        job.title.toLowerCase().includes(query) ||
        job.company.toLowerCase().includes(query) ||
        job.location_label.toLowerCase().includes(query) ||
        (job.description && job.description.toLowerCase().includes(query));
      if (!match) return false;
    }

    // 1. Basic Criteria
    if (filters.jobFunction && filters.jobFunction !== "All") {
      const target = filters.jobFunction.toLowerCase();
      const fn = (job.jobFunction ?? "").toLowerCase();
      const title = job.title.toLowerCase();
      const ind = (job.industry ?? "").toLowerCase();
      if (!fn.includes(target) && !title.includes(target) && !ind.includes(target)) {
        return false;
      }
    }

    if (excludedTitle && job.title.toLowerCase().includes(excludedTitle)) {
      return false;
    }

    if (filters.jobTypes.length > 0) {
      if (!job.jobType || !filters.jobTypes.includes(job.jobType)) {
        return false;
      }
    }

    // 2. Work Model
    if (filters.workModels.length > 0) {
      if (!filters.workModels.includes(job.workType)) {
        return false;
      }
    }

    // 3. Experience
    if (filters.experienceLevels.length > 0) {
      if (!job.experienceLevel || !filters.experienceLevels.includes(job.experienceLevel)) {
        return false;
      }
    }

    if (!Number.isNaN(reqExpNum)) {
      if (job.requiredExperienceYears != null && job.requiredExperienceYears > reqExpNum) {
        return false;
      }
    }

    // 4. Recency
    if (filters.datePosted !== "all") {
      const days = job.postedDaysAgo ?? 0;
      if (filters.datePosted === "24h" && days > 1) return false;
      if (filters.datePosted === "3d" && days > 3) return false;
      if (filters.datePosted === "week" && days > 7) return false;
      if (filters.datePosted === "month" && days > 30) return false;
    }

    // 5. Sponsorship & Legal
    if (filters.minSalary != null) {
      const effectiveSalary = job.salaryMax ?? job.salaryNum ?? job.salaryMin ?? 0;
      if (effectiveSalary > 0 && effectiveSalary < filters.minSalary) {
        return false;
      }
    }

    if (filters.maxSalary != null) {
      const effectiveMin = job.salaryMin ?? job.salaryNum ?? 0;
      if (effectiveMin > 0 && effectiveMin > filters.maxSalary) {
        return false;
      }
    }

    if (filters.h1bSponsorship && !job.h1bSponsorship) {
      return false;
    }

    if (filters.h1bSponsorLikely && !job.h1bSponsorLikely && !job.h1bSponsorship) {
      return false;
    }

    if (filters.excludeSecurityClearance && job.requiresSecurityClearance) {
      return false;
    }

    if (filters.excludeUsCitizenOnly && job.usCitizenOnly) {
      return false;
    }

    // 6. Industry & Skills
    if (filters.industry && filters.industry !== "All") {
      const target = filters.industry.toLowerCase();
      const ind = (job.industry ?? "").toLowerCase();
      if (!ind.includes(target) && !job.title.toLowerCase().includes(target)) {
        return false;
      }
    }

    if (excludedIndustry) {
      const ind = (job.industry ?? "").toLowerCase();
      if (ind.includes(excludedIndustry)) return false;
    }

    if (skill) {
      const inSkills = job.skills?.some((s) => s.toLowerCase().includes(skill));
      const inDesc = job.description?.toLowerCase().includes(skill);
      const inTitle = job.title.toLowerCase().includes(skill);
      if (!inSkills && !inDesc && !inTitle) return false;
    }

    if (excludedSkill) {
      const inSkills = job.skills?.some((s) => s.toLowerCase().includes(excludedSkill));
      const inDesc = job.description?.toLowerCase().includes(excludedSkill);
      if (inSkills || inDesc) return false;
    }

    if (filters.roleType !== "All") {
      if (job.roleType !== filters.roleType) return false;
    }

    // 7. Company Insights
    if (companyName && !job.company.toLowerCase().includes(companyName)) {
      return false;
    }

    if (filters.companyStages.length > 0) {
      if (!job.companyStage || !filters.companyStages.includes(job.companyStage)) {
        return false;
      }
    }

    if (filters.excludeStaffingAgency && job.isStaffingAgency) {
      return false;
    }

    if (filters.excludeCompany && !job.isStaffingAgency) {
      return false;
    }

    if (filters.turboExclusive && !job.turboExclusive) {
      return false;
    }

    if (filters.hiddenJobs && !job.hiddenJob) {
      return false;
    }

    return true;
  });
}
