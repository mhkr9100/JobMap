"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/supabase";

interface AdminMetrics {
  total_users: number;
  new_users_30d: number;
  active_users_30d: number;
  events_30d: number;
  local_available_jobs: number;
}

interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  role: "user" | "admin";
}

export default function AdminDashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");

  const loadDashboard = useCallback(async (accessToken: string) => {
    setBusy(true);
    setMessage("");
    const usersResponse = await fetch("/api/admin/users", { headers: { Authorization: `Bearer ${accessToken}` } });
    if (usersResponse.ok) {
      const data = (await usersResponse.json()) as { users?: AdminUser[]; metrics?: AdminMetrics };
      setUsers(data.users ?? []);
      setMetrics(data.metrics ?? null);
    } else {
      const data = (await usersResponse.json().catch(() => ({}))) as { error?: string };
      setMessage((current) => [current, data.error].filter(Boolean).join(" "));
    }
    setBusy(false);
  }, []);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const accessToken = data.session?.access_token;
      if (!accessToken) return;
      setToken(accessToken);
      setCurrentUserId(data.session?.user.id ?? null);
      void loadDashboard(accessToken);
    });
  }, [loadDashboard]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data.session) {
      setMessage(error?.message ?? "Sign in failed.");
      return;
    }
    setPassword("");
    setToken(data.session.access_token);
    setCurrentUserId(data.user.id);
    void supabase.from("analytics_events").insert({ user_id: data.user.id, event_name: "sign_in" });
    await loadDashboard(data.session.access_token);
  }

  async function updateUser(user: AdminUser) {
    if (!token) return;
    const action = user.bannedUntil ? "unban" : "ban";
    setBusy(true);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, action }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setMessage(data.error ?? "User update failed.");
    else await loadDashboard(token);
    setBusy(false);
  }

  async function setUserRole(user: AdminUser) {
    if (!token) return;
    setBusy(true);
    const response = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.id, action: "set-role", role: user.role === "admin" ? "user" : "admin" }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) setMessage(data.error ?? "Role update failed.");
    else await loadDashboard(token);
    setBusy(false);
  }

  async function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) return;
    setBusy(true);
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: inviteEmail }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    setMessage(response.ok ? `Invitation sent to ${inviteEmail}.` : data.error ?? "Invitation failed.");
    if (response.ok) setInviteEmail("");
    setBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setToken(null);
    setCurrentUserId(null);
    setMetrics(null);
    setUsers([]);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-5 py-10 text-white">
      <section className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-300">JobMap</p>
            <h1 className="mt-2 text-3xl font-semibold">Admin dashboard</h1>
          </div>
          {token && <button onClick={signOut} className="rounded-xl border border-white/15 px-4 py-2 text-sm">Sign out</button>}
        </header>

        {!token ? (
          <form onSubmit={signIn} className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-6">
            <h2 className="mb-5 text-lg font-medium">Administrator sign in</h2>
            <label className="mb-4 block text-sm text-slate-300">Email
              <input required type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-blue-400" />
            </label>
            <label className="mb-5 block text-sm text-slate-300">Password
              <input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-white/15 bg-slate-900 px-3 py-2.5 text-white outline-none focus:border-blue-400" />
            </label>
            <button disabled={busy} className="w-full rounded-xl bg-blue-600 px-4 py-2.5 font-medium disabled:opacity-50">{busy ? "Signing in…" : "Sign in"}</button>
          </form>
        ) : (
          <>
            <p className="mb-5 text-sm text-slate-300">Usage metrics include signed-in activity only. The dashboard does not collect email addresses or precise user locations for analytics.</p>
            {metrics && (
              <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {[
                  ["Registered users", metrics.total_users],
                  ["New · 30 days", metrics.new_users_30d],
                  ["Active · 30 days", metrics.active_users_30d],
                  ["Events · 30 days", metrics.events_30d],
                  ["Local available jobs", metrics.local_available_jobs],
                ].map(([label, value]) => (
                  <article key={label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs text-slate-400">{label}</p>
                    <p className="mt-2 text-2xl font-semibold">{Number(value).toLocaleString()}</p>
                  </article>
                ))}
              </div>
            )}
            <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/5">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <h2 className="font-medium">Users</h2><span className="text-xs text-slate-400">First 100 accounts</span>
              </div>
              <form onSubmit={(event) => void inviteUser(event)} className="flex flex-wrap gap-2 border-b border-white/10 p-4">
                <input required type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="Invite by email" className="min-w-0 flex-1 rounded-xl border border-white/15 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-blue-400" />
                <button disabled={busy} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium disabled:opacity-50">Invite user</button>
              </form>
              <div className="divide-y divide-white/10">
                {users.map((user) => (
                  <div key={user.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{user.email || "Email unavailable"} <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase text-slate-300">{user.role}</span></p>
                      <p className="mt-1 text-xs text-slate-400">Joined {new Date(user.createdAt).toLocaleDateString()} · Last active {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleDateString() : "never"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button disabled={busy || user.id === currentUserId} onClick={() => void setUserRole(user)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-50">
                        {user.role === "admin" ? "Remove admin" : "Make admin"}
                      </button>
                      {user.role !== "admin" && <button disabled={busy} onClick={() => void updateUser(user)} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs disabled:opacity-50">{user.bannedUntil ? "Restore access" : "Suspend"}</button>}
                    </div>
                  </div>
                ))}
                {users.length === 0 && <p className="px-5 py-6 text-sm text-slate-400">No users to show, or user management has not been configured.</p>}
              </div>
            </section>
          </>
        )}
        {message && <p role="status" className="mt-5 max-w-3xl rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">{message}</p>}
      </section>
    </main>
  );
}
