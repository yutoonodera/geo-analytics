// nuxt.config.ts
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: { enabled: true },

  modules: [
    "@nuxtjs/supabase",
    "@nuxtjs/tailwindcss",
  ],

  supabase: {
    redirectOptions: {
      login: "/login",
      callback: "/confirm",
      // ★ここが重要：ログイン関連は必ず除外
      exclude: ["/", "/login", "/confirm"],
    },
  },
  css: ["leaflet/dist/leaflet.css"],
});
