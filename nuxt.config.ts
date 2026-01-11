// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  modules: [
    "@nuxtjs/supabase",
    "@nuxtjs/tailwindcss",
  ],

  // ✅ サーバー専用の環境変数（クライアントに漏れない）
  runtimeConfig: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    workerToken: process.env.WORKER_TOKEN,
    public: {},
  },

  supabase: {
    redirectOptions: {
      login: "/login",
      callback: "/confirm",
      // ✅ API は必ず除外（重要）
      exclude: ["/", "/login", "/confirm", "/api/**"],
    },
  },

  css: ["leaflet/dist/leaflet.css",
        "leaflet.markercluster/dist/MarkerCluster.css",
        "leaflet.markercluster/dist/MarkerCluster.Default.css",
  ],
  vite: {
    server: {
      allowedHosts: ["nuxt"],
    },
  },
})
