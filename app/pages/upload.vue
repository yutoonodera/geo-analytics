<script setup lang="ts">
import Papa from "papaparse"

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
// CSV Upload
// =============================
type Row = {
  address: string
  birth?: string
  sex?: "male" | "female"
}

const file = ref<File | null>(null)
const uploading = ref(false)
const message = ref<string>("")

const onFile = (e: Event) => {
  const input = e.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  message.value = ""
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
  uploading.value = true
  message.value = ""
  try {
    const rows = await parseCsv(file.value)

    if (rows.length === 0) {
      message.value = "CSVに address 列がありません（または空です）"
      return
    }

    const res = await $fetch<{
      ok: boolean
      inserted: number
      skipped: number
      limit: number
    }>("/api/jobs/upload", {
      method: "POST",
      body: { rows },
    })

    message.value = `投入完了: inserted=${res.inserted}, skipped=${res.skipped}, limit=${res.limit}`
  } catch (e: any) {
    message.value = e?.data?.statusMessage || e?.message || "Upload failed"
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl space-y-4">
    <!-- ✅ 共通 UserBar -->
    <UserBar />

    <h1 class="text-xl font-semibold">CSV Upload → customer_jobs</h1>

    <div class="rounded-xl border bg-white p-4 space-y-3">
      <p class="text-sm text-slate-600">
        CSVヘッダーは <code>address,birth,sex</code> を想定（birth/sexは任意）。<br />
        sexは <code>male</code> / <code>female</code>。
      </p>

      <input type="file" accept=".csv,text/csv" @change="onFile" />

      <button
        class="px-4 py-2 rounded-lg border bg-white hover:bg-slate-50 text-sm"
        :disabled="!file || uploading"
        @click="upload"
      >
        {{ uploading ? "Uploading..." : "Upload CSV" }}
      </button>

      <p v-if="message" class="text-sm">{{ message }}</p>
    </div>

    <div class="rounded-xl border bg-white p-4">
      <h2 class="font-medium mb-2">サンプルCSV</h2>
      <pre class="text-xs overflow-auto">
address,birth,sex
Ropponmatsu Station, Fukuoka, Japan,1996-04-12,male
Tokyo Station, Japan,1988-01-05,female
Beijing, China,1977-03-20,male
      </pre>
    </div>
  </div>
</template>
