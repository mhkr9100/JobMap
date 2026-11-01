import { supabase } from "@/lib/supabase";

export type AnalyticsEvent = "sign_in" | "map_open" | "job_open" | "job_apply_click";

/** Collect coarse, signed-in usage only; no user email or location is stored. */
export async function trackSignedInEvent(eventName: AnalyticsEvent): Promise<void> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase
    .from("analytics_events")
    .insert({ user_id: data.user.id, event_name: eventName });
  if (error) console.warn("Could not record usage event:", error.message);
}
