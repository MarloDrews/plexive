"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import PostCard from "@/app/components/PostCard"
import BottomNav from "@/app/components/BottomNav"
import EmptyState from "@/components/EmptyState"
import Spinner from "@/components/Spinner"
import type { Post } from "@/types/post"
import { FORMAT_IDS, FORMAT_STYLES, type FormatId } from "@/lib/formats"

const API_URL = process.env.NEXT_PUBLIC_API_URL

interface FeedTab {
  id: string
  label: string
  format: FormatId | null
  accent: string
  rgb: readonly [number, number, number]
}

const TABS: FeedTab[] = [
  { id: "for-you", label: "For You", format: null, accent: "#ffffff", rgb: [255, 255, 255] },
  ...FORMAT_IDS.map((id) => ({
    id,
    label: FORMAT_STYLES[id].label,
    format: id,
    accent: FORMAT_STYLES[id].accent,
    rgb: FORMAT_STYLES[id].rgb,
  })),
]

const HALF_IND = 8 // half of w-4 (16px indicator width)

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-[100dvh] bg-zinc-950 flex justify-center">
      <div className="w-full max-w-[430px] h-[100dvh] relative">{children}</div>
    </div>
  )
}

function TabPage({
  tab,
  slugs,
  isActivated,
}: {
  tab: (typeof TABS)[number]
  slugs: string[]
  isActivated: boolean
}) {
  const [posts, setPosts] = useState<Post[] | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (posts === null || !scrollRef.current) return
    const raw = sessionStorage.getItem("feedScrollPosition")
    if (!raw) return
    const { scrollTop, tabId } = JSON.parse(raw)
    if (tabId !== tab.id) return
    scrollRef.current.scrollTop = scrollTop
    sessionStorage.removeItem("feedScrollPosition")
  }, [posts, tab.id])

  useEffect(() => {
    if (!isActivated || posts !== null || slugs.length === 0) return
    const params = new URLSearchParams({ interests: slugs.join(",") })
    if (tab.format) params.set("format", tab.format)
    fetch(`${API_URL}/api/feed?${params}`)
      .then((r) => r.json())
      .then((data: Post[]) => setPosts(data))
  }, [isActivated, posts, slugs, tab.format]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={scrollRef} className="w-full shrink-0 snap-start h-[100dvh] overflow-y-scroll snap-y snap-mandatory overscroll-y-contain [&::-webkit-scrollbar]:hidden [scrollbar-width:none] pb-14">
      {!isActivated ? (
        <div className="h-full bg-zinc-950" />
      ) : posts === null ? (
        <div className="h-full flex items-center justify-center bg-zinc-950">
          <Spinner />
        </div>
      ) : posts.length === 0 && tab.format ? (
        <div className="h-full flex items-center justify-center bg-zinc-950">
          <EmptyState format={tab.format} accentColor={tab.accent} />
        </div>
      ) : posts.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center gap-3 bg-zinc-950">
          <p className="text-white font-semibold">Nothing here yet</p>
          <p className="text-zinc-500 text-sm">Try adjusting your interests</p>
        </div>
      ) : (
        posts.map((post) => <PostCard key={post.id} post={post} activeTabId={tab.id} />)
      )}
    </div>
  )
}

