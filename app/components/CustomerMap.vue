<script setup lang="ts">
import L from "leaflet"
import "leaflet.markercluster"
import * as h3 from "h3-js"
import { onMounted, ref, computed } from "vue"

type Sex = "male" | "female"
type Customer = {
  id: number
  address: string | null
  birth: string | null
  sex: Sex | null
  ido: number
  keido: number
}

type JobStatus = "queued" | "processing" | "done" | "failed"
type FailedJob = {
  id: number
  address: string | null
  last_error: string | null
  updated_at: string | null
}

type TopArea = {
  rank: number
  covered: number
  cells: number
  bounds: { south: number; west: number; north: number; east: number }
}

const client = useSupabaseClient()

const mapEl = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const lastUpdated = ref<string | null>(null)
const lastError = ref<string | null>(null)

// ===== 表示切替 =====
const showCluster = ref(true)
const showMesh = ref(true)

// ===== 上位5エリアのリスト =====
const topAreas = ref<TopArea[]>([])

// ===== 再描画用に保持 =====
const lastCustomers = ref<Customer[]>([])

const progress = ref({
  total: 0,
  queued: 0,
  processing: 0,
  done: 0,
  failed: 0,
  percent: 0,
  successRate: 0,
})

const failedJobs = ref<FailedJob[]>([])
const failedLoading = ref(false)

const isCompleted = computed(() => {
  const p = progress.value
  return p.total > 0 && p.queued === 0 && p.processing === 0
})

const isRunning = computed(() => {
  const p = progress.value
  return p.total > 0 && (p.queued > 0 || p.processing > 0)
})

let map: L.Map | null = null
let cluster: any = null

// ===== mesh layer =====
let meshLayer: L.LayerGroup | null = null
const meshColor = "#ec4899"

// ===== Top dense areas layer =====
let topAreasLayer: L.GeoJSON | null = null
const TOP_AREAS = 5
const TOP_AREA_RES = 7
const CANDIDATE_TOP_CELLS = 400

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

const zoomToH3Res = (z: number) => {
  if (z <= 4) return 2
  if (z <= 6) return 3
  if (z <= 8) return 4
  if (z <= 10) return 5
  if (z <= 12) return 6
  if (z <= 14) return 7
  return 8
}

const renderMesh = (customers: Customer[]) => {
  if (!map || !meshLayer) return

  meshLayer.clearLayers()
  if (!showMesh.value) return
  if (customers.length === 0) return

  const res = zoomToH3Res(map.getZoom())

  const counts = new Map<string, number>()
  for (const c of customers) {
    if (!Number.isFinite(c.ido) || !Number.isFinite(c.keido)) continue
    const cell = h3.latLngToCell(c.ido, c.keido, res)
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }

  const values = Array.from(counts.values())
  const max = values.length ? Math.max(...values) : 1

  for (const [cell, n] of counts) {
    const boundaryLngLat = h3.cellToBoundary(cell, true) as Array<[number, number]>
    const boundary = boundaryLngLat.map(([lng, lat]) => [lat, lng]) as Array<[number, number]>

    const fillOpacity = Math.min(0.6, Math.max(0.08, 0.08 + 0.52 * (n / max)))

    const poly = L.polygon(boundary, {
      color: meshColor,
      weight: 1,
      opacity: 0.35,
      fillColor: meshColor,
      fillOpacity,
      interactive: true,
    })

    poly.bindTooltip(`${n} customers`, { sticky: true })
    meshLayer.addLayer(poly)
  }
}

