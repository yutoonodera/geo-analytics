<script setup lang="ts">
const user = useSupabaseUser();
</script>

<template>
  <div style="max-width: 720px; margin: 40px auto;">
    <h1>App</h1>
    <p v-if="user">Logged in as: {{ user.email }}</p>
    <p v-else>Not logged in</p>
  </div>
</template>
