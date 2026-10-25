"use client";

import { useRef, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronRight,
  Compass,
  LayoutList,
  Map,
  Menu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { JobSidebar } from "@/components/jobmap/job-sidebar";
import { MapWorkspace } from "@/components/jobmap/map-workspace";
import { JobDetails } from "@/components/jobmap/job-details";
import {
  getVisibleJobs,
  sampleJobs,
  type Job,
  type JobFilters,
} from "@/lib/jobs";
import { cn } from "@/lib/utils";

const initialFilters: JobFilters = {
  query: "",
  status: "All",
  location: "All locations",
  sort: "newest",
};

export function JobTracker({ jobs = sampleJobs }: { jobs?: Job[] }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [view, setView] = useState<"map" | "list">("map");
  const [filters, setFilters] = useState<JobFilters>(initialFilters);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLButtonElement>(null);
  const visibleJobs = getVisibleJobs(jobs, filters);

  function updateFilter<K extends keyof JobFilters>(
    key: K,
    value: JobFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function selectJob(job: Job) {
    previousFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSelectedJob(job);
  }

  const sidebarProps = {
    jobs: visibleJobs,
    allJobs: jobs,
    query: filters.query,
    status: filters.status,
    sort: filters.sort,
    onQueryChange: (query: string) => updateFilter("query", query),
    onStatusChange: (status: JobFilters["status"]) =>
      updateFilter("status", status),
    onSortChange: (sort: JobFilters["sort"]) => updateFilter("sort", sort),
    onReset: () => setFilters(initialFilters),
    onSelect: selectJob,
  };

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-background">
      <a
        href="#workspace"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-card p-3 text-sm shadow-lg focus:not-sr-only"
      >
        Skip to workspace
      </a>
      <aside
        aria-label="Job sidebar"
        className={cn(
          "sidebar-theme hidden h-full shrink-0 border-r border-border bg-background text-foreground transition-[width] duration-300 md:block",
          collapsed ? "w-19" : "w-83 xl:w-90",
        )}
      >
        <JobSidebar
          {...sidebarProps}
          collapsed={collapsed}
          onToggle={() => setCollapsed(!collapsed)}
        />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-19 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/70 px-5 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button
                  ref={menuRef}
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label="Open job sidebar"
                >
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                showCloseButton={false}
                className="sidebar-theme w-[min(360px,calc(100%-24px))] gap-0 bg-background p-0 text-foreground"
              >
                <SheetHeader className="sr-only">
                  <SheetTitle>Your job opportunities</SheetTitle>
                  <SheetDescription>
                    Search and filter your job opportunities.
                  </SheetDescription>
                </SheetHeader>
                <JobSidebar
                  {...sidebarProps}
                  mobile
                  onToggle={() => setMobileOpen(false)}
                />
              </SheetContent>
            </Sheet>
            <span className="hidden rounded-lg border border-border p-1.5 text-muted-foreground sm:inline-flex">
              <BriefcaseBusiness
                aria-hidden="true"
                className="size-3.5"
                strokeWidth={1.6}
              />
            </span>
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-3 text-[11px]"
            >
              <span className="hidden text-muted-foreground sm:inline">
                Workspace
              </span>
              <ChevronRight
                aria-hidden="true"
                className="hidden size-3 text-muted-foreground sm:block"
              />
              <span className="font-medium">Job explorer</span>
            </nav>
          </div>
          <div className="flex items-center gap-3.5">
            <span className="hidden text-[11px] text-muted-foreground lg:block">
              A space for your next chapter
            </span>
            <span
              aria-label="Personal workspace"
              className="flex size-8 items-center justify-center rounded-full border border-primary/10 bg-primary/8 text-[10px] font-semibold text-primary"
            >
              JM
            </span>
          </div>
        </header>
        <main
          id="workspace"
          tabIndex={-1}
          className="flex min-h-0 flex-1 flex-col gap-5 px-4 pb-4 pt-6 outline-none sm:px-6 lg:gap-6 lg:px-8 lg:pt-8"
        >
          <div className="animate-enter flex shrink-0 flex-wrap items-center justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[9px] font-medium uppercase tracking-[0.16em] text-primary">
                <Compass aria-hidden="true" className="size-3" />
                Your next chapter
              </div>
              <h1 className="text-[25px] font-semibold leading-tight tracking-[-0.045em] lg:text-[30px]">
                Your opportunities, mapped.
              </h1>
              <p className="text-xs leading-relaxed text-muted-foreground">
                A clearer view of where your career could go.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-muted p-1">
              <ToggleGroup
                type="single"
                variant="view"
                spacing={1}
                value={view}
                onValueChange={(value) => {
                  if (value === "map" || value === "list") setView(value);
                }}
                aria-label="Workspace view"
              >
                <ToggleGroupItem
                  value="map"
                  aria-label="Map view"
                  className="gap-1.5 px-3"
                >
                  <Map aria-hidden="true" />
                  Map
                </ToggleGroupItem>
                <ToggleGroupItem
                  value="list"
                  aria-label="List view"
                  className="gap-1.5 px-3"
                >
                  <LayoutList aria-hidden="true" />
                  List
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
          </div>
          <MapWorkspace
            view={view}
            jobs={visibleJobs}
            allJobs={jobs}
            location={filters.location}
            onLocationChange={(location) => updateFilter("location", location)}
            onSelect={selectJob}
            onReset={() => setFilters(initialFilters)}
          />
          <footer className="flex shrink-0 items-center justify-between gap-3 px-0.5 text-[9px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-1 rounded-full bg-primary" />
              Sample workspace
              <span className="hidden sm:inline"> · Real possibilities.</span>
            </span>
            <div
              aria-label="Job status legend"
              className="flex items-center gap-3.5"
            >
              {[
                { label: "Available", color: "bg-available" },
                { label: "Applied", color: "bg-applied" },
                { label: "Interview", color: "bg-interview" },
              ].map(({ label, color }) => (
                <span key={label} className="flex items-center gap-1.5">
                  <span className={cn("size-1.5 rounded-full", color)} />
                  {label}
                </span>
              ))}
            </div>
          </footer>
        </main>
      </div>
      <JobDetails
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onRestoreFocus={() => {
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
          else menuRef.current?.focus();
        }}
      />
    </div>
  );
}