const renderTopAreas = (customers: Customer[]) => {
  if (!topAreasLayer) return
  topAreasLayer.clearLayers()
  topAreas.value = []
  if (customers.length === 0) return

  const counts = new Map<string, number>()
  for (const c of customers) {
    if (!Number.isFinite(c.ido) || !Number.isFinite(c.keido)) continue
    const cell = h3.latLngToCell(c.ido, c.keido, TOP_AREA_RES)
    counts.set(cell, (counts.get(cell) ?? 0) + 1)
  }
  if (counts.size === 0) return

  const sortedCells = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])
  const candidateCells = new Set(sortedCells.slice(0, CANDIDATE_TOP_CELLS).map(([cell]) => cell))

  const anyH3 = h3 as any
  const neighborsOf = (cell: string): string[] => {
    if (typeof anyH3.gridDisk === "function") {
      return (anyH3.gridDisk(cell, 1) as string[]).filter((x) => x !== cell)
    }
    if (typeof anyH3.kRing === "function") {
      return (anyH3.kRing(cell, 1) as string[]).filter((x) => x !== cell)
    }
    return []
  }

  const visited = new Set<string>()
  const components: Array<{ cells: string[]; covered: number }> = []

  for (const start of candidateCells) {
    if (visited.has(start)) continue

    const stack = [start]
    visited.add(start)

    const comp: string[] = []
    let covered = 0

    while (stack.length) {
      const cur = stack.pop()!
      comp.push(cur)
      covered += counts.get(cur) ?? 0

      for (const nb of neighborsOf(cur)) {
        if (!candidateCells.has(nb)) continue
        if (visited.has(nb)) continue
        visited.add(nb)
        stack.push(nb)
      }
    }

    components.push({ cells: comp, covered })
  }

  components.sort((a, b) => b.covered - a.covered)
  const top = components.slice(0, TOP_AREAS)

  for (let i = 0; i < top.length; i++) {
    const rank = i + 1
    const comp = top[i]

    const multi =
      typeof anyH3.cellsToMultiPolygon === "function"
        ? anyH3.cellsToMultiPolygon(comp.cells, true)
        : anyH3.h3SetToMultiPolygon(comp.cells, true)

    const feature = {
      type: "Feature",
      properties: { rank, covered: comp.covered, cells: comp.cells.length, res: TOP_AREA_RES },
      geometry: { type: "MultiPolygon", coordinates: multi },
    } as any

    topAreasLayer.addData(feature)

    const b = L.latLngBounds([])
    for (const poly of multi) {
      for (const ring of poly) {
        for (const [lng, lat] of ring) b.extend([lat, lng])
      }
    }
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()

    topAreas.value.push({
      rank,
      covered: comp.covered,
      cells: comp.cells.length,
      bounds: { south: sw.lat, west: sw.lng, north: ne.lat, east: ne.lng },
    })
  }
}

const zoomToTopArea = (rank: number) => {
  if (!map) return
  const a = topAreas.value.find((x) => x.rank === rank)
  if (!a) return
  const b = L.latLngBounds([a.bounds.south, a.bounds.west], [a.bounds.north, a.bounds.east])
  map.fitBounds(b, { padding: [60, 60] })
}

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

  // ✅ attribution を手動で置く（＝右下を空ける）
  map = L.map(mapEl.value, { zoomControl: true, attributionControl: false })

  // ✅ attribution は左下へ
  L.control.attribution({ position: "bottomleft" }).addTo(map)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map)

  cluster = (L as any).markerClusterGroup({
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    maxClusterRadius: 40,
  })
  cluster.addTo(map)

  meshLayer = L.layerGroup().addTo(map)

  topAreasLayer = L.geoJSON(undefined, {
    style: (feature: any) => {
      const rank = feature?.properties?.rank ?? 999
      const weight = rank === 1 ? 4 : rank === 2 ? 3 : 2
      const fillOpacity = rank === 1 ? 0.22 : rank === 2 ? 0.18 : 0.14
      return { color: "#ec4899", weight, opacity: 0.95, fillColor: "#ec4899", fillOpacity }
    },
    onEachFeature: (feature: any, layer) => {
      const rank = feature?.properties?.rank ?? "?"
      const covered = feature?.properties?.covered ?? "?"
      const cells = feature?.properties?.cells ?? "?"
      layer.bindTooltip(`#${rank} / ${covered} customers / ${cells} cells`, { sticky: true })
    },
  }).addTo(map)

  map.on("zoomend moveend", () => {
    if (!map) return
    if (showMesh.value && lastCustomers.value.length) renderMesh(lastCustomers.value)
  })

  map.setView([33.5756, 130.3749], 12)
  setTimeout(() => map?.invalidateSize(), 0)
}

const renderPins = (customers: Customer[]) => {
  if (!map || !cluster) return

  cluster.clearLayers()
  if (!showCluster.value) return

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

    cluster.addLayer(marker)
    bounds.extend([c.ido, c.keido])
  }

  map.fitBounds(bounds, { padding: [40, 40] })
}

const loadProgress = async () => {
  const { data, error } = await client.from("customer_jobs").select("status")
  if (error) throw error

  const rows = (data ?? []) as Array<{ status: JobStatus }>
  const counts = { queued: 0, processing: 0, done: 0, failed: 0 }

  for (const r of rows) {
    if (r.status === "queued") counts.queued++
    else if (r.status === "processing") counts.processing++
    else if (r.status === "done") counts.done++
    else if (r.status === "failed") counts.failed++
  }

  const total = rows.length
  const completed = counts.done + counts.failed
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100)
  const successRate = completed === 0 ? 0 : Math.round((counts.done / completed) * 100)

  progress.value = { total, ...counts, percent, successRate }
}

