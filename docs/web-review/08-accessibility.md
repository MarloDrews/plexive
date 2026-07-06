# Web Review: Accessibility
Date: 2026-07-06 | Model: Fable 5 | Scope: frontend/src/app (pages + components), frontend/src/components (shared + sections), frontend/src/lib (glyphs, formats, bookCover), frontend/src/app/globals.css, frontend/src/app/layout.tsx

## Files reviewed

- frontend/src/app/globals.css, layout.tsx, page.tsx
- frontend/src/app/post/[id]/page.tsx
- frontend/src/app/login/page.tsx, register/page.tsx, create/page.tsx, search/page.tsx, my-posts/page.tsx, saved-posts/page.tsx, stats/page.tsx
- frontend/src/app/profile/page.tsx, profile/[username]/page.tsx
- frontend/src/app/chat/page.tsx, chat/[id]/page.tsx
- frontend/src/app/onboarding/InterestPicker.tsx
- frontend/src/app/components: PostCard, FeedHeader, BottomNav, SegmentedTabs, CommentsBottomSheet, CommentsSection, CommentRow, Toast, Marathon, Battle, NumberSlider, stage, icons
- frontend/src/app/lib/useSwipeTabs.ts
- frontend/src/components: SvgBlock, BookCover, GeneratedBookCover, Avatar, VerifiedBadge, DotScale, SectionLabel, SectionRenderer, Prose, MathText
- frontend/src/components/sections: ContentImage, HeadlineSection, PortraitSection, StorySection, CoreIdeasSection, HeadlineFigureSection, QuizSection, RelatedPostsSection, AuthorContextSection, AuthorsContextSection, CastSection, OriginSection, plus a grep sweep of all SvgBlock / img call sites across the sections directory
- frontend/src/lib/glyphs.ts (header + representative entries)

Contrast figures below are computed WCAG 2.x ratios against the real composited surfaces: surface-0 #0a0a0a, the frosted slab (white 4% over surface-0), and field fills (white 6%).

## Summary table

| ID | Title | Severity | Confidence | Category | Effort |
|---|---|---|---|---|---|
| A11Y-001 | Feed post cards are not keyboard operable | High | High | a11y (keyboard) | M |
| A11Y-002 | NumberSlider is pointer-only with no slider semantics | High | High | a11y (keyboard/SR) | M |
| A11Y-003 | Form inputs labeled by placeholder only, visible labels never associated | High | High | a11y (forms) | L |
| A11Y-004 | Sheets and overlays lack dialog semantics and focus management | High | High | a11y (modals) | L |
| A11Y-005 | Meaningful content images hardcoded to alt="" | High | High | a11y (images) | M |
| A11Y-006 | SvgBlock offers no accessible name, decorative glyph overlays not hidden | High | High | a11y (images) | M |
| A11Y-007 | ink-muted and ink-faint text fail WCAG AA contrast across the app | High | High | a11y (contrast) | L |
| A11Y-008 | Private-account toggle exposes no on/off state | High | High | a11y (forms/ARIA) | S |
| A11Y-009 | Follow control in search results is unfocusable and invalidly nested | High | High | a11y (keyboard) | S |
| A11Y-010 | Post headlines render as p, most detail pages have no h1 | Medium | High | a11y (semantics) | M |
| A11Y-011 | Several pages have no headings at all | Medium | High | a11y (semantics) | M |
| A11Y-012 | Tab systems have no tab semantics or arrow-key support | Medium | High | a11y (ARIA) | M |
| A11Y-013 | Off-screen pager pages and quiz slides stay in the tab order | Medium | High | a11y (keyboard) | M |
| A11Y-014 | Selection chips, format cards and filter pills expose no selected state | Medium | High | a11y (ARIA) | M |
| A11Y-015 | Accordions and expandable panels lack aria-expanded | Medium | High | a11y (ARIA) | S |
| A11Y-016 | Errors and async status changes are never announced | Medium | High | a11y (live regions) | L |
| A11Y-017 | Toast is not announced and its stale message stays exposed | Medium | High | a11y (live regions) | S |
| A11Y-018 | Quiz/Train/Battle answer feedback is color-only on the options | Medium | High | a11y (color) | M |
| A11Y-019 | Stats visuals have no non-visual alternative, heatmap data is title-attribute only | Medium | High | a11y (images/SR) | L |
| A11Y-020 | DotScale hides difficulty from screen readers with no text equivalent | Medium | High | a11y (images) | S |
| A11Y-021 | Unlabeled or ambiguous remove/delete buttons | Medium | High | a11y (labels) | S |
| A11Y-022 | VerifiedBadge relies on aria-label without role, stats uses a bare check glyph | Low | High | a11y (SR) | S |
| A11Y-023 | Icon components are neither hidden nor named by default | Low | High | a11y (images) | S |
| A11Y-024 | No landmarks and no skip link, nav dock is a plain div | Low | High | a11y (semantics) | S |
| A11Y-025 | JS smooth scrolling is not gated on prefers-reduced-motion | Low | High | a11y (motion) | S |
| A11Y-026 | Scrollbars are hidden app-wide on both axes | Low | High | a11y (usability) | S |
| A11Y-027 | Action-rail counts are detached from their buttons | Low | High | a11y (SR) | S |
| A11Y-028 | Meaningful lists rendered as plain divs | Low | High | a11y (semantics) | M |
| A11Y-029 | Comments sheet expand gesture is touch-only | Low | High | a11y (keyboard) | S |
| A11Y-030 | Error/destructive red is marginally below AA on frosted slabs | Low | High | a11y (contrast) | S |

