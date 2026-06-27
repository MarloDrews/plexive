# Deepscroll — Long-Form Style Guide

The binding standard for **how the language reads** across all seven formats:
books, facts, people, concepts, questions, stories, academy.

This file governs language only. It does not decide which sections a post has,
in what order, or where a visual sits: that is the skeletons
(`*_skeleton.jsonc`). It does not govern how a graphic looks: that is
`SVG_STANDARD.md`. When this guide and a skeleton conflict on structure, the
skeleton wins; this guide owns the words inside the structure.

It applies to every word a reader sees: body prose, headlines, teasers,
captions, quiz questions and explanations, section headings.

---

## The one principle everything serves

A reader who finds the topic interesting should read to the end, understand it,
and carry something away. Most should finish even a long post.

The ease that makes that happen comes from **flow and concreteness, never from
simplified vocabulary or shortened content.** We do not dumb anything down. We
write for an educated general adult, the kind who reads good long-form
journalism: not an academic paper, not a children's book. A post may run long,
up to roughly fifteen minutes, and that is fine when every part earns the
attention. Length is never the enemy. Tedium is. The reader leaves because a
sentence bored them, repeated something, or made them work for no reward, not
because the piece was hard or long.

So the whole craft below is in service of one thing: keep the reader moving,
and make the moving worthwhile.

---

# Part A — The shared voice

These rules hold for all seven formats. Part B adds the small, named per-format
deviations.

Scope convention (shared with the texture standard): any unmarked line in Part A
binds all seven formats. A line that holds for only some is marked inline with a
fixed, greppable label, "Format-specific (Facts): ..." or "Format-specific
(Books, Questions): ...", naming which formats it binds. If a rule would be wrong
for any format it is not written here unmarked: it is either scoped with the
label or moved to Part B. Measured figures are never baked into a Part A rule;
the principle stays here and the figure lives per format, delegated by reference
(for example A11 sets the teaser voice and points to each skeleton for length).

## A1. Voice and address

Third person, assertive, no first-person "I" and no editorial or authorial
"we", the "in this post we'll explore" tic. The inclusive "we" that means
people in general is fine where it reads naturally. Address the reader as "you"
where it is natural, not as a tic. Warm but not chummy; confident without
performing confidence. The voice of someone who knows the subject well and
respects the reader's intelligence, talking to one person, not lecturing a room.

Weak: "In this post, we'll explore the fascinating world of sleep."
Strong: "You spend a third of your life unconscious. Here is what your brain is
doing with the time."

## A2. Integrity: nothing is invented

This outranks every other rule in this guide. Every concrete claim a post makes,
whether a number, a date, a name, a quotation, a source, or a study result, is
real and verifiable, taken from the research, not estimated, not rounded into a
better story, not filled in because it sounds plausible. A vivid invented
statistic is a worse failure than a dull true one. When you are not certain a
detail is right, leave it out or state the uncertainty plainly; never manufacture
confidence. One fabricated fact a reader later catches costs the trust of the
whole post, and of the app.

The rules that follow push hard toward specificity. This rule is the leash on
all of them: be concrete, but only with what is true.

This covers media as much as text. Use only images you can point to, real and
licensed for reuse, with attribution, and about the subject at hand rather than
generic decoration; never paste an invented or unverified image URL. The
specifics, which licenses qualify, how to attribute, how images are shown, live
in `IMAGE_STANDARD.md`. A made-up source is a made-up source whether it is a statistic or a
picture. The acceptable licenses and the attribution format are a sourcing
question settled elsewhere, but the integrity line is absolute: no fabricated
number, date, name, quote, source, or URL, ever. When a fitting licensed image
does not exist, use none; a graphic we control is always better than a guess.

Cross-post references obey the same rule. When a post links to another (a
person, a book, a concept, another fact), it names the target by its real
natural identity, a fact the post already knows, and never invents a handle to
force a link. Naming a real target whose post does not exist yet is fine. It is not a
fabrication, and how an unbuilt link behaves is settled in
`SKELETON_COMMENT_STANDARD.md` section 10.

## A3. No AI fingerprints

This is the rule that protects everything else. LLM-default writing has a
texture readers now recognize and distrust, and distrust is the fastest way to
lose them. Remove it.

