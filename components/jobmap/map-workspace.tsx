"use client";

import {
  ArrowUpRight,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Compass,
  Cuboid,
  Layers,
  Map,
  MapPin,
  MessageSquare,
  MoveUpRight,
} from "lucide-react";
import { JobCard } from "@/components/jobmap/job-card";
import { NoJobs } from "@/components/jobmap/job-sidebar";
import type { Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

interface MapWorkspaceProps {
  view: "map" | "list";
  jobs: Job[];
  allJobs: Job[];
  location: string;
  onLocationChange: (location: string) => void;
  onSelect: (job: Job) => void;
  onReset: () => void;
}

function SearchOverview({ jobs }: { jobs: Job[] }) {
  const metrics = [
    {
      label: "Opportunities",
      value: jobs.length,
      description: "Possibilities ahead",
      icon: BriefcaseBusiness,
      color: "text-available",
      background: "bg-available-subtle",
    },
    {
      label: "Applications sent",
      value: jobs.filter((job) => job.status === "Applied").length,
      description: "Steps in the right direction",
      icon: Check,
      color: "text-applied",
      background: "bg-applied-subtle",
    },
    {
      label: "Interviews",
      value: jobs.filter((job) => job.status === "Interview").length,
      description: "Conversations that count",
      icon: MessageSquare,
      color: "text-interview",
      background: "bg-interview-subtle",
    },
  ];
  return (
    <section
      aria-label="Your job search overview"
      className="grid w-full grid-cols-3 divide-x divide-border rounded-2xl border border-border bg-card p-4 shadow-[0_4px_18px_-12px_#243b3930] md:p-5"
    >
      {metrics.map(
        ({ label, value, description, icon: Icon, color, background }) => (
          <div
            key={label}
            className="flex min-w-0 flex-col gap-2 px-3 first:pl-0 last:pr-0 lg:px-5 xl:flex-row xl:items-center xl:gap-3.5"
          >
            <span
              className={cn(
                "hidden size-10 shrink-0 items-center justify-center rounded-xl sm:flex",
                color,
                background,
              )}
            >
              <Icon className="size-4" aria-hidden="true" strokeWidth={1.6} />
            </span>
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[9px] text-muted-foreground sm:text-[11px]">
                {label}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-semibold leading-none tracking-tight">
                  {value.toString().padStart(2, "0")}
                </span>
                {value > 0 && (
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-3.5 text-applied"
                  />
                )}
              </div>
              <p className="mt-1 hidden truncate text-[9px] text-muted-foreground lg:block">
                {description}
              </p>
            </div>
          </div>
        ),
      )}
    </section>
  );
}

export function MapWorkspace({
  view,
  jobs,
  allJobs,
  location,
  onLocationChange,
  onSelect,
  onReset,
}: MapWorkspaceProps) {
  const locations = [...new Set(allJobs.map((job) => job.location))].sort();
  return (
    <section
      aria-label={
        view === "map" ? "Opportunity map preview" : "Opportunity list"
      }
      className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-map"
    >
      {view === "map" && (
        <div
          aria-hidden="true"
          className="map-grid pointer-events-none absolute inset-0"
        />
      )}
      <div className="relative flex shrink-0 items-center justify-between gap-3 p-4 lg:p-6">
        <div className="relative flex items-center rounded-xl border border-border bg-card shadow-xs">
          <MapPin
            aria-hidden="true"
            className="pointer-events-none absolute left-3 size-3.5 text-primary"
          />
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(event) => onLocationChange(event.target.value)}
            className="max-w-48 cursor-pointer appearance-none rounded-xl bg-transparent py-3 pl-9 pr-8 text-[11px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option>All locations</option>
            {locations.map((place) => (
              <option key={place}>{place}</option>
            ))}
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-3 size-3 text-muted-foreground"
          />
        </div>
        <span className="flex items-center gap-2 rounded-lg border border-border bg-card/70 px-2.5 py-2 text-[10px] text-muted-foreground">
          <Cuboid aria-hidden="true" className="size-3.5" />
          {view === "map" ? "3D workspace" : `${jobs.length} opportunities`}
        </span>
      </div>
      {view === "map" ? (
        <>
          <div className="relative flex min-h-52 flex-1 flex-col items-center justify-center px-5 pb-8 text-center">
            <div aria-hidden="true" className="relative mb-8">
              <div className="absolute -inset-6 rounded-full border border-map-grid/35" />
              <div className="absolute -inset-12 rounded-full border border-map-grid/20" />
              <div className="map-icon-shadow relative flex size-21 -rotate-6 items-center justify-center rounded-3xl border border-white bg-card text-primary/80">
                <Map className="size-10" strokeWidth={1.2} />
              </div>
              <span className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full border-3 border-map bg-primary text-primary-foreground">
                <MapPin className="size-3" strokeWidth={2} />
              </span>
            </div>
            <h2 className="text-[23px] font-semibold tracking-tight text-foreground/85">
              Map Loading<span className="text-primary">...</span>
            </h2>
            <p className="mt-2.5 max-w-64 text-xs leading-relaxed text-muted-foreground">
              Your opportunities will come to life here.
              <br />
              For now, explore the jobs in your list.
            </p>
            <div className="mt-6 flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary/60" />A new
              perspective is coming
            </div>
          </div>
          <div className="relative flex shrink-0 flex-col gap-4 px-4 pb-4 lg:px-6 lg:pb-5">
            <SearchOverview jobs={allJobs} />
            <div className="flex items-center justify-between gap-3 px-1 text-[9px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Layers aria-hidden="true" className="size-3" />
                3D map preview · Coming soon
              </span>
              <span className="hidden items-center gap-1.5 sm:flex">
                <Compass aria-hidden="true" className="size-3" />
                Made for your next move
              </span>
            </div>
          </div>
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 lg:px-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold">
                A world of possibilities
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Select an opportunity to take a closer look.
              </p>
            </div>
            <MoveUpRight
              aria-hidden="true"
              className="hidden size-5 text-muted-foreground sm:block"
            />
          </div>
          {jobs.length ? (
            <ul
              aria-label="Opportunity grid"
              className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3"
            >
              {jobs.map((job) => (
                <li key={job.id}>
                  <JobCard job={job} onSelect={onSelect} />
                </li>
              ))}
            </ul>
          ) : (
            <NoJobs onReset={onReset} />
          )}
        </div>
      )}
    </section>
  );
}
