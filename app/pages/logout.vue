<script setup lang="ts">
const client = useSupabaseClient();
await client.auth.signOut();
await navigateTo("/login");
</script>

<template>
  <div>Logging out...</div>
</template>
