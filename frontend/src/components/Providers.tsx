"use client"

// This file exists solely to create a "use client" boundary so that
// AuthProvider (which uses React context) can be imported from layout.tsx,
// which is a Server Component and cannot import client code directly.
import { SWRConfig } from "swr"
import { AuthProvider } from "@/lib/auth"
import { jsonFetcher } from "@/lib/swr"

// revalidateOnFocus/Reconnect are off: no such refetch existed before the
// cache layer, and keeping request patterns identical is a hard requirement.
export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SWRConfig value={{ fetcher: jsonFetcher, revalidateOnFocus: false, revalidateOnReconnect: false }}>
        {children}
      </SWRConfig>
    </AuthProvider>
  )
}
