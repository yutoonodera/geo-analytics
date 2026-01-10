// server/api/jobs/process-one.post.ts
import { request } from "undici"
import { supabaseAdmin } from "../../utils/supabaseAdmin"

type Sex = "male" | "female"
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function geocode(address: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("q", address)
  url.searchParams.set("limit", "1")
  url.searchParams.set("addressdetails", "1")

  const res = await request(url.toString(), {
    method: "GET",
    headers: {
      "user-agent": "MoveeGeo/0.1 (contact: https://your-domain.example)",
      "accept": "application/json",
      "accept-language": "en",
    },
  })

  const text = await res.body.text()
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`Nominatim ${res.statusCode}: ${text.slice(0, 200)}`)
  }

  const json = JSON.parse(text) as any[]
  if (!json?.length) throw new Error("No result")
  return {
    lat: Number(json[0].lat),
    lng: Number(json[0].lon),
    displayName: String(json[0].display_name ?? ""),
  }
}

export default defineEventHandler(async (event) => {
  const token = getHeader(event, "x-worker-token")
  if (!process.env.WORKER_TOKEN || token !== process.env.WORKER_TOKEN) {
    throw createError({ statusCode: 401, statusMessage: "Unauthorized worker" })
  }

  const supabase = supabaseAdmin()

  // 1) 次のジョブを1件取る（最古）
  const { data: job, error: pickErr } = await supabase
    .from("customer_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pickErr) throw createError({ statusCode: 500, statusMessage: pickErr.message })
  if (!job) return { ok: true, processed: 0 }

  // 2) processing にする（競合対策：queued のときだけ更新）
  const { data: upd, error: updErr } = await supabase
    .from("customer_jobs")
    .update({
      status: "processing",
      attempts: (job.attempts ?? 0) + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle()

  if (updErr) throw createError({ statusCode: 500, statusMessage: updErr.message })
  if (!upd) return { ok: true, processed: 0, skipped: "already taken" }

  try {
    // 3) レート制限対策（Nominatim）
    await sleep(1100)

    // 4) ジオコード
    const geo = await geocode(job.address)

    // 5) customer に insert
    const { error: insErr } = await supabase.from("customer").insert({
      user_id: job.user_id,
      address: geo.displayName,
      birth: job.birth,
      sex: (job.sex ?? "male") as Sex,
      ido: geo.lat,
      keido: geo.lng,
    } as any)

    if (insErr) throw new Error(insErr.message)

    // 6) job done
    await supabase
      .from("customer_jobs")
      .update({ status: "done", updated_at: new Date().toISOString() })
      .eq("id", job.id)

    return { ok: true, processed: 1, id: job.id, lat: geo.lat, lng: geo.lng }
  } catch (e: any) {
    await supabase
      .from("customer_jobs")
      .update({
        status: "failed",
        last_error: e?.message ?? String(e),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id)

    return { ok: false, processed: 1, id: job.id, error: e?.message ?? String(e) }
  }
})