const loadFailedJobs = async (limit = 30) => {
  failedLoading.value = true
  try {
    const { data, error } = await client
      .from("customer_jobs")
      .select("id,address,last_error,updated_at")
      .eq("status", "failed")
      .order("updated_at", { ascending: false })
      .limit(limit)

    if (error) throw error
    failedJobs.value = (data ?? []) as FailedJob[]
  } finally {
    failedLoading.value = false
  }
}

const loadCustomers = async () => {
  initMapOnce()
  if (!map) return

  loading.value = true
  lastError.value = null

  try {
    await Promise.all([loadProgress(), loadFailedJobs(30)])

    const { data, error } = await client
      .from("customer")
      .select("id,address,birth,sex,ido,keido")
      .order("id", { ascending: false })

    if (error) throw error

    const customers = (data ?? []) as Customer[]
    lastCustomers.value = customers

    renderPins(customers)
    renderMesh(customers)
    renderTopAreas(customers)

    lastUpdated.value = new Date().toLocaleString()
  } catch (e: any) {
    console.error(e)
    lastError.value = e?.message ?? String(e)
  } finally {
    loading.value = false
    setTimeout(() => map?.invalidateSize(), 0)
  }
}

const toggleCluster = () => {
  showCluster.value = !showCluster.value
  if (!cluster) return
  cluster.clearLayers()
  if (showCluster.value && lastCustomers.value.length) renderPins(lastCustomers.value)
}

const toggleMesh = () => {
  showMesh.value = !showMesh.value
  if (!meshLayer) return
  meshLayer.clearLayers()
  if (showMesh.value && lastCustomers.value.length) renderMesh(lastCustomers.value)
}

onMounted(async () => {
  await loadCustomers()
})
</script>

<template>
<UserBar class="mb-3" />

  <div class="space-y-3">
    <!-- ===== Header ===== -->
    <div class="flex flex-wrap items-center gap-2">
      <button
        class="px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50 disabled:opacity-50"
        :disabled="loading"
        @click="loadCustomers()"
      >
        {{ loading ? "Updating..." : "UPDATE" }}
      </button>

      <div class="text-xs text-slate-500">
        <span v-if="lastUpdated">Last updated: {{ lastUpdated }}</span>
        <span v-else>Not updated yet</span>
      </div>

      <div class="ml-auto flex items-center gap-2">
        <div
          v-if="progress.total > 0"
          class="inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium"
          :class="
            isCompleted
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          "
        >
          <span v-if="isCompleted">COMPLETED</span>
          <span v-else>PROGRESS {{ progress.percent }}%</span>
          <span class="ml-2 text-[11px] text-slate-500">
            ({{ progress.done + progress.failed }}/{{ progress.total }})
          </span>
        </div>

        <details>
          <summary
            class="cursor-pointer select-none rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500 hover:text-slate-700"
          >
            Details
            <span v-if="progress.failed > 0" class="ml-1">/ Issues {{ progress.failed }}</span>
          </summary>

          <div class="mt-2 w-[min(520px,90vw)] rounded-lg border border-slate-200 bg-white p-3">
            <div class="flex items-center justify-between">
              <div class="text-xs font-medium text-slate-700">Job metrics</div>
              <div v-if="failedLoading" class="text-[11px] text-slate-400">Loading...</div>
            </div>

            <div class="mt-2 text-[11px] text-slate-500 flex flex-wrap gap-2">
              <span>progress {{ progress.percent }}%</span>
              <span>success {{ progress.successRate }}%</span>
              <span>queued {{ progress.queued }}</span>
              <span>processing {{ progress.processing }}</span>
              <span>done {{ progress.done }}</span>
              <span>failed {{ progress.failed }}</span>
              <span class="text-slate-400">total {{ progress.total }}</span>
            </div>

            <div v-if="progress.failed === 0" class="mt-3 text-[11px] text-slate-400">
              No failed jobs.
            </div>

            <ul v-else class="mt-3 space-y-2">
              <li
                v-for="j in failedJobs"
                :key="j.id"
                class="rounded-md border border-slate-100 bg-slate-50 p-2"
              >
                <div class="text-[11px] font-medium text-slate-800 truncate">
                  #{{ j.id }} — {{ j.address ?? "No address" }}
                </div>
                <div class="mt-1 text-[11px] text-rose-700 break-words">
                  {{ j.last_error ?? "Unknown error" }}
                </div>
                <div class="mt-1 text-[10px] text-slate-400">
                  {{ j.updated_at ? new Date(j.updated_at).toLocaleString() : "" }}
                </div>
              </li>
            </ul>
          </div>
        </details>
      </div>

      <div v-if="lastError" class="w-full text-xs text-rose-600">
        Error: {{ lastError }}
      </div>
    </div>

    <!-- ===== Progress bar ===== -->
    <div
      v-if="!isCompleted && progress.total > 0"
      class="relative h-3 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div
        class="h-full rounded-full bg-pink-400 transition-all duration-500"
        :style="{ width: progress.percent + '%' }"
      />
    </div>

    <!-- ===== Main layout ===== -->
    <div class="grid gap-3 lg:grid-cols-[1fr_320px]">
      <!-- Map -->
      <div class="w-full h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white">
        <div ref="mapEl" class="w-full h-full"></div>
      </div>

      <!-- Top areas -->
      <div class="rounded-xl border border-slate-200 bg-white p-3">
        <div class="flex items-center justify-between">
          <div class="text-sm font-semibold text-slate-800">Top {{ TOP_AREAS }} dense areas</div>
          <div class="text-[11px] text-slate-400">H3 res {{ TOP_AREA_RES }}</div>
        </div>

        <div class="mt-2 text-[12px] text-slate-500">Click to zoom</div>

        <div v-if="topAreas.length === 0" class="mt-3 text-[12px] text-slate-400">
          No areas yet.
        </div>

        <ul v-else class="mt-3 space-y-2">
          <li v-for="a in topAreas" :key="a.rank">
            <button
              class="w-full text-left rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 hover:bg-slate-100"
              @click="zoomToTopArea(a.rank)"
            >
              <div class="flex items-center justify-between">
                <div class="text-sm font-semibold text-slate-800">#{{ a.rank }}</div>
                <div class="text-xs text-slate-500">{{ a.cells }} cells</div>
              </div>
              <div class="mt-1 text-[12px] text-slate-600">
                {{ a.covered }} customers
              </div>
            </button>
          </li>
        </ul>

        <div class="mt-4 text-[11px] text-slate-400 leading-relaxed">
          This list groups adjacent high-density H3 cells into regions, then ranks regions by total customers.
        </div>
      </div>
    </div>

    <!-- ✅ ここが「Color: ...」の行。右側にトグルを出す -->
    <div class="legend-row">
      <div class="legend-text">
        Color: sex × age band (20/30/40/50/60+)
        <span class="legend-muted"> / Mesh: single pink (opacity by density)</span>
        <span class="legend-muted"> / Top Areas: polygons ranked #1–#{{ TOP_AREAS }}</span>
      </div>

      <div class="legend-toggles">
        <button class="legend-toggle-btn" @click="toggleCluster()">
          Cluster: {{ showCluster ? "ON" : "OFF" }}
        </button>
        <button class="legend-toggle-btn" @click="toggleMesh()">
          Mesh: {{ showMesh ? "ON" : "OFF" }}
        </button>
      </div>
    </div>
  </div>
