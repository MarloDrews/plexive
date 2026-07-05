# Human texture standard (v1.9, all seven formats calibrated)

Companion to `STYLE_GUIDE_LONGFORM.md`. The style guide is the generation
contract: it tells the writer how the language should read. This document is the
audit and calibration layer: it tells the checker how to catch the prose that
still reads as machine, and it tells us how to measure the bar instead of judging
it by feel. The two are separate jobs on purpose. One is written for the front
end of the pipeline, the other for the back end.

The app is dark only and all content is English, the same as its siblings.

This is v1.9 (see the changelog at the end). The numeric thresholds below were
measured from the finished Books
gold example (`books_example.json`), not guessed, in line with the plan that the
example finalizes this layer. All seven rows of the band table in section 3 are now
calibrated, each measured from that format's locked gold.

---

## 0. What this is for, and the two facts that shape it

The goal is not flawless prose. Flawless, evenly polished, perfectly balanced
writing is exactly what reads as machine. The goal is prose that is alive and
that an attentive reader cannot tell from a strong human author. Those are
different targets, and aiming at the first one walks straight into the tell.

Two facts decide how this layer is built.

- **Vocabulary tells decay.** The giveaway words shift with each model
  generation. The 2023 to 2024 set ("delve", "tapestry", "testament") faded; a
  later set ("fostering", "showcasing", "align with") rose and fell in turn; the
  current generation leans on framing verbs ("emphasizing", "highlighting",
  "showcasing", "enhance") and on an undue emphasis on notability, attribution,
  and sourcing. A fixed word list is necessary but always one generation behind.
  So the list here is dated and refreshed, never frozen, and lexical bans alone
  never finish the job.
- **The deepest tells are distributional, and a writing model cannot measure
  them on itself.** What gives a text away is rarely one phrase. It is sameness:
  uniform sentence length, repeated sentence shape, every thought closed the same
  way. The technical name is low burstiness. A model writing a post will believe
  it varied its rhythm and still produce a smooth run, because it cannot reliably
  audit its own distribution while generating. This is why the producing pass is
  never trusted on language quality, and why the parts of this layer that are
  measurable are checked by an external script, not by the writer.

Both facts point the same way. The generation prompt stays lean, a few positive
directives plus the gold example carrying most of the load. The full rule set
lives here, for the audit pass and for calibration, and is not dumped wholesale
into the generation prompt, where it would pull the model's attention onto
rule-following and flatten the prose.

A last calibration note. Humans are unreliable detectors of machine text, often
no better than chance. The point is not to beat a detector, which is a moving and
gameable target. The point is to read human to a careful reader. Acceptance is a
judgment, probabilistic, not a green checkmark.

---

## 1. How a post is checked: three layers

A post passes through three checks with decreasing volume and increasing
judgment.

1. **The mechanical checker (`tools/texture_check.py`, every post).** Deterministic measures over
   the reader-facing text: sentence-length distribution and variance per section,
   commas per sentence, candidate clause and appositive stacking, blacklist word
   hits and their clustering, triplet patterns, repeated sentence openings, a rhythm-drift candidate, and
   shared opening shape across a parallel-field set. The script never fails a post
   on its own. It produces candidates, the spots a human or the audit looks at.