**Banned vocabulary** (representative, not exhaustive): delve, tapestry,
testament, realm, navigate (figurative), landscape (figurative), underscore,
pivotal, crucial, vital, foster, leverage, robust, nuanced, intricate,
multifaceted, showcase, boast, treasure trove, rich history, stands as, serves
as, plays a (key) role, it is important to note, it is worth noting. The test:
if a word shows up more in model output than in good human writing, cut it.

**Banned structures:**
- The contrast frame: "It's not X, it's Y." "X isn't just Y, it's Z." Overused
  to the point of parody. Say the thing plainly.
- The sweeping opener: "From X to Y," "In a world where," "Throughout history,"
  "Since the dawn of."
- Rhetorical question then immediate answer, as a default rhythm.
- The tricolon crescendo: everything arriving in threes.
- "Whether you are X or Y" reader-bucketing.
- The summarizing sign-off: "Ultimately," "In the end, it's clear that."
- The per-unit mic-drop: ending every section or paragraph on a short, weighty,
  quotable line. A punch at the close of every unit is a machine habit and the
  reader feels the metronome. The habit creeps in most at the two natural exits,
  the opening hook and the closing takeaway, which tempt a lyrical sign-off every
  time. Let most sections end plainly, on a fact or mid-thought. In a short post,
  one landing is the rule: give it to the closing takeaway and keep the hook flat.
  In a long, many-sectioned post the hook and the takeaway sit far enough apart
  that a pointe at each does not compete, so both may land, as long as every
  section between them ends plainly. A quotable line at the close of every unit is
  never fine.
- The reflex antithesis: "X, not Y," "X rather than Y," "less a clock than a
  budget," "beats, not years." It is the quiet cousin of the contrast frame. A
  fact that is itself a symmetry may justify one; reaching for the balance in
  paragraph after paragraph is the tell.
- The empty intensifier: "simply," "actually," "really," "essentially,"
  "fundamentally," "of course," "clearly." They pose as emphasis but add
  nothing and read as machine throat-clearing. Cut them. If the emphasis is
  real, let the sentence carry it.

**Punctuation:**
- Zero em-dashes. They are the single most reliable AI tell. Use a comma, a
  colon, parentheses, or two sentences.
- Semicolons sparingly, and never as a stand-in for the banned em-dash. Where
  two full clauses meet, prefer two sentences, or join them with "and." A run
  of semicolons reads as machine-paced, the same tell the em-dash is. One in
  its proper place is fine, but if you are reaching for one where you wanted a
  dramatic pause, write two sentences instead.
- En-dash only inside a tight number range in metadata; in flowing prose write
  "5 to 10," not "5–10."
- No colon-reveal "ta-da" rhythm on every other sentence.
- Bold is rare. If everything is emphasized, nothing is.

**Symbols and quotation marks:**
- Use the symbol, not the spelled-out word, wherever a symbol exists and renders
  cleanly: % not “percent” and € not “euro”. A symbol takes a digit, never a
  spelled number: write 16%, not sixteen percent. This keeps figures scannable and
  matches how the reader meets these quantities in the wild.
- Currency uses a symbol with a digit too ($ and £), shown to the reader as $100. A
  bare $ collides with the inline math that some formats use in prose, so a literal
  currency dollar is escaped with a backslash: the content string is \$100, and in
  the JSON source, where the backslash is itself escaped, the field is typed as
  \\$100 and the reader sees $100. Never write a bare unescaped $ for currency; the
  bare $ is reserved for inline math.
- Quotation uses typographic double quotes, the curly pair, for any quoted word or
  phrase: the patient hears “a 90% survival rate” and relaxes. Curly doubles are
  cleaner here than straight quotes, which must be escaped inside JSON, and they
  render as real typography. Use them in place of single quotes for quotation, and
  keep the ordinary apostrophe for possessives and contractions.
  This covers a represented question or thought in direct form, such as the
  substituted question “do I like Ford cars?”, but not indirect speech, such as
  asks whether to buy Ford stock.

**Numbers and fractions:**
- Spell out one through twelve in flowing prose; use digits from 13 up. Always use
  digits with a unit or a symbol (16%, 63 years, age 27, a 60-gram primate), and in
  a comparison use digits for every item so the spread is scannable (a shrew gets 2,
  a cat 15, an elephant 65), even ones below 13.
