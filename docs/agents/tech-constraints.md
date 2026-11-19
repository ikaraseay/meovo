# Tech Constraints

This repo's **non-negotiable invariants** — the rules that silently break the UI when broken.

`AGENTS.md` carries the full rationale (why each rule exists, and the bugs that taught it).
This file is the short list: read it before touching styles, layout, or the admin API.
Each row names the file that owns the value and the test that enforces it.

## The list

| # | Rule | Owner | Enforced by |
| - | ---- | ----- | ----------- |
| 1 | Desktop/mobile breakpoint is **1024px**, paired `min-width` / `not (min-width)`. Never `max-width: 1023px` — that leaves a 1023~1024px gap where neither rule applies but JS already switched. | `frontend/lib/breakpoint.ts` | `test/dom-contract.test.ts` |
| 2 | Cross-module class names / data attributes live in `dom-contract.ts`. Rename the contract first, then both sides. | `frontend/lib/dom-contract.ts` | `test/dom-contract.test.ts` |
| 3 | Glass cards have **no outer shadow** — inset highlight only. `clip-path` can't clip `box-shadow`, and `drop-shadow` loses half its opacity on translucent glass. | `frontend/styles/themes/liquid-glass.css` | `test/squircle.test.ts` |
| 4 | No bare `z-index` in components. Layer order comes from `--ui-z-*` in `tokens.css`. | `frontend/styles/tokens.css` | `test/dom-contract.test.ts` |
| 5 | Component scoped styles must not set `background` / `border-radius` / `box-shadow` — that overrides the theme. | `frontend/styles/themes/liquid-glass.css` | — |
| 6 | Animation uses the shared primitives (`.ui-anim-*`). Pages orchestrate, never author new `@keyframes`. `prefers-reduced-motion` is the only source of truth. | `frontend/styles/motion.css` | — |
| 7 | `color-scheme` follows the **site theme**, not the OS. Light and dark each declare their own. | `frontend/styles/themes/liquid-glass.css` | — |
| 8 | Widget tint passes **hue only** inline. The S/L/A recipe lives in `tokens.css` (light = visible, dark = unified). | `frontend/lib/tint-hue.ts` | `test/tint-hue.test.ts` |
| 9 | Slug pattern has one owner. Backend validation and the frontmatter schema both read it. | `frontend/lib/slug.ts` | `test/admin-documents.test.ts` |
| 10 | All user-visible UI text goes through `t(locale, key)`. No hardcoded strings in components/layouts/pages. | `frontend/i18n/ui.ts` | `pnpm check:i18n` |
| 11 | Login rate-limit counting must be **one atomic statement**. Read-then-write lets concurrent requests each read the same old count and overwrite each other — the counter sticks at 1 and the lock never engages. | `backend/lib/admin/db.ts` | `test/admin-password.test.ts` |
| 12 | Document saves must guard on `updated_at` **inside the UPDATE**. A read-then-write check has a gap: two concurrent saves both pass, the later silently overwrites the earlier and body text is lost. | `backend/lib/admin/db.ts` | — |
| 13 | Verify the password **before** rate-limiting. Otherwise a few wrong guesses lock the owner out of their own blog (correct password then also gets 429). | `frontend/pages/api/admin/login.ts` | — |
| 14 | Every on-demand route needs `export const prerender = false`. A prerendered API silently drops query params and always returns empty. | `frontend/pages/api/**` | `pnpm check:seo` |

## Rules that look like rules but are not

- **Comments are disabled** — the code stays, the UI does not. See `AGENTS.md`.
- **`footer.custom` renders raw HTML** — only the author writes it, so it is not sanitized.
- **Dark mode defaults to the system**, but a stored choice wins. `readModeChoice()` tells you which.

## If you break one

Most of these fail **silently** — wrong colour, invisible transition, lost text, no error.
When the UI looks wrong but the code looks right, check this table first.