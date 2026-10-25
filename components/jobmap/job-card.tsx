import { ArrowUpRight, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Job, JobStatus } from "@/lib/jobs";
import { cn } from "@/lib/utils";

const companyColors: Record<string, string> = {
  violet: "bg-[#635bd5] text-white",
  paper: "bg-[#f1f2f4] text-[#182032]",
  coral: "bg-[#e77e73] text-[#301a1a]",
  mint: "bg-[#bce5bc] text-[#253c2b]",
  blue: "bg-[#5184dc] text-white",
};

const statusVariants = {
  Available: "available",
  Applied: "applied",
  Interview: "interview",
} as const;

export function StatusBadge({ status }: { status: JobStatus }) {
  return (
    <Badge variant={statusVariants[status]}>
      <span
        aria-hidden="true"
        className="mr-0.5 size-1 rounded-full bg-current"
      />
      {status}
    </Badge>
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
        companyColors[job.color] ?? companyColors.paper,
        large ? "size-14 text-2xl" : "size-10",
      )}
    >
      {job.initials}
    </span>
  );
}

export function JobCard({
  job,
  onSelect,
}: {
  job: Job;
  onSelect: (job: Job) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(job)}
      aria-label={`View ${job.title} at ${job.company}`}
      className="group flex w-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 text-left transition duration-200 hover:border-muted-foreground/45 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <span className="flex w-full items-center gap-3">
        <CompanyMark job={job} />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
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
      <span className="flex items-center justify-between gap-2">
        <StatusBadge status={job.status} />
        <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
          <MapPin aria-hidden="true" className="size-3 shrink-0" />
          <span className="truncate">{job.location}</span>
        </span>
      </span>
    </button>
  );
}
