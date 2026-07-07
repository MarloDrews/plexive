"use client"

// Read-aloud hook. The page text is split into sentences and spoken ONE
// sentence at a time (a "sentence queue"), through one of two engines:
// - Piper (preferred): a neural TTS model running in the browser via
//   vits-web — natural voice; each sentence becomes a small WAV played
//   through a single reused <audio> element (sentence highlight only).
// - speechSynthesis (fallback): the built-in browser voices — less natural
//   but instant, and Chrome's onboundary events add per-word highlights.

import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { extractReadableText, type ReadableText } from "./extractText"
import {
  rangeFromOffsets,
  setHighlight,
  clearHighlights,
  SENTENCE_HIGHLIGHT,
  WORD_HIGHLIGHT,
} from "./highlights"
import { pickVoice, warmVoices } from "./voice"
import { loadPiper, type SynthesizeFn } from "./piper"

export type ReadAloudStatus = "idle" | "loading" | "playing" | "paused"

// A tiny silent WAV: playing it inside the user's tap "blesses" the audio
// element on strict autoplay browsers (iOS Safari) so the asynchronously
// generated sentences may play later.
const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA="

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window
    ? window.speechSynthesis
    : null
}

function unlockAudio(audio: HTMLAudioElement) {
  audio.src = SILENT_WAV
  void audio.play().catch(() => {})
}