2. **The model audit (the pipeline's independent review).** The semantic tells a
   script cannot see: whether a closure was needed, whether a triplet was earned,
   whether the variance is real or applied, whether the register slid into
   symbolism. It also reads as a reader, not only a texture-checker: whether the
   teasers open real loops and earn the tap, whether each list and detail coheres
   under the claim it serves, whether a title pays off the scene it promises,
   whether a clichi or assembled phrase slipped through, whether the thread leaves a
   gap the reader trips on, and whether each section earns the read. It confirms or
   clears the script's candidates and adds its own.
3. **The human spot-check (a sample).** The final call on whether the post reads
   like a person wrote it. This judgment is not delegated to a model.

One exemption overrides all three. **Verbatim quotes are never touched by any
texture rule.** A real quotation is evidence, and smoothing it for rhythm would
falsify it. Integrity (style guide A2) outranks every rule below. The checker and
the audit both treat quote fields as out of scope. When a long sentence carries a
quote, the fix is to split the scaffold around the quote, never to alter the
quote.

---

## 2. The universal anti-tell core

These rules are identical across all seven formats. A tell does not become
acceptable because a format is harder or denser. Each rule says who checks it.
The numbers are the Books-calibrated reference; a format with a different band
(section 3) reads the spirit, not the exact figure.

Scope convention (applies to this section and to the style guide Part A): any
unmarked line in a universal section binds all seven formats. The rare line that
holds for only some is marked inline with a fixed label, "Format-specific
(Facts): ..." or "Format-specific (Books, Questions): ...", naming exactly which
formats it binds. The label is greppable, so searching "Format-specific (" lists
every scoped exception in one pass. If a rule would be wrong for any format it
does not belong here unmarked: either scope it with the label, or move the
format-bound part down to section 3 or the style guide Part B. A measured number
is never baked into an unmarked universal rule. The principle stays universal and
the figure lives per format, delegated by reference, the way the rhythm band
(2.2 points to section 3) and the teaser length (A11 points to each skeleton)
already work.

### 2.1 Comma and clause density

This is the most common source of the "assembled, not written" feel. The fault
is not the comma itself. It is stacking: an appositive set off by commas dropped
inside a sentence that already carries a subordinate clause, then a second insert
after that, until the sentence is a chain of interruptions.

Calibration from the gold: no sentence carries more than **three** commas that
each open a new clause or insert. A fourth comma appears only inside a genuine
flat list (a run of traits or named items, for example "31, single, outspoken, a
former philosophy student"), never to chain subordinate clauses. The sentences
that were rewritten out of the gold each had **five** commas and three nested
inserts. That is the line: three is the working ceiling, four only for a true
list, five is always a rewrite.

Weak: "Tversky died in 1996, so when the 2002 Nobel arrived for that work, shared
with the experimental economist Vernon Smith, he received it without him, since
the prize is not awarded posthumously."

Better: two or three plain sentences that each land one fact.

Checker: commas per sentence, and mid-sentence appositives between commas, as
candidates. Audit: judges whether the density is earned.

### 2.2 Sentence-length variance (burstiness)

The style guide already says to vary length hard. Here it is made checkable.
Within every prose section of three sentences or more, length must swing, not
drift. A section whose sentences sit in a narrow band is a rewrite candidate even
when no single sentence is wrong, because the flatness is the tell.

Calibration from the gold:

- **Min-to-max ratio** of sentence length within a prose section runs from about
  **2.2 up to 13** across the gold, and most sections sit at **3 or more**. The
  one section that had to be rewritten sat at **1.3**, four sentences all 26 to 35
  words with no short one. So the floor is clear: a ratio under about **2** is a
  flat drone and a rewrite; **2 and up** is real variation; **3 or more** is the
  comfortable target.
- **A short sentence is present.** Every multi-sentence prose section in the gold
  carries at least one sentence at or under about **10 words**; the genuine short
  punches run **4 to 9** ("Those errors are systematic." "You feel none of it."
  "Tversky died in 1996."). A tightly built section may have its shortest sentence
  as long as about **15**, but a section whose shortest sentence is **25 or more**
  is the drone again.

Watch the mechanical fix. Dropping one token short sentence into each paragraph
satisfies the letter and not the spirit; the audit flags variance that looks
counted rather than felt (see 2.8).

Variance is a shape, not only a spread. A section can clear the ratio and still
drift, its sentences climbing almost monotonically to a long close, because one
short opener is enough to pass the min-to-max test. The Books influence section
did this before it was reshaped: lengths 9, 12, 15, 24, 10, 14, 27, ending on its
longest sentence. So the ratio is necessary, not sufficient. Read the trajectory,
and do not let a section end on its longest sentence as the payoff of a climb.

Checker: per-section length distribution, variance, min and max ratio, presence
of a short sentence, and a rhythm-drift candidate when a section's lengths mostly
ascend and end on its longest sentence. Audit: real swing or perfunctory.

### 2.3 Inline lists of three or more, past the crescendo

The crescendo (three clauses building to a peak) is banned in the style guide.
The wider habit is the reflexive enumeration: the adjective trio, the embedded
noun list ("probability, statistics, and money"), the run of three short phrases.
The rule covers any inline list of **three or more** items, not only the literal
triplet, because a four-item buried list ("anchoring, availability,
representativeness, and regression to the mean") clots a sentence just as much.

One genuine set is fine. The tell is reaching for the balance of a list as a
default rhythm, sentence after sentence. Calibration from the gold: about **five
to six** genuine inline lists across the whole post, each a real enumeration the
content needs, well spaced, never two in adjacent sentences. (Note for the
checker: a naive "X, Y, and Z" match also catches appositive pairs like "The
first, System 1, is" and trait lists; the audit separates a real reflexive
enumeration from those.)

A list can repeat across sections, not only within one. The same enumeration
used twice in different sections (the Facts gold reused one public-health triad,
clean water, antibiotics, safe surgery, in two sections before it was fixed)
reads as a reflex even when each list alone is fine and the post-wide count is in
budget. Keep one home for a given enumeration. The checker cannot see this, since
it counts each list locally; the audit catches the reuse.

Beyond rhythm, a list must cohere. When a list is offered as evidence for a claim,
every item has to support it: a trio under a head word must be three real instances
of that word. The fault is the assembled triplet whose members point different ways,
as in "her exactness showed in small things: a declined honorary degree, a daily hour
at the piano, decades of letters in German." Only the first is exactness; the piano is
routine, the letters are attachment to home. The head word is glued on, not earned. A
naming-list like this passes every rhythm check and still reads assembled, so the fault
is coherence, not cadence.

Checker: detects inline 3+ lists and adjacent ones, counts per post. Audit: each
list earned or reflexive, and every item genuinely coheres under its claim.

### 2.4 Over-closure and the appended reason

A model rarely lets a claim stand. It appends the reason the reader could already
infer, or restates the point as a closing gloss. Watch the trailing "which is
why", the tacked-on ", since X" and ", because X", and the sentence that says
again what the one before it just said.

Let the claim stand. When the reason carries real weight, give it its own
sentence. Otherwise trust the reader to draw it.

Weak: "The swap is invisible from the inside, which is why it usually goes
uncorrected."

Better: "The swap is invisible from the inside. You rarely catch it."

Checker: trailing causal clauses as candidates. Audit: was the closure needed.

### 2.5 The symbolism register

Say what happened, or what a thing does. Do not say what it represents, embodies,
reflects, underscores, signifies, or stands for. That register is abstract and
promotional, and it reads as machine even when no single word is on the blacklist.

This one is audit-led, since it is a register more than a word list. A script can
flag the verbs (represents, embodies, reflects, underscores, stands as,
symbolizes, signifies) as candidates; the audit judges whether the sentence is
reporting or sermonizing.

### 2.6 Within-post sameness across parallel fields

The style guide guards against sameness from one post to the next (A15). The same
fault runs inside a single post, across its parallel fields. When every
`in_practice` line opens with an imperative verb, when every core-idea title
takes the same grammatical shape, when every concept is introduced with the same
gesture, the reader feels the template even though each item reads fine alone.

Vary the entry across the set: some imperative, some declarative, some a real
question, some a concrete conditional. The set should not scan as one mold
stamped repeatedly. In the Books gold, the eight `in_practice` lines were rewritten
from seven of eight opening on an imperative verb to a mix of imperative,
declarative, conditional, and question.

**A consequence for the skeletons.** A section comment must not mandate a single
syntactic shape across a parallel field. The Books `in_practice` template tell came
from the skeleton comment itself, which read "ONE direct imperative sentence,
begin with the action". A comment that fixes one shape for every item in a set
manufactures the sameness this rule forbids. When a comment constrains a
parallel field, it asks for variety across the set, not one form. (The Books
skeleton comment was changed accordingly.)

Checker: shared opening shape across a parallel-field set (approximate). Audit:
confirms and judges.

### 2.7 The vocabulary blacklist, living and dated

The style guide's A3 list is the base. This layer adds the rule that the list
carries a date and is refreshed each quarter and on every model upgrade, because
the tells move. As of the current generation, the words to watch most are framing
verbs ("emphasizing", "highlighting", "showcasing", "enhance"), the connectives
"align with" and "foster", and the promotional set ("seamless", "comprehensive",
"elevate"), alongside the older set the style guide already names. "Maximize" sits
apart: its promotional use ("maximize impact") is a tell, but its mathematical use
(maximizing an objective, a bound, or a likelihood) is correct and common in the
technical formats, so it is off the auto-flagged list and judged in the audit by
context. The same holds for "minimize", which was never listed.

A single hit is a candidate, not proof; real human writing uses these words too.
A cluster of hits in one post is the signal.

Checker: hit count and clustering, with the list's date recorded. Audit: whether
the usage is natural or a tell.

Blacklist date: 2026 Q2. Refresh due each quarter or on the next model upgrade.

### 2.8 Overcorrection is its own tell

Roughed-up prose done badly is performative quirkiness, which is only a different
machine register. A short sentence dropped in for effect, an odd word chosen to
seem unmachined, a fragment forced where the thought did not break: each reads as
applied, not written. Texture has to serve the meaning, never display itself.

This is the hardest to script and falls mainly to the audit and the human check.
Its presence usually shows up as variance that looks deliberate rather than
natural, so it is the counterweight to 2.2: vary hard, but do not perform the
variation.

### 2.9 The reflex antithesis

The "X, not Y" balance, with its cousins ("X rather than Y", "less a clock than a
budget", "beats, not years"), is the quiet relative of the contrast frame the
style guide bans in A3. One is fine when the content is itself a real opposition.
The tell is the same balance reached for as a default rhythm, or one opposition
pressed twice or three times inside a single passage. In the Books gold,
core_ideas[2] pressed the same coherence-versus-truth opposition three times (the
title, a "more confident, not less", and a near-verbatim restatement) before it
was cut to one plain claim. The fix is never to ban the shape. It is to keep at
most the earned instance and let the rest fall to plain statement.

This is audit-led. A naive "X, not Y" match over-flags, since a real contrast
reads the same to a regex, so the script does not raise it; the audit judges the
density across the passage and the post.

### 2.10 Unnecessary complexity, for a global readership

Most readers are fluent but not native English speakers, so a needless hard word
or a sentence they must parse twice is friction, and reaching for an ornamental
word to sound less plain is itself an affectation tell (see 2.8). The lens, on
the prose only: when a common word and a rarer one carry the same meaning, the
common one is wanted; one main idea per sentence; modifiers near what they
modify; no clause stacked inside a clause (which 2.1 already measures from the
comma side).

The guard runs the other way too. This is not a push toward simple or short
prose, it never trims substance, and it never talks down to the reader (style
guide, the one principle and A5). The difficulty stays in the idea; only the
construction gets out of its way. The exact technical term still earns its place
when it is the right one, glossed in stride rather than avoided. This generalizes
the Academy note in section 3 to all seven formats.

This is audit-led and falls to the human read; the script has no reliable measure
of a needlessly fancy word.

---

## 3. The format-specific rhythm band (the only thing that flexes)

Everything in section 2 is fixed across all seven formats. The one thing that
changes per format is the rhythm band, and it is anchored to that format's gold
example, never to a number invented in the abstract.

The band controls three things:

- where the center of gravity of sentence length sits;
- how high the ceiling goes (the longest sentence the format tolerates);
- how much subordination a technical or explanatory step may carry.

Facts sits at one end: a short center, a low ceiling, very high variance, the
sharpest and tightest of the seven. The others sit further along, and each is
fixed when its own example reaches gold.

**Academy, said plainly, because it is the easiest to get wrong.** Academy's
difficulty lives in the idea, the precision, the notation, and the worked step.
It does not live in the sentence construction. A long, clotted, multi-clause
sentence in Academy is a defect, not the register. "Walk the hard step slowly and
concretely" means break it into more digestible beats, which usually means more
short sentences, not fewer. Expert register means precision and assumed
background, never tortured syntax. The flow and burstiness rules in section 2
apply to Academy exactly as hard as to Facts. What is allowed to be harder is the
idea the reader must hold, not the prose that delivers it. The reader brings more;
the writer never works against them.

The band table. All seven rows are measured from their format's locked gold example.

| Format    | Length center        | Ceiling                      | Subordination tolerance                    | Burstiness ratio   |
|-----------|----------------------|------------------------------|--------------------------------------------|--------------------|
| Books     | 16 to 20 words, with short punches of 4 to 9 | about 37, most sentences under 30 | moderate: one appositive per sentence, never stacked | floor 2, typical 3 to 8 |
| Facts     | 12 to 16 words, with short punches of 4 to 9 | about 31, most sentences under 22 | tight: one appositive per sentence, never stacked | floor 2, typically 2.5 to 6, very high variance |
| People    | 16 to 20 words, with short punches of 4 to 9 | about 40 (a technical outlier to 44 in greatest_work), most sentences under 28 | moderate: one appositive per sentence, genuine lists allowed, never stacked | floor 2, typically 2.5 to 8, very high variance |
| Concepts  | 15 to 18 words, with short punches of 4 to 10 | about 28, with a single 63-word outlier in origin, most sentences under 24 | moderate: one appositive per sentence, genuine lists allowed, never stacked | floor 2, typically 2 to 8, very high variance |
| Stories   | 13 to 19 words (median 16), with short punches of 4 to 10 | about 33, most sentences under 28 | moderate: one appositive per sentence, genuine lists allowed, never stacked | floor 2, typically 2 to 8, very high variance |
| Questions | 16 to 22 words (median 20), with short punches of 4 to 10 | about 35, most sentences under 28, with deliberate outliers in the single-sentence strongest_argument distillations (to 44) and one history sentence (50) | moderate: one appositive per sentence, genuine lists allowed, never stacked | floor 2, typically 2.5 to 8, very high variance |
| Academy   | 13 to 15 words (median 14), with short punches of 5 to 10 | about 28, no outliers, most sentences under 22, the tightest ceiling of the seven | tight: one appositive per sentence, never stacked, a clotted multi-clause sentence is a defect | floor 2, typically 2 to 5, very high variance; short technical sections may sit lower |

---

## 4. The acceptance call

A post is "gold" when it passes all three layers to the bar of the format's gold
example. The script clears or raises the mechanical candidates. The audit judges
the semantic tells and confirms or clears the script. The human spot-checks a
sample and makes the final read-human call.

This is a judgment, made against an example, not a threshold a post either clears
or fails. The numbers in section 2 and the band in section 3 narrow where the
judgment looks; they do not replace it.

---

## 5. Open items, and what each remaining format settles

- **The per-format bands beyond Books** are set as each format's example reaches
  gold, in turn. Books is the calibrated pilot; its band proved the method.
- **The mechanical checker** is implemented as `tools/texture_check.py`, a
  standalone stdlib script that emits the measures named in sections 1 and 2
  (per-section length stats, comma counts, inline-list counts, parallel-field
  opening shapes) and produces candidates, not verdicts. It is calibrated on the
  Books band; run it with `python3 tools/texture_check.py path/to/post.json`. Two
  tells stay audit-led, and the script says so: the structure items' shared
  internal shape (the opener word is a weak proxy, so the opening-shape test runs
  on `in_practice` only), and whether an inline list is a real enumeration or an
  appositive pair (the raw count is descriptive, only adjacency is raised).
- **Cross-post variance** (sameness across many posts in a bulk run) is named and
  tracked, and the independent-review step already carries a cross-batch check to
  strengthen. The full mechanism, a register of used opening moves and structural
  beats that the generator avoids, is designed after more formats are calibrated.
- **Integration into the bulk pipeline** (lean positive directives in the
  generation step, these tells added to the review rubric, the checker as a
  script) is the next build once this layer is trusted on Books.

---

## Changelog

- v1.9: Academy calibrated (locked gold, Friston's free-energy principle), the seventh and final format, so all seven section-3 band rows are now filled. Added the Academy band row, measured from the locked gold: the lightest center of the seven (median 14), the tightest ceiling (about 28, no outliers), and a clotted multi-clause sentence treated as a defect. Registered BANDS["academy"] (the universal section-2 floors, list_post_soft 6) so the format reports as calibrated. Removed "maximize" from the vocabulary blacklist and noted in 2.7 that the mathematical maximize or minimize of an objective is legitimate while the promotional sense stays an audit tell, which stops false flags in the math-bearing format. The Academy cycle, after a provisional lock, was reopened by a human reader check that found an accessibility gap: the plain-language on-ramp (the_big_idea) sat behind the dense in-field tldr, and several sentences ran long. Fixes: the_big_idea was reordered to order 2 ahead of the tldr (a pure data change, since the renderer sorts by the order field); a format-wide inline-italics render was added so named theories and works italicize across every free-text prose field (asterisk marker, parsed outside the math spans); an independent review, a gated worker fix (nine clotted sentences recast, sixteen theory and work names italicized), and an independent verifier pass that caught a real sign error in cross_field_reach (the evidence lower bound is maximized and free energy is its negative, so the original "minimizes the ELBO" and "identical quantities" were wrong); a narrow re-fix corrected the science, dropped a four-versus-five faculty-count mismatch between the on-ramp and key_findings, and de-italicized Occam's razor as a named principle outside the theory, framework, and work rule. Checker on the locked gold: calibrated, candidates only (one flat short technical finding, a few earned subordinate closes), zero em-dashes, zero blacklist hits.
- v1.8: Questions calibrated (locked gold, "Do we have moral obligations to future generations?", the Onkalo framing). Added the Questions section-3 band row, measured from the locked gold: a longer center (median 20) than the narrative formats, fitting an analytical debate format, with healthy burstiness and deliberate long outliers in the one-sentence strongest_argument distillations and one history sentence. The Questions cycle ran the full loop: mechanical pre-check (extract_questions added to the checker, BANDS["questions"] registered, the straight-quote check extended to feed_card.the_question and one_line, which closed a real gap), independent cold audit, a gate with web-verification of every philosophy and Onkalo attribution (all correct), a body+quiz worker fix (closing metronome broken in the non-perspective sections, three because/since clauses recast, the contractarian reopened concrete-first to match the other three and protect steelman parity, two your_turn prompts neutralised, setup de-restated, the_question set to curly quotes, quiz length-tell cut from 7/8 to 2/8 and two throwaway distractors replaced), a fresh verification pass (verdict: even, open payoff, teasers work, lock as is), and a final mechanical touch unifying the far-future date to 2300. Also removed a leftover duplicate Stories TBD row from the band table. Checker on the locked gold: 4 candidates, all accepted (three earned because-clauses, one genuine enumeration list), quiz-groundedness and straight-quote 0.
- v1.7: Stories calibrated (locked gold, the van Meegeren forgery). Added the Stories section-3 band
  row (center 13 to 19 words, median 16, short punches of 4 to 10, ceiling about 33, very high
  burstiness). No rule change; the checker thresholds remain the universal section-2 floors, and a
  calibrated BANDS["stories"] entry was added so the format reports as calibrated. The Stories cycle
  also landed two carried-over shared-layer items: the word-as-mention quotation clause in the style
  guide (work titles plain, curly doubles for quotation and term-mentions) and a straight-quote
  candidate in the checker, both verified against all golds with zero regression.

- v1.6: two additions from a reader pass on the People gold, neither changing an
  existing numeric rule. Extended 2.3 from list rhythm to list COHERENCE: a list
  offered as evidence must have every item support its head word or claim (the
  "exactness" triplet whose members pointed three ways was the case). Extended the
  section 1 audit-layer description so the audit also reads as a reader, not only a
  texture-checker (teaser pull, list and detail coherence, title payoff, clichis,
  content gaps, per-section momentum); this captures the lens that a rhythm-only audit
  was missing. Regression: Books, Facts and Concepts golds were re-scanned against the
  2.3 coherence extension and the title-payoff rule and pass both (no incoherent list,
  no unrendered title), so their locks stand at their versions; People is separately
  re-opened for revision and HAS re-locked against v1.6 (Lise Meitner). The revision (flat teasers rebuilt into open loops, the incoherent "exactness" list rebound, the promised "walk in the snow" scene rendered, the bomb-to-Hiroshima bridge added, one passive activated, E = mc²) changed reader-quality but barely moved the band; only the greatest_work outlier shifted 46 to 44 (the mc² edit shortened that sentence). People row updated accordingly; the rest of the row stands.

- v1.5: filled the Concepts row of the section 3 band table, measured from the locked
  Concepts gold (`concepts_example.json`, Regression to the Mean): a tighter, punchier
  center than the narrative formats (about 15 to 18 words, many short beats of 4 to 10),
  a typical ceiling near 28 with one 63-word outlier in the origin section that a cold
  read cleared as a structured parallel sentence, and very high burstiness. No universal
  rule changed: the Concepts cycle surfaced only applications of existing rules (the
  per-unit interpretive bow as the dominant pattern, examples announcing rather than
  letting the reader notice, reflex antithesis, a repeated motif across sections, a quiz
  spread too narrow). Two items were deferred to a later pass and are NOT yet done: a
  possible style-guide clause on word-as-mention quotation (Concepts follows the curly-
  double convention for now), and a checker gap where texture_check.py scans only straight
  double quotes and missed straight single quotes used as quotation. Books, Facts and
  People locks stand at their versions; only the per-format length numbers are new.

- v1.4: filled the People row of the section 3 band table, measured from the locked
  People gold (`people_example.json`, Lise Meitner): length center about 16 to 20
  words with short punches of 4 to 9, narrative ceiling near 40 with a single
  technical outlier to 46 in greatest_work, most sentences under 28, very high
  burstiness. No universal rule (section 2 or Part A) changed: the People cycle
  surfaced only applications of existing rules (the per-unit mic-drop, ascend-to-
  longest, reflex antithesis, parallel-field sameness, over-closure), so the Books
  and Facts locks stand at their versions and only the per-format length numbers are
  new. This confirms the split discipline a second time: a contrasting narrative
  format added a band row, not a core rule.
- v1.3: filled the Facts row of the section 3 band table, measured from the locked
  Facts gold (length center about 12 to 16 words with 4 to 9 short punches, ceiling
  about 31 with most sentences under 22, very high variance, tight subordination).
  Added to 2.3 that the same enumeration reused across sections is itself a tell,
  which the checker cannot see. No Books threshold changed, so the Books lock stands.
- v1.2: added the scope convention at the top of section 2 (unmarked universal
  text binds all seven formats; format-bound lines carry a greppable
  "Format-specific (X):" label; measured numbers are delegated per format, never
  baked into a universal rule). This is an authoring and reading convention only;
  no threshold or rule changed, so existing locks need no re-check.
- v1.1: added 2.9 (the reflex antithesis, with the Books core_ideas[2] density
  calibration) and 2.10 (unnecessary complexity for a global readership, which
  generalizes the Academy note); recorded the rhythm-drift measure in 2.2 and in
  section 1 to match the checker. No Books threshold changed, so the v1.0 lock of
  the Books example is re-checked against the new rules only, not re-measured.
- v1.0: initial Books-calibrated thresholds, measured from the Books gold example.
