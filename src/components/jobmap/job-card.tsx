import { ArrowUpRight, MapPin } from "lucide-react";
import type { Job } from "@/types";
import { cn } from "@/lib/utils";

const companyColors: Record<string, string> = {
  violet: "bg-[#635bd5] text-white",
  paper: "bg-[#f1f2f4] text-[#182032]",
  coral: "bg-[#e77e73] text-[#301a1a]",
  mint: "bg-[#bce5bc] text-[#253c2b]",
  blue: "bg-[#5184dc] text-white",
};

export function WorkTypeBadge({ workType }: { workType: Job["workType"] }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/80 bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-secondary-foreground">
      {workType}
    </span>
  );
}

export function CompanyMark({
  job,
  large = false,
}: {
  job: Job;
  large?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl text-lg font-bold tracking-tighter",
        companyColors[job.color ?? "paper"] ?? companyColors.paper,
        large ? "size-14 text-2xl" : "size-10",
      )}
    >
      {job.initials ?? job.company.slice(0, 1).toUpperCase()}
    </span>
  );
}

export interface JobCardProps {
  job: Job;
  onSelect: (job: Job) => void;
  selected?: boolean;
}

export function JobCard({
  job,
  onSelect,
  selected = false,
}: JobCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(job)}
      aria-label={`View ${job.title} at ${job.company}`}
      aria-current={selected ? "true" : undefined}
      data-selected={selected || undefined}
      className={cn(
        "group flex w-full flex-col gap-3 rounded-2xl border border-border/70 bg-card/90 p-3.5 text-left transition duration-200 hover:border-border hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        selected && "ring-2 ring-blue-500 bg-blue-50/80 dark:bg-blue-950/40 border-blue-500",
      )}
    >
      <span className="flex w-full items-center gap-3">
        <CompanyMark job={job} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold tracking-[0.01em] text-foreground">
            {job.company}
          </span>
          <span className="truncate text-xs text-muted-foreground">
            {job.title}
          </span>
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/55 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-foreground"
        />
      </span>
      <span className="flex items-center justify-between gap-2 border-t border-border/40 pt-2.5">
        <span className="flex items-center gap-2">
          <WorkTypeBadge workType={job.workType} />
          {job.salary && (
            <span className="text-[10px] font-medium text-foreground/80">
              {job.salary}
            </span>
          )}
        </span>
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{job.location_label}</span>
        </span>
      </span>
    </button>
  );
}
