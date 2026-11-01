import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type AdminAction = "ban" | "unban" | "set-role";

async function getAdminClients(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!url || !publicKey || !token) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };

  const userClient = createClient(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  if (authError || !authData.user) return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }) };

  const { data: role, error: roleError } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (roleError || role?.role !== "admin") {
    return { response: NextResponse.json({ error: "Admin access required." }, { status: 403 }) };
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) {
    return {
      response: NextResponse.json(
        { error: "User management is not configured. Add SUPABASE_SECRET_KEY to the Vercel server environment." },
        { status: 503 },
      ),
    };
  }

  return {
    admin: createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } }),
    user: authData.user,
  };
}

export async function GET(request: Request) {
  const context = await getAdminClients(request);
  if ("response" in context) return context.response;
  const firstPage = await context.admin.auth.admin.listUsers({ page: 1, perPage: 100 });
  if (firstPage.error) return NextResponse.json({ error: "Could not load users." }, { status: 502 });
  const { data: roleRows, error: rolesError } = await context.admin.from("user_roles").select("user_id,role");
  if (rolesError) return NextResponse.json({ error: "Could not load user roles." }, { status: 502 });
  const roles = new Map((roleRows ?? []).map((row) => [row.user_id, row.role]));

  const allUsers = [...firstPage.data.users];
  for (let page = 2; ; page += 1) {
    const result = await context.admin.auth.admin.listUsers({ page, perPage: 100 });
    if (result.error) return NextResponse.json({ error: "Could not calculate user metrics." }, { status: 502 });
    allUsers.push(...result.data.users);
    if (result.data.users.length < 100) break;
  }

  const since = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const [eventResult, jobsResult] = await Promise.all([
    context.admin.from("analytics_events").select("id", { count: "exact", head: true }).gte("created_at", new Date(since).toISOString()),
    context.admin.rpc("get_jobs_in_viewport", {
      min_lng: -91.2,
      min_lat: 37.88,
      max_lng: -89.2,
      max_lat: 39.37,
    }, { count: "exact", head: true }),
  ]);
  if (eventResult.error || jobsResult.error) {
    return NextResponse.json({ error: "Could not load dashboard metrics." }, { status: 502 });
  }
  return NextResponse.json({
    metrics: {
      total_users: allUsers.length,
      new_users_30d: allUsers.filter((user) => Date.parse(user.created_at) >= since).length,
      active_users_30d: allUsers.filter((user) => user.last_sign_in_at && Date.parse(user.last_sign_in_at) >= since).length,
      events_30d: eventResult.count ?? 0,
      local_available_jobs: jobsResult.count ?? 0,
    },
    users: firstPage.data.users.map((user) => ({
      id: user.id,
      email: user.email ?? "",
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      bannedUntil: user.banned_until,
      role: roles.get(user.id) ?? "user",
    })),
  });
}

export async function PATCH(request: Request) {
  const context = await getAdminClients(request);
  if ("response" in context) return context.response;

  let input: { userId?: unknown; action?: unknown; role?: unknown };
  try {
    input = (await request.json()) as { userId?: unknown; action?: unknown; role?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (
    typeof input.userId !== "string" ||
    (input.action !== "ban" && input.action !== "unban" && input.action !== "set-role")
  ) {
    return NextResponse.json({ error: "A user ID and valid user action are required." }, { status: 400 });
  }
  const { data: targetRoleRow } = await context.admin.from("user_roles").select("role").eq("user_id", input.userId).maybeSingle();
  const targetRole = targetRoleRow?.role ?? "user";

  if (input.action === "set-role") {
    if (input.role !== "admin" && input.role !== "user") {
      return NextResponse.json({ error: "Role must be user or admin." }, { status: 400 });
    }
    if (input.userId === context.user.id && input.role !== "admin") {
      return NextResponse.json({ error: "You cannot remove your own admin role." }, { status: 400 });
    }
    if (targetRole === "admin" && input.role === "user") {
      const { count, error } = await context.admin.from("user_roles").select("user_id", { count: "exact", head: true }).eq("role", "admin");
      if (error || (count ?? 0) <= 1) {
        return NextResponse.json({ error: "At least one administrator must remain." }, { status: 400 });
      }
    }
    const { error } = await context.admin.from("user_roles").upsert({ user_id: input.userId, role: input.role });
    if (error) return NextResponse.json({ error: "Could not update the user's role." }, { status: 502 });
    return NextResponse.json({ success: true });
  }

  if (targetRole === "admin") return NextResponse.json({ error: "Remove the admin role before suspending this account." }, { status: 400 });
  if (input.userId === context.user.id) return NextResponse.json({ error: "You cannot suspend your own admin account." }, { status: 400 });

  const { error } = await context.admin.auth.admin.updateUserById(input.userId, {
    ban_duration: (input.action as AdminAction) === "ban" ? "876000h" : "none",
  });
  if (error) return NextResponse.json({ error: "Could not update the user." }, { status: 502 });
  return NextResponse.json({ success: true });
}

export async function POST(request: Request) {
  const context = await getAdminClients(request);
  if ("response" in context) return context.response;
  let input: { email?: unknown };
  try {
    input = (await request.json()) as { email?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof input.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  const redirectTo = new URL("/admin", request.url).toString();
  const { error } = await context.admin.auth.admin.inviteUserByEmail(input.email.trim(), { redirectTo });
  if (error) return NextResponse.json({ error: "Could not send the user invitation." }, { status: 502 });
  return NextResponse.json({ success: true });
}
