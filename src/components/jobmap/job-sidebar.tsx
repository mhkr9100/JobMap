"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import {
  Briefcase,
  Building,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  GraduationCap,
  Layers,
  RotateCcw,
  Search,
  ShieldAlert,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  JobSearchFilters,
  WorkType,
  JobTypeOption,
  ExperienceLevelOption,
  DatePostedOption,
  RoleTypeOption,
  CompanyStageOption,
} from "@/types";
import { INITIAL_JOB_FILTERS } from "@/types";

interface JobSidebarProps {
  filters: JobSearchFilters;
  setFilters: Dispatch<SetStateAction<JobSearchFilters>>;
}

const JOB_FUNCTIONS = [
  "All Functions",
  "Software",
  "Engineering",
  "Design",
  "Product",
  "Data",
  "Security",
  "Healthcare",
  "Sales",
  "Marketing",
  "Finance",
  "Customer Support",
  "Operations",
];

const JOB_TYPES: JobTypeOption[] = ["Full-time", "Contract", "Part-time", "Internship"];

const WORK_MODELS: WorkType[] = ["On-site", "Hybrid", "Remote"];

const EXPERIENCE_LEVELS: ExperienceLevelOption[] = [
  "Intern",
  "Entry",
  "Mid",
  "Senior",
  "Lead",
  "Director",
];

const DATE_POSTED_OPTIONS: { label: string; value: DatePostedOption }[] = [
  { label: "Anytime", value: "all" },
  { label: "Past 24h", value: "24h" },
  { label: "Past 3d", value: "3d" },
  { label: "Past Week", value: "week" },
  { label: "Past Month", value: "month" },
];

const INDUSTRIES = [
  "All Industries",
  "Software",
  "IT",
  "AI",
  "Finance",
  "Consulting",
  "Healthcare",
  "Retail",
  "Manufacturing",
];

const COMPANY_STAGES: CompanyStageOption[] = ["Early", "Growth", "Late", "Public"];

