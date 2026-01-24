// server/api/jobs/upload.post.ts
import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server"

type Sex = "male" | "female"
type InputRow = { address: string; birth?: string; sex?: string }

const normalizeSex = (v: unknown): Sex | null => {
  const s = String(v ?? "").trim().toLowerCase()
  if (s === "male" || s === "m") return "male"
  if (s === "female" || s === "f") return "female"
  return null
}

const normalizeBirth = (v: unknown): string | null => {
  const s = String(v ?? "").trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export default defineEventHandler(async (event) => {
  console.log("HIT /api/jobs/upload", new Date().toISOString())

  const supabase = await serverSupabaseClient(event)

  const user = (await serverSupabaseUser(event)) as any
  const userId: string | undefined = user?.id ?? user?.sub

  if (!userId) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" })
  }

  const body = await readBody<{ rows?: InputRow[] }>(event)
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "rows is required" })
  }

  const LIMIT = 200

  // ✅ 今月の期間 [start, next)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0)

  // ✅ 今月作られた件数（status無関係）
  const { count: usedCount, error: countErr } = await supabase
    .from("customer_jobs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", start.toISOString())
    .lt("created_at", next.toISOString())

  if (countErr) {
    console.error("COUNT ERROR FULL:", JSON.stringify(countErr, null, 2))
    throw createError({ statusCode: 500, statusMessage: countErr.message || "count failed" })
  }

  const used = usedCount ?? 0
  const remaining = LIMIT - used
  if (remaining <= 0) {
    throw createError({ statusCode: 429, statusMessage: `Monthly limit reached (${LIMIT}).` })
  }

  // normalize + filter (address必須)
  const normalized = rows
    .map((r) => ({
      address: String(r.address ?? "").trim(),
      birth: normalizeBirth(r.birth),
      sex: normalizeSex(r.sex),
    }))
    .filter((r) => r.address.length > 0)

  if (normalized.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "No valid rows (address is empty)" })
  }

  // ✅ 月の残り枠ぶんだけ投入
  const toInsert = normalized.slice(0, remaining).map((r) => ({
    user_id: userId,
    address: r.address,
    birth: r.birth,
    sex: r.sex,
    status: "queued" as const,
  }))

  const skipped = normalized.length - toInsert.length

  const { data, error: insErr } = await supabase
    .from("customer_jobs")
    .insert(toInsert as any)
    .select("id")

  if (insErr) {
    console.error("INSERT ERROR FULL:", JSON.stringify(insErr, null, 2))
    throw createError({ statusCode: 500, statusMessage: insErr.message || "insert failed" })
  }

  console.log("inserted ids (first 3):", data?.slice?.(0, 3))

  // ✅ フロントがそのまま更新できる値を返す
  return {
    ok: true,
    inserted: toInsert.length,
    skipped,
    limit: LIMIT,
    used: used + toInsert.length,
    remaining: Math.max(0, remaining - toInsert.length),
  }
})
