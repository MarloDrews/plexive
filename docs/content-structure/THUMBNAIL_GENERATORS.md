# Thumbnail generators

Generated from `backend/app/thumbnails/generators.py` by
`backend/scripts/thumbnail_catalog.py --write-doc`. Do not edit by hand.

A post JSON's optional top-level `thumbnail` object names one of these in its
`generator` key; every other key is a parameter below. A post that suits none of
them simply has no `thumbnail` object and falls back to the placeholder image.

## `concept`

A grid of a hundred dots with one share of them filled in colour, or a formula typeset as maths -- optionally beside a circular portrait of the person the claim belongs to, under the same tilted caption banner as the other two cards.

**Use it when** the substance of the post is a SHARE OF A WHOLE or a RULE THAT CAN BE WRITTEN DOWN, and no place and no single mind anchors it. Ask WHAT IS THE CLAIM MADE OF: '8% of your DNA is the wreckage of old viruses' is a share, and the grid shows how much of you that is; 'every piano is tuned to the twelfth root of two' is a rule, and the formula IS the fact. This is the card for the posts a map and a head both have to decline -- a proportion is true of everyone and everywhere, so a country filled in red would say something false.

**Do not use it when** the number in the post is not a share of anything. A RATIO is the common trap: 'nuclear power kills 800 times fewer people than coal' is a comparison, not a part of a hundred, and there is no whole for the grid to be. A rate, a duration, a temperature, a distance and a count are all the same refusal. Decline too when the post merely happens to contain a percentage: the share has to be what the post is ABOUT.

Exactly one of `share` or `formula` is required.

| Key | Type | Default | Values | Meaning |
|---|---|---|---|---|
| `share` | number | - | `0`–`100` | The percentage to fill in, 0 to 100. The grid is a hundred dots, so this is read straight off the card. |
| `formula` | string | - | - | LaTeX maths WITHOUT the surrounding dollar signs, e.g. "\\sqrt[12]{2}" or "P(d)=\\log_{10}(1+1/d)". Drawn instead of the dot grid. |
| `caption` | string | required | - | The words in the banner, rendered in capitals. Two to five words that name what the share is a share OF, or what the formula says. |
| `benchmark` | number | - | `0`–`100` | A second share the post explicitly compares the first with, drawn as hollow dots inside the filled ones. Only for a post that states both numbers. |
| `portrait` | string | - | - | The name of the PERSON the claim belongs to, looked up on Wikipedia: "Hermann Ebbinghaus", not "forgetting curve". Puts a circular portrait to the right of the content. Leave it out unless the post really hangs on one person -- see the rules. |
| `portrait_file` | string | - | - | A Wikimedia Commons file name such as "File:Ebbinghaus2.jpg", used instead of `portrait` when a person's name resolves to the wrong image. |
| `columns` | integer | `10` | `1`–`100` | How many dots per row. Must divide 100 exactly. Leave at 10 -- a ten-by-ten square is what lets a reader see a percentage without counting. |
| `palette` | string | `auto` | `auto`, `blue`, `green`, `red`, `yellow` | Colour of the filled dots, the formula, the portrait and the banner; the empty dots stay grey. Four colours only. Leave it out -- see the rules. |
| `theme` | string | `auto` | `auto`, `dark`, `light` | Whether the field behind the content is a dark slate (`dark`) or a pale paper (`light`). Leave it out: `auto` derives it from the subject, which keeps the feed from being all one or the other. |
| `font` | string | `auto` | `auto`, `sans`, `serif` | The caption typeface, which the formula follows: `sans` sets the maths in a grotesque, `serif` in Computer Modern. Leave it out -- `auto` derives one from the subject. |
| `uppercase` | boolean | `true` | - | Capitalise the caption. Leave on unless the caption is a proper name in mixed case. |
| `seed` | integer | - | `0`–`2147483647` | Pins the caption's slight random tilt, so the same spec renders the same card twice. Omit to let each render differ. |
| `width` | integer | `1280` | `320`–`3840` | Image width in pixels. Leave at the default. |
| `height` | integer | `720` | `180`–`2160` | Image height in pixels. Leave at the default; cards are 16:9. |

