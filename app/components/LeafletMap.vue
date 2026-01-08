<script setup lang="ts">
import L from "leaflet"
import { onMounted, ref } from "vue"

// 六本松駅（目安の緯度経度）
const ropponmatsu: [number, number] = [33.5756, 130.3749]

const mapEl = ref<HTMLDivElement | null>(null)

onMounted(() => {
  if (!mapEl.value) return

  // Leafletのデフォルトアイコンがビルド環境で壊れがちなので明示設定（重要）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: new URL("leaflet/dist/images/marker-icon-2x.png", import.meta.url).toString(),
    iconUrl: new URL("leaflet/dist/images/marker-icon.png", import.meta.url).toString(),
    shadowUrl: new URL("leaflet/dist/images/marker-shadow.png", import.meta.url).toString(),
  })

  const map = L.map(mapEl.value, {
    zoomControl: true,
  }).setView(ropponmatsu, 16)

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map)

  L.marker(ropponmatsu)
    .addTo(map)
    .bindPopup("六本松駅")
    .openPopup()

  // 画面サイズ変更時に崩れるのを予防（Tailwindのレイアウト変更対策）
  setTimeout(() => map.invalidateSize(), 0)
})
</script>

<template>
  <div class="w-full h-[420px] rounded-xl overflow-hidden border border-slate-200">
    <div ref="mapEl" class="w-full h-full"></div>
  </div>
</template>
