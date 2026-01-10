// server/api/geocode.get.ts
export default defineEventHandler(async (event) => {
  const q = getQuery(event)
  const address = (q.address as string | undefined)?.trim()
  if (!address) throw createError({ statusCode: 400, statusMessage: "address is required" })

  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("format", "jsonv2")
  url.searchParams.set("q", address)
  url.searchParams.set("limit", "1")
  url.searchParams.set("addressdetails", "1")

  const res = await fetch(url.toString(), {
    headers: {
      // ★ ここは「あなたのサービス名 + 連絡先（メール/URL）」に変えてください
      // example@example.com のままだと雑なBot扱いされることがあります
      "User-Agent": "MoveeGeo/0.1 (contact: https://your-domain.example)",
      "Accept": "application/json",
      "Accept-Language": "en",
      // 付けられるなら Referer も（必須ではないが効くことがある）
      "Referer": "http://localhost:3000",
    },
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw createError({
      statusCode: 502,
      statusMessage: `Nominatim failed: ${res.status} ${res.statusText} ${text.slice(0, 200)}`,
    })
  }

  const json = (await res.json()) as any[]
  if (!json?.length) throw createError({ statusCode: 404, statusMessage: "No result" })

  const first = json[0]
  return {
    lat: Number(first.lat),
    lng: Number(first.lon),
    displayName: String(first.display_name ?? ""),
    raw: first,
  }
})
