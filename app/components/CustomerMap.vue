<script setup lang="ts">
import L from "leaflet"
import "leaflet.markercluster"
import { onMounted, ref } from "vue"

type Sex = "male" | "female"
type Customer = {
  id: number
  address: string | null
  birth: string | null
  sex: Sex | null
  ido: number
  keido: number
}

const client = useSupabaseClient()

const mapEl = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const lastUpdated = ref<string | null>(null)
const lastError = ref<string | null>(null)

let map: L.Map | null = null
let cluster: any = null // markerClusterGroup は型が弱いので any でOK

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
  if (age < 20) return "u20"
  if (age < 30) return "20s"
  if (age < 40) return "30s"
  if (age < 50) return "40s"
  if (age < 60) return "50s"
  return "60p"
}

const pinClass = (sex: Sex | null, birthISO: string | null) => {
  const s: Sex = sex ?? "male"
  if (!birthISO) return `${s}-20s`
  const band = ageBand(calcAge(birthISO))
  const normalized = band === "u20" ? "20s" : band
  return `${s}-${normalized}`
}

const makeIcon = (cls: string) =>
  L.divIcon({
    className: "",
    html: `<div class="pin ${cls}"></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 24],
  })

const initMapOnce = () => {
  if (!mapEl.value) return
  if (map) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
    iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
    shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
  })

  map = L.map(mapEl.value, { zoomControl: true })

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map)

  // ✅ Cluster レイヤ
  cluster = (L as any).markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 40,
  })
  cluster.addTo(map)

  map.setView([33.5756, 130.3749], 12)
  setTimeout(() => map?.invalidateSize(), 0)
}

const renderPins = (customers: Customer[]) => {
  if (!map || !cluster) return

  // ✅ 既存ピンを全部消す
  cluster.clearLayers()

  if (customers.length === 0) {
    map.setView([33.5756, 130.3749], 12)
    return
  }

  const bounds = L.latLngBounds([])

  for (const c of customers) {
    const cls = pinClass(c.sex, c.birth)
    const icon = makeIcon(cls)

    const ageText = c.birth ? `${calcAge(c.birth)} yrs` : "age unknown"
    const sexText = c.sex ?? "unknown"

    const marker = L.marker([c.ido, c.keido], { icon }).bindPopup(
      `${c.address ?? "No address"}<br/>${sexText} / ${ageText}`
    )

    // ✅ cluster に追加
    cluster.addLayer(marker)

    bounds.extend([c.ido, c.keido])
  }

  map.fitBounds(bounds, { padding: [40, 40] })
}

const loadCustomers = async () => {
  initMapOnce()
  if (!map) return

  loading.value = true
  lastError.value = null

  try {
    const { data, error } = await client
      .from("customer")
      .select("id,address,birth,sex,ido,keido")
      .order("id", { ascending: false })

    if (error) throw error

    renderPins((data ?? []) as Customer[])
    lastUpdated.value = new Date().toLocaleString()
  } catch (e: any) {
    console.error(e)
    lastError.value = e?.message ?? String(e)
  } finally {
    loading.value = false
    setTimeout(() => map?.invalidateSize(), 0)
  }
}

onMounted(async () => {
  await loadCustomers()
})
</script>

<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center gap-2">
      <button
        class="px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50 disabled:opacity-50"
        :disabled="loading"
        @click="loadCustomers()"
      >
        {{ loading ? "Updating..." : "UPDATE" }}
      </button>

      <div class="text-xs text-slate-600">
        <span v-if="lastUpdated">Last updated: {{ lastUpdated }}</span>
        <span v-else>Not updated yet</span>
      </div>

      <div v-if="lastError" class="w-full text-xs text-rose-600">
        Error: {{ lastError }}
      </div>
    </div>

    <div class="w-full h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div ref="mapEl" class="w-full h-full"></div>
    </div>

    <div class="text-xs text-slate-600">
      Color: sex × age band (20/30/40/50/60+)
    </div>
  </div>
</template>

<style>
/* CSSピン（そのまま） */
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

/* 男性：青系 */
.pin.male-20s { background: #60a5fa; }
.pin.male-30s { background: #3b82f6; }
.pin.male-40s { background: #2563eb; }
.pin.male-50s { background: #1d4ed8; }
.pin.male-60p { background: #1e40af; }

/* 女性：ピンク系 */
.pin.female-20s { background: #f9a8d4; }
.pin.female-30s { background: #f472b6; }
.pin.female-40s { background: #ec4899; }
.pin.female-50s { background: #db2777; }
.pin.female-60p { background: #be185d; }

.leaflet-div-icon {
  background: transparent !important;
  border: none !important;
}
</style>
