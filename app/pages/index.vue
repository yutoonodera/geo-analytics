<script setup lang="ts">
const supabase = useSupabaseClient()
const user = useSupabaseUser()

console.log('[index] script start', { server: import.meta.server, client: import.meta.client })

onMounted(async () => {
  console.log('[index] mounted', { user: user.value })

  try {
    const res = await supabase.from('dummy').select('*')
    console.log('[index] res', res)
  } catch (e) {
    console.log('[index] catch', e)
  }
})
</script>

<template>
  <div style="padding:24px;">
    <h1>Home</h1>
    <p>Open browser console</p>
  </div>
</template>
