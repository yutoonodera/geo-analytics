<script setup lang="ts">
const client = useSupabaseClient()
const user = useSupabaseUser()
const route = useRoute()

// 未ログインは表示しない（ページ側で弾く前提）
const meta = computed(() => (user.value?.user_metadata ?? {}) as Record<string, any>)
const email = computed(() => user.value?.email ?? "")
const fullName = computed(
  () => (meta.value.full_name || meta.value.name) as string | undefined
)

const avatarUrl = computed(() => {
  const m = meta.value
  return (m.avatar_url || m.picture || m.avatar) as string | undefined
})

const signOut = async () => {
  await client.auth.signOut()
  navigateTo(`/login?redirect=${route.fullPath}`)
}
</script>

<template>
  <div
    v-if="user"
    class="flex items-center justify-between rounded-xl border bg-white px-4 py-3"
  >
    <div class="flex items-center gap-3 min-w-0">
      <!-- Avatar -->
      <div class="h-9 w-9 overflow-hidden rounded-full border bg-slate-100 shrink-0">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          class="h-full w-full object-cover"
          referrerpolicy="no-referrer"
          alt="avatar"
        />
        <div
          v-else
          class="h-full w-full flex items-center justify-center text-[11px] text-slate-500"
        >
          👤
        </div>
      </div>

      <!-- Name / Email -->
      <div class="min-w-0">
        <div class="text-sm font-semibold text-slate-800 truncate">
          {{ fullName ?? "Signed in" }}
        </div>
        <div class="text-xs text-slate-500 truncate">
          {{ email }}
        </div>
      </div>
    </div>

    <!-- Sign out -->
    <button
      class="px-3 py-2 rounded-lg border bg-white text-sm hover:bg-slate-50"
      @click="signOut"
    >
      Sign out
    </button>
  </div>
</template>