</template>

<style>
.pin {
  width: 16px;
  height: 16px;
  border-radius: 9999px;
  border: 2px solid white;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
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

.pin.male-20s { background: #60a5fa; }
.pin.male-30s { background: #3b82f6; }
.pin.male-40s { background: #2563eb; }
.pin.male-50s { background: #1d4ed8; }
.pin.male-60p { background: #1e40af; }

.pin.female-20s { background: #f9a8d4; }
.pin.female-30s { background: #f472b6; }
.pin.female-40s { background: #ec4899; }
.pin.female-50s { background: #db2777; }
.pin.female-60p { background: #be185d; }

.leaflet-div-icon {
  background: transparent !important;
  border: none !important;
}

/* ✅ legend 行を「左=説明 / 右=トグル」にする */
.legend-row {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: rgb(71 85 105); /* slate-600 */
}

.legend-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.legend-muted {
  color: rgb(148 163 184); /* slate-400 */
}

.legend-toggles {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.legend-toggle-btn {
  padding: 8px 12px;
  border-radius: 12px;
  border: 1px solid rgb(226 232 240);
  background: #fff;
  font-size: 13px;
  cursor: pointer;
}

.legend-toggle-btn:hover {
  background: rgb(248 250 252);
}

/* Leaflet attribution を小さく・薄く */
.leaflet-control-attribution {
  background: transparent !important;
  box-shadow: none !important;
  font-size: 10px !important;   /* 小さく */
  line-height: 1.2 !important;
  color: rgba(0, 0, 0, 0.45) !important; /* 薄く */
  opacity: 0.6 !important;
  padding: 0 6px !important;
}

/* リンクも目立たなく */
.leaflet-control-attribution a {
  color: rgba(0, 0, 0, 0.45) !important;
  text-decoration: none !important;
}

.leaflet-control-attribution a:hover {
  text-decoration: underline;
  opacity: 0.8;
}

</style>
