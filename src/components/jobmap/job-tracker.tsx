"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import MapView from "@/components/MapView";
import JobSidebar from "@/components/jobmap/job-sidebar";
import { FloatingJobPopup } from "@/components/jobmap/job-details";
import AnalyticsDock from "@/components/AnalyticsDock";
import LocationSearch from "@/components/LocationSearch";
import { filterJobs, mapSupabaseJob, sampleJobs } from "@/lib/jobs";
import { supabase } from "@/lib/supabase";
import type { Job, JobSearchFilters, JobViewport } from "@/types";
import { INITIAL_JOB_FILTERS } from "@/types";

export default function JobTracker() {
  const [fetchedJobs, setFetchedJobs] = useState<Job[]>(sampleJobs);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [filters, setFilters] = useState<JobSearchFilters>(INITIAL_JOB_FILTERS);
  const [viewport, setViewport] = useState<JobViewport | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [targetLocation, setTargetLocation] = useState<[number, number] | null>(null);
  const [loading, setLoading] = useState(true);
  const latestRequest = useRef(0);

  // Fetch jobs in viewport from Supabase
  useEffect(() => {
    if (!viewport) return;

    const requestNumber = ++latestRequest.current;
    const timeout = window.setTimeout(async () => {
      setLoading(true);

      try {
        let request = supabase.rpc("get_jobs_in_viewport", {
          min_lng: viewport.minLng,
          min_lat: viewport.minLat,
          max_lng: viewport.maxLng,
          max_lat: viewport.maxLat,
        });

        // Filter out inactive or expired jobs at query level
        request = request
          .neq("status", "Inactive")
          .neq("status", "Expired")
          .neq("status", "Closed");

        // Basic database-side pushdowns
        if (filters.workModels.length > 0) {
          request = request.in("workType", filters.workModels);
        }
        if (filters.minSalary !== null) {
          request = request.gte("salary_max", filters.minSalary);
        }
        if (filters.maxSalary !== null) {
          request = request.lte("salary_min", filters.maxSalary);
        }
        if (filters.h1bSponsorship) {
          request = request.eq("h1b_sponsorship", true);
        }

        const { data, error } = await request;
        if (requestNumber !== latestRequest.current) return;

        if (error) {
          console.warn("Viewport query notice:", error.message);
          // Keep current or sample jobs on error
          if (fetchedJobs.length === 0) {
            setFetchedJobs(sampleJobs);
          }
        } else {
          const rows = (data ?? []) as Record<string, unknown>[];
          if (rows.length > 0) {
            const normalized = rows.map(mapSupabaseJob);
            setFetchedJobs(normalized);
          } else if (fetchedJobs.length === 0) {
            setFetchedJobs(sampleJobs);
          }
        }
      } catch (err) {
        console.error("Viewport load failed:", err);
      } finally {
        if (requestNumber === latestRequest.current) {
          setLoading(false);
        }
      }
    }, 200);

    return () => window.clearTimeout(timeout);
  }, [viewport, filters.workModels, filters.minSalary, filters.maxSalary, filters.h1bSponsorship]);

  // Apply the 7-category professional filter engine client-side
  const filteredJobs = useMemo(() => {
    return filterJobs(fetchedJobs, filters);
  }, [fetchedJobs, filters]);

  // Selected job for the floating popup
  const selectedJob = useMemo(() => {
    if (!selectedJobId) return null;
    return (
      filteredJobs.find((job) => job.id === selectedJobId) ??
      fetchedJobs.find((job) => job.id === selectedJobId) ??
      null
    );
  }, [selectedJobId, filteredJobs, fetchedJobs]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-900">
      {/* 100% Full-Screen 3D Map */}
      <MapView
        jobs={filteredJobs}
        selectedJobId={selectedJobId}
        onSelectJob={(job) => setSelectedJobId(job.id)}
        onViewportChange={setViewport}
        targetLocation={targetLocation}
        onVisibleCountChange={setVisibleCount}
      />

      {/* Floating Translucent Filter Sidebar (Left) */}
      <JobSidebar filters={filters} setFilters={setFilters} />

      {/* Unified Search (Top Right) */}
      <LocationSearch
        onLocationSelected={(coords) => {
          setTargetLocation([coords[0], coords[1]]);
        }}
        onJobSelected={(jobId, coords) => {
          setSelectedJobId(jobId);
          setTargetLocation([coords[0], coords[1]]);
        }}
        availableJobs={fetchedJobs}
      />

      {/* Floating Analytics Dock (Bottom Center) */}
      <AnalyticsDock
        total={fetchedJobs.length}
        filtered={filteredJobs.length}
        visible={visibleCount}
      />

      {/* Floating Opportunity Popup on Pin Selection */}
      <FloatingJobPopup
        job={selectedJob}
        onClose={() => setSelectedJobId(null)}
      />

      {/* Loading pill */}
      {loading && (
        <div className="absolute bottom-5 right-5 z-20 rounded-full bg-slate-950/80 px-3.5 py-1.5 text-xs font-medium text-white shadow-xl backdrop-blur-md animate-pulse">
          Searching this map area…
        </div>
      )}
    </div>
  );
}