- Keep words for idiomatic or rounded quantities: the rounded motif (a billion beats,
  half a billion), a dozen, a thousand-beat pulse, and small ratios woven into prose
  (three times heavier, the two effects). A number that opens a sentence is spelled
  out, or the sentence is recast.
- Fractions and technical exponents use the slash form, not words: the 3/4 power, the
  2/3 power, the negative 1/4 power, and 1/4, 2/3, 3/4 as standalone fractions. This
  is plain text, since most prose paths do not render math, so no LaTeX here. Loose
  proportions stay words (half the evidence).
- The lean is format-dependent: data-forward formats such as Facts tilt toward
  digits, narrative formats tilt toward words. The principle is shared; the tilt is
  per format.

**The positive directive:** write the way a sharp, well-read person writes when
they care about being understood and have no template in front of them.

**The uniformity tell (the deepest one).** The strongest giveaway is not any
single phrase, it is sameness. Every sentence equally smooth and equally
measured, the same medium length, the same calm explanatory register, every
paragraph built to the same shape. Human writing has texture: an abrupt
three-word sentence, a flat or blunt statement that does not try to be elegant,
a sentence that opens on an odd word, a sudden concrete detail, a small aside.
If a passage reads as uniformly polished, it reads as machine. So vary the
openings, most sentences should not start with "The," "A," "In," or "That";
vary length hard, not gently; and let some sentences be plain and unclever on
purpose. When in doubt, rough it up.

## A4. Sentence rhythm

Flow is mostly rhythm. Vary sentence length deliberately. A long, building
sentence followed by a short one creates the pull that carries a reader down the
page. A run of same-length sentences, especially medium-length ones, flattens
into a drone, and that is where attention dies. Read it as if aloud; if it lulls,
break the pattern.

Weak: three 18-word sentences in a row, each a subject-verb-object march.
Strong: a 25-word sentence that sets up the idea, then four words that land it.

## A5. Concrete first, and define in stride

Lead with the thing the reader can see, then name the principle. The concrete
detail buys the attention the abstraction then spends; never open with the
general statement and follow with the example, reverse it. And when a precise or
technical word is the right one, use it, but make it graspable in the same
breath, in a clause, so precision never becomes exclusion. We do not avoid the
exact word and we do not stop the flow to define it in its own sentence; we land
it and light it up at once.

Weak: "Reciprocity is a powerful social force. For instance, free samples raise
sales."
Strong: "A free sample costs a few cents and reliably raises sales. That is
reciprocity, the pull to return a favor, doing its quiet work."

## A6. Every sentence earns its place

Cut throat-clearing ("It is important to understand that"), cut restatement of
what was just said, cut transitions that only announce a transition
("Additionally," "Moreover," "Furthermore"). Momentum is the goal: each
paragraph should make the next feel necessary, pulled forward by curiosity or
cause, not glued by filler. If a sentence can be removed without loss, remove it.
This is what lets a long post still feel fast.

## A7. Stance without hedging, and without false certainty

Take a position. We are not an encyclopedia and we do not perform neutrality. No
"some argue," no "many believe," no both-sides hedge where the evidence is
one-sided; there, say what is true with conviction and cite specifics, not vague
authority ("studies show" is weak, name what was found). But conviction is not
the same as certainty. Where a question is genuinely open, the honest move is to
hold the tension, not to fake a verdict. No fake neutrality, and no fake
certainty. Where real sides exist, give each the strongest version its best
defender would.

## A8. Prose over lists

Default to prose. A list is correct only when the content is genuinely a set of
parallel items the reader will scan or count. Do not inflate prose into bullets
to look organized; that is a Wikipedia reflex and it breaks flow. When a list is
right, each item is a full thought, not a fragment.

## A9. Headings and titles are claims, not labels

Every section heading and item title makes a point with a verb, so reading only
the headings still tells a story. A reader skimming the headings should get the
argument.

Weak: "Background." "The mechanism." "Implications."
Strong: "The measurement nobody believed." "Why the body cannot cheat this."
"What it costs to be the exception."

## A10. Start in motion, end on a stop

Open every post and every section already moving: a concrete image, a sharp
claim, a number that does not sit right. No warm-up, no scene-setting throat-
clear. And because a reader can stop after any section, no section may end on a
cliffhanger that only pays off later ("but more on that below"). Each section
has to read as a satisfying place to have stopped, even as the next one makes
them want not to.

