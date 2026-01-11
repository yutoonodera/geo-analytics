<script setup lang="ts">
import L from "leaflet"
import "leaflet.markercluster"
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

const client = useSupabaseClient()

const mapEl = ref<HTMLDivElement | null>(null)
const loading = ref(false)
const lastUpdated = ref<string | null>(null)
const lastError = ref<string | null>(null)

const progress = ref({
  total: 0,
  queued: 0,
  processing: 0,
  done: 0,
  failed: 0,
  percent: 0, // (done+failed)/total
  successRate: 0, // done/(done+failed)
})

const failedJobs = ref<FailedJob[]>([])
const failedLoading = ref(false)

const isCompleted = computed(() => {
  const p = progress.value
  return p.total > 0 && p.queued === 0 && p.processing === 0
})

let map: L.Map | null = null
let cluster: any = null

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
    // ✅ まず進捗＆failedを更新（“完了したか”もここで決まる）
    await Promise.all([loadProgress(), loadFailedJobs(30)])

    // ✅ そのあと地図（customer）を更新
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

      <!-- ✅ 完了表示 -->
      <div
        v-if="isCompleted"
        class="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 border border-emerald-200"
      >
        COMPLETED
      </div>

      <div class="text-xs text-slate-600">
        <span v-if="lastUpdated">Last updated: {{ lastUpdated }}</span>
        <span v-else>Not updated yet</span>
      </div>

      <div v-if="lastError" class="w-full text-xs text-rose-600">
        Error: {{ lastError }}
      </div>
    </div>

    <!-- ✅ 進捗 -->
    <div class="w-full max-w-3xl space-y-2">
      <div class="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div>
          Progress:
          <span class="font-medium text-slate-900">{{ progress.percent }}%</span>
          <span class="ml-2">
            Success:
            <span class="font-medium text-slate-900">{{ progress.successRate }}%</span>
          </span>
        </div>

        <div class="flex flex-wrap gap-2">
          <span>queued {{ progress.queued }}</span>
          <span>processing {{ progress.processing }}</span>
          <span>done {{ progress.done }}</span>
          <span>failed {{ progress.failed }}</span>
          <span class="text-slate-400">total {{ progress.total }}</span>
        </div>
      </div>

      <div class="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
        <div class="h-full bg-slate-800 transition-all" :style="{ width: progress.percent + '%' }" />
      </div>
    </div>

    <!-- ✅ 地図 -->
    <div class="w-full h-[520px] rounded-xl overflow-hidden border border-slate-200 bg-white">
      <div ref="mapEl" class="w-full h-full"></div>
    </div>

    <!-- ✅ failed一覧 -->
    <div class="rounded-xl border border-slate-200 bg-white p-4">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-slate-900">
          Failed jobs
          <span class="ml-2 text-xs text-slate-500">(latest 30)</span>
        </div>
        <div class="text-xs text-slate-500" v-if="failedLoading">Loading...</div>
      </div>

      <div v-if="failedJobs.length === 0" class="mt-3 text-sm text-slate-600">
        No failed jobs 🎉
      </div>

      <ul v-else class="mt-3 space-y-2">
        <li v-for="j in failedJobs" :key="j.id" class="rounded-lg border border-slate-200 p-3">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="text-sm font-medium text-slate-900 truncate">
                #{{ j.id }} — {{ j.address ?? "No address" }}
              </div>
              <div class="mt-1 text-xs text-rose-700 break-words">
                {{ j.last_error ?? "Unknown error" }}
              </div>
            </div>
            <div class="shrink-0 text-xs text-slate-500">
              {{ j.updated_at ? new Date(j.updated_at).toLocaleString() : "" }}
            </div>
          </div>
        </li>
      </ul>
    </div>

    <div class="text-xs text-slate-600">
      Color: sex × age band (20/30/40/50/60+)
    </div>
  </div>
</template>

<style>
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
</style>
