<script setup lang="ts">
import L from "leaflet"
import { onMounted, ref } from "vue"

type Sex = "male" | "female"
type Customer = {
  id: number
  address: string | null
  birth: string // "YYYY-MM-DD"
  sex: Sex
  ido: number
  keido: number
}

const client = useSupabaseClient()
const mapEl = ref<HTMLDivElement | null>(null)

const calcAge = (birthISO: string) => {
  const b = new Date(birthISO)
  const now = new Date()
  let age = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--
  return age
}

type AgeBand = "20s" | "30s" | "40s" | "50s" | "60p" | "u20"

const ageBand = (age: number): AgeBand => {
  if (age < 20) return "u20" // If you don't need it, you can remove it later
  if (age < 30) return "20s"
  if (age < 40) return "30s"
  if (age < 50) return "40s"
  if (age < 60) return "50s"
  return "60p"
}

// sex × age band → class name (10 categories)
// e.g. pin male-20s, female-60p, etc.
const pinClass = (sex: Sex, birthISO: string) => {
  const band = ageBand(calcAge(birthISO))
  // We want to focus on 20s–60+, so treat under-20 as 20s (change if you prefer)
  const normalized = band === "u20" ? "20s" : band
  return `${sex}-${normalized}`
}

const makeIcon = (cls: string) =>
  L.divIcon({
    className: "", // Disable Leaflet's default class
    html: `<div class="pin ${cls}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  })

// (Optional) Seed test data: generate ~30 random records
const seedCustomers = async (n = 30) => {
  const user = useSupabaseUser()
  if (!user.value) return

  const baseLat = 33.5756
  const baseLng = 130.3749

  const rand = (min: number, max: number) => Math.random() * (max - min) + min
  const randInt = (min: number, max: number) => Math.floor(rand(min, max + 1))

  const randomBirth = () => {
    // Roughly ages 20–75
    const age = randInt(20, 75)
    const year = new Date().getFullYear() - age
    const month = randInt(1, 12)
    const day = randInt(1, 28)
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }

  const rows = Array.from({ length: n }).map((_, i) => ({
    user_id: user.value!.id,
    address: `Test address ${i + 1}`,
    birth: randomBirth(),
    sex: (Math.random() < 0.5 ? "male" : "female") as Sex,
    ido: baseLat + rand(-0.03, 0.03), // Scatter around Fukuoka
    keido: baseLng + rand(-0.03, 0.03),
  }))

  const { error } = await client.from("customer").insert(rows)
  if (error) alert(error.message)
  else alert(`Inserted ${n} test records`)
}

onMounted(async () => {
  if (!mapEl.value) return

  // Fix Leaflet default icon URLs (keep this for the default blue marker if needed)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
    iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
    shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
  })

  const map = L.map(mapEl.value, { zoomControl: true })

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map)

  // Fetch data first
  const { data, error } = await client
    .from("customer")
    .select("id,address,birth,sex,ido,keido")
    .order("id", { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  const customers = (data ?? []) as Customer[]
  if (customers.length === 0) {
    // If there's no data, show around Ropponmatsu
    map.setView([33.5756, 130.3749], 14)
    setTimeout(() => map.invalidateSize(), 0)
    return
  }

  // Add pins and fit the view to include all points
  const bounds = L.latLngBounds([])
  for (const c of customers) {
    const cls = pinClass(c.sex, c.birth)
    const icon = makeIcon(cls)

    L.marker([c.ido, c.keido], { icon })
      .addTo(map)
      .bindPopup(`${c.address ?? "No address"}<br/>${c.sex} / ${calcAge(c.birth)} years old`)

    bounds.extend([c.ido, c.keido])
  }

  map.fitBounds(bounds, { padding: [40, 40] })
  setTimeout(() => map.invalidateSize(), 0)

  // Enable this if you want to seed without a button (optional)
  // await seedCustomers(30)
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <button
        class="px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50"
        @click="seedCustomers(30)"
      >
        Insert 30 test records
      </button>
      <button
        class="px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50"
        @click="location.reload()"
      >
        Reload
      </button>
    </div>

    <div class="w-full h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div ref="mapEl" class="w-full h-full"></div>
    </div>

    <div class="text-xs text-slate-600">
      Color coding: Sex × Age band (20/30/40/50/60+)
    </div>
  </div>
</template>

<!-- Important: do NOT use scoped here, because Leaflet's divIcon is rendered outside Vue's scope -->
<style>
/* Shared pin shape (CSS only, no CDN/images) */
.pin {
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  border: 2px solid white;
  box-shadow: 0 4px 10px rgba(0,0,0,0.30);
  position: relative;
}
.pin::after {
  content: "";
  position: absolute;
  bottom: -6px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 6px;
  height: 6px;
  background: inherit;
}

/* 10 categories: male/female × 20s/30s/40s/50s/60p */
/* Male: blue gradient */
.pin.male-20s { background: #60a5fa; } /* blue-400 */
.pin.male-30s { background: #3b82f6; } /* blue-500 */
.pin.male-40s { background: #2563eb; } /* blue-600 */
.pin.male-50s { background: #1d4ed8; } /* blue-700 */
.pin.male-60p { background: #1e40af; } /* blue-800 */

/* Female: pink gradient */
.pin.female-20s { background: #f9a8d4; } /* pink-300 */
.pin.female-30s { background: #f472b6; } /* pink-400 */
.pin.female-40s { background: #ec4899; } /* pink-500 */
.pin.female-50s { background: #db2777; } /* pink-600 */
.pin.female-60p { background: #be185d; } /* pink-700 */
</style>
