export default defineNuxtRouteMiddleware((to) => {
  const user = useSupabaseUser()

  // ここは未ログインでも通してOK（ループ防止）
  if (to.path === "/login" || to.path === "/confirm") return

  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})
