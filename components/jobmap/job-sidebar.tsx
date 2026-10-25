"use client";

import {
  BriefcaseBusiness,
  ChevronDown,
  Compass,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  SearchX,
  Sparkles,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { JobCard } from "@/components/jobmap/job-card";
import type { Job, JobSort, StatusFilter } from "@/lib/jobs";

interface JobSidebarProps {
  jobs: Job[];
  allJobs: Job[];
  query: string;
  status: StatusFilter;
  sort: JobSort;
  collapsed?: boolean;
  mobile?: boolean;
  onQueryChange: (query: string) => void;
  onStatusChange: (status: StatusFilter) => void;
  onSortChange: (sort: JobSort) => void;
  onToggle: () => void;
  onReset: () => void;
  onSelect: (job: Job) => void;
}

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex shrink-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <BriefcaseBusiness
          aria-hidden="true"
          className="size-5"
          strokeWidth={1.8}
        />
      </span>
      {!compact && (
        <span className="flex items-center gap-2 text-[19px] font-semibold tracking-tight">
          JobMap{" "}
          <span className="rounded-md border border-primary/25 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium tracking-normal text-primary">
            3D
          </span>
        </span>
      )}
      {compact && <span className="sr-only">JobMap 3D</span>}
    </div>
  );
}

export function NoJobs({ onReset }: { onReset: () => void }) {
  return (
    <Empty className="px-4 py-12 md:px-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <SearchX aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>No matches just yet</EmptyTitle>
        <EmptyDescription>
          Try another company, role, or location. Your next opportunity might be
          one search away.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button size="sm" variant="secondary" onClick={onReset}>
          Clear all filters
        </Button>
      </EmptyContent>
    </Empty>
  );
}

export function JobSidebar({
  jobs,
  allJobs,
  query,
  status,
  sort,
  collapsed,
  mobile,
  onQueryChange,
  onStatusChange,
  onSortChange,
  onToggle,
  onReset,
  onSelect,
}: JobSidebarProps) {
  if (collapsed) {
    return (
      <div className="flex h-full flex-col items-center gap-7 py-6">
        <Brand compact />
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label="Expand job sidebar"
          title="Expand sidebar"
        >
          <PanelLeftOpen />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={onToggle}
          aria-label="Browse opportunities"
          title="Browse opportunities"
        >
          <BriefcaseBusiness />
        </Button>
        <span className="text-[11px] font-medium text-muted-foreground">
          {allJobs.length} jobs
        </span>
        <Compass
          aria-hidden="true"
          className="mt-auto size-5 text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-21 shrink-0 items-center justify-between px-6">
        <Brand />
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggle}
          aria-label={mobile ? "Close job sidebar" : "Collapse job sidebar"}
          title={mobile ? "Close sidebar" : "Collapse sidebar"}
        >
          {mobile ? <X /> : <PanelLeftClose />}
        </Button>
      </header>
      <section
        aria-label="Search and filter jobs"
        className="flex shrink-0 flex-col gap-5 px-6 pb-5 pt-4"
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h2 className="text-[15px] font-medium">Your opportunities</h2>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {allJobs.length}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            A new chapter starts with a possibility.
          </p>
        </div>
        <InputGroup className="h-11 rounded-xl">
          <InputGroupInput
            aria-label="Search jobs"
            placeholder="Search company, role, or location..."
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          {query && (
            <InputGroupAddon align="inline-end">
              <InputGroupButton
                aria-label="Clear search"
                size="icon-xs"
                onClick={() => onQueryChange("")}
              >
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          )}
        </InputGroup>
        <ToggleGroup
          type="single"
          variant="filter"
          value={status}
          onValueChange={(value) => {
            if (value) onStatusChange(value as StatusFilter);
          }}
          spacing={1}
          aria-label="Filter by job status"
          className="w-full justify-between"
        >
          <ToggleGroupItem value="All" className="flex-1 gap-1.5 px-2">
            All jobs{" "}
            <span className="text-[10px] opacity-65">{allJobs.length}</span>
          </ToggleGroupItem>
          <ToggleGroupItem value="Applied" className="flex-1 gap-1.5 px-2">
            Applied{" "}
            <span className="text-[10px] opacity-65">
              {allJobs.filter((job) => job.status === "Applied").length}
            </span>
          </ToggleGroupItem>
          <ToggleGroupItem value="Available" className="flex-1 gap-1.5 px-2">
            Available{" "}
            <span className="text-[10px] opacity-65">
              {allJobs.filter((job) => job.status === "Available").length}
            </span>
          </ToggleGroupItem>
        </ToggleGroup>
      </section>
      <div className="mx-6 flex shrink-0 items-center justify-between border-t border-border pb-3 pt-4">
        <span
          aria-live="polite"
          className="text-[9px] font-medium uppercase tracking-[0.13em] text-muted-foreground"
        >
          {jobs.length} {jobs.length === 1 ? "opportunity" : "opportunities"}
        </span>
        <div className="relative flex items-center">
          <select
            aria-label="Sort opportunities"
            value={sort}
            onChange={(event) => onSortChange(event.target.value as JobSort)}
            className="cursor-pointer appearance-none rounded-sm bg-transparent py-1 pr-4 text-[10px] text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="newest">Newest first</option>
            <option value="company">Company A–Z</option>
            <option value="role">Role A–Z</option>
          </select>
          <ChevronDown
            aria-hidden="true"
            className="pointer-events-none absolute right-0 size-3 text-muted-foreground"
          />
        </div>
      </div>
      <div className="job-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
        {jobs.length ? (
          <ul
            aria-label="Job opportunities"
            className="flex flex-col gap-2.5 p-1"
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
      <footer className="shrink-0 border-t border-border">
        <div className="flex items-start gap-2.5 px-6 py-4">
          <Sparkles
            aria-hidden="true"
            className="mt-0.5 size-3.5 shrink-0 text-primary"
          />
          <div className="flex flex-col gap-1">
            <p className="text-[11px] font-medium text-foreground/90">
              Big things start with small steps.
            </p>
            <p className="text-[10px] text-muted-foreground">
              Keep exploring. Your next move is out there.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-6 py-3.5 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-primary" />
            Personal workspace
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 text-[9px]">
            DEMO
          </span>
        </div>
      </footer>
    </div>
  );
}
