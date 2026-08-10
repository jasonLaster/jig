# Test Plan

This test plan describes what must be covered before a change is pushed or deployed.

## Test Layers

| Layer | Command | Purpose |
| --- | --- | --- |
| Model audit scripts | `npm run audit` | Validate catalog discovery, model JSON, STL presence, source dimensions, parameter limits, and model-specific invariants. |
| TypeScript and production build | `npm run build` | Validate type safety and Vite production bundling. |
| Browser E2E | `npm run test:e2e` | Validate workspace, sidebar model/version navigation, viewer controls, URL state, export, responsive layout, and static contracts. |
| Full local gate | `npm run verify` | Run model audits, build, and all local Playwright tests. |
| Live Convex persistence | `VITE_CONVEX_URL=<url> npx playwright test tests/e2e/app.spec.ts -g "saves and forks"` | Validate Save/Fork writes against a real Convex deployment. |
| Production smoke | Playwright or browser against the Vercel alias | Validate the deployed default workspace, model switching, viewer render, and actions menu. |

## Functional Coverage Matrix

| Area | Required Coverage |
| --- | --- |
| Workspace Shell | Root route opens the default model workspace, lists all catalog models in the sidebar, and does not expose arbitrary upload. |
| Workspace Header | One-column actions menu for Save, Fork, theme, Export, and Convex-disabled setup note. |
| Model Sidebar | Catalog model switching, collapsible/resizable behavior, and saved versions scoped to the selected model. |
| Workspace Inspector | Collapsible/resizable behavior, logically grouped X-Hover Overall/Tabletop/End boxes/Support layout/Top support members/Bottom support members/Support joinery/Routing templates controls, semantic top/bottom support selectors, weighted-center controls only for paper towel holder, X-Hover Assembled/Exploded/Cut List/Templates modes, rendering modes, original overlay, and audit rows. |
| URL State | Model selection, unit, theme, millimeter params, legacy X-Hover split-brace/shared-radius migration, unknown model errors, root param cleanup, and saved-version rehydration. |
| Units | Millimeters, centimeters, inches, fractional inches, global unit switching, and stable URL millimeter values. |
| Parameter Limits | Static limits plus dependent holder tube/diameter limits, tray floor/height limits, and Hover-table widened overhang/spread/support ranges, independent top/bottom box radii, six support-layout combinations, radius-aware placement, round-overs, conditional half-laps, and direct-contact relationships. |
| Structural Screening | X-Hover and Plate Table overall and six component grades stay finite and bounded. Height, post/end-box dimensions, plate geometry, support topology, independent Plate foot extensions, and C-channel section/coverage/distribution edits move the appropriate racking, joint, torsion, tipping, rocking, and member/tabletop-stiffness scores monotonically. The UI exposes formula inputs, ±1 in overall-height sensitivity, and the required physical-test caveat. |
| Viewer | Nonblank canvas after load, parameter or support-layout or C-channel edit, X-Hover 14–16-piece explosion, variant-aware cut sheet, and segmented routing-template preview, render mode, original overlay, zoom, cube orientation, reset, center view, and sidebar collapse. Assembly switching and live exploded/cut-list/template edits preserve camera state. |
| Export | Download starts, file name includes model prefix and parameter keys, generated STL is non-empty, furniture-model exports retain finite nondegenerate triangles plus their scaled envelope, and each full-size routing-template STL fits the selected square plate with the requested thickness and keyed seam. |
| Persistence | Convex schema/functions, Save, Fork, parent version link, selected-model saved-version list, saved-version open, and no arbitrary STL upload mutation. |
| Brochures | Four CAD references are submitted once, durable jobs receive `202 Accepted`, leaving or closing the preview does not cancel backend generation, and completed four-image sets reappear from Convex history. |
| Accessibility | Accessible labels for controls, native `select` regressions rejected, keyboard sidebar rails, mobile layout. |
| Specifications | Product specs and audit docs stay in sync with executable coverage. |

## Release Gate

Before pushing or deploying:

```bash
npm run verify
```

When persistence behavior changes, also run the live Convex slice:

```bash
VITE_CONVEX_URL=https://pleasant-chameleon-464.convex.cloud \
  npx playwright test tests/e2e/app.spec.ts -g "saves and forks"
```

After deployment, verify production:

- `/` renders the default model workspace.
- A catalog model opens from the sidebar.
- The 3D viewer renders a nonblank canvas.
- Actions menu commands are present and dismiss on click-away.
- Save/Fork appear when production Convex env vars are active.
