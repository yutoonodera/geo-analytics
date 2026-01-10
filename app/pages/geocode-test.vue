<script setup lang="ts">
const address = ref("Fukuoka, Japan")
const result = ref<any>(null)
const errorMsg = ref<string | null>(null)
const loading = ref(false)

const run = async () => {
  loading.value = true
  errorMsg.value = null
  result.value = null
  try {
    const data = await $fetch("/api/geocode", {
      params: { address: address.value },
    })
    result.value = data
  } catch (e: any) {
    errorMsg.value = e?.data?.statusMessage || e?.message || "Unknown error"
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="p-6 max-w-2xl space-y-3">
    <h1 class="text-xl font-semibold">Nominatim Geocode Test</h1>

    <div class="flex gap-2">
      <input
        v-model="address"
        class="flex-1 border rounded-lg px-3 py-2"
        placeholder="e.g. 1 Infinite Loop, Cupertino, CA"
      />
      <button class="px-4 py-2 rounded-lg border bg-white" :disabled="loading" @click="run">
        {{ loading ? "Running..." : "Geocode" }}
      </button>
    </div>

    <p v-if="errorMsg" class="text-sm text-red-600">{{ errorMsg }}</p>

    <div v-if="result" class="rounded-lg border bg-white p-3 text-sm">
      <div><b>lat</b>: {{ result.lat }}</div>
      <div><b>lng</b>: {{ result.lng }}</div>
      <div class="mt-2"><b>displayName</b>: {{ result.displayName }}</div>

      <details class="mt-2">
        <summary class="cursor-pointer">raw</summary>
        <pre class="mt-2 overflow-auto">{{ JSON.stringify(result.raw, null, 2) }}</pre>
      </details>
    </div>
  </div>
</template>
