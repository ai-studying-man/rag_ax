# DAPA RAG Service Design System

## 1. Product Context

This project is a public-sector RAG question answering service for a DAPA training assignment. The interface should feel like a restrained government operations console: clear, credible, Korean-readable, and built for repeated document search rather than marketing.

## 2. Design Principles

- Work surface first: the query input, answer, and evidence list are the primary screen.
- Public-sector trust: use quiet navy, green, slate, white, and one amber accent.
- Dense but readable: show retrieval state and source evidence without decorative clutter.
- Security-aware: API keys are entered by the user and never displayed as content or committed.
- Korean precision: labels must be short, line wrapping must preserve readable Korean phrases.

## 3. Tokens

Colors:
- `bg`: `#f6f8fb`
- `surface`: `#ffffff`
- `surface-muted`: `#eef3f7`
- `ink`: `#14202b`
- `muted`: `#667789`
- `line`: `#d7e0ea`
- `navy`: `#17324d`
- `green`: `#226a5b`
- `green-soft`: `#e2f1ed`
- `amber`: `#b88422`
- `danger`: `#b94035`
- `focus`: `#2a6fbb`

Typography:
- Primary font: system UI, `Malgun Gothic`, Apple SD Gothic Neo, sans-serif.
- Page title: 28px to 34px.
- Section heading: 18px to 22px.
- Body: 15px to 16px.
- Metadata: 12px to 13px.

Spacing:
- Base unit: 4px.
- Compact gap: 8px.
- Panel padding: 16px.
- Page gutter: 24px desktop, 16px mobile.
- Radius: 8px for repeated result cards and controls.

Depth:
- Use borders and tonal separation.
- Avoid large shadows.
- Interactive focus uses a 2px outline in `focus`.

## 4. Components

Query workspace:
- Two-column desktop layout: left controls, right answer and evidence.
- Single-column mobile layout with answer first after submission.
- Main action button uses `green`.

Credential panel:
- Compact inputs for Cohere and OpenRouter keys.
- Uses password fields.
- Explains that keys stay in the browser session.

Evidence result:
- Repeated card with section title, source URL, score, and content excerpt.
- Active top evidence uses a green left border.

Answer panel:
- Plain text answer with cited evidence.
- Empty, loading, and error states are visibly distinct.

## 5. Interaction States

- Loading: disable submit and show progress text.
- Empty: guide the user to ask a sample question.
- Error: show concise Korean error copy and the failed stage.
- Focus: every input and button has visible outline.

## 6. Responsive Rules

- Desktop: controls and results are side by side.
- Tablet: columns remain but controls compress.
- Mobile: one column, no horizontal scroll, buttons span full width.

## 7. Asset Guidance

- No decorative images are required for this operational tool.
- No logos are copied.
- Source URLs are shown as text links for verification.
