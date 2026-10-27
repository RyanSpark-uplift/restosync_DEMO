# apps/tv/assets/fonts/

Google Fonts ttf bundle for the 12-theme M02 pickup display.

`src/utils/themeFonts.ts` registers each ttf below with a deterministic
`fontFamily` name (e.g. `Inter-ExtraBold`). Themes resolve to those names at
render time. If a ttf is missing at bundle time, `useThemeFonts()` logs a
console warning and the affected theme falls back to the platform system
font — per the design handoff, do NOT substitute silently into another
Google font.

## Required ttf files

Download from <https://fonts.google.com>. Each `family-weight` row maps to
exactly one ttf with the exact filename listed (case-sensitive). All ttf
files are SIL OFL 1.1 — free for commercial use.

| File | Family | Weight | Used by theme(s) |
|------|--------|--------|------------------|
| `Inter-Regular.ttf`            | Inter             | 400 | body text (most themes) |
| `Inter-Medium.ttf`             | Inter             | 500 | body text |
| `Inter-SemiBold.ttf`           | Inter             | 600 | body text |
| `Inter-Bold.ttf`               | Inter             | 700 | body text |
| `Inter-ExtraBold.ttf`          | Inter             | 800 | bistro display + numbers |
| `Manrope-Medium.ttf`           | Manrope           | 500 | sage body |
| `Manrope-SemiBold.ttf`         | Manrope           | 600 | sage body |
| `Manrope-Bold.ttf`             | Manrope           | 700 | sage display + numbers |
| `DMSerifDisplay-Regular.ttf`   | DM Serif Display  | 400 | cafe display |
| `PlayfairDisplay-Bold.ttf`     | Playfair Display  | 700 | steakhouse display |
| `CormorantGaramond-Medium.ttf` | Cormorant Garamond| 500 | sushi display |
| `BebasNeue-Regular.ttf`        | Bebas Neue        | 400 | burger display |
| `SpaceGrotesk-SemiBold.ttf`    | Space Grotesk     | 600 | neon head |
| `SpaceGrotesk-Bold.ttf`        | Space Grotesk     | 700 | neon numbers |
| `Fraunces-SemiBold.ttf`        | Fraunces          | 600 | riviera display |
| `Quicksand-Medium.ttf`         | Quicksand         | 500 | boba body |
| `Quicksand-SemiBold.ttf`       | Quicksand         | 600 | boba head |
| `Quicksand-Bold.ttf`           | Quicksand         | 700 | boba numbers |
| `Lora-SemiBold.ttf`            | Lora              | 600 | lodge head |
| `Lora-Bold.ttf`                | Lora              | 700 | lodge numbers |
| `Cinzel-SemiBold.ttf`          | Cinzel            | 600 | speakeasy head |
| `Cinzel-Bold.ttf`              | Cinzel            | 700 | speakeasy numbers |
| `FamiljenGrotesk-Bold.ttf`     | Familjen Grotesk  | 700 | diner display + numbers |

Total: 23 ttf files. Approx bundle size ≈ 3–5 MB compressed.

## How to add

1. `npx degit google/fonts/ofl/<family>` or download manually.
2. Rename to match the **File** column exactly.
3. Drop into this directory.
4. Re-run `pnpm --filter @restosync/tv start --reset-cache` so Metro picks up new assets.

Source of truth for the family/weight mapping: `packages/shared/src/themes.ts`
(weightHead / weightNumber per theme) + design handoff
`DevGuide/Theme/extracted/design_handoff_order_pickup/README.md`.
