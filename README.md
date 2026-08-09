# Jig

Jig is the focused home for parametric woodworking models. It combines live
React/Three.js workspaces with fabrication views, structural design screens,
URL-backed parameters, registered STL exports, saved versions, and generated
brochures.

Production: [jig.jlast.io](https://jig.jlast.io)

## Models

The active catalog lives in `public/models/index.json`:

- `dining-table` — Plate Table
- `whisperer` — Whisperer
- `hover-dining-table` — X-Hover Dining Table
- `wave-dining-table` — The Wave
- `concentric-tube-jig` — Concentric Tube Jig

Each model owns its public configuration and registered STL under
`public/models/<model-id>/`. Table geometry, fabrication layouts, audits, and
exports share the same parametric source so the surfaces stay synchronized.

## Development

```bash
npm install
npm run dev
```

## Verification

```bash
npm run audit
npm run build
npx playwright test --workers=1
```

The woodworking catalog is synchronized through `3d-prints` commit
`0d438c7e4544bcf3f5273edebcd6553a7c85221b`. Dormant non-woodworking engine
code remains temporarily to keep this first extraction low-risk; it is not in
the Jig catalog or audit surface.

`docs/specifications.md` defines the inherited product contract and
`docs/test-plan.md` defines the release gates.