**Rules**

- A SHARE IS NOT A RATIO, and this is the mistake to watch for. `share` is a part of one whole you can name: 8 of every 100 base pairs, 80 of every 100 nerve fibres. 'Eight hundred times fewer deaths than coal' has no whole -- it is two quantities divided by each other, and there is nothing for a hundred dots to represent. If you cannot finish the sentence '... out of a hundred WHAT', do not use this generator.
- The caption must name the whole. The grid shows that 8 of a hundred somethings are filled; only the banner can say "of your DNA". A caption that leaves the reader asking '8% of what?' has failed at the one job it has on this card.
- A formula has to be readable on one line at a glance. This is a thumbnail, not a blackboard: a derivation, a system of equations or anything three lines deep renders as a grey smear. If the rule cannot be written short, the post does not have a formula card.
- Write the formula WITHOUT dollar signs and as LaTeX maths: "\\sqrt[12]{2}", not "$\\sqrt[12]{2}$" and not "the twelfth root of 2".
- `portrait` takes a PERSON'S NAME, never the topic's. "Frank Benford", not "Benford's law" -- the topic article leads with a bar chart, and a lookup that returns a real image nobody checks is exactly how a card ends up with a diagram where a face should be.
- Use `portrait` only when the post genuinely hangs on that person: they found it, or it carries their name. Not because they are mentioned. A portrait that cannot be used is dropped and the card comes out centred, so naming one is never fatal -- but naming one for a post that is not about anybody puts a stranger on the card.
- Living people almost never work. Their photographs are under licences that oblige a visible credit the card cannot carry, so the lookup refuses them; historical figures are the ones whose portraits are in the public domain.
- Never invent a `portrait_file`. Use `portrait` unless you know the exact Commons file you mean.
- `benchmark` only when the post states BOTH numbers and contrasts them -- 30% observed against the 11% chance predicts. It is not a place to put a second interesting figure.
- Leave `palette` out. Nothing about a proportion or a formula is red, yellow, green or blue, and picking a colour to match the mood of the topic is what made every second card red on the map generator. `auto` spreads the cards across all four on its own.
- Leave `theme` out for the same reason: `auto` alternates dark and light across the feed, and pinning it throws that variety away.

**Examples**

```json
{"generator": "concept", "share": 80, "caption": "Most of it goes up"}
{"generator": "concept", "share": 8, "caption": "Old viruses in your DNA"}
{"generator": "concept", "share": 30, "benchmark": 11, "caption": "Three times what chance predicts"}
{"generator": "concept", "formula": "\\sqrt[12]{2}", "caption": "Every piano is out of tune"}
{"generator": "concept", "formula": "R=e^{-t/S}", "portrait": "Hermann Ebbinghaus", "caption": "Memory fades on a curve"}
```

## `geography`

A greyscale world map -- dark or light -- with exactly one region filled in colour and a short caption in a tilted banner underneath.

**Use it when** a specific place on Earth anchors what the post says -- a sea, ocean, country, region, island, desert, mountain range, rainforest or river basin. Ask WHERE THE CLAIM IS TRUE, not what subject the post belongs to. A post whose topic is economics, history, biology or policy is still a geography card when its claim is scoped to one place: banks creating 97% of the money supply is a fact about the United Kingdom, and the map answers 'where?'. This is the common case -- reach for it whenever the post names a place it is really talking about.

**Do not use it when** no place anchors the claim, because it holds everywhere or nowhere. A law of mathematics, a property of a material, a cognitive bias, a fact about the human body or a piece of physics has no location, and a map of where it happened to be discovered would mislead. Also decline when a place is named only in passing, as an example among others, or as the address of a laboratory.

Exactly one of `place` or `osm_id` is required.

