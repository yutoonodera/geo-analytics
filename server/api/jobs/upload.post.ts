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
  // YYYY-MM-DD 以外は null に落とす（必要ならここで変換も可能）
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  return null
}

export default defineEventHandler(async (event) => {
  console.log("HIT /api/jobs/upload", new Date().toISOString())

  const supabase = await serverSupabaseClient(event)

const user = await serverSupabaseUser(event) as any
const userId: string | undefined = user?.id ?? user?.sub

  if (!userId) {
    console.error("Unauthorized: no userId. user =", user)
    throw createError({ statusCode: 401, statusMessage: "Unauthorized" })
  }

  const body = await readBody<{ rows?: InputRow[] }>(event)
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createError({ statusCode: 400, statusMessage: "rows is required" })
  }

  const LIMIT = 200

  // queued + processing を “実データで” 数える（LIMIT=200ならこれで十分高速）
  const { data: existing, error: selErr } = await supabase
    .from("customer_jobs")
    .select("id")
    .eq("user_id", userId)
    .in("status", ["queued", "processing"])
    .limit(LIMIT + 1)

  if (selErr) {
    console.error("SELECT ERROR FULL:", JSON.stringify(selErr, null, 2))
    throw createError({ statusCode: 500, statusMessage: selErr.message || "select failed" })
  }

  const current = existing?.length ?? 0
  const remaining = LIMIT - current
  if (remaining <= 0) {
    throw createError({
      statusCode: 429,
      statusMessage: `Queue limit reached (${LIMIT}).`,
    })
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

  const toInsert = normalized.slice(0, remaining).map((r) => ({
    user_id: userId,
    address: r.address,
    birth: r.birth, // null or YYYY-MM-DD
    sex: r.sex,     // null or male/female
    status: "queued" as const,
  }))

  console.log("toInsert sample:", toInsert[0])

  const { data, error: insErr } = await supabase
    .from("customer_jobs")
    .insert(toInsert as any) // 型生成してない間は any でOK
    .select("id")

  if (insErr) {
    console.error("INSERT ERROR FULL:", JSON.stringify(insErr, null, 2))
    throw createError({ statusCode: 500, statusMessage: insErr.message || "insert failed" })
  }

  console.log("inserted ids (first 3):", data?.slice?.(0, 3))

  return {
    ok: true,
    inserted: toInsert.length,
    skipped: normalized.length - toInsert.length,
    limit: LIMIT,
  }
})
