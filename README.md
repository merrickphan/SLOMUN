# SLOMUN Website

Website for **SLOMUN**, the Second Session of San Luis Obispo Model United Nations, hosted at San Luis Obispo High School.

## Design

Figma: https://www.figma.com/design/7AEod4fvR9lOplTIN8cver

- **Desktop** page: Home, About (What is SLOMUN?), Committees, Register, Logistics, Position Paper, Delegate Resources, FAQ, Contact Us, plus the SLOMUN dropdown open state
- **Foundations** page: tokens, type, component library
- **Archive (club pages)**: earlier club-focused pages, not part of the conference site

Style: white and SLO High yellow, Cormorant Garamond headlines, EB Garamond body copy, Oswald caps for nav and buttons. Photo hero on Home, inset photo banners on inner pages.

Nav: About, SLOMUN (dropdown: Committees, Register, Logistics, Position Paper, Delegate Resources, FAQ, Contact Us), Committees, Register.

## Committees

| Committee | Type | Topic |
| --- | --- | --- |
| SOCHUM | General Assembly | Modern Slavery and Human Trafficking |
| CRISPR & Genetic Engineering Ethics | Crisis | |
| Early WWII (Europe) | Crisis | |
| Modern AGI Emergency Summit | Crisis | |

## Placeholders to fill

Conference date, Secretariat names and photos, Secretary-General letter, USG names, fees, schedule, position paper guidelines, background guides, contact email. All photos are placeholders.

Images in `public/images/`: `hero-slohs.png` (600x400, replace with 2400px+), `crest.png` (SLOHS tiger crest, background removed).

## Intro animation

Figma frames `Intro / 1 Load` through `Intro / 5 Home` (prototype flow "Site intro").

1. White loading screen. The crest fades in and scales up, "SLOMUN" and "The Second Session" rise in, and a yellow loading bar fills (1.0s, ease-out).
2. The loading screen slides up off the top with a yellow bottom edge, revealing the Home hero photo (0.8s, ease-in-out).
3. The nav drops in and the eyebrow and title rise in (0.6s, ease-out).
4. The date, Register button, and tagline rise in (0.6s, ease-out).

Show once per visit and skip it for users with `prefers-reduced-motion`.

## Development

```bash
npm install
npm run dev
```

Built with Next.js (App Router). Deploys on Vercel with no extra config.