export default function Home() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("for-you")
  const [activatedTabs, setActivatedTabs] = useState<Set<string>>(new Set(["for-you"]))
  const [slugs, setSlugs] = useState<string[]>([])
  const outerRef        = useRef<HTMLDivElement>(null)
  const activeTabRef    = useRef("for-you")
  const tabRefs         = useRef<Record<string, HTMLButtonElement | null>>({})
  const indicatorRef    = useRef<HTMLDivElement>(null)
  const tabStripRef     = useRef<HTMLDivElement>(null)
  const isFirstTabCenter = useRef(true)

  // Check localStorage on mount, store interests, and restore active tab from sessionStorage
  useEffect(() => {
    const saved = localStorage.getItem("deepscroll_interests")
    if (!saved) {
      router.replace("/onboarding")
      return
    }
    setSlugs(JSON.parse(saved))

    const savedTab = sessionStorage.getItem("feedActiveTab")
    if (savedTab) {
      const tabIndex = TABS.findIndex((t) => t.id === savedTab)
      if (tabIndex !== -1) {
        activeTabRef.current = savedTab
        setActiveTab(savedTab)
        setActivatedTabs(new Set(["for-you", savedTab]))
        sessionStorage.removeItem("feedActiveTab")
        requestAnimationFrame(() => {
          if (outerRef.current) {
            outerRef.current.scrollLeft = tabIndex * outerRef.current.clientWidth
          }
        })
      }
    }
  }, [router])

  // Center the active tab label in the tab bar whenever activeTab changes
  useEffect(() => {
    const button = tabRefs.current[activeTab]
    if (!button) return
    button.scrollIntoView({
      behavior: isFirstTabCenter.current ? "instant" : "smooth",
      inline: "center",
      block: "nearest",
    })
    isFirstTabCenter.current = false
  }, [activeTab])

  // Real-time indicator + state update on outer feed scroll
  useEffect(() => {
    const el = outerRef.current
    if (!el) return

    function updateIndicator() {
      if (!el || !indicatorRef.current) return
      const progress   = el.scrollLeft / el.clientWidth
      const leftIndex  = Math.max(0,              Math.floor(progress))
      const rightIndex = Math.min(TABS.length - 1, Math.ceil(progress))
      const fraction   = progress - Math.floor(progress)

      const leftBtn  = tabRefs.current[TABS[leftIndex].id]
      const rightBtn = tabRefs.current[TABS[rightIndex].id]
      if (!leftBtn || !rightBtn) return

      const leftX  = leftBtn.offsetLeft  + leftBtn.offsetWidth  / 2 - HALF_IND
      const rightX = rightBtn.offsetLeft + rightBtn.offsetWidth / 2 - HALF_IND
      const x      = leftX + (rightX - leftX) * fraction

      const [lr, lg, lb] = TABS[leftIndex].rgb as [number, number, number]
      const [rr, rg, rb] = TABS[rightIndex].rgb as [number, number, number]
      const r = Math.round(lr + (rr - lr) * fraction)
      const g = Math.round(lg + (rg - lg) * fraction)
      const b = Math.round(lb + (rb - lb) * fraction)

      indicatorRef.current.style.transition = "none"
      indicatorRef.current.style.left = `${x}px`
      indicatorRef.current.style.backgroundColor = `rgb(${r},${g},${b})`
    }

    function onSettled() {
      if (!el) return
      // Restore a brief transition so the final snap feels smooth
      if (indicatorRef.current) {
        indicatorRef.current.style.transition =
          "left 0.15s ease-out, background-color 0.15s ease-out"
      }
      const index = Math.round(el.scrollLeft / el.clientWidth)
      const tab = TABS[index]
      if (!tab || tab.id === activeTabRef.current) return
      activeTabRef.current = tab.id
      setActiveTab(tab.id)
      setActivatedTabs((prev) => new Set([...prev, tab.id]))
    }

    // Set initial indicator position
    updateIndicator()

    el.addEventListener("scroll", updateIndicator, { passive: true })

    if ("onscrollend" in el) {
      el.addEventListener("scrollend", onSettled, { passive: true })
      return () => {
        el.removeEventListener("scroll", updateIndicator)
        el.removeEventListener("scrollend", onSettled)
      }
    }

    // Fallback: 50ms debounce for older browsers.
    // Cast needed: lib.dom assumes scrollend always exists, narrowing el to never here.
    const legacyEl = el as HTMLDivElement
    let timer: ReturnType<typeof setTimeout>
    function onScroll() {
      clearTimeout(timer)
      timer = setTimeout(onSettled, 50)
    }
    legacyEl.addEventListener("scroll", onScroll, { passive: true })
    return () => {
      legacyEl.removeEventListener("scroll", updateIndicator)
      legacyEl.removeEventListener("scroll", onScroll)
      clearTimeout(timer)
    }
  }, [])

  function handleTabClick(index: number) {
    const tab = TABS[index]
    activeTabRef.current = tab.id
    setActiveTab(tab.id)
    setActivatedTabs((prev) => new Set([...prev, tab.id]))
    outerRef.current?.scrollTo({
      left: index * (outerRef.current.clientWidth),
      behavior: "smooth",
    })
  }

  return (
    <PhoneFrame>
      {/* Tab bar — single sliding indicator, TikTok style */}
      <div className="absolute top-0 left-0 right-0 z-20">
        <div className="relative bg-zinc-950/90 backdrop-blur-md">
          {/* Left edge fade */}
          <div className="absolute left-0 top-0 h-full w-10 bg-gradient-to-r from-zinc-950 to-transparent pointer-events-none z-10" />
          {/* Right edge fade */}
          <div className="absolute right-0 top-0 h-full w-10 bg-gradient-to-l from-zinc-950 to-transparent pointer-events-none z-10" />
          {/* Scrollable tab strip */}
          <div
            ref={tabStripRef}
            className="relative flex overflow-x-scroll snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none] h-[44px] items-center px-[calc(50%-40px)]"
          >
            {TABS.map((tab, i) => {
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  ref={(el) => { tabRefs.current[tab.id] = el }}
                  onClick={() => handleTabClick(i)}
                  className={`snap-center shrink-0 px-4 h-[44px] flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? "text-white scale-100 font-semibold"
                      : "text-zinc-500 scale-90 font-medium"
                  }`}
                >
                  <span className="text-sm whitespace-nowrap">{tab.label}</span>
                </button>
              )
            })}
            {/* Single sliding indicator — positioned in scroll-content space */}
            <div
              ref={indicatorRef}
              className="absolute bottom-0 h-[4px] w-4 rounded-full pointer-events-none"
              style={{ left: 0, backgroundColor: "rgb(255,255,255)" }}
            />
          </div>
        </div>
      </div>

      {/* Horizontal strip — one full-width page per tab */}
      <div
        ref={outerRef}
        className="h-full flex flex-row overflow-x-scroll overflow-y-hidden snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [scrollbar-width:none]"
      >
        {TABS.map((tab) => (
          <TabPage
            key={tab.id}
            tab={tab}
            slugs={slugs}
            isActivated={activatedTabs.has(tab.id)}
          />
        ))}
      </div>
      <BottomNav activeTab="feed" />
    </PhoneFrame>
  )
}