export default function JobSidebar({ filters, setFilters }: JobSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    basic: true,
    workModel: true,
    experience: false,
    recency: false,
    legal: false,
    industry: false,
    company: false,
  });

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  const updateFilter = <K extends keyof JobSearchFilters>(
    key: K,
    value: JobSearchFilters[K],
  ) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => {
    setFilters(INITIAL_JOB_FILTERS);
  };

  // Section-specific clear functions
  const clearBasic = () => {
    setFilters((prev) => ({
      ...prev,
      jobFunction: "",
      excludedTitle: "",
      jobTypes: [],
    }));
  };

  const clearWorkModel = () => {
    setFilters((prev) => ({
      ...prev,
      workModels: [],
    }));
  };

  const clearExperience = () => {
    setFilters((prev) => ({
      ...prev,
      experienceLevels: [],
      requiredExperience: "",
    }));
  };

  const clearRecency = () => {
    setFilters((prev) => ({
      ...prev,
      datePosted: "all",
    }));
  };

  const clearLegal = () => {
    setFilters((prev) => ({
      ...prev,
      minSalary: null,
      maxSalary: null,
      h1bSponsorship: false,
      h1bSponsorLikely: false,
      excludeSecurityClearance: false,
      excludeUsCitizenOnly: false,
    }));
  };

  const clearIndustry = () => {
    setFilters((prev) => ({
      ...prev,
      industry: "",
      excludedIndustry: "",
      skill: "",
      excludedSkill: "",
      roleType: "All",
    }));
  };

  const clearCompany = () => {
    setFilters((prev) => ({
      ...prev,
      companyName: "",
      companyStages: [],
      excludeStaffingAgency: false,
      excludeCompany: false,
      turboExclusive: false,
      hiddenJobs: false,
    }));
  };

  // Active filter counters for badges
  const basicCount =
    (filters.jobFunction && filters.jobFunction !== "All Functions" ? 1 : 0) +
    (filters.excludedTitle ? 1 : 0) +
    filters.jobTypes.length;

  const workModelCount = filters.workModels.length;

  const expCount =
    filters.experienceLevels.length + (filters.requiredExperience ? 1 : 0);

  const recencyCount = filters.datePosted !== "all" ? 1 : 0;

  const legalCount =
    (filters.minSalary ? 1 : 0) +
    (filters.h1bSponsorship ? 1 : 0) +
    (filters.h1bSponsorLikely ? 1 : 0) +
    (filters.excludeSecurityClearance ? 1 : 0) +
    (filters.excludeUsCitizenOnly ? 1 : 0);

  const industryCount =
    (filters.industry && filters.industry !== "All Industries" ? 1 : 0) +
    (filters.excludedIndustry ? 1 : 0) +
    (filters.skill ? 1 : 0) +
    (filters.excludedSkill ? 1 : 0) +
    (filters.roleType !== "All" ? 1 : 0);

  const companyCount =
    (filters.companyName ? 1 : 0) +
    filters.companyStages.length +
    (filters.excludeStaffingAgency ? 1 : 0) +
    (filters.excludeCompany ? 1 : 0) +
    (filters.turboExclusive ? 1 : 0) +
    (filters.hiddenJobs ? 1 : 0);

  const totalActive =
    (filters.query ? 1 : 0) +
    basicCount +
    workModelCount +
    expCount +
    recencyCount +
    legalCount +
    industryCount +
    companyCount;

  return (
    <div
      className={cn(
        "absolute left-6 top-6 z-20 transition-all duration-300 ease-in-out",
        isCollapsed ? "-translate-x-[380px]" : "translate-x-0",
      )}
    >
      <div className="flex max-h-[calc(100vh-48px)] w-88 md:w-92 flex-col rounded-3xl border border-white/30 bg-white/90 p-5 text-slate-900 shadow-2xl backdrop-blur-2xl dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-100">
        {/* Header with Title and Clear All */}
        <div className="flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <Briefcase className="size-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white">
                JobMap
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Interactive Global Discovery
              </p>
            </div>
          </div>
          {totalActive > 0 && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
            >
              <RotateCcw className="size-3" />
              Reset All
            </button>
          )}
        </div>

        {/* Global Keyword Search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => updateFilter("query", e.target.value)}
            placeholder="Search keywords, roles, tech…"
            className="w-full rounded-xl bg-slate-100/90 py-2 pl-9 pr-8 text-xs font-medium text-slate-900 placeholder-slate-400 outline-none transition focus:bg-white focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500 dark:focus:bg-slate-800"
          />
          {filters.query && (
            <button
              type="button"
              onClick={() => updateFilter("query", "")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Filter Categories */}
        <div className="job-scrollbar mt-3 flex-1 space-y-3.5 overflow-y-auto pr-1">
          {/* Section 1: Basic Criteria */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("basic")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Basic Criteria</span>
                {basicCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {basicCount}
                  </span>
                )}
                {openSections.basic ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {basicCount > 0 && (
                <button
                  type="button"
                  onClick={clearBasic}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.basic && (
              <div className="mt-3 space-y-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Job Function
                  </span>
                  <select
                    value={filters.jobFunction}
                    onChange={(e) => updateFilter("jobFunction", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {JOB_FUNCTIONS.map((fn) => (
                      <option key={fn} value={fn === "All Functions" ? "" : fn}>
                        {fn}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Excluded Title
                  </span>
                  <input
                    type="text"
                    value={filters.excludedTitle}
                    onChange={(e) => updateFilter("excludedTitle", e.target.value)}
                    placeholder="e.g. Intern, Manager"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>

                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Job Type
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {JOB_TYPES.map((type) => {
                      const active = filters.jobTypes.includes(type);
                      return (
                        <label
                          key={type}
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-xs transition",
                            active
                              ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={active}
                            onChange={(e) => {
                              const next = e.target.checked
                                ? [...filters.jobTypes, type]
                                : filters.jobTypes.filter((t) => t !== type);
                              updateFilter("jobTypes", next);
                            }}
                            className="hidden"
                          />
                          <CheckCircle2
                            className={cn(
                              "size-3",
                              active ? "text-blue-600 dark:text-blue-400" : "opacity-0",
                            )}
                          />
                          <span>{type}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Work Model */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("workModel")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Work Model</span>
                {workModelCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {workModelCount}
                  </span>
                )}
                {openSections.workModel ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {workModelCount > 0 && (
                <button
                  type="button"
                  onClick={clearWorkModel}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.workModel && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {WORK_MODELS.map((model) => {
                  const active = filters.workModels.includes(model);
                  const label =
                    model === "Remote" ? "Remote anywhere in US" : model;
                  return (
                    <button
                      key={model}
                      type="button"
                      onClick={() => {
                        const next = active
                          ? filters.workModels.filter((m) => m !== model)
                          : [...filters.workModels, model];
                        updateFilter("workModels", next);
                      }}
                      className={cn(
                        "rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                        active
                          ? "border-blue-500 bg-blue-600 text-white shadow-sm"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Experience */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("experience")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Experience</span>
                {expCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {expCount}
                  </span>
                )}
                {openSections.experience ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {expCount > 0 && (
                <button
                  type="button"
                  onClick={clearExperience}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.experience && (
              <div className="mt-2.5 space-y-2.5">
                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Experience Level
                  </span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {EXPERIENCE_LEVELS.map((level) => {
                      const active = filters.experienceLevels.includes(level);
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? filters.experienceLevels.filter((l) => l !== level)
                              : [...filters.experienceLevels, level];
                            updateFilter("experienceLevels", next);
                          }}
                          className={cn(
                            "rounded-lg border px-2 py-0.5 text-xs transition",
                            active
                              ? "border-blue-500 bg-blue-50 font-semibold text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {level}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Required Experience
                  </span>
                  <input
                    type="text"
                    value={filters.requiredExperience}
                    onChange={(e) => updateFilter("requiredExperience", e.target.value)}
                    placeholder="Max years (e.g. 3, 5)"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Section 4: Recency */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("recency")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Date Posted</span>
                {recencyCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {recencyCount}
                  </span>
                )}
                {openSections.recency ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {recencyCount > 0 && (
                <button
                  type="button"
                  onClick={clearRecency}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.recency && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {DATE_POSTED_OPTIONS.map((opt) => {
                  const active = filters.datePosted === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => updateFilter("datePosted", opt.value)}
                      className={cn(
                        "rounded-xl border px-2.5 py-1 text-xs font-medium transition",
                        active
                          ? "border-blue-500 bg-blue-600 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 5: Sponsorship & Legal */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("legal")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Sponsorship & Salary</span>
                {legalCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {legalCount}
                  </span>
                )}
                {openSections.legal ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {legalCount > 0 && (
                <button
                  type="button"
                  onClick={clearLegal}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.legal && (
              <div className="mt-2.5 space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Minimum Annual Salary ($)
                  </span>
                  <input
                    type="number"
                    step="10000"
                    min="0"
                    value={filters.minSalary ?? ""}
                    onChange={(e) =>
                      updateFilter(
                        "minSalary",
                        e.target.value ? Number(e.target.value) : null,
                      )
                    }
                    placeholder="e.g. 100000"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>

                <div className="space-y-1.5 border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Work Authorization
                  </span>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.h1bSponsorship}
                      onChange={(e) =>
                        updateFilter("h1bSponsorship", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>H1B Sponsorship Confirmed</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.h1bSponsorLikely}
                      onChange={(e) =>
                        updateFilter("h1bSponsorLikely", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>H1B Sponsor Likely</span>
                  </label>
                </div>

                <div className="space-y-1.5 border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Exclude Limitations
                  </span>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.excludeSecurityClearance}
                      onChange={(e) =>
                        updateFilter("excludeSecurityClearance", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude Security Clearance</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.excludeUsCitizenOnly}
                      onChange={(e) =>
                        updateFilter("excludeUsCitizenOnly", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude US Citizen Only</span>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Section 6: Industry & Skills */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("industry")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Industry & Skills</span>
                {industryCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {industryCount}
                  </span>
                )}
                {openSections.industry ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {industryCount > 0 && (
                <button
                  type="button"
                  onClick={clearIndustry}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.industry && (
              <div className="mt-2.5 space-y-2.5">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Industry
                  </span>
                  <select
                    value={filters.industry}
                    onChange={(e) => updateFilter("industry", e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white p-1.5 text-xs font-medium text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {INDUSTRIES.map((ind) => (
                      <option key={ind} value={ind === "All Industries" ? "" : ind}>
                        {ind}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Excluded Industry
                  </span>
                  <input
                    type="text"
                    value={filters.excludedIndustry}
                    onChange={(e) => updateFilter("excludedIndustry", e.target.value)}
                    placeholder="e.g. Defense, Crypto"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Skill
                    </span>
                    <input
                      type="text"
                      value={filters.skill}
                      onChange={(e) => updateFilter("skill", e.target.value)}
                      placeholder="e.g. React"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                      Excluded Skill
                    </span>
                    <input
                      type="text"
                      value={filters.excludedSkill}
                      onChange={(e) => updateFilter("excludedSkill", e.target.value)}
                      placeholder="e.g. PHP"
                      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    />
                  </label>
                </div>

                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Role Type
                  </span>
                  <div className="mt-1 flex gap-1.5">
                    {(["All", "IC", "Manager"] as RoleTypeOption[]).map((type) => {
                      const active = filters.roleType === type;
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => updateFilter("roleType", type)}
                          className={cn(
                            "flex-1 rounded-lg border py-1 text-xs font-medium transition",
                            active
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section 7: Company Insights */}
          <div className="rounded-2xl border border-slate-200/70 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => toggleSection("company")}
                className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
              >
                <span>Company Insights</span>
                {companyCount > 0 && (
                  <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white">
                    {companyCount}
                  </span>
                )}
                {openSections.company ? (
                  <ChevronUp className="size-3.5 text-slate-400" />
                ) : (
                  <ChevronDown className="size-3.5 text-slate-400" />
                )}
              </button>
              {companyCount > 0 && (
                <button
                  type="button"
                  onClick={clearCompany}
                  className="text-[10px] font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  Clear
                </button>
              )}
            </div>

            {openSections.company && (
              <div className="mt-2.5 space-y-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Company Name
                  </span>
                  <input
                    type="text"
                    value={filters.companyName}
                    onChange={(e) => updateFilter("companyName", e.target.value)}
                    placeholder="Search company…"
                    className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  />
                </label>

                <div>
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                    Company Stage
                  </span>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {COMPANY_STAGES.map((stage) => {
                      const active = filters.companyStages.includes(stage);
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => {
                            const next = active
                              ? filters.companyStages.filter((s) => s !== stage)
                              : [...filters.companyStages, stage];
                            updateFilter("companyStages", next);
                          }}
                          className={cn(
                            "rounded-lg border px-2 py-1 text-xs font-medium transition",
                            active
                              ? "border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/50 dark:text-blue-300 font-semibold"
                              : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300",
                          )}
                        >
                          {stage}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1.5 border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
                  <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                    Job Source
                  </span>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.excludeStaffingAgency}
                      onChange={(e) =>
                        updateFilter("excludeStaffingAgency", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude Staffing Agencies</span>
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={filters.excludeCompany}
                      onChange={(e) =>
                        updateFilter("excludeCompany", e.target.checked)
                      }
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>Exclude Direct Company</span>
                  </label>
                </div>

                <div className="space-y-2 border-t border-slate-200/50 pt-2 dark:border-slate-700/50">
                  <label className="flex cursor-pointer items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Sparkles className="size-3.5 text-amber-500" />
                      Turbo Exclusive
                    </span>
                    <input
                      type="checkbox"
                      checked={filters.turboExclusive}
                      onChange={(e) =>
                        updateFilter("turboExclusive", e.target.checked)
                      }
                      className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center justify-between text-xs text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Layers className="size-3.5 text-purple-500" />
                      Hidden Jobs
                    </span>
                    <input
                      type="checkbox"
                      checked={filters.hiddenJobs}
                      onChange={(e) =>
                        updateFilter("hiddenJobs", e.target.checked)
                      }
                      className="size-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating Toggle Pill Tab when Open or Collapsed */}
      <button
        type="button"
        onClick={() => setIsCollapsed((prev) => !prev)}
        className={cn(
          "group absolute transition-all duration-300 ease-in-out cursor-pointer",
          isCollapsed
            ? "left-[400px] top-0 flex items-center gap-2 rounded-full border border-white/40 bg-white/95 px-3.5 py-2 text-slate-800 shadow-2xl backdrop-blur-2xl hover:bg-blue-600 hover:text-white dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-100 dark:hover:bg-blue-600"
            : "-right-4 top-8 flex h-14 w-4 items-center justify-center rounded-r-xl border-y border-r border-white/40 bg-white/95 text-slate-400 shadow-lg backdrop-blur-xl hover:w-5 hover:bg-blue-600 hover:text-white dark:border-slate-700 dark:bg-slate-900/95 dark:hover:bg-blue-600",
        )}
        aria-label={isCollapsed ? "Open filters panel" : "Collapse filters panel"}
      >
        {isCollapsed ? (
          <>
            <Layers className="size-4 text-blue-500 group-hover:text-white" />
            <span className="text-xs font-bold tracking-tight">Filters</span>
            {totalActive > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white group-hover:bg-white group-hover:text-blue-600">
                {totalActive}
              </span>
            )}
          </>
        ) : (
          <ChevronLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
        )}
      </button>
    </div>
  );
}