## A11. The hook: headlines and teasers

Headlines and teasers are their own craft, and they are where the scroll stops
or does not. A hook earns the tap with a specific, true promise the post keeps,
not with a curiosity gap the body cannot pay off. Concrete beats clever: a real
number, a real tension, the actual surprising thing, stated cleanly. Never
overpromise; a teaser that oversells is a reader lost on arrival.

Weak: "You won't believe what scientists found about sleep."
Strong: "Skip a night and your body starts clearing waste from neurons less
well within a week."

Teasers come as a set, usually three, so the within-post sameness rule applies
to them (texture standard 2.6): the three must not read as one template or make
the same promise three times. Each opens a different loop the post then closes, a
real curiosity or tension that makes the reader want in, and none restates the
finding or spends the payoff up front. Let the three share a register so they
cohere as a set, and reach for variety in form so they do not clone one shape,
but let that serve the content. A question, a direct address, a flat claim are
ways to vary when they fit, never a quota to fill: three teasers that each suit
their loop beat a forced variety that suits none, so if a shape does not fit a
post, do not force it. Speak in terms the reader already has: a teaser meets them before the
post, so it never leans on a name or concept the post itself will only teach.
What counts as already-had shifts by format, but teasing with the very thing you
are about to explain is the error everywhere. The no-overpromise rule above is the leash: a loop the body never closes
is the clickbait this forbids. No category labels, and nothing in the "you won't
believe" register. How many teasers, their length, and any format-specific axis
for varying them are set in each skeleton; the voice is set here.

## A12. Quotes have to earn their place

A quote is included only when the exact words carry something a paraphrase
cannot: a turn of phrase, a voice, a stake. Never a flat factual sentence in
quotation marks. Attribute concretely (who, and why they have standing on this),
and keep it short. A dull quote is worse than a good paraphrase.

## A13. Quiz language

Quiz questions test whether the reader understood, not whether they memorized.
Ask why something is true or what it implies, not for a date, a name, or a place.
The wrong options are plausible to someone who half-understood, never throwaway
filler. The explanation teaches the logic of the right answer in a sentence or
two; it does not open with "The correct answer is."

## A14. Gravity: the tone yields to the subject

The default voice is sharp and forward. It must give way when the subject carries
real weight: death, suffering, atrocity, serious illness, grief. People and
Stories meet this most often. There, drop the punch and the cleverness; plain,
careful, respectful language is the strong choice. The surprise-and-reframe
machinery is for a curious fact, never for a tragedy.

## A15. Variety across posts

These rules describe one post, but posts ship by the hundred, and sameness
across them reads as machine-made. Do not reuse the same opening move, the same
rhythmic trick, or the same structural beat from one post to the next. If every
fact opens by stating the number and then breaking the intuition in the same
cadence, the format becomes a template the reader can feel. Vary the way in.

## A16. Conventions: global English, consistent notation

Write for a global English readership. Avoid region-locked idioms and cultural
references only one country would catch, or explain them in passing when they
are essential. Keep notation consistent across posts: one style for numbers,
units, and dates, so a feed of many posts reads as a single publication.

Reach for the plain word when it carries the same meaning as a rarer or more
ornamental one. Many readers are fluent but not native, and a needless hard word
or a clause they must read twice costs them the flow this guide exists to protect.
Keep the syntax navigable: one main idea to a sentence, modifiers next to what
they modify, no clause buried inside another. This is not the simplification the
one principle rules out. The substance and the educated-general-adult target both
stand; the difficulty stays in the idea and leaves the sentence. The exact
technical word still earns its place when it is the right one (A5): use it and
light it up in the same breath, never swap in a vaguer word that loses the meaning.

## A17. Visuals, the language part only

A visual carries information; it is never decoration. Its caption follows every
rule above, the same as body prose. How many visuals, where they sit, and how
they are drawn live in the skeletons and in `SVG_STANDARD.md`, not here.

---

# Part B — Per-format voice

One base voice (Part A). Each format tilts it in one named, bounded way. Nothing
else deviates. For the full worked example of each, read that format's benchmark
post; this block is the tilt, not a tutorial.

