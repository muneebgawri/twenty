# Pinion fork of Twenty

This branch (`pinion/main`) is Twenty plus a small, explicit set of changes. It exists because Twenty has no
supported extension point for the shell and board behaviour Pinion needs. Everything that **can** be done through
Twenty's supported mechanisms (the apps SDK: objects, fields, views, page layouts, front components, roles) lives in
the `pinion-layout` and `lead-engine` apps instead and is **not** a divergence.

## Base

| | |
|---|---|
| Upstream | `https://github.com/twentyhq/twenty` (`upstream` remote) |
| Pinned commit | `c1135611665aaad8de1a9a756e6784a4164191b5` (2026-10-06, `twenty-sdk` 2.46.0) |
| Why this commit | zero failed check runs (70 passed, 30 skipped) on upstream CI; upstream publishes no git tags for its image releases, so the base is pinned by SHA |

## The rule for this branch

1. **Supported mechanism first.** If the apps SDK or workspace settings can do it, it goes in an app, not here.
2. **One directory per feature, under `packages/twenty-front/src/modules/pinion/`.** New files there never conflict
   with upstream.
3. **Touch upstream files as little as possible**, and list every touched line below. Each edit is a small, named hook
   point, not a rewrite.
4. **No feature flag unless the server needs to know.** Prefer behaviour driven by metadata (a field exists or it
   does not), so a workspace without the feature behaves like stock Twenty.
5. **Typed, unit-tested, with the behaviour covered.** No DOM patching, no hashed class names, no reaching into
   rendered markup.

## Divergences

### 1. Stage gate: ask for a reason before a deal enters Closed Lost

*Why:* the sales pipeline requires a Lost reason on every lost deal, and Twenty has no "required when stage = X" rule.
Dropping a card on the Closed Lost column opens a prompt for the reason. Cancelling leaves the card where it was.

*New code* (isolated): `packages/twenty-front/src/modules/pinion/stage-gate/`
- `constants/StageGates.ts`: the one gate (opportunity.stage = `CLOSED_LOST` requires `lostReason`)
- `utils/findApplicableStageGate.ts`: pure matching; returns null unless the object really has the required SELECT field
- `hooks/useRequestStageGate.ts`, `states/pendingStageGateState.ts`, `components/StageGateDialog.tsx`

*Upstream files touched* (3 files, +49 / −20 lines):
- `object-record/record-drag/hooks/useProcessBoardCardDrop.ts`: positions are computed at drop time and the move is
  wrapped in `applyDrop`, so it can be held back for the prompt
- `object-record/record-drag/hooks/useUpdateDroppedRecordOnBoard.ts`: optional `extraInput` written in the same update
- `object-record/record-board/components/RecordBoardContainer.tsx`: mounts `<StageGateDialog />`

*Known limit:* only a **board drop** is gated. Changing the stage from a table cell, the deal page or a bulk edit is
not (Twenty has no single write path to intercept). The backstop is the "Lost without a reason" view in the
`pinion-layout` app. Gating `usePersistField` is the next step if that view is not empty in practice.

*Tests:* `stage-gate/**/__tests__/` (matching logic, the hook, the dialog's behaviour).

## Upgrading to a new upstream commit

1. `git fetch upstream` and pick a commit with a clean upstream CI (zero failed check runs).
2. `git rebase <new-sha>` onto `pinion/main`. Conflicts can only be in the upstream files listed above.
3. Re-read the three touched files against upstream's version of each: has the drop handler's shape changed?
4. `yarn install`, `npx nx build twenty-shared`, `npx nx typecheck twenty-front`, run `stage-gate` tests, lint.
5. Update the pinned commit in the table above.
6. Build the image, test on staging, then prod.

## Not tracked here

The overlay patches applied to the built image (row-level security, the email gate, the Google OAuth client) live in
`deploy/branding/` and are separate from this source divergence.
