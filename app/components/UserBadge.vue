<script setup lang="ts">
const user = useSupabaseUser()

// Google OAuth の場合ここに avatar_url / name が入ってることが多い
const meta = computed(() => (user.value?.user_metadata ?? {}) as Record<string, any>)

const email = computed(() => user.value?.email ?? "")
const avatarUrl = computed(() => meta.value.avatar_url as string | undefined)
const fullName = computed(() => (meta.value.full_name || meta.value.name) as string | undefined)

const logout = async () => {
  const client = useSupabaseClient()
  await client.auth.signOut()
  await navigateTo("/login")
}
</script>

<template>
  <div class="flex items-center justify-between gap-3 rounded-xl border bg-white px-4 py-3">
    <div class="flex items-center gap-3 min-w-0">
      <!-- Avatar -->
      <div class="h-9 w-9 shrink-0 overflow-hidden rounded-full border bg-slate-100">
        <img
          v-if="avatarUrl"
          :src="avatarUrl"
          alt="avatar"
          class="h-full w-full object-cover"
          referrerpolicy="no-referrer"
        />
        <div v-else class="h-full w-full grid place-items-center text-xs text-slate-500">
          👤
        </div>
      </div>

      <!-- Text -->
      <div class="min-w-0">
        <div class="text-sm font-medium text-slate-900 truncate">
          {{ fullName ?? "Signed in" }}
        </div>
        <div class="text-xs text-slate-500 truncate">
          {{ email }}
        </div>
      </div>
    </div>

    <button
      class="shrink-0 rounded-lg border px-3 py-2 text-sm hover:bg-slate-50"
      @click="logout"
    >
      Logout
    </button>
  </div>
</template>