## Findings

### A11Y-001: Feed post cards are not keyboard operable
- Location: frontend/src/app/components/PostCard.tsx:318-325 (also 281-299 for the tap logic)
- Severity: High | Confidence: High | Category: a11y (keyboard)
- Description: The entire feed card is a `div` with `onClick={handleCardClick}` and `style={{ cursor: "pointer" }}`, with no `role`, no `tabIndex`, and no key handler. Opening a post from the feed (single tap) and the double-tap like shortcut are both pointer-only. The buttons inside the card (read aloud, like, comment, save, share) are focusable, but no focusable element navigates to the post itself.
- Impact: Keyboard and switch-device users cannot open any post from the feed, which is the app's primary interaction. Screen reader users get no "link/button" role announcing that the card is activatable.
- Fix approach: Give each card a real navigation element (a Link/anchor wrapping the slab content, or a visually-styled button) so it is focusable and Enter-activatable; keep double-tap as a redundant shortcut. The like action already has a button equivalent, so no extra work there.
- Effort: M
- Depends on: none

### A11Y-002: NumberSlider is pointer-only with no slider semantics
- Location: frontend/src/app/components/NumberSlider.tsx:118-124 (pointer-only track), 150-160 (div thumb)
- Severity: High | Confidence: High | Category: a11y (keyboard/SR)
- Description: The numeric-answer slider used by Train and Battle is a `div` with `onPointerDown/Move/Up` only. There is no `role="slider"`, no `aria-valuenow/valuemin/valuemax`, no `tabIndex`, and no arrow-key handling. The current value is shown visually (line 107-109) but nothing is exposed to assistive tech.
- Impact: Numeric questions in Train and Battle are completely unanswerable by keyboard and invisible to screen readers.
- Fix approach: Add slider semantics and keyboard support (role, aria-value attributes, tabIndex, arrow/Home/End keys mapped to the existing snap logic), or render a visually-hidden `input type="range"` that drives the same state.
- Effort: M
- Depends on: none

### A11Y-003: Form inputs labeled by placeholder only, visible labels never associated
- Location (verified representatives, the pattern is app-wide):
  - frontend/src/app/login/page.tsx:63-79 (email, password)
  - frontend/src/app/register/page.tsx:64-90 (email, username, password)
  - frontend/src/app/profile/page.tsx:525-533, 556-573, 607-615 (new username, current/new password, delete confirmation)
  - frontend/src/app/search/page.tsx:208-215 (search field)
  - frontend/src/app/chat/page.tsx:103-110, 127-134 (people search, group name); frontend/src/app/chat/[id]/page.tsx:171-183 (message textarea)
  - frontend/src/app/post/[id]/page.tsx:768-775 and frontend/src/app/components/CommentsBottomSheet.tsx:142-148 (comment inputs)
  - frontend/src/app/create/page.tsx: visible labels exist but are never associated, `const labelCls = "label-caps mb-2 mt-4 block"` at line 38 is used for every `<label>` with no `htmlFor`, and no input has an `id` (e.g. 683-688, 940, 1085-1086, 1123-1128); many fields are placeholder-only (option inputs 847 and 1096-1102, textareas 1145, 1151); the mark-correct-answer radios have no accessible name at all (846, 1089-1095)
