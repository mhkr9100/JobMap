"use client";

import { Banknote, Building2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CompanyMark, StatusBadge } from "@/components/jobmap/job-card";
import type { Job } from "@/lib/jobs";

export function JobDetails({
  job,
  onClose,
  onRestoreFocus,
}: {
  job: Job | null;
  onClose: () => void;
  onRestoreFocus: () => void;
}) {
  return (
    <Dialog
      open={Boolean(job)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="gap-6 rounded-2xl p-7"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        {job && (
          <>
            <DialogHeader>
              <div className="mb-4 flex items-center gap-3">
                <CompanyMark job={job} large />
                <span className="text-sm font-medium">{job.company}</span>
                <span className="ml-auto mr-4">
                  <StatusBadge status={job.status} />
                </span>
              </div>
              <DialogTitle>{job.title}</DialogTitle>
              <DialogDescription>
                Explore a possible next chapter at {job.company}.
              </DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-3 rounded-xl border border-border bg-card p-4">
              {[
                { label: "Location", value: job.location, icon: MapPin },
                { label: "Workplace", value: job.workType, icon: Building2 },
                { label: "Annual salary", value: job.salary, icon: Banknote },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex flex-col gap-2">
                  <dt className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Icon aria-hidden="true" className="size-3" />
                    {label}
                  </dt>
                  <dd className="text-xs font-medium leading-relaxed">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">About the opportunity</h3>
              <p className="text-sm leading-7 text-muted-foreground">
                {job.description}
              </p>
            </div>
            <p className="rounded-lg bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
              This is a sample opportunity for the dashboard preview, not a live
              job listing. Company, role, and salary details are illustrative.
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button className="rounded-lg">Keep exploring</Button>
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
