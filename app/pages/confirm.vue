<script setup lang="ts">
const user = useSupabaseUser();

watchEffect(() => {
  if (user.value) navigateTo("/app");
});
</script>

<template>
  <div style="max-width: 420px; margin: 40px auto;">
    <p>Signing you in...</p>
  </div>
</template>
