import { useCallback, useEffect, useState } from "react"
import { Pressable, ScrollView, Text, TextInput, View } from "react-native"
import type { TextStyle } from "react-native"
import * as Haptics from "expo-haptics"
import { useRouter } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useAuth } from "../../lib/auth"
import { apiFetch } from "../../lib/api"
import { useBattleSocket } from "../../lib/battle/battleSocket"
import type { BattleInbound } from "../../lib/battle/battleSocket"
import { buildSequence } from "../../lib/battle/seededQuestions"
import type { MarathonQuestion } from "../../types/train"
import NumberSlider from "../train/NumberSlider"
import { colors, fills, fonts, radius } from "../../theme/tokens"
import { Frosted, MessageSlab, PulsingSlab, SlabGlow, ghostPillStyle } from "../stage"
import PrimaryButton from "../PrimaryButton"
import Avatar from "../Avatar"
import VerifiedBadge from "../VerifiedBadge"
import { mono, sans, sansSemiBold } from "../sections/primitives"

// The Battle tab: a real-time 1v1 quiz duel against a friend. It mirrors the
// Train marathon's look (same ScrollView shell, frosted slabs, tokens) but
// instead of a solo Elo climb two accounts race through the SAME questions and a
// winner is declared. You find an opponent with the user search (the same
// /api/search/users the search screen uses), tap Battle, and both devices play
// in lockstep over a WebSocket (../../lib/battle/battleSocket.ts) that only
// agrees a shared seed — both clients derive the identical question sequence
// locally (mock phase, see types/train.ts). Battle needs an account (the socket
// authenticates by JWT like chat), so guests see a login prompt.
//
// State machine:
//   lobby -> waiting -> question <-> feedback -> done -> summary
// where being challenged jumps straight to `question` (battle_start arrives on
// both devices). Edge events (opponent left / unavailable / error) drop back to
// the lobby with a message.

type Stage = "lobby" | "waiting" | "question" | "feedback" | "done" | "summary"

interface UserResult {
  username: string
  avatar_url: string | null
  is_verified: number
  is_self: boolean
}

const labelCaps: TextStyle = {
  fontFamily: fonts.mono,
  fontSize: 10,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: colors["ink-muted"],
}

interface Props {
  // Switch back to the feed from the summary's secondary button; falls back to
  // routing to "/" when not supplied (matches Marathon's onExit).
  onExit?: () => void
}

// A label-caps stat (tiny label over a mono value), tinted by `color`.
function ScoreStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ alignItems: "center", gap: 2, maxWidth: 130 }}>
      <Text style={labelCaps} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ fontFamily: fonts.mono, fontSize: 26, color }}>{value}</Text>
    </View>
  )
}

