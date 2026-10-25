export type JobStatus =
  | "Available"
  | "Applied"
  | "Interview"
  | "Rejected"
  | "Inactive"
  | "Expired"
  | "Closed";
export type StatusFilter = "All" | JobStatus;
export type JobSort = "newest" | "company" | "role";
export type WorkType = "Remote" | "Hybrid" | "On-site";

export type JobTypeOption = "Full-time" | "Contract" | "Part-time" | "Internship";
export type ExperienceLevelOption = "Intern" | "Entry" | "Mid" | "Senior" | "Lead" | "Director";
export type DatePostedOption = "all" | "24h" | "3d" | "week" | "month";
export type RoleTypeOption = "All" | "IC" | "Manager";
export type CompanyStageOption = "Early" | "Growth" | "Late" | "Public";

export interface JobSearchFilters {
  query: string;

  // 1. Basic Criteria
  jobFunction: string;
  excludedTitle: string;
  jobTypes: JobTypeOption[];

  // 2. Work Model
  workModels: WorkType[];

  // 3. Experience
  experienceLevels: ExperienceLevelOption[];
  requiredExperience: string;

  // 4. Recency
  datePosted: DatePostedOption;

  // 5. Sponsorship & Legal
  minSalary: number | null;
  maxSalary: number | null;
  h1bSponsorship: boolean;
  h1bSponsorLikely: boolean;
  excludeSecurityClearance: boolean;
  excludeUsCitizenOnly: boolean;

  // 6. Industry & Skills
  industry: string;
  excludedIndustry: string;
  skill: string;
  excludedSkill: string;
  roleType: RoleTypeOption;

  // 7. Company Insights
  companyName: string;
  companyStages: CompanyStageOption[];
  excludeStaffingAgency: boolean;
  excludeCompany: boolean;
  turboExclusive: boolean;
  hiddenJobs: boolean;
}

export const INITIAL_JOB_FILTERS: JobSearchFilters = {
  query: "",
  // 1. Basic Criteria
  jobFunction: "",
  excludedTitle: "",
  jobTypes: [],
  // 2. Work Model
  workModels: [],
  // 3. Experience
  experienceLevels: [],
  requiredExperience: "",
  // 4. Recency
  datePosted: "all",
  // 5. Sponsorship & Legal
  minSalary: null,
  maxSalary: null,
  h1bSponsorship: false,
  h1bSponsorLikely: false,
  excludeSecurityClearance: false,
  excludeUsCitizenOnly: false,
  // 6. Industry & Skills
  industry: "",
  excludedIndustry: "",
  skill: "",
  excludedSkill: "",
  roleType: "All",
  // 7. Company Insights
  companyName: "",
  companyStages: [],
  excludeStaffingAgency: false,
  excludeCompany: false,
  turboExclusive: false,
  hiddenJobs: false,
};

export interface JobViewport {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
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
  addedOrder?: number;
  application_url?: string;

  // Filter criteria
  jobFunction?: string;
  jobType?: JobTypeOption;
  experienceLevel?: ExperienceLevelOption;
  requiredExperienceYears?: number;
  postedDaysAgo?: number;
  salaryNum?: number;
  salaryMin?: number;
  salaryMax?: number;
  h1bSponsorship?: boolean;
  h1bSponsorLikely?: boolean;
  requiresSecurityClearance?: boolean;
  usCitizenOnly?: boolean;
  industry?: string;
  skills?: string[];
  roleType?: "IC" | "Manager";
  companyStage?: CompanyStageOption;
  isStaffingAgency?: boolean;
  turboExclusive?: boolean;
  hiddenJob?: boolean;
}
