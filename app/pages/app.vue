<script setup lang="ts">
definePageMeta({ middleware: ["auth"] }) // 認証必須にしたいなら
</script>

<template>
  <div class="min-h-screen bg-slate-50 p-6">
    <div class="mx-auto max-w-4xl space-y-4">
      <div class="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
        <h1 class="text-xl font-semibold text-slate-900">Map</h1>
        <p class="mt-1 text-sm text-slate-600">六本松駅にピンを表示</p>

        <div class="mt-4">
          <ClientOnly>
            <LeafletMap />
            <template #fallback>
              <div class="w-full h-[420px] rounded-xl bg-slate-100 animate-pulse" />
            </template>
          </ClientOnly>
        </div>
      </div>
    </div>
  </div>
</template>
