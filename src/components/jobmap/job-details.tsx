"use client";

import { Banknote, Building2, ExternalLink, MapPin, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyMark, WorkTypeBadge } from "@/components/jobmap/job-card";
import type { Job } from "@/types";
import { getJobApplicationLink } from "@/lib/jobs";

export interface JobDetailsProps {
  job: Job | null;
  onClose: () => void;
  onRestoreFocus?: () => void;
}

export function JobDetails({ job, onClose }: JobDetailsProps) {
  if (!job) return null;

  const applicationLink = getJobApplicationLink(job);

  return (
    <article
      aria-label={`${job.title} at ${job.company}`}
      className="absolute bottom-6 right-6 z-30 flex w-88 md:w-96 max-w-[calc(100vw-3rem)] flex-col gap-4 rounded-3xl border border-border/70 bg-card/90 p-5 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-4 duration-200"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CompanyMark job={job} />
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-foreground/80">
              {job.company}
            </span>
            <WorkTypeBadge workType={job.workType} />
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close opportunity popup"
          className="rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </Button>
      </header>

      <div>
        <h2 className="text-base font-bold tracking-tight text-foreground">
          {job.title}
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <MapPin aria-hidden="true" className="size-3 text-primary" />
            {job.location_label}
          </span>
          {job.salary && (
            <>
              <span>·</span>
              <span className="inline-flex items-center gap-1 font-medium text-foreground">
                <Banknote aria-hidden="true" className="size-3 text-muted-foreground" />
                {job.salary}
              </span>
            </>
          )}
        </div>
      </div>

      {job.description && (
        <p className="line-clamp-3 text-xs leading-relaxed text-muted-foreground">
          {job.description}
        </p>
      )}

      <footer className="flex items-center gap-2 border-t border-border/50 pt-3">
        <Button
          asChild
          className="flex-1 gap-2 rounded-xl text-xs font-semibold"
        >
          <a
            href={applicationLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            Apply Now
            <ExternalLink aria-hidden="true" className="size-3.5" />
          </a>
        </Button>
      </footer>
    </article>
  );
}

export { JobDetails as FloatingJobPopup };
