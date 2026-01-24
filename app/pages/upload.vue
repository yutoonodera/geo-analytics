<script setup lang="ts">
import Papa from "papaparse"

type Row = {
  address: string
  birth?: string
  sex?: "male" | "female"
}

type UsageRes = {
  ok: boolean
  limit: number
  used: number
  remaining: number
  period?: { start: string; next: string }
}

type UploadRes = {
  ok: boolean
  inserted: number
  skipped: number
  limit: number
  used?: number
  remaining?: number
}

// =============================
// Auth（このページでは「弾く」だけ）
// =============================
const user = useSupabaseUser()
const route = useRoute()

watchEffect(() => {
  if (user.value === null) {
    navigateTo(`/login?redirect=${route.fullPath}`)
  }
})

// =============================
// 月の使用量（表示＆制限）
// =============================
const usage = ref<UsageRes>({
  ok: true,
  limit: 200,
  used: 0,
  remaining: 200,
})
const usageLoading = ref(false)

const loadUsage = async () => {
  if (!user.value) return
  usageLoading.value = true
  try {
    const res = await $fetch<UsageRes>("/api/jobs/usage")
    usage.value = res
  } catch (e) {
    console.error(e)
  } finally {
    usageLoading.value = false
  }
}

watchEffect(() => {
  if (user.value) loadUsage()
})

const isOverLimit = computed(() => usage.value.remaining <= 0)

// =============================
// CSV Upload
// =============================
const file = ref<File | null>(null)
const uploading = ref(false)
const message = ref<string>("")
const csvInputId = "csvFile"

const hasFile = computed(() => !!file.value)

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  message.value = ""
}

const resetFile = () => {
  file.value = null
  const input = document.getElementById(csvInputId) as HTMLInputElement | null
  if (input) input.value = ""
}

const parseCsv = async (f: File) => {
  return await new Promise<Row[]>((resolve, reject) => {
    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = (results.data as any[]).map((r) => ({
          address: String(r.address ?? "").trim(),
          birth: r.birth ? String(r.birth).trim() : undefined,
          sex: r.sex ? (String(r.sex).trim() as "male" | "female") : undefined,
        }))
        resolve(rows.filter((r) => r.address.length > 0))
      },
      error: (err) => reject(err),
    })
  })
}

const upload = async () => {
  if (!file.value) return

  if (isOverLimit.value) {
    message.value = `Monthly limit reached (${usage.value.used}/${usage.value.limit}).`
    return
  }

  uploading.value = true
  message.value = ""
  try {
    const rows = await parseCsv(file.value)

    if (rows.length === 0) {
      message.value = "The CSV does not contain a valid address column."
      return
    }

    if (rows.length > usage.value.remaining) {
      message.value = `Monthly limit exceeded. Remaining: ${usage.value.remaining}, CSV rows: ${rows.length}.`
      return
    }

    const res = await $fetch<UploadRes>("/api/jobs/upload", {
      method: "POST",
      body: { rows },
    })

    message.value = `Upload completed: inserted ${res.inserted}, skipped ${res.skipped}.`

    await loadUsage()

    // アップロード完了後は初期状態に戻す
    resetFile()
  } catch (e: any) {
    message.value = e?.data?.statusMessage || e?.message || "Upload failed."
    await loadUsage()
  } finally {
    uploading.value = false
  }
}

// =============================
// ボタン色（手順誘導）
// =============================
const highlightPick = computed(() => !hasFile.value)
const highlightUpload = computed(() => hasFile.value && !uploading.value && !isOverLimit.value)
</script>

<template>
  <div class="p-6 max-w-2xl space-y-4">
    <UserBar />

    <h1 class="text-xl font-semibold">CSV Upload → customer_jobs</h1>

    <!-- Monthly usage -->
    <div class="rounded-xl border bg-white p-4">
      <div class="flex items-center justify-between">
        <div class="text-sm font-medium text-slate-800">Monthly usage</div>
        <div v-if="usageLoading" class="text-xs text-slate-400">Loading...</div>
      </div>

      <div class="mt-2 flex items-center gap-2">
        <div
          class="inline-flex items-center rounded-full border px-3 py-1 text-xs"
          :class="
            isOverLimit
              ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-slate-50 text-slate-700 border-slate-200'
          "
        >
          {{ usage.used }} / {{ usage.limit }}
        </div>

        <div class="text-xs text-slate-500">
          Remaining: <span class="font-medium">{{ usage.remaining }}</span>
        </div>
      </div>

      <div v-if="isOverLimit" class="mt-2 text-xs text-rose-600">
        Monthly limit reached. Upload is disabled until next month.
      </div>
    </div>

    <!-- Upload card -->
    <div class="rounded-xl border bg-white p-4 space-y-3">
      <p class="text-sm text-slate-600">
        Expected CSV headers: <code>address,birth,sex</code><br />
        <code>birth</code> and <code>sex</code> are optional. Sex must be
        <code>male</code> or <code>female</code>.
      </p>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <input
          :id="csvInputId"
          type="file"
          accept=".csv,text/csv"
          class="hidden"
          @change="onFile"
        />

        <div class="flex items-center gap-3 min-w-0">
          <label
            :for="csvInputId"
            class="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium cursor-pointer transition border"
            :class="
              highlightPick
                ? 'bg-pink-50 text-pink-700 border-pink-200 hover:bg-pink-100'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            "
          >
            Select file
          </label>

          <div class="text-sm text-slate-600 truncate max-w-[240px]">
            <span v-if="file">{{ file.name }}</span>
            <span v-else class="text-slate-400">No file selected</span>
          </div>
        </div>

        <button
          class="sm:ml-auto inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed border"
          :class="[
            uploading
              ? 'bg-slate-300 text-slate-600 border-slate-300'
              : isOverLimit
                ? 'bg-rose-200 text-rose-700 border-rose-200'
                : highlightUpload
                  ? 'bg-pink-500 text-white border-pink-500 hover:bg-pink-600 active:bg-pink-700'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50',
          ]"
          :disabled="!file || uploading || isOverLimit"
          @click="upload"
        >
          {{ uploading ? "Uploading..." : isOverLimit ? "Limit reached" : "Upload CSV" }}
        </button>
      </div>

      <p v-if="message" class="text-sm">{{ message }}</p>
    </div>

    <!-- Sample -->
    <div class="rounded-xl border bg-white p-4">
      <h2 class="font-medium mb-2">Sample CSV</h2>
      <pre class="text-xs overflow-auto">
address,birth,sex
Ropponmatsu Station,1996-04-12,male
Tokyo Station,1988-01-05,female
Beijing,1977-03-20,male
      </pre>
    </div>
  </div>
</template>
