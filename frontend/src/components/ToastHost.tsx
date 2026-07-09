"use client"

import { useEffect, useRef, useState } from "react"
import Toast from "./Toast"
import { subscribeToast } from "@/lib/toastBus"

// The one fixed toast element per page. Cards raise it via showToast(); the
// hide timer lives here and is cleared before reuse, so two toasts in quick
// succession extend the visible window instead of the first hiding the second.
export default function ToastHost() {
  const [message, setMessage] = useState("")
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const unsubscribe = subscribeToast((msg) => {
      setMessage(msg)
      setVisible(true)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setVisible(false), 2000)
    })
    return () => {
      unsubscribe()
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return <Toast message={message} visible={visible} />
}
