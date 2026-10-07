# Pinion fork of Twenty

This branch (`pinion/2.45`) is Twenty plus a small, explicit set of changes. It exists because Twenty has no
supported extension point for the shell and board behaviour Pinion needs. Everything that **can** be done through
Twenty's supported mechanisms (the apps SDK: objects, fields, views, page layouts, front components, roles) lives in
the `pinion-layout` and `lead-engine` apps instead and is **not** a divergence.

## Base

| | |
|---|---|
| Upstream | `https://github.com/twentyhq/twenty` (`upstream` remote) |
| Upstream release | `twenty/v2.45.6` (Twenty 2.45.6) |
| Pinned commit | `6007ad5a7f6cb676fd8a9ff0c2a86a2e3d4c260e` (the release tag) |
| Why a release tag | Twenty publishes releases as tags (`twenty/vX.Y.Z`). An image built from a released tag runs only migrations that production Twenty already runs, so it can go on the shared staging and prod databases. `main` is the next, unreleased version and must never be deployed. |

There is one branch per upstream release line: `pinion/2.45` now, `pinion/2.46` when 2.46.0 is released. `pinion/main`
is the older fork built on an unreleased snapshot; it is kept for reference and is never built into a deployable image.

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

*Upstream files touched* (3 files):
- `object-record/record-drag/hooks/useProcessBoardCardDrop.ts`: the updates `processGroupDrop` produces are collected,
  then applied by `applyDrop`, so the move can be held back for the prompt
- `object-record/record-drag/hooks/useUpdateDroppedRecordOnBoard.ts`: optional `extraInput` written in the same update
- `object-record/record-board/components/RecordBoardContainer.tsx`: mounts `<StageGateDialog />`

*Known limit:* only a **board drop** is gated. Changing the stage from a table cell, the deal page or a bulk edit is
not (Twenty has no single write path to intercept). The backstop is the "Lost without a reason" view in the
`pinion-layout` app. Gating `usePersistField` is the next step if that view is not empty in practice.

*Tests:* `stage-gate/**/__tests__/` (matching logic, the hook, the dialog's behaviour).

### 2. Shell: the module rail

*Why:* the sales team comes from a CRM with a short row of labelled modules on the left, and Twenty's sidebar is
overwhelming to them. The collapsed drawer becomes that rail: an icon over a short label, a larger centred workspace
avatar on top, and none of the Home / AI / Settings buttons.

*New code* (isolated): `packages/twenty-front/src/modules/pinion/shell/constants/PinionRail.ts` (rail width, item width and height)

*Upstream files touched* (small, named edits):
- `ui/layout/resizable-panel/constants/NavigationDrawerCollapsedWidth.ts`: the collapsed width is the rail's
- `ui/navigation/navigation-drawer/components/NavigationDrawerItem.tsx`: collapsed, the icon sits over the label
- `ui/navigation/navigation-drawer/components/NavigationDrawerHeader.tsx` and
  `MultiWorkspaceDropdown/internal/MultiWorkspaceDropdownClickableComponent.tsx`, `MultiWorkspacesDropdownStyles.tsx`:
  the avatar is larger and centred on the rail
- `navigation/components/MainNavigationDrawerModeSwitcher.tsx`: no mode buttons on Home. Settings is reached from the
  profile menu (stock has that item), and while inside Settings or an AI page one button leads back to Home.
- `ui/navigation/states/isNavigationDrawerExpanded.ts`: a browser starts on the rail; expanding it is remembered

*Tests:* `navigation/components/__tests__/MainNavigationDrawerModeSwitcher.test.tsx` was rewritten for this behaviour.

## Shipping an image

Images are built by `.github/workflows/pinion-image.yaml` on a GitHub runner, never on the production host (a monorepo
build needs several GB of RAM and that host runs the live CRM). The workflow first verifies the fork's changes
(typecheck, tests, lint and format of `modules/pinion`), then builds the Dockerfile's `twenty` target and publishes:

    ghcr.io/<owner>/twenty-pinion:<twenty-version>-pinion.<short-sha>      e.g. 2.45.6-pinion.1a2b3c4

The version is the **Upstream release** row above, not the version constant in the source: patch releases do not bump
the constant (it still says 2.45.0 at the 2.45.6 tag), and the image's app version drives the instance's upgrade logic.

There is no moving tag. A deploy names one exact build, and the image carries the upstream base commit as a label
(`io.pinion.upstream-base`).

**Deploy only a released Twenty version.** A branch based on a release tag (this one) is deployable. An image built from
upstream `main` runs that version's unreleased database migrations, and migrations cannot be run backwards, so it is
for local and throwaway use only. Layer the overlay patches (`deploy/branding`) on the image, then test on staging
before prod.

*One-time setup:* a new GHCR package starts private. Make it public in the package settings (the fork is public and the
image contains only Twenty and the changes above, no secrets), or give the deploy host a `read:packages` token.

## Moving to a new upstream release

1. `git fetch upstream --tags`, pick the release tag (`twenty/vX.Y.Z`).
2. `git checkout -b pinion/X.Y <tag>`, then cherry-pick the fork's commits from the previous branch. Conflicts can
   only be in the upstream files listed above.
3. Re-read each touched upstream file against the new release: has the board drop handler or the drawer's shape
   changed? (Between 2.45.6 and `main` the drop handler was refactored, so the stage gate needed rewiring.)
4. `yarn install`, `npx nx build twenty-shared`, `npx nx typecheck twenty-front`, run the `pinion` and
   `MainNavigationDrawerModeSwitcher` tests, lint.
5. Update the Base table above, build the image, test on staging, then prod.