## Books
The voice of someone who has actually read it and is telling you why it is worth
your time. Slightly more evaluative about the ideas than other formats; an honest
verdict is welcome, not neutral summary. Emphasis: the book's central argument
and what reading it changes in you.
Avoid: back-cover-blurb tone. Instead: the argument a smart friend would make
over coffee.

## Facts
The sharpest, tightest voice. The fact and its reframe lead; the prose is lean.
Emphasis: the turn, the moment the reader's intuition breaks.
Avoid: "Did you know." Instead: state the fact like it is obvious, then show why
it should not be.

## People
Tells a life as a story of consequence, not a resume. Slight narrative warmth.
Hard rule against hagiography: show the cost, the error, the resistance, not a
saint. Emphasis: what this person changed and what it took.
Avoid: "renowned," "brilliant," "pioneering." Instead: the specific thing they
did that earns the word.

## Concepts
The voice of a great teacher. Concrete example first, always, then the
abstraction the reader can now reuse. The most diagram-leaning format. Emphasis:
the mental model the reader walks away able to apply.
Avoid: defining the term before showing it. Instead: show it working, then name
it.

## Questions
Invites genuinely. Presents the strongest case for each side and does not rush to
resolve. The one format allowed a stronger direct second-person invitation, and
allowed to end on an unresolved tension rather than a tidy answer. Emphasis: the
reader thinking for themselves, not being handed a verdict.
Avoid: a fake balance that secretly favors one side. Instead: make each side as
strong as its best defender would.

## Stories
The narrative format. Scene, tension, payoff. This is the biggest deviation:
storytelling craft leads, a hook scene up front, information withheld and then
resolved, pacing that pulls. The substance is woven into the story, not stapled
on at the end. Emphasis: a story that actually lands.
Avoid: "Once upon a time," or a moral spelled out at the end. Instead: let the
events carry the meaning.

## Academy
The higher-register format, for motivated learners of the subject, not the broad
feed. Allowed: greater technical density, worked steps, terms defined precisely,
mathematical notation (KaTeX). The flow rules still hold inside each explanation
and AI stiffness is still banned, but the threshold of difficulty is higher and
that is correct. Emphasis: the reader genuinely learns to do something; rigor
delivered clearly.
Avoid: hand-waving past the hard step to stay easy. Instead: walk the hard step
slowly and concretely.

---

# Part C — Before output

Run this check on every generated post. Any hit is a rewrite, not a maybe.

- [ ] Every concrete claim (number, date, name, quote, source, image URL) is
      real and verifiable; nothing invented, estimated, or embellished.
- [ ] Zero em-dashes anywhere in user-facing text.
- [ ] Semicolons sparse, none standing in for an em-dash.
- [ ] Symbols for percent and currency, written with digits (16%, $100), not
      spelled out; quotation in curly double quotes, not single or straight quotes.
- [ ] Numbers follow the rule: digits from 13 up and with units or symbols, words
      for idiomatic or rounded amounts; fractions and exponents in slash form
      (the 3/4 power), not words.
- [ ] No banned vocabulary; no contrast frames ("not X, it's Y"); no sweeping
      openers; no summarizing sign-off.
- [ ] Sentence length varies; no flat run of same-length sentences.
- [ ] Sections open concrete, then generalize; precise words defined in stride,
      not avoided.
- [ ] No throat-clearing, no filler transitions, no restatement.
- [ ] Stance taken where evidence is clear; tension held where the question is
      open; no false certainty.
- [ ] Prose by default; lists only for genuinely parallel sets.
- [ ] Headings are claims with verbs, not labels.
- [ ] Every section reads as a fine place to have stopped; no cliffhanger glue.
- [ ] Headline and teaser hook with a specific, true promise; no overpromise.
- [ ] Every quote earns its exact words.
- [ ] Quiz tests understanding; distractors plausible; explanations teach.
- [ ] Tone matches the weight of the subject; no punch on a tragedy.
- [ ] Opening move and structure differ from sibling posts; no template feel.
- [ ] Global English; notation consistent across posts.
- [ ] The format's named voice tilt is present and nothing else deviates.

Precedence when something conflicts:
1. Factual integrity (A2) is absolute and outranks every stylistic rule. A vivid
   invented detail is never acceptable.
2. A skeleton's structural decision wins over this guide.
3. Within the words, content quality wins over any length guideline.
4. This guide governs all prose the structure does not dictate.
