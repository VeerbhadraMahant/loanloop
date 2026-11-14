# LoanLoop landing page: design principles

These are the rules the public landing page (`/`) follows. They come from a teardown of superhuman.com (structure and behaviour only; none of their text, images or brand) applied to LoanLoop. Code lives in `web/components/landing/`; tokens and shared classes are in `landing.css` and `shared.tsx`.

They cover the landing page only. The bank, dev and customer apps keep their own systems (see `DESIGN-BRIEF.md`).

## 1. One immersive moment, then a calm page

- The hero is the only showpiece: animated background, voice orb, frosted glass fragments.
- Everything below it is flat and still. Nothing fades or slides in on scroll.
- If a new section needs attention, give it colour or size, not motion.

## 2. Warm neutrals, colour in blocks

- Page `#F7F5F2`, surface `#F2F0EB`, stone `#DEDBD5`, ink `#292827`. No cool greys.
- Muted text is the ink at 65% opacity, never a separate grey. On dark, white at 80% or 65%.
- One accent: violet `#714CB6` (hover `#533192`), with lilac `#D4C7FF` and lavender `#E8E0FF` as its tints.
- Jewel fills carry the colour: teal `#0C4243`, wine `#421D24`, aubergine `#281647`, violet, stone, lavender.
- Colour separates content. Borders and shadows do not: bento cards have neither.

## 3. Light type at large sizes

- Headings are weight 400 with tracking near -0.0275em. Headings are never bold.
- Sizes are fluid (`clamp`): display up to 68px, H2 up to 49px, quote up to 39px, card title up to 25px. Lead 18px, body 16px, eyebrow 14px.
- Two-tone headlines: the second half is the same size and weight at 65% opacity (`Chapter soft=`, `TwoTone`).
- Emphasis inside a sentence is weight 600 on two to four words, nothing more.
- Figures use tabular numerals; technical figures use the mono face.

## 4. The chapter is the unit of the page

- A chapter is: eyebrow, centred two-tone H2, muted lead, actions, then a bento or grid.
- Actions are a filled button followed by a chevron link, 16px apart. Never two filled buttons side by side.
- Repeat the chapter; vary what follows it. That is what makes a long page easy to scan.

## 5. Bento cards

- Solid fill, radius 12, no border, no shadow, overflow hidden.
- Text sits bottom-left: a 14px eyebrow and a card title.
- Media is one cropped "UI moment" (a chat bubble, an SMS, a tier chip, a masked value) bleeding off an edge. Never a full screenshot.
- Vary the layout per chapter: full width plus two halves, one tall plus two stacked, or uneven pairs (7/5 then 5/7). Not four equal boxes every time.
- Gap is 32px on desktop and 16px on mobile, always.

## 6. Quiet surfaces

- Light cards (`.ll-card`) use the surface fill and a near-invisible elevation: a 1px ring at 4% plus soft haze.
- Hairline grids (`.ll-hairGrid`) lay out facts and languages: equal cells, 1px lines at 20%.
- Glass (`.ll-glass`: 12px blur, violet tint, diagonal sheen) is allowed only over the animated background.

## 7. Windows onto one background

- A single fixed layer (`BackgroundStage`) sits behind the page and cycles three backgrounds on a timer with a cross-fade: Gradient ASCII, Pattern Waves, Lightfall.
- Three sections are transparent "windows" onto it: the hero, Security and the closing band. Every other section is opaque.
- Windows carry a dark scrim so white text stays readable whatever the background is doing.
- The backgrounds are themed to the palette (night violet `#150C2B`, lilac, violet, one warm accent) and kept low-contrast. They are decoration, never content.
- Fallback is a static gradient in the same palette. It shows before the effect loads, when WebGL is missing, and always under reduced motion.

## 8. Motion is small and purposeful

- Durations 100, 200, 300, 400ms. One curve: `cubic-bezier(0.16, 1, 0.3, 1)`.
- Entrance animation exists only in the hero: text slides down and fades, the composition slides up, glass fragments follow 100ms apart.
- Hover feedback: arrows nudge 4px, underlines appear, outline rings go from 1px to 2px, fills darken. Cards never lift, scale or glow.
- Signature pieces: the gooey pill in the header nav, the curved language loop, the hero button's rotating chip. One of each; do not repeat them elsewhere.
- Every animation is switched off under `prefers-reduced-motion`, and the content is fully visible without it.

## 9. The page darkens toward the end

Order of grounds: dark hero, light, lavender band, light, dark Security window, light, dark closing band, wine footer. The footer ends with a huge, faint wordmark running edge to edge.

## 10. Layout and spacing

- Container 1376px, gutters 32px (16px on mobile). Intro text is capped near 900px.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96. Section padding is fluid up to 96px.
- Rhythm alternates: airy intros and bands, then dense bentos.
- Breakpoints in use: 640, 800, 1080.

## 11. Header and navigation

- Sticky, opaque, 64px, one hairline under it. The announcement strip below it scrolls away.
- Desktop (1080px and up): the gooey nav follows the section in view; nothing is active over the hero.
- Below 1080px: a menu button opens a native dialog that slides in from the right, with the sign-in actions pinned at the bottom. Esc and the backdrop close it; focus returns to the button.

## 12. Mobile

- Everything stacks to one column. Bento text sits above its media.
- The hero keeps only the orb and one glass card.
- Tab bars scroll sideways; the page itself never does.
- Touch targets are at least 44px.

## 13. Content rules

- Only real facts and measured numbers. No invented testimonials, customers, logos or statistics.
- The quote-style band is a product statement, so it has no name and no avatar.
- All data is synthetic and the page says so. Sahyadri Finance Bank is fictional.
- Sensitive values are always masked (for example `••••7310`).
- Plain words, short sentences, no hype.

## 14. Accessibility

- One `h1`; headings in order; lists and tabs use their proper roles.
- Visible focus rings on every interactive element; a skip link at the top.
- Decoration (background, loop, footer wordmark, glows) is `aria-hidden`.
- Colour is never the only signal.
- Text over the animated background must pass AA against the scrim alone.

## 15. Building on this

- Reuse `Section`, `Chapter`, `Bento`, `Cell` and the `ll-` classes before writing new ones.
- New colours and sizes go in as tokens in `landing.css`, not as one-off values.
- Plain prefixed CSS only (CSS modules do not work in this app).
- The three React Bits effects and two components live in `web/components/reactbits/` as published; theme them through props.