export function useReadAloud(rootRef: RefObject<HTMLElement | null>) {
  const [status, setStatus] = useState<ReadAloudStatus>("idle")
  // Bumped on every stop/restart; callbacks of a cancelled run compare
  // against it and do nothing, so stale audio can never restart speech.
  const sessionRef = useRef(0)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const modeRef = useRef<"piper" | "browser">("browser")
  const pausedRef = useRef(false)
  const unlockedRef = useRef(false)
  // The object URL currently loaded into the audio element. Tracked so stop()
  // can revoke it: removing the src attribute alone stranded one WAV blob per
  // mid-sentence stop until page unload.
  const currentUrlRef = useRef<string | null>(null)

  const releaseCurrentUrl = useCallback(() => {
    if (currentUrlRef.current) {
      URL.revokeObjectURL(currentUrlRef.current)
      currentUrlRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    sessionRef.current++
    pausedRef.current = false
    const s = synth()
    if (s) {
      // Chrome ignores cancel() while paused unless resumed first.
      s.resume()
      s.cancel()
    }
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.removeAttribute("src")
    }
    releaseCurrentUrl()
    clearHighlights()
    setStatus("idle")
  }, [releaseCurrentUrl])

  const start = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const session = ++sessionRef.current
    pausedRef.current = false

    // Silence anything still playing from a previous run.
    const s = synth()
    if (s) {
      s.resume()
      s.cancel()
    }
    audioRef.current?.pause()

    const { segments, sentences }: ReadableText = extractReadableText(root)
    // A post with no readable body text: stay idle, never crash.
    if (sentences.length === 0) return

    const showSentence = (index: number) => {
      const sentence = sentences[index]
      const range = rangeFromOffsets(segments, sentence.start, sentence.end)
      setHighlight(SENTENCE_HIGHLIGHT, range)
      setHighlight(WORD_HIGHLIGHT, null)
      // Keep the spoken sentence on screen as the voice moves down the post.
      range?.startContainer.parentElement?.scrollIntoView({
        block: "center",
        behavior: "smooth",
      })
    }

    const finish = () => {
      clearHighlights()
      setStatus("idle")
    }

    const playWithPiper = (synthesizeText: SynthesizeFn) => {
      modeRef.current = "piper"
      setStatus("playing")
      const audio = audioRef.current ?? (audioRef.current = new Audio())

      // One generation promise per sentence, so the next sentence can be
      // synthesized while the current one is playing (no gaps).
      const cache = new Map<number, Promise<Blob | null>>()
      const synthesize = (index: number): Promise<Blob | null> => {
        if (index >= sentences.length) return Promise.resolve(null)
        let pending = cache.get(index)
        if (!pending) {
          pending = synthesizeText(sentences[index].text).catch(() => null)
          cache.set(index, pending)
        }
        return pending
      }

      const playFrom = async (index: number) => {
        if (session !== sessionRef.current) return
        if (index >= sentences.length) {
          finish()
          return
        }
        showSentence(index)
        const blob = await synthesize(index)
        if (session !== sessionRef.current) return
        // Keep two sentences in the generation pipeline while this one
        // plays, so playback never waits on the synthesizer.
        void synthesize(index + 1)
        void synthesize(index + 2)
        if (!blob) {
          // Generation failed: skip the sentence instead of dying mid-post.
          cache.delete(index)
          void playFrom(index + 1)
          return
        }
        const url = URL.createObjectURL(blob)
        currentUrlRef.current = url
        // Playback only moves forward, so a sentence's WAV can leave the cache
        // once it played (uncompressed PCM: a long post used to accumulate
        // tens of MB until the run ended).
        const releaseSentence = () => {
          if (currentUrlRef.current === url) currentUrlRef.current = null
          URL.revokeObjectURL(url)
          cache.delete(index)
        }
        audio.src = url
        audio.onended = () => {
          releaseSentence()
          void playFrom(index + 1)
        }
        audio.onerror = () => {
          releaseSentence()
          if (session === sessionRef.current) void playFrom(index + 1)
        }
        // If the user paused while this sentence was being generated, leave
        // the audio loaded; resume() will play it.
        if (!pausedRef.current) {
          audio.play().catch(() => {
            // Autoplay blocked (no user gesture on this page yet).
            releaseSentence()
            if (session === sessionRef.current) finish()
          })
        }
      }
      void playFrom(0)
    }

    const playWithBrowserVoices = () => {
      if (!s) {
        finish()
        return
      }
      modeRef.current = "browser"
      setStatus("playing")
      const lang = document.documentElement.lang || "en"
      const voice = pickVoice(lang)

      const speakFrom = (index: number) => {
        if (session !== sessionRef.current) return
        if (index >= sentences.length) {
          finish()
          return
        }
        const sentence = sentences[index]
        showSentence(index)

        const utterance = new SpeechSynthesisUtterance(sentence.text)
        if (voice) {
          utterance.voice = voice
          utterance.lang = voice.lang
        } else {
          utterance.lang = lang
        }
        utterance.onboundary = (e) => {
          if (session !== sessionRef.current || e.name !== "word") return
          const wordStart = sentence.start + e.charIndex
          // charLength is missing in some engines; fall back to "until the
          // next whitespace" inside the sentence.
          const length =
            e.charLength || (sentence.text.slice(e.charIndex).match(/^\S+/)?.[0].length ?? 0)
          if (length > 0) {
            setHighlight(WORD_HIGHLIGHT, rangeFromOffsets(segments, wordStart, wordStart + length))
          }
        }
        utterance.onend = () => speakFrom(index + 1)
        utterance.onerror = (e) => {
          if (session !== sessionRef.current) return
          // cancel() reports interrupted/canceled — that is not an error here.
          if (e.error === "interrupted" || e.error === "canceled") return
          speakFrom(index + 1)
        }
        s.speak(utterance)
      }
      speakFrom(0)
    }

    // Unlock the audio element while (possibly) inside a user gesture.
    if (!unlockedRef.current) {
      unlockedRef.current = true
      unlockAudio(audioRef.current ?? (audioRef.current = new Audio()))
    }

    // "loading" covers the one-time model download/initialization; the
    // transport button cancels it by bumping the session via stop().
    setStatus("loading")
    loadPiper().then((synthesizeText) => {
      if (session !== sessionRef.current) return
      if (synthesizeText) playWithPiper(synthesizeText)
      else playWithBrowserVoices()
    })
  }, [rootRef])

  const pause = useCallback(() => {
    pausedRef.current = true
    if (modeRef.current === "piper") audioRef.current?.pause()
    else synth()?.pause()
    setStatus("paused")
  }, [])

  const resume = useCallback(() => {
    pausedRef.current = false
    if (modeRef.current === "piper") void audioRef.current?.play().catch(() => {})
    else synth()?.resume()
    setStatus("playing")
  }, [])

  const toggle = useCallback(() => {
    if (status === "playing") pause()
    else if (status === "paused") resume()
    else if (status === "loading") stop()
    else start()
  }, [status, pause, resume, stop, start])

  // Leaving the page must silence the voice: unmount covers in-app
  // navigation, pagehide covers tab close and full reloads. Mount also
  // warms the async browser voice list for the fallback engine.
  useEffect(() => {
    warmVoices()
    const silence = () => stop()
    window.addEventListener("pagehide", silence)
    return () => {
      window.removeEventListener("pagehide", silence)
      stop()
    }
  }, [stop])

  return { status, start, pause, resume, stop, toggle }
}
