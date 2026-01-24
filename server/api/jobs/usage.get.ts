// server/api/jobs/usage.get.ts
import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server"

export default defineEventHandler(async (event) => {
  const supabase = await serverSupabaseClient(event)
  const user = (await serverSupabaseUser(event)) as any
  const userId: string | undefined = user?.id ?? user?.sub

  if (!userId) throw createError({ statusCode: 401, statusMessage: "Unauthorized" })

  const LIMIT = 200
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

  const { count, error } = await supabase
    .from("customer_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lt("created_at", next.toISOString())

  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const used = count ?? 0
  return {
    ok: true,
    limit: LIMIT,
    used,
    remaining: Math.max(0, LIMIT - used),
    period: { start: start.toISOString(), next: next.toISOString() },
  }
})