export default function Battle({ onExit }: Props) {
  const { user } = useAuth()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // Clear the floating FeedTabBar capsule that overlays the pager, same as Marathon.
  const topPad = insets.top + 68

  const [stage, setStage] = useState<Stage>("lobby")
  const [message, setMessage] = useState("")

  // User search (lobby).
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<UserResult[] | null>(null)
  const [searching, setSearching] = useState(false)

  // The people the user follows, shown as a tappable list in the lobby so a
  // friend can be challenged straight away without typing a search.
  const [friends, setFriends] = useState<UserResult[] | null>(null)
  const [friendsLoading, setFriendsLoading] = useState(false)

  // The paired opponent's username (for the live strip, summary and rematch).
  const [opponent, setOpponent] = useState("")

  // Duel state. `seq` is the shared question sequence both devices derive from
  // the seed; both players walk it at their own pace.
  const [seq, setSeq] = useState<MarathonQuestion[]>([])
  const [count, setCount] = useState(0)
  const [index, setIndex] = useState(0)
  const [myScore, setMyScore] = useState(0)
  const [oppScore, setOppScore] = useState(0)
  const [myDone, setMyDone] = useState(false)
  const [oppDone, setOppDone] = useState(false)

  // Per-question answer state.
  const [selected, setSelected] = useState<number | null>(null)
  const [sliderValue, setSliderValue] = useState(0)
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)

  // Numeric questions start the slider at a random step (never anchored on a
  // hintable midpoint), exactly like the Train marathon.
  function startSlider(q: MarathonQuestion | undefined) {
    if (q && q.kind === "numeric") {
      const step = q.step ?? 1
      const steps = Math.floor((q.max - q.min) / step)
      const rand = q.min + Math.round(Math.random() * steps) * step
      setSliderValue(Math.min(q.max, Math.max(q.min, rand)))
    }
  }

  function resetToLobby() {
    setStage("lobby")
    setSeq([])
    setCount(0)
    setIndex(0)
    setMyScore(0)
    setOppScore(0)
    setMyDone(false)
    setOppDone(false)
    setSelected(null)
    setLastCorrect(null)
  }

  // Inbound socket frames drive the whole duel.
  const handleEvent = useCallback((e: BattleInbound) => {
    switch (e.type) {
      case "battle_start": {
        const next = buildSequence(e.seed, e.count)
        setOpponent(e.opponent)
        setSeq(next)
        setCount(e.count)
        setIndex(0)
        setMyScore(0)
        setOppScore(0)
        setMyDone(false)
        setOppDone(false)
        setSelected(null)
        setLastCorrect(null)
        setMessage("")
        startSlider(next[0])
        setStage("question")
        break
      }
      case "opponent_progress":
        setOppScore(e.score)
        break
      case "opponent_finish":
        setOppScore(e.score)
        setOppDone(true)
        break
      case "opponent_left":
        setStage((s) => {
          if (s === "lobby" || s === "summary") return s
          setMessage("Your opponent left the battle.")
          return "lobby"
        })
        break
      case "opponent_unavailable":
        setMessage(`@${e.username ?? "That user"} is not online. Ask them to open the Battle tab.`)
        setStage((s) => (s === "waiting" ? "lobby" : s))
        break
      case "error":
        setMessage(e.detail ?? "Something went wrong.")
        setStage((s) => (s === "waiting" ? "lobby" : s))
        break
      default:
        break
    }
  }, [])

  const { status, challenge, progress, finish } = useBattleSocket(!!user, handleEvent)

  // Debounced user search (mirrors the search screen's Accounts tab).
  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        const r = await apiFetch(`/api/search/users?${new URLSearchParams({ q })}`)
        setResults(r.ok ? ((await r.json()) as UserResult[]) : [])
      } catch {
        setResults([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query])

  // Load the user's following list once so the lobby can show friends ready to
  // battle before any search. Returns the same {username, is_verified,
  // avatar_url} shape the rows expect (is_self is absent, so rows stay tappable).
  useEffect(() => {
    if (!user) {
      setFriends(null)
      return
    }
    let cancelled = false
    setFriendsLoading(true)
    apiFetch(`/api/users/${encodeURIComponent(user.username)}/following`)
      .then(async (r) => (r.ok ? ((await r.json()) as UserResult[]) : []))
      .catch(() => [])
      .then((list) => {
        if (!cancelled) setFriends(list)
      })
      .finally(() => {
        if (!cancelled) setFriendsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  // Both players finished -> reveal the result.
  useEffect(() => {
    if (stage === "done" && oppDone) setStage("summary")
  }, [stage, oppDone])

  function challengeUser(username: string) {
    if (status !== "open") {
      setMessage("Connecting... try again in a moment.")
      return
    }
    setMessage("")
    setOpponent(username)
    if (challenge(username)) setStage("waiting")
  }

  // Shared bookkeeping once an answer is committed (choice or slider).
  function commitAnswer(correct: boolean) {
    const newScore = myScore + (correct ? 1 : 0)
    setMyScore(newScore)
    setLastCorrect(correct)
    progress(index, correct, newScore)
    Haptics.notificationAsync(
      correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
    ).catch(() => {})
    setStage("feedback")
  }

  function handleSelect(i: number) {
    const cur = seq[index]
    if (stage !== "question" || selected !== null || !cur || cur.kind === "numeric") return
    setSelected(i)
    commitAnswer(i === cur.answerIndex)
  }

  function handleSubmitNumeric() {
    const cur = seq[index]
    if (stage !== "question" || !cur || cur.kind !== "numeric") return
    commitAnswer(sliderValue === cur.answerValue)
  }

  function handleNext() {
    const nextIndex = index + 1
    if (nextIndex >= count) {
      // myScore already includes the answer just revealed.
      setMyDone(true)
      finish(myScore)
      setStage("done")
      return
    }
    setIndex(nextIndex)
    setSelected(null)
    setLastCorrect(null)
    startSlider(seq[nextIndex])
    setStage("question")
  }

  function handleRematch() {
    if (!opponent || status !== "open") {
      resetToLobby()
      return
    }
    setMessage("")
    if (challenge(opponent)) setStage("waiting")
    else resetToLobby()
  }

  function handleExit() {
    if (onExit) onExit()
    else router.push("/")
  }

  // --- Render helpers -------------------------------------------------------

  function optionColors(i: number) {
    const cur = seq[index]
    if (stage !== "feedback" || lastCorrect === null || !cur || cur.kind === "numeric") {
      return { border: "transparent", background: fills.chrome, text: colors["ink-body"] }
    }
    if (i === cur.answerIndex) return { border: colors.good, background: colors.good + "1a", text: colors.good }
    if (i === selected) return { border: colors.bad, background: colors.bad + "1a", text: colors.bad }
    return { border: colors.edge, background: fills.chrome, text: colors["ink-faint"] }
  }

  function renderStrip() {
    return (
      <View style={{ flexDirection: "row", justifyContent: "space-around", alignItems: "center" }}>
        <ScoreStat label="You" value={myScore} color={colors.lamp} />
        <Text style={sans(13, colors["ink-muted"])}>vs</Text>
        <ScoreStat label={opponent ? `@${opponent}` : "Rival"} value={oppScore} color={colors.ink} />
      </View>
    )
  }

  function renderAnswerArea() {
    const cur = seq[index]
    if (!cur) return null
    if (cur.kind === "numeric") {
      const answered = stage === "feedback" && lastCorrect !== null
      return (
        <View style={{ gap: 16 }}>
          <NumberSlider
            min={cur.min}
            max={cur.max}
            step={cur.step ?? 1}
            unit={cur.unit}
            value={sliderValue}
            onChange={setSliderValue}
            disabled={answered}
            showResult={answered}
            correct={lastCorrect ?? undefined}
            correctValue={cur.answerValue}
          />
          {stage === "question" ? <PrimaryButton label="Submit" onPress={handleSubmitNumeric} /> : null}
        </View>
      )
    }
    const interactive = stage === "question"
    return (
      <View style={{ gap: 10 }}>
        {cur.options.map((opt, i) => {
          const c = optionColors(i)
          return (
            <Pressable
              key={i}
              onPress={interactive ? () => handleSelect(i) : undefined}
              disabled={!interactive || selected !== null}
              style={{
                borderRadius: radius.slab,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.background,
                paddingHorizontal: 20,
                paddingVertical: 16,
              }}
            >
              <Text style={sans(16, c.text)}>{opt}</Text>
            </Pressable>
          )
        })}
      </View>
    )
  }

  function renderLoginGate() {
    return (
      <View style={{ gap: 20 }}>
        <Text style={{ fontFamily: fonts.serifMedium, fontSize: 34, color: colors.ink }}>Battle</Text>
        <MessageSlab>
          <Text style={[sans(15, colors["ink-dim"]), { textAlign: "center" }]}>
            Log in to search for a friend and battle them 1v1.
          </Text>
          <Pressable
            onPress={() => router.push("/login")}
            style={{ backgroundColor: "rgba(124, 111, 255, 0.15)", borderRadius: 999, paddingHorizontal: 24, paddingVertical: 10 }}
          >
            <Text style={sansSemiBold(14, "#9d93ff")}>Log in</Text>
          </Pressable>
        </MessageSlab>
      </View>
    )
  }

  function renderUserRow(u: UserResult) {
    return (
      <Pressable
        key={u.username}
        onPress={() => !u.is_self && challengeUser(u.username)}
        disabled={u.is_self}
        style={{
          backgroundColor: fills.slab,
          borderRadius: radius.slab,
          paddingHorizontal: 16,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: u.is_self ? 0.5 : 1,
        }}
      >
        <Avatar username={u.username} avatarUrl={u.avatar_url} size={44} verified={u.is_verified} />
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text numberOfLines={1} style={{ fontFamily: fonts.sansSemiBold, fontSize: 14, color: colors.ink }}>
            @{u.username}
          </Text>
          {u.is_verified > 0 && <VerifiedBadge size={14} level={u.is_verified} />}
        </View>
        {u.is_self ? (
          <Text style={sans(12, colors["ink-muted"])}>You</Text>
        ) : (
          <View style={{ backgroundColor: "rgba(124, 111, 255, 0.15)", borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
            <Text style={sansSemiBold(12, "#9d93ff")}>Battle</Text>
          </View>
        )}
      </Pressable>
    )
  }

  function renderLobby() {
    // With no search typed the lobby shows the friends list; typing switches to
    // live search results. Each branch tracks its own loading and empty state.
    const searchingUsers = query.trim().length > 0
    const list = searchingUsers ? results : friends
    const loadingList = searchingUsers ? searching : friendsLoading
    return (
      <View style={{ gap: 16 }}>
        <Text style={{ fontFamily: fonts.serifMedium, fontSize: 34, color: colors.ink }}>Battle</Text>
        <Text style={[sans(15, colors["ink-dim"]), { textAlign: "center" }]}>
          Pick a friend below or search by username, then challenge them to a 1v1.
        </Text>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by username"
          placeholderTextColor={colors["ink-muted"]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            backgroundColor: fills.chrome,
            borderRadius: 999,
            paddingHorizontal: 18,
            paddingVertical: 12,
            fontFamily: fonts.sans,
            fontSize: 15,
            color: colors.ink,
          }}
        />

        {message ? (
          <MessageSlab>
            <Text style={[sans(14, colors["ink-dim"]), { textAlign: "center" }]}>{message}</Text>
          </MessageSlab>
        ) : null}

        {!searchingUsers ? <Text style={labelCaps}>Your friends</Text> : null}

        {loadingList ? (
          <View style={{ gap: 8 }}>
            <PulsingSlab height={68} />
            <PulsingSlab height={68} />
          </View>
        ) : list && list.length > 0 ? (
          <View style={{ gap: 8 }}>{list.map(renderUserRow)}</View>
        ) : searchingUsers ? (
          <Text style={[sans(14, colors["ink-muted"]), { textAlign: "center", paddingTop: 24 }]}>
            No one found for “{query}”.
          </Text>
        ) : friends !== null ? (
          <Text style={[sans(14, colors["ink-muted"]), { textAlign: "center", paddingTop: 24 }]}>
            You are not following anyone yet. Search by username to find a friend.
          </Text>
        ) : null}
      </View>
    )
  }

  function renderWaiting() {
    return (
      <MessageSlab>
        <Text style={sansSemiBold(16, colors.ink)}>Waiting for @{opponent}...</Text>
        <Text style={[sans(14, colors["ink-dim"]), { textAlign: "center" }]}>
          They need the Battle tab open to accept.
        </Text>
        <Pressable onPress={resetToLobby} style={{ ...ghostPillStyle, alignItems: "center" }}>
          <Text style={sansSemiBold(14, colors["ink-body"])}>Cancel</Text>
        </Pressable>
      </MessageSlab>
    )
  }

  function renderQuestion() {
    const cur = seq[index]
    if (!cur) return null
    return (
      <View style={{ gap: 16 }}>
        {renderStrip()}
        <Frosted fill={fills.slab} borderRadius={radius.slab} style={{ overflow: "hidden" }}>
          <SlabGlow accent={colors.lamp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ paddingHorizontal: 24, paddingVertical: 28, gap: 16 }}>
            <Text style={labelCaps}>
              Question {index + 1} of {count}
            </Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, lineHeight: 30, color: colors.ink }}>
              {cur.prompt}
            </Text>
          </View>
        </Frosted>
        {renderAnswerArea()}
      </View>
    )
  }

  function renderFeedback() {
    const cur = seq[index]
    if (!cur || lastCorrect === null) return null
    const good = lastCorrect
    const last = index + 1 >= count
    return (
      <View style={{ gap: 16 }}>
        {renderStrip()}
        <Frosted fill={fills.slab} borderRadius={radius.slab} style={{ overflow: "hidden" }}>
          <SlabGlow accent={colors.lamp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ paddingHorizontal: 24, paddingVertical: 28, gap: 14 }}>
            <Text
              style={{
                fontFamily: fonts.sansSemiBold,
                fontSize: 11,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: good ? colors.good : colors.bad,
              }}
            >
              {good ? "Correct" : "Incorrect"}
            </Text>
            <Text style={{ fontFamily: fonts.serif, fontSize: 20, lineHeight: 28, color: colors.ink }}>
              {cur.prompt}
            </Text>
          </View>
        </Frosted>
        {renderAnswerArea()}
        {cur.explanation ? (
          <Text style={sans(14, colors["ink-dim"], { lineHeight: 21 })}>{cur.explanation}</Text>
        ) : null}
        <PrimaryButton label={last ? "Finish" : "Next"} onPress={handleNext} />
      </View>
    )
  }

  function renderDone() {
    return (
      <MessageSlab>
        <Text style={sansSemiBold(16, colors.ink)}>You finished — {myScore} correct</Text>
        <Text style={[sans(14, colors["ink-dim"]), { textAlign: "center" }]}>
          Waiting for @{opponent} to finish...
        </Text>
      </MessageSlab>
    )
  }

  function renderSummary() {
    const won = myScore > oppScore
    const draw = myScore === oppScore
    const title = draw ? "Draw" : won ? "You win" : "You lose"
    const titleColor = draw ? colors.ink : won ? colors.good : colors.bad
    return (
      <View style={{ gap: 20 }}>
        <Frosted fill={fills.slab} borderRadius={radius.slab} style={{ overflow: "hidden" }}>
          <SlabGlow accent={colors.lamp} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
          <View style={{ paddingHorizontal: 24, paddingVertical: 32, gap: 20, alignItems: "center" }}>
            <Text style={{ fontFamily: fonts.serifMedium, fontSize: 30, color: titleColor }}>{title}</Text>
            <View style={{ flexDirection: "row", justifyContent: "space-around", alignSelf: "stretch" }}>
              <ScoreStat label="You" value={myScore} color={colors.lamp} />
              <Text style={sans(15, colors["ink-muted"])}>vs</Text>
              <ScoreStat label={opponent ? `@${opponent}` : "Rival"} value={oppScore} color={colors.ink} />
            </View>
          </View>
        </Frosted>
        <View style={{ gap: 10 }}>
          <PrimaryButton label="Rematch" onPress={handleRematch} disabled={status !== "open"} />
          <Pressable onPress={handleExit} style={{ ...ghostPillStyle, alignItems: "center" }}>
            <Text style={sansSemiBold(14, colors["ink-body"])}>Back to feed</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  let body: React.ReactNode
  if (!user) body = renderLoginGate()
  else if (stage === "lobby") body = renderLobby()
  else if (stage === "waiting") body = renderWaiting()
  else if (stage === "question") body = renderQuestion()
  else if (stage === "feedback") body = renderFeedback()
  else if (stage === "done") body = renderDone()
  else body = renderSummary()

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: topPad, paddingBottom: 96 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {body}
    </ScrollView>
  )
}