| Key | Type | Default | Values | Meaning |
|---|---|---|---|---|
| `place` | string | - | - | The region to fill, as a plain name a map would use: "Iceland", "Black Sea", "Sahara". Join several with " + " to fill them as one shape. |
| `osm_id` | string | - | - | An OpenStreetMap object id such as "R9407", used instead of `place` when a name resolves to the wrong feature. |
| `caption` | string | `""` | - | The words under the map, rendered in capitals. Two to five words that say what happened there. Defaults to the place name when empty. |
| `palette` | string | `auto` | `auto`, `blue`, `green`, `red`, `yellow` | Colour of the filled region and its banner; everything else on the card stays grey. Four colours only. Leave it out unless the subject really has a colour -- see the rules. |
| `theme` | string | `auto` | `auto`, `dark`, `light` | Whether the map behind the coloured region is a dark slate (`dark`) or a pale paper (`light`). Leave it out: `auto` derives it from the subject, which keeps the feed from being all one or the other. |
| `font` | string | `auto` | `auto`, `sans`, `serif` | The caption typeface: `sans` is the plain heavy news banner, `serif` a lighter, dressier one. Leave it out -- `auto` derives one from the subject, which is what keeps the feed from being set entirely in the plain face. |
| `source` | string | `auto` | `auto`, `osm`, `natural_earth` | Which map data set the filled shape comes from. `auto` tries OpenStreetMap and falls back to Natural Earth; `natural_earth` is mandatory for physical regions -- see the rules. |
| `padding` | number | `0.35` | `0`–`10` | How much surrounding context to show, as a fraction of the region's own size. 0.1 is a tight crop, 0.35 the normal card, 2.0 pulls back to the whole continent. |
| `uppercase` | boolean | `true` | - | Capitalise the caption. Leave on unless the caption is a proper name in mixed case. |
| `highlight_under_land` | boolean | - | - | Draw the coloured shape beneath the landmass so coastlines stay visible. Omit it: seas and oceans switch it on by themselves. |
| `clip_to_land` | boolean | `true` | - | Mask a land region to the coastline, so a country's territorial waters are not filled too. Leave on. |
| `seed` | integer | - | `0`–`2147483647` | Pins the caption's slight random tilt, so the same spec renders the same card twice. Omit to let each render differ. |
| `width` | integer | `1280` | `320`–`3840` | Image width in pixels. Leave at the default. |
| `height` | integer | `720` | `180`–`2160` | Image height in pixels. Leave at the default; cards are 16:9. |

**Rules**

- EVERY physical region MUST set `source: "natural_earth"` -- deserts, mountain ranges, rainforests, tundra, steppes, plains, plateaus and polar regions alike. OpenStreetMap's geocoder is built for addresses and resolves a bare physical name to whatever business or building carries it: "Sahara" returns a village in India, "Andes" a town in New York, "Arctic" an appliance shop in Romania. Each is a real fillable area, so nothing downstream can tell the card is wrong -- it just renders a red rectangle over a blank grey map.
- A polar subject is fine: "Antarctica", "Arctic Ocean" and "Southern Ocean" are drawn on a map centred on the pole, so they come out the shape an atlas shows. Still name the LAND when the claim is about land -- Arctic permafrost is in "Siberia", "Alaska" and "Greenland", not in the Arctic Ocean.
- Write "Mediterranean Sea", "Baltic Sea", "Atlantic Ocean" and "Pacific Ocean" as those plain names. Each is stored split across several polygons and is already reassembled into the complete sea; naming a sub-basin gives a partial one.
- Two places that belong together are joined with " + ", e.g. "Black Sea + Sea of Azov". They are filled as a single shape, so only combine places the post treats as one thing.
- Never invent an `osm_id`. Use `place` unless you know the exact id of the object you mean.
- An abstract topic is not a reason to decline. Ask where the claim holds, not what field it belongs to: "In the UK, banks create 97% of all money" is a post about money, but it is true OF THE UNITED KINGDOM, so it gets a UK card. A statistic about one country, a practice in one region, a law in one state -- all of these are geography cards.
- When a post spans two places, pick the one it is ABOUT, or join them with " + " when it is genuinely about both. Saharan dust fertilising the Amazon is an "Amazon" card (the place being changed), or "Sahara + Amazon" to show the route -- not a decline.
- The caption is not the headline. It is the two-to-five words a reader needs while looking at the map: "Almost dried up", "Growing every year".
- The card has exactly four colours: red, yellow, green and blue. Set `palette` ONLY when the subject really is one of them: blue for water, green for forest and vegetation, yellow for desert and heat. Otherwise leave it out -- omitting it spreads the cards across all four, while picking red as a fallback made every second card red. Never set it to match the mood of the topic; a card is not red because the news is bad.
- Leave `theme` out unless the post itself has a light or dark register. `auto` alternates dark and light across the feed on its own, which is the variety it exists for; pinning every card to one theme throws that away.
- Leave `font` out. It used to be yours to choose, with `serif` for a subject that had age to it and `sans` for anything current -- and because almost any post can be argued to be current, the dressier face was picked once in twenty-two posts and every card in the feed looked the same. `auto` now derives it, which is the only thing that actually gets both typefaces used.
- Cities, buildings and single addresses make poor cards -- the map is a world map, and a point that small renders as a dot. Use a region or nothing.

