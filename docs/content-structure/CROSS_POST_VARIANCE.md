# Cross-post variance standard

Companion to HUMAN_TEXTURE_STANDARD (how one post reads) and STYLE_GUIDE_LONGFORM (the language
rules). This one governs how a SET of posts reads: it keeps a feed from feeling templated even when
every post reads human on its own. Cross-format (all seven).

## The problem it solves

A post can pass every within-post texture check and still, placed beside three others of the same
format, give up the mold. The tell is not inside any one post; it is the shared cadence at the
positions a reader remembers: the line that opens the twist, the line that closes on the payoff, and
the pivot in the story. When those are cut to the same shape post after post, the feed reads as
machine-made. This was measured on the first Facts batch and confirmed by an independent cold read.

## The principle: variance, not prohibition

Vary the memorable moves across a batch. The moves themselves are good; banning them would flatten
the best part of the format. A deviation dropped in on a schedule reads as machine too. The goal is
genuine range across posts, not a new required shape. The memorable positions are the opener and the close of each core section (surprises, how_we_know, open_questions, bigger_picture) plus the story pivot. The rule is the same at each: no single form may dominate that position across a batch. The molds listed below are the instances seen so far, not an exhaustive list; apply the same variance to any position where one form recurs, including positions not named here.

## The templates to break (vary these across every batch)

1. The intuition-flip that opens the reframe section. Do not let every post state a naive belief in a
   flat declarative and then negate it in a 3-to-6-word staccato punch ("does the reverse.",
   "Pregnancy breaks that."). Vary it: one post opens mid-scene on the concrete fact, one carries the
   reversal in a longer sentence, one withholds the flat reversal entirely.
2. The closing "why it matters" line. The strongest recurring tell: zoom out to the cosmic or the deep
   past, then land a crafted, quotable aphorism on the reader's own body or life. Do not let every post
   end on that gesture. Let several posts close plainly and flatly (a blunt present-day sentence is a
   valid ending); reserve the crafted landing for the one post per batch where it is truly earned. The deeper form of this tell is positional, not stylistic. A unit that clicks shut on a
   short weighty landing is the tell even when the landing is plain and present-day, not lyrical. So
   flattening a cosmic aphorism into a blunt sentence removes the style but leaves the landing, and the
   feed still ticks. The real fix is positional: vary WHERE the short beat sits across the batch, and let
   most units end mid-thought or on a plain fact rather than on any landing, keeping the one earned
   landing per post and letting the other units trail off.
3. The story arc, not just its pivot phrasing. Do not let every story run settled-belief, then a doubted
   or overlooked figure, then vindication after N years ("waited N years", "finally saw why"). Vary the
   arc where the history allows: some facts were settled quickly, some by accumulated evidence with no
   lone hero, some are not a rescued-underdog story at all. Do not bend the true history to fit or to
   avoid the arc; vary it only where the facts genuinely differ.
4. The teaser triad slotting. Do not let every post fill its three teasers with the same three roles in
   the same order (a concrete noun-hook, then a human or vindication hook, then a "why it isn't what it
   seems" reframe). Vary which roles appear and their order across the batch; some posts need only two
   kinds, or a different mix.
5. Two phrasing molds to avoid as a reflex: the antithesis "X is not the same as Y" landing in closing
   slots, and a "the same ___" bridge at the pivot of nearly every post. Used once where earned they are
   fine; as a batch-wide habit they read as a mold.
6. Section openers beyond the reframe opener, and the surprises close. The how_we_know section tends to
   open on a negation-of-doubt or a "you can see it" reassurance ("The number is not a guess.", "None of
   this is guesswork.", "You can watch it happen."). The open_questions section tends to open on a
   "settled X / unsettled Y" antithesis ("The pattern is clear; its cause is not."). Both sit at a fixed
   position a reader hits in every post, so interleaving cannot hide them. Vary them: let some how_we_know
   open straight on the method or the study, and some open_questions open on a concrete unknown or a
   specific number rather than the balanced seesaw. Also vary the surprises section's closing turn, which
   reaches for a "Whatever X, [truth] did not Y" restatement.

Milder, watch but do not force: the headline built as reversal-plus-number, and the bigger_picture
opener built on a time-span phrase ("For most of a century...", "For as long as she lives...") or on a
bare "[X] is not [Y]".

## Format-inheritance that must NOT be touched

Shared structure a reader expects, and which is not sameness: the section skeleton and order, the
existence of an intuition-overturning section, numeric scaling in tangible lists, myth/reality pairs,
the quiz, the two-key-figure pairing (an old discoverer plus a modern confirmer). Do not "fix" these.
The middle of a post (which optional sections appear, the angle titles, the figure pairings) should
already vary by topic; leave that variation alone.

## How the pipeline uses this

- Generation (step 2) PREVENTS: vary the three moves across the posts it writes in one batch.
- Human-sound review (step 5) DETECTS: check the three moves at the memorable positions, across the batch.
  For the closing metronome, detect it as a POSITION, not a style: per post, count how many units end on a
  landing versus end plainly, report the batch pattern, and hand step 6 the concrete list of units to de-land.
- Prose-only correction (step 6) CORRECTS: apply the batch-level findings coordinated across posts
  (decide which post keeps a given move and recast the others), and write the batch's final opening,
  closing, and pivot moves to generated/<format>/_recent_moves.md. For the metronome specifically,
  break the POSITION and not just the register: de-land the units step 5 lists (end them mid-thought or on
  a plain fact, move or drop the closing beat), keeping one earned landing per post. Flattening a landing's
  wording while leaving it at the unit end does not clear the tell.
- Topic finding (step 1) DAMPENS across batches: read generated/<format>/_recent_moves.md and steer the
  new batch's way-ins away from the moves earlier batches used, avoiding most strongly the moves with the
  highest counts. This is a running tally, not a full structured register; it curbs repetition across many
  batches but is still the light interim lever. The full cross-batch register is separate future work. Step 1 also spreads the topic ARCHETYPE (the kind of fact: myth-corrected, experience-it, mechanism, scale-number, reasoning-trap, delayed-discovery) across batches, softly: same-archetype posts rhyme at the story and the close even with different way-ins, so it avoids piling one archetype batch after batch. A single batch may hold kindred topics, since the feed mixes them anyway; the goal is a reasonable spread over time, not a per-batch quota.

## The _recent_moves.md format (rolling, compacted)

generated/<format>/_recent_moves.md is a running tally, not a per-batch overwrite. Step 6 APPENDS to it
and keeps it compact so it stays usable as it grows:
- A "move tally" section: one line per distinct move shape seen, grouped by position (reframe opener /
  closing line / story pivot), each with a count of how many posts have used it. Increment counts; add a
  new line only for a genuinely new shape. This is what step 1 reads first: high counts are the shapes to
  avoid hardest.
- A "recent batches" section: the last ~10 batches in brief (batch id + the shapes each post used, plus each post's rough topic archetype), older
  entries dropped once past the cap. Keeps detail current without unbounded growth.
Step 6 rewrites the file as tally-plus-recent each run (read it, fold in this batch, drop past the cap,
write back), so it never simply balloons.