- Severity: High | Confidence: High | Category: a11y (forms)
- Description: No input in the app has a programmatically associated label. Auth, settings, search, chat and the entire 3-step create wizard rely on placeholders or on adjacent `<label>` elements that are not linked to their control.
- Impact: Screen readers announce most fields as an unnamed "edit text". Placeholders disappear once the user types, which also hurts users with memory or attention impairments. In the create wizard, the unnamed radios ("radio, not checked") give no clue they mean "this option is the correct answer".
- Fix approach: Associate every visible label via `htmlFor`/`id` (the create wizard's `labelCls` sites make this mechanical); add `aria-label` to the single-field pill inputs whose design has no visible label (search, comment bars, chat message box); give each quiz radio an `aria-label` like "Correct answer: option A".
- Effort: L
- Depends on: none

### A11Y-004: Sheets and overlays lack dialog semantics and focus management
- Location:
  - frontend/src/app/components/CommentsBottomSheet.tsx:80-94 (portal sheet)
  - frontend/src/app/profile/page.tsx:632-670 (followers/following sheet)
  - frontend/src/app/profile/[username]/page.tsx:338-380 (same pattern, verified close button at 347 per sub-review)
  - frontend/src/app/chat/page.tsx:93 (New chat overlay, full-screen `div` at z-40)
- Severity: High | Confidence: High | Category: a11y (modals)
- Description: All modal surfaces are plain positioned `div`s: no `role="dialog"`, no `aria-modal`, focus is not moved into the sheet on open nor restored on close, there is no focus trap, no Escape-key close, and the background page is not made inert. Each sheet does contain a labeled close button (CommentsBottomSheet:106-109, profile:641), so closing is at least reachable.
- Impact: Keyboard users can tab out of an open sheet into the obscured page behind it; screen reader users are not told a dialog opened and can wander the whole background DOM. Escape does nothing.
- Fix approach: One shared sheet wrapper: `role="dialog"` + `aria-modal="true"` + `aria-label`, move focus to the sheet on mount and back to the invoker on unmount, trap Tab within, close on Escape, and set `inert` on the app root while open. Apply it to all four sites.
- Effort: L
- Depends on: none

### A11Y-005: Meaningful content images hardcoded to alt=""
- Location:
  - frontend/src/components/sections/ContentImage.tsx:19-21 (shared figure component, no alt prop exists in Props at 8-14; used by 11 sections)
  - frontend/src/components/sections/PortraitSection.tsx:17-23 (the section's whole purpose is the portrait)
  - frontend/src/components/sections/HeadlineFigureSection.tsx:21, CoreIdeasSection.tsx:29-35, DefiningMomentsSection.tsx:44-46, GreatestWorkSection.tsx:34-36 (inline content images)
  - frontend/src/components/BookCover.tsx:90-98 (real cover) and 50-57 (baked cover, user path), while title and author are resolved unused at 80-81
  - frontend/src/app/components/PostCard.tsx:551-558 (stories lead image) and 419-425 (people portrait); frontend/src/app/post/[id]/page.tsx:497-505 and 585-591 (same two on the detail page)
  - frontend/src/app/create/page.tsx:947 (cover upload preview, the only visual confirmation the upload worked)
  - Person-card portraits with adjacent names, defensible as decorative but inconsistent: CastSection.tsx:24, AuthorsContextSection.tsx:26, AuthorContextSection.tsx:26-32, OriginSection.tsx:54. StorySection.tsx:38-44 uses `alt={fig.name}` for the identical pattern, proving the intent is undecided.
- Severity: High | Confidence: High | Category: a11y (images)
- Description: Every content image in the post body pipeline is marked decorative. Captions, when present, render adjacent (ContentImage's `figcaption` at 30-32), but captions are optional and the images themselves are silenced.
- Impact: Screen reader users lose all pictorial content: portraits, figures, book covers, lead images. For academy figures and concept visuals this is core content, not decoration.
- Fix approach: Add an `alt` prop to ContentImage and BookCover (cover alt from the resolved title/author) and thread the existing caption/name fields into it; for person portraits pick one convention (name as alt, or alt="" everywhere the name is adjacent) and apply it consistently; give the create-page preview a literal alt like "Cover preview". Content JSON schema changes are out of scope, but most sections already carry usable text (caption, name, title).
- Effort: M
- Depends on: A11Y-006 for the SVG-based covers

### A11Y-006: SvgBlock offers no accessible name, decorative glyph overlays not hidden
- Location:
  - frontend/src/components/SvgBlock.tsx:35-51: the user-content path hardcodes `alt=""` (40), the seed path injects raw SVG into a `div` with no `role="img"`, no `aria-label` and no `aria-hidden` (44-50); the component has no prop through which a caller could pass a name
  - Informative callers (all sections rendering `visual_svg` content): AnglesSection.tsx:24, ApproachSection.tsx:21, CoreIdeasSection.tsx:24, DefiningMomentsSection.tsx:39, GreatestWorkSection.tsx:29, HeadlineFigureSection.tsx:16, HowItWorksSection.tsx:32, HowToApplySection.tsx:38, KeyFindingsSection.tsx:36, LifeArcSection.tsx:25, MentalTakeawaySection.tsx:22, PerspectivesSection.tsx:44, RealWorldExamplesSection.tsx:43, SeeItSection.tsx:17, SettingSection.tsx:22, StorySection.tsx:22, TakeawaySection.tsx:22, TangibleSection.tsx:25, VisualExplanationSection.tsx:19, WhatScienceSaysSection.tsx:30
  - Decorative callers not hidden: FieldGlyph in frontend/src/app/components/PostCard.tsx:61-71 and frontend/src/app/post/[id]/page.tsx:39-49 (only `pointer-events-none`, no `aria-hidden`); the glyph sources in frontend/src/lib/glyphs.ts carry no title/role (verified template at 23-29)
  - frontend/src/components/BookCover.tsx:60-65: the baked-cover seed path has the same unnamed `dangerouslySetInnerHTML` problem. Positive counterexample: GeneratedBookCover.tsx:394-398 correctly sets `role="img"` and `aria-label` with title and author.
- Severity: High | Confidence: High | Category: a11y (images)
- Description: The single shared SVG renderer can neither name an informative visual nor hide a decorative one. Injected seed SVGs expose whatever stray text/shape nodes they contain, unstructured; user-content SVGs become `alt=""` images.
- Impact: Concept diagrams, academy figures and other explanatory SVGs are invisible to screen readers; decorative category glyphs land in the accessibility tree as unnamed graphics on every typographic card and detail header.
- Fix approach: Add `label?: string` and `decorative?: boolean` props to SvgBlock: label maps to `alt`/`aria-label` + `role="img"`, decorative maps to `alt=""`/`aria-hidden="true"`. Then set `decorative` at the two FieldGlyph sites and pass section captions/titles as labels where they exist. Mirror the same treatment in BookCover's BakedCover.
- Effort: M
- Depends on: none

### A11Y-007: ink-muted and ink-faint text fail WCAG AA contrast across the app
- Location: tokens at frontend/src/app/globals.css:40 (`--color-ink-muted: #606060`) and 41 (`--color-ink-faint: #3a3a3a`). Measured ratios: ink-muted 3.15:1 on surface-0, 2.93:1 on a slab, 2.53:1 on a field fill; ink-faint 1.74:1 on surface-0, 1.62:1 on a slab. AA requires 4.5:1 for normal text and 3:1 for large text. Verified usage sites where this is body-relevant text at small sizes:
  - `.field::placeholder` (globals.css:225-227) and `.label-caps` (globals.css:264-271, 11px uppercase) both use ink-muted
  - Meta text at 11px mono: PostCard.tsx:139, post/[id]/page.tsx:88-90
  - Inactive tab labels: FeedHeader.tsx:78, SegmentedTabs.tsx:50 (text-ink-muted at text-sm)
  - Create wizard field labels in `text-ink-faint text-xs` (create/page.tsx:842, 850, 1085, 1105, 1123-1127) and hint text at 949
  - Attribution/credit lines in ink-faint at 10-12px: ContentImage.tsx:34, PortraitSection.tsx:32, BookCover.tsx:121, AuthorContextSection.tsx:34
  - Chat: connection status and group participant list in ink-faint text-xs (chat/[id]/page.tsx:109-111, 114-118); "Private account" in search rows (search/page.tsx:90); post byline in search results (search/page.tsx:294); "No comments yet" (CommentsBottomSheet.tsx:121); quiz dimmed options after answering (QuizSection.tsx:31); Marathon/Battle dimmed options (Marathon.tsx:367, Battle.tsx:289); stats empty state (stats/page.tsx:217)
- Severity: High | Confidence: High (ratios computed, not eyeballed) | Category: a11y (contrast)
- Description: Two of the five ink levels sit below AA for any text size at the sizes they are used at, and they are used for text that carries information: form labels, placeholders, statuses, attributions, timestamps, meta data. By contrast, ink-dim (#8a8a8a, 5.34:1 on slab) and all seven format accent inks (about 7.9-8.6:1 on slab) pass comfortably.
- Impact: Low-vision users lose form labels, image credits, connection status, timestamps and reading-time metadata. The create wizard is the worst case: its field labels are ink-faint at 12px, roughly 1.6:1.
- Fix approach: Rebase the two tokens (ink-muted needs roughly #909090+ for 4.5:1 on slabs; ink-faint should stop being used for text and stay for hairline graphics only), then sweep the ink-faint text call sites up one level. This is a token change plus a mechanical audit, and it preserves the visual hierarchy since every level shifts together.
- Effort: L
- Depends on: none

### A11Y-008: Private-account toggle exposes no on/off state
- Location: frontend/src/app/profile/page.tsx:496-507
- Severity: High | Confidence: High | Category: a11y (forms/ARIA)
- Description: The privacy switch is a `button` with `aria-label="Toggle private account"` whose state is conveyed only by fill color (`bg-lamp` vs `bg-white/[0.10]`) and thumb position. No `role="switch"`, no `aria-checked`.
- Impact: A screen reader user cannot tell whether their account is currently private, on a privacy-sensitive setting.
- Fix approach: Add `role="switch"` and `aria-checked={user.is_private}`; keep the existing click handler.
- Effort: S
- Depends on: none

### A11Y-009: Follow control in search results is unfocusable and invalidly nested
- Location: frontend/src/app/search/page.tsx:92-99 (`<span onClick={toggleFollow} role="button">` with no tabIndex or key handler, rendered inside the row); also 287-303 where a `<Link>` to the author profile is nested inside the post-result `<button>`
- Severity: High | Confidence: High | Category: a11y (keyboard)
- Description: The follow/unfollow affordance on account results is a span with `role="button"` but no `tabIndex` and no Enter/Space handling. The post results nest an anchor inside a button, which is invalid HTML with unpredictable focus and activation order in assistive tech.
- Impact: Keyboard users cannot follow or unfollow from search at all. The nested interactive elements produce confusing double announcements and flaky activation.
- Fix approach: Make the follow control a real `<button>` (the row container should then not be a wrapping interactive element, or the row becomes a layout div with discrete link/button children); restructure post rows so the card link and the author link are siblings, not nested.
- Effort: S
- Depends on: none

### A11Y-010: Post headlines render as p, most detail pages have no h1
- Location: frontend/src/components/sections/HeadlineSection.tsx:31-36 (`<p className="font-serif text-[2rem] ...">`); used as the page title for facts, concepts, questions, academy, books and stories detail pages (post/[id]/page.tsx:422, 456, 555, 611). Real h1s exist only for people (post/[id]/page.tsx:512) and the slab-fallback header (post/[id]/page.tsx:633). Section headers are h3 via SectionLabel.tsx:15, and CoreIdeasSection.tsx:20 uses h2 for idea titles.
- Severity: Medium | Confidence: High | Category: a11y (semantics)
- Description: On six of seven formats the page's visual title is a paragraph, so the document outline starts at h3 (or a stray h2), and "jump to heading" lands on section labels with no page title above them.
- Impact: Screen reader users lose the fastest way to identify and navigate a post; heading-level navigation starts mid-structure.
- Fix approach: Render HeadlineSection's text as an h1 (styling unchanged), keep the people inline h1, and consider h2 for SectionLabel or accept the single jump from h1 to h3 consistently.
- Effort: M
- Depends on: none

### A11Y-011: Several pages have no headings at all
- Location (verified by grep over frontend/src/app for h1/h2/h3, plus spot reads): the home feed (page.tsx, cards are h2 but the page has no h1), search/page.tsx (no heading anywhere), stats/page.tsx (section titles are divs, CategorySection at 370-373), profile/page.tsx and profile/[username]/page.tsx (username is a p/span), chat/[id]/page.tsx:107 (conversation name is a p), saved-posts/page.tsx. Counterexamples that do it right: login:57, register:58, my-posts:49, chat list:209, create:606.
- Severity: Medium | Confidence: High | Category: a11y (semantics)
- Description: Whole surfaces expose zero headings, including the stats page whose roughly 26 chart sections are labeled with `label-caps` divs.
- Impact: No heading navigation on exactly the pages with the most content to skip through.
- Fix approach: Promote each page's visual title to h1 (visually identical) and the stats CategorySection title div to a heading element.
- Effort: M
- Depends on: none

### A11Y-012: Tab systems have no tab semantics or arrow-key support
- Location: frontend/src/app/components/FeedHeader.tsx:70-98 (feed tab strip) and SegmentedTabs.tsx:42-55 (used by search:232-241, profile/[username], stats). Active state is font weight and color only.
- Severity: Medium | Confidence: High | Category: a11y (ARIA)
- Description: Tabs are plain buttons in plain divs: no `role="tablist"/"tab"`, no `aria-selected`, no `aria-controls`, no arrow-key navigation. The buttons are natively focusable, and clicking is the keyboard equivalent of swiping, so the pattern is operable but never announced as tabs, and the selected tab is not identifiable by assistive tech.
- Impact: Screen reader users hear an undifferentiated row of buttons with no indication which is active or that they switch the page below.
- Fix approach: Add tablist/tab roles, `aria-selected`, and roving tabindex with Left/Right arrow handling in the two shared components; wire `aria-controls` to the pager pages.
- Effort: M
- Depends on: none

### A11Y-013: Off-screen pager pages and quiz slides stay in the tab order
- Location: horizontal pagers keep all activated pages mounted with no `inert`/`aria-hidden`: frontend/src/app/page.tsx:191-223 (feed tabs), search/page.tsx:270-309, profile/[username]/page.tsx:314-326 (per sub-review of that pager block). Same class of problem in the quiz: QuizSection.tsx:227-243 slides sit off-screen via `translateX` inside `overflow-hidden`, and option buttons are only disabled after answering (QuizSection.tsx:89), so future questions are tabbable, which bypasses the no-advance gating at 166-171.
- Severity: Medium | Confidence: High | Category: a11y (keyboard)
- Description: Content on non-active pager pages remains focusable and readable. Tabbing into it drags the scroll position to a page the user never chose; in the quiz it lets keyboard users answer questions out of order.
- Impact: Disorienting focus jumps for keyboard users; quiz flow integrity differs by input method.
- Fix approach: Set `inert` (or `aria-hidden` + `tabIndex=-1` management) on non-active pager pages when they settle; in QuizSection disable option buttons on non-current slides.
- Effort: M
- Depends on: A11Y-012 (same components, do together)

### A11Y-014: Selection chips, format cards and filter pills expose no selected state
- Location (all verified): onboarding interest chips InterestPicker.tsx:211-221 and 238-248; create-page format cards create/page.tsx:612-619 and its interest chips; search format filter chips search/page.tsx:250-262; stats chart-type pills stats/page.tsx:377-382; chat recipient rows with a purely visual checkmark circle chat/page.tsx:143-157.
- Severity: Medium | Confidence: High | Category: a11y (ARIA)
- Description: Every toggle/selection control conveys its state by fill/color classes only, with no `aria-pressed` (or checkbox semantics for the multi-select cases).
- Impact: Screen reader users picking interests during onboarding, choosing a format, filtering search, or selecting chat recipients cannot tell what is selected.
- Fix approach: Add `aria-pressed={isSelected}` to the chip/pill/card buttons; the chat recipient list fits checkbox semantics (`role="checkbox"` + `aria-checked`) better.
- Effort: M
- Depends on: none

### A11Y-015: Accordions and expandable panels lack aria-expanded
- Location: create/page.tsx:53-55 (shared Accordion header button); profile/page.tsx:513-522 (change username), 544-553 (change password), 594-603 (delete account); the follow-requests panel uses the same pattern per the forms sub-review.
- Severity: Medium | Confidence: High | Category: a11y (ARIA)
- Description: Disclosure buttons toggle content below but carry no `aria-expanded` and no `aria-controls`; the only cue is a rotating chevron.
- Impact: Screen reader users cannot tell whether activating the row opened anything, or where.
- Fix approach: Add `aria-expanded={open}` on the header buttons (one line in the shared Accordion; three repeats in profile).
- Effort: S
- Depends on: none

### A11Y-016: Errors and async status changes are never announced
- Location (verified representatives):
  - Bare error paragraphs, not linked to inputs and not live: login:81, register:91, create/page.tsx:40-43 (FieldError, used throughout), profile:534, 574, 616, chat:136, chat/[id]:169, my-posts:52-54, QuizSection.tsx:99
  - Async results with no live region or focus move: quiz verdict and explanation QuizSection.tsx:102-113; create success screen replacing the whole view (create/page.tsx:565-582); chat connection status (chat/[id]:114-118); incoming chat messages (chat/[id]:139-160); Marathon rating strip and verdicts (Marathon.tsx:371-378 and the feedback stage); Battle opponent score and lobby messages (Battle.tsx:292-300 and message slabs)
- Severity: Medium | Confidence: High | Category: a11y (live regions)
- Description: Nothing in the app uses `aria-live`, `role="status"`/`"alert"`, or `aria-describedby`. All validation and status feedback is visual insertion only.
- Impact: Screen reader users submit a form and hear nothing on failure; quiz answers, chat connectivity and battle progress change silently.
- Fix approach: Give form error paragraphs `role="alert"` and connect them via `aria-describedby`; put quiz verdicts, chat status and battle score strips in polite live regions (throttled for scores, and never wrap the per-frame TickingNumber in one); move focus to the create success card on submit.
- Effort: L
- Depends on: none

### A11Y-017: Toast is not announced and its stale message stays exposed
- Location: frontend/src/app/components/Toast.tsx:1-11
- Severity: Medium | Confidence: High | Category: a11y (live regions)
- Description: The toast div has no `role="status"`/`aria-live`, so "Link copied!" is never announced; and because visibility is `opacity-0` while the element stays mounted, the old message remains in the accessibility tree when invisible.
- Impact: The only feedback for the share fallback (PostCard.tsx:301-315) is invisible to screen readers, and stale text lingers.
- Fix approach: Add `role="status"`, and unmount or `aria-hidden` the element when not visible.
- Effort: S
- Depends on: none

### A11Y-018: Quiz/Train/Battle answer feedback is color-only on the options
- Location: QuizSection.tsx:21-32 (optionClass returns border/color classes only), Marathon.tsx:357-368 and Battle.tsx:278-290 (optionStyle returns colors only)
- Severity: Medium | Confidence: High | Category: a11y (color)
- Description: After answering, correct and incorrect options are distinguished purely by green/red borders and text tint. A separate "Correct"/"Incorrect" caption exists (QuizSection.tsx:104-106) but is not associated with any option, and does not say which option was the right one.
- Impact: Color-blind users can distinguish these particular green/red tints in most cases, but screen reader users get no per-option state at all: they hear four disabled buttons and a verdict, without learning the correct answer's text unless they re-read and infer.
- Fix approach: Add a non-color mark per option (check/cross glyph) and per-option ARIA (`aria-label` suffix like "correct answer" / "your choice, incorrect") in the three option renderers.
- Effort: M
- Depends on: A11Y-016 for the verdict announcement

### A11Y-019: Stats visuals have no non-visual alternative, heatmap data is title-attribute only
- Location: stats/page.tsx:193-200 (month bars) and 235-248 (activity heatmap) expose values only via `title` attributes; the roughly 26 chart sections render Recharts SVG with hover tooltips; some sections offer a "Table" pill but it is opt-in, and gauge/waffle/radar style sections have none. Section titles being divs is covered by A11Y-011.
- Severity: Medium | Confidence: High | Category: a11y (images/SR)
- Description: The stats page's data is reachable only by mouse hover or by parsing bare SVG.
- Impact: Screen reader and keyboard users get numbers-free chart chrome. `title` tooltips are mouse-only.
- Fix approach: Not a redesign: add a visually-hidden summary (or make the existing table view the accessible fallback via `aria-label` on chart containers pointing at totals), and give heatmap cells text equivalents through an sr-only table. Prioritize the sections with no table option.
- Effort: L
- Depends on: A11Y-011
- Note: this is a stats-page polish item; if the pre-launch bar is the core feed/post/create flows, it can be batched later.

### A11Y-020: DotScale hides difficulty from screen readers with no text equivalent
- Location: frontend/src/components/DotScale.tsx:6 (`aria-hidden="true"` on the whole scale, no label offered); used by PostCard.tsx:137 and post/[id]/page.tsx:84-86
- Severity: Medium | Confidence: High | Category: a11y (images)
- Description: Hiding the dots is right, but nothing replaces them, and the component offers no prop for a caller to do so.
- Impact: Difficulty (1-3) is simply absent for screen reader users on every card and detail page.
- Fix approach: Render an sr-only "Difficulty N of 3" inside the component (keep the dots aria-hidden).
- Effort: S
- Depends on: none

### A11Y-021: Unlabeled or ambiguous remove/delete buttons
- Location: create/page.tsx:1153 (structure part remover is a bare "×", announced as "multiplication sign"); chat/page.tsx:114-122 (selected-user chip button reads "@username ×" with no hint it removes); CommentRow.tsx:36-42 (every delete button is named just "Delete", indistinguishable in a list)
- Severity: Medium | Confidence: High | Category: a11y (labels)
- Description: Destructive/remove affordances lack names that say what they act on.
- Impact: Screen reader users cannot safely pick the right remove/delete control.
- Fix approach: `aria-label={"Remove part " + (i+1)}`, `aria-label={"Remove @" + u.username}`, `aria-label={"Delete comment by " + comment.username}`.
- Effort: S
- Depends on: none

### A11Y-022: VerifiedBadge relies on aria-label without role, stats uses a bare check glyph
- Location: VerifiedBadge.tsx:24 and 34 (`<svg ... aria-label="Official"/"Verified">` with no `role="img"`, and the level 1/2/3 distinction, color-only per the comment at line 2, is not in the label); stats/page.tsx:493, 560, 2364 render verification as `<span ...>✓</span>` instead of the badge. The Avatar verified ring (Avatar.tsx:30-32) is also color-only, though the badge usually sits adjacent.
- Severity: Low | Confidence: High | Category: a11y (SR)
- Description: `aria-label` on an svg without an image role is unreliably announced across AT combinations; the loose check mark reads as "check mark" with no meaning.
- Impact: Verified status may be silently dropped or announced meaninglessly.
- Fix approach: Add `role="img"` in VerifiedBadge and fold the level into the label; replace the stats check spans with the badge component or an sr-only "verified".
- Effort: S
- Depends on: none

### A11Y-023: Icon components are neither hidden nor named by default
- Location: frontend/src/app/components/icons.tsx:13-135 (all eight glyphs are bare svgs with props spread, no default `aria-hidden`); AuthorContextSection.tsx:11-17 (ExternalLinkIcon inside the Wikipedia link, not hidden)
- Severity: Low | Confidence: High | Category: a11y (images)
- Description: Every current usage of the icons.tsx set sits inside a labeled button (verified across PostCard, the detail page, CommentsBottomSheet), so nothing is broken today, but the safe default is missing and the external-link arrow adds noise inside its link text.
- Impact: Redundant or noisy announcements; a future unlabeled caller silently ships an unnamed graphic.
- Fix approach: Default `aria-hidden="true"` (overridable via the existing props spread) in icons.tsx and on ExternalLinkIcon.
- Effort: S
- Depends on: none

### A11Y-024: No landmarks and no skip link, nav dock is a plain div
- Location: layout.tsx:74-77 (body renders children with no `main`), BottomNav.tsx:74-79 (dock wrapper is a div, items are labeled buttons), FeedHeader/headers are divs; no `nav`, `main` or `header` element anywhere in the reviewed pages; no skip link (mitigated by content preceding the dock in DOM order)
- Severity: Low | Confidence: High | Category: a11y (semantics)
- Description: Zero landmark structure app-wide.
- Impact: Screen reader landmark navigation is empty; users must arrow through everything.
- Fix approach: Wrap page content in `main`, make BottomNav a `nav aria-label="Primary"`, and add `aria-current="page"` to the active dock item (its active state is currently visual-only, BottomNav.tsx:85-87).
- Effort: S
- Depends on: none

### A11Y-025: JS smooth scrolling is not gated on prefers-reduced-motion
- Location: useSwipeTabs.ts:139-152 (selectTab defaults to `behavior: "smooth"`), page.tsx:166-174 (tab strip `scrollTo`/`scrollIntoView` smooth), post/[id]/page.tsx:253-255 (comments `scrollIntoView({ behavior: "smooth" })`)
- Severity: Low | Confidence: High | Category: a11y (motion)
- Description: The CSS animation system is well guarded (globals.css:310-315 and 349-354; PostCard entrance at 190-215; the detail page's global override at post/[id]/page.tsx:320-322), but programmatic smooth scrolls always animate. The snap-scroll feed itself is user-driven scrolling, which is fine.
- Impact: Users with vestibular sensitivity who set reduced motion still get full-page horizontal glides when switching tabs.
- Fix approach: One shared helper that resolves "smooth" to "auto" when `matchMedia("(prefers-reduced-motion: reduce)")` matches, used at the three sites.
- Effort: S
- Depends on: none

### A11Y-026: Scrollbars are hidden app-wide on both axes
- Location: globals.css:106-111 (`* { scrollbar-width: none }` + `*::-webkit-scrollbar { display: none }`), reinforced per-container throughout the pages
- Severity: Low | Confidence: High | Category: a11y (usability)
- Description: A deliberate design rule (LAYOUT_STANDARD s.5), noted here for the record: no scroll position indicator exists anywhere, and users who scroll by dragging the bar (common with some motor impairments) cannot.
- Impact: Loss of scroll affordance and orientation on long pages (create wizard, stats, long posts) for mouse-primary and motor-impaired users.
- Fix approach: Decision to revisit rather than a bug: if the aesthetic stands, consider showing scrollbars under `prefers-reduced-motion` or a future "accessibility" setting, or at least keep keyboard scrolling healthy (PageDown works once focus is inside the scroller).
- Effort: S
- Depends on: product decision

### A11Y-027: Action-rail counts are detached from their buttons
- Location: PostCard.tsx:685 (like count span), 697 (comment count), 713 (save count): counts render as sibling spans below buttons whose `aria-label` is only "Like"/"Comments"/"Save"; count changes are not announced
- Severity: Low | Confidence: High | Category: a11y (SR)
- Description: A screen reader reads "Like, button" then a bare "12" with no relationship.
- Impact: Counts are confusing noise rather than information.
- Fix approach: Fold the count into the button's label ("Like, 12 likes") and hide the visual span from AT.
- Effort: S
- Depends on: none

### A11Y-028: Meaningful lists rendered as plain divs
- Location (verified representatives): search results search/page.tsx:285-305, my-posts rows my-posts/page.tsx:80-88, follower sheet rows profile/page.tsx:653-666, comment lists (CommentsBottomSheet.tsx:123-131), chat conversation rows. Counterexample: quiz options correctly use `ol/li` (QuizSection.tsx:84-97).
- Severity: Low | Confidence: High | Category: a11y (semantics)
- Description: Result and feed lists have no list semantics, so AT does not announce "list, N items" or support list navigation.
- Impact: Minor navigation and context loss, worst in long search results.
- Fix approach: `ul/li` (or `role="list"`) around the mapped rows.
- Effort: M
- Depends on: none

### A11Y-029: Comments sheet expand gesture is touch-only
- Location: CommentsBottomSheet.tsx:37-71 (drag handle listens to touch events only; expand to 75vh has no button or key equivalent)
- Severity: Low | Confidence: High | Category: a11y (keyboard)
- Description: Keyboard and desktop-mouse users can open and close the sheet (close button at 106-109) but can never reach the expanded state.
- Impact: Less visible comment area for non-touch users; content is still scrollable, so information is not lost.
- Fix approach: Make the drag pill a labeled button that toggles expanded, keeping the gesture.
- Effort: S
- Depends on: A11Y-004 (same component)

### A11Y-030: Error/destructive red is marginally below AA on frosted slabs
- Location: globals.css:48 (`--color-bad: #c05870`). Measured: 4.59:1 on surface-0 (passes), 4.27:1 on a slab, 3.69:1 on a field fill (fails 4.5:1 for the text-sm/text-xs sizes used). Verified text usages on slabs: login:81, register:91 (error paragraphs inside `.card`), FieldError create/page.tsx:42, btn-destructive text on its 12% fill computes 4.18:1 (globals.css:173-176).
- Severity: Low | Confidence: High | Category: a11y (contrast)
- Description: Error text passes on the pure-black base but dips just under AA on the frosted surfaces where forms actually render.
- Impact: Error messages, the text users most need to read under stress, are slightly under threshold for low-vision users.
- Fix approach: Nudge the bad token a step lighter (roughly #c96a80 territory) or use a lighter variant for text-on-slab; re-run the ratio check.
- Effort: S
- Depends on: A11Y-007 (do in the same token pass)

## Coverage notes

- Reviewed: globals.css tokens and component classes (with computed contrast ratios for every ink, accent and format color on surface-0, slab and field composites); the feed (page.tsx, PostCard, FeedHeader, BottomNav, useSwipeTabs); the post detail page and its header variants; SectionRenderer plus the image/SVG-bearing and quiz sections; all shared visual components (SvgBlock, BookCover, GeneratedBookCover, Avatar, VerifiedBadge, DotScale, SectionLabel, HeadlineSection, ContentImage, icons); all forms (login, register, create wizard, profile settings, search, chat); modals and sheets (CommentsBottomSheet, profile follower sheets, New chat overlay); Train/Battle widgets (Marathon, Battle, NumberSlider); Toast; onboarding InterestPicker; stats page (targeted: headings, chart pills, heatmaps, verified glyphs, not every chart section line by line).
- Positive findings worth keeping: reduced-motion guards on all CSS keyframes (globals.css:310-315, 349-354) plus the PostCard entrance gate and the detail page's blanket animation kill under reduced motion; a global :focus-visible lamp ring (globals.css:97-100); consistent `aria-label` on icon-only navigation buttons; Avatar always sets alt; `lang="en"` and no zoom-blocking viewport meta; GeneratedBookCover's `role="img"` + title/author label is the model the other cover paths should copy.
- Not reviewed (out of scope or time-boxed): the mobile app; post JSON content and schema; backend; the read-aloud engine internals (useReadAloud, piper, highlights) beyond their UI controls; MathText/KaTeX output accessibility (KaTeX renders its own MathML, assumed adequate); EmptyState, Spinner, PostRow, stage.tsx beyond skims; every individual stats chart section; RelatedPostsSection internals beyond the sub-review's check (reported clean: resolved cards are real links).
- Low-confidence: none retained; every finding above had its cited lines re-opened and confirmed during the verification pass. Items I could not fully verify were either dropped or folded into a finding with only the verified lines cited. Two judgment calls to be aware of: A11Y-026 documents an intentional design rule rather than a defect, and the person-portrait `alt=""` sub-items in A11Y-005 are defensible as decorative; they are flagged mainly for the inconsistency with StorySection.