**Examples**

```json
{"generator": "geography", "place": "Mediterranean Sea", "caption": "Almost dried up", "palette": "blue", "padding": 0.2}
{"generator": "geography", "place": "Sahara", "caption": "Growing every year", "palette": "yellow", "source": "natural_earth"}
{"generator": "geography", "place": "Antarctica", "caption": "Once a rainforest", "palette": "green", "source": "natural_earth", "padding": 0.3}
{"generator": "geography", "place": "Greece", "caption": "Democracy started here", "font": "serif", "theme": "light"}
{"generator": "geography", "place": "United Kingdom", "caption": "Banks make the money"}
{"generator": "geography", "place": "Amazon", "caption": "Fed by Saharan dust", "palette": "green", "source": "natural_earth"}
```

## `mental`

A prepared 3D figure -- a head, a brain, or a brain seen through a translucent head -- lit on a plain dark or light field, with the same tilted caption banner underneath as the map card. The head takes the card's colour; the brain keeps its own pink.

**Use it when** the post is about something happening INSIDE one mind. Ask WHOSE MIND IS DOING THIS: a cognitive bias, an illusion, an effect of memory or attention, a habit, motivation, emotion, sleep, learning, how a decision gets made, mental health, or the brain itself as an organ. This is the card for the posts a map has to decline -- a bias is true of everyone everywhere, so a country filled in red would say something false, while a head claims no location at all.

**Do not use it when** the claim is about the world outside a single mind. A claim scoped to a place is a geography card. A claim about a group, a market, a society, a technology, a material or a piece of physics is not about anyone's mind, and a brain over it would announce 'this is psychology' about a post that is not. Decline in particular when the mind is merely the AUDIENCE: a fact is not a mental post because reading it feels surprising.

