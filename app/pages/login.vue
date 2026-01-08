<script setup lang="ts">
const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

watchEffect(() => {
  if (user.value) {
    const redirect =
      typeof route.query.redirect === "string" ? route.query.redirect : "/"
    navigateTo(redirect)
  }
})

const loading = ref(false)
const errorMsg = ref<string | null>(null)

const signInWithGoogle = async () => {
  loading.value = true
  errorMsg.value = null

  const { error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${window.location.origin}/confirm`,
    },
  })

  loading.value = false
  if (error) errorMsg.value = error.message
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-4">
    <div class="w-full max-w-md rounded-2xl bg-white/90 backdrop-blur border border-white/20 shadow-2xl">
      <div class="p-8">
        <!-- Header -->
        <div class="text-center mb-8">
          <div class="mx-auto mb-4 h-12 w-12 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl">
            🗺️
          </div>
          <h1 class="text-2xl font-semibold tracking-tight text-slate-900">
            Welcome back
          </h1>
          <p class="mt-2 text-sm text-slate-600">
            Sign in to continue
          </p>
        </div>

        <!-- Google button -->
        <button
          @click="signInWithGoogle"
          :disabled="loading"
          class="w-full flex items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-800 hover:bg-slate-50 transition disabled:opacity-50"
        >
          <svg class="h-5 w-5" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.6l6.84-6.84C35.91 2.7 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.2C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.5c0-1.64-.15-3.22-.43-4.75H24v9h12.39c-.54 2.9-2.18 5.36-4.63 7.04l7.48 5.8C43.98 37.06 46.1 31.2 46.1 24.5z"/>
            <path fill="#FBBC05" d="M10.54 28.42a14.45 14.45 0 010-8.84l-7.98-6.2a24.01 24.01 0 000 21.24l7.98-6.2z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.14 15.91-5.81l-7.48-5.8c-2.08 1.4-4.75 2.23-8.43 2.23-6.26 0-11.57-4.22-13.46-9.92l-7.98 6.2C6.51 42.62 14.62 48 24 48z"/>
          </svg>

          <span>
            {{ loading ? "Redirecting..." : "Continue with Google" }}
          </span>
        </button>

        <!-- Error -->
        <p v-if="errorMsg" class="mt-4 text-sm text-red-600 text-center">
          {{ errorMsg }}
        </p>

        <!-- Footer -->
        <div class="mt-8 text-center text-xs text-slate-500">
          Secure login powered by Supabase
        </div>
      </div>
    </div>
  </div>
</template>
