// server/utils/supabaseAdmin.ts
import { createClient } from "@supabase/supabase-js"

export const supabaseAdmin = () => {
  const config = useRuntimeConfig()
  const url = config.supabaseUrl
  const key = config.supabaseServiceRoleKey

  if (!url) throw new Error("SUPABASE_URL is missing")
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing")

  return createClient(url, key)
}