| Key | Type | Default | Values | Meaning |
|---|---|---|---|---|
| `motif` | string | required | `head`, `brain`, `brain_in_head` | Which figure to draw. `head` is the person and the default, `brain` is the organ, `brain_in_head` is the organ seen through a translucent skull. This is the one real decision on the card, and the rules below are not optional reading. |
| `caption` | string | required | - | The words in the banner, rendered in capitals. Two to five words that say what the mind is doing. |
| `angle` | string | `auto` | `auto`, `angled-side`, `front` | Which camera angle of the figure to use: `angled-side` (a three-quarter view from the side: the face points left, and enough of the far side of the skull shows to read as a solid head); `front` (the head facing the camera straight on, symmetrical). Leave it out unless one angle genuinely suits the post better than another -- `auto` picks one from the subject, which keeps the feed from showing the same pose every time. |
| `palette` | string | `auto` | `auto`, `blue`, `green`, `red`, `yellow` | Colour of the banner, and of the head on a `head` card. The brain keeps its rendered pink whatever this says, and the field behind the figure stays grey either way. Four colours only. Leave it out -- see the rules. |
| `theme` | string | `auto` | `auto`, `dark`, `light` | Whether the field behind the figure is a dark slate (`dark`) or a pale paper (`light`). Leave it out: `auto` derives it from the subject, which keeps the feed from being all one or the other. |
| `uppercase` | boolean | `true` | - | Capitalise the caption. Leave on unless the caption is a proper name in mixed case. |
| `seed` | integer | - | `0`–`2147483647` | Pins the caption's slight random tilt, so the same spec renders the same card twice. Omit to let each render differ. |
| `width` | integer | `1280` | `320`–`3840` | Image width in pixels. Leave at the default. |
| `height` | integer | `720` | `180`–`2160` | Image height in pixels. Leave at the default; cards are 16:9. |

**Rules**

- `head` IS THE DEFAULT, and most mental posts should get it. The plain figure of a person suits anything about what someone does or experiences -- a bias, a habit, an emotion, an identity, a decision, an expectation, a way of paying attention. The thing doing all of that is a person, not a lump of tissue, and putting an organ on it adds a note of neuroscience the post never claimed.
- Reach for a brain motif only when the ORGAN is genuinely the subject -- when drawing a person instead would lose something. `brain` is for a post literally about the tissue: neurons, sleep, energy consumption, brain chemistry, anatomy, what a drug does to it. `brain_in_head` is for a post that turns on something being HIDDEN inside someone, a mechanism they cannot watch running in themselves -- an illusion, a blind spot, a memory rewriting itself unnoticed.
- `brain_in_head` is the most striking of the three and therefore the easiest to over-use. Before choosing it, check that the post really trades on 'you cannot see this happening in you'. If it does not, use `head`.
- Beware one particular bad reason. If your justification for a brain motif is that the post is about the mind, that justification fits EVERY post this generator draws -- the mind is the whole generator, so it cannot also be the reason for the motif. Applied honestly it produced a feed in which every card was the same picture.
- The caption is not the headline. It is the two-to-five words a reader needs while looking at the figure: "You cannot feel it", "Memory rewrites itself". Write what the mind is DOING, not what the post concludes.
- The brain is always pink, on `brain` and `brain_in_head` alike. That pink is most of what makes it read as a brain rather than an abstract shape, so it is not something `palette` can or should change -- on a brain card the colour you pick shows up in the banner only.
- Leave `palette` out. Nothing about a bias or a memory is red, yellow, green or blue, and picking a colour to match the mood of the topic is what made every second card red on the map generator. `auto` spreads the cards across all four on its own.
- Leave `theme` out for the same reason: `auto` alternates dark and light across the feed, and pinning it throws that variety away. Set it only when the post itself has a register -- a card about sleep or the unconscious may earn `dark`.
- Leave `angle` out unless the post genuinely reads better from one camera. It is the weakest of the choices here and the easiest to over-think.
- There is one figure on the card and no room for a second subject. A post about two people, a conversation, a crowd or a comparison between minds has nothing this generator can draw -- decline rather than picking `head` and hoping.

**Examples**

```json
{"generator": "mental", "motif": "head", "caption": "Habits beat willpower"}
{"generator": "mental", "motif": "head", "caption": "Losing hurts twice as much"}
{"generator": "mental", "motif": "head", "caption": "You only recall the ending"}
{"generator": "mental", "motif": "head", "caption": "Believing it makes it work"}
{"generator": "mental", "motif": "brain", "caption": "A fifth of your energy"}
{"generator": "mental", "motif": "brain", "caption": "It cleans itself at night"}
{"generator": "mental", "motif": "brain_in_head", "caption": "You edit it every time"}
{"generator": "mental", "motif": "brain_in_head", "caption": "Your blind spot is real", "theme": "dark"}
```
