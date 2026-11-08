# Deploys reported from Cloudflare's own build (builds_previews_deploys: all-cloudflare)

**Go:** pending

## Intent

The owner keeps Cloudflare's GitHub app building every PR's preview and deploying `main`, in the
one Cloudflare account the site already uses ("I'm liking the previews. And I want to keep them in
the same account"). The merged PR's deploy comment should follow that real deploy: merged →
deploying → live or failed. Today it says "this project has no deploy step yet; production is
unchanged", which is false, because the app deploys every merge. Previews must never reach
production data. This repo is where the setup is built and proven ("first we should set it up here
and make sure that it works"). Once it has worked on real merges, the owner takes it to the devshop
as a preset. The preset's working name is `builds_previews_deploys: all-cloudflare`, with
`github-and-cloudflare` as the devshop's existing two-account setup. No page changes.

## Decisions

- One Cloudflare account. The Cloudflare app builds previews and deploys production, and no Cloudflare token goes into GitHub: the owner relies on the app's native previews, has a limited number of accounts, and doesn't want to pay for two; rejected: the devshop's two-account, GitHub-deploys setup for this repo (owner, 2026-11-08).
- The deploy is gated at merge time: `main` requires `fast` and `slow` on the PR, and "Require branches to be up to date before merging" is on, so `main` only ever becomes code that just passed. The Cloudflare app can't wait for GitHub's checks: no setting for it was found, and Cloudflare's own docs couldn't be read from the session. The owner confirmed both settings on `main`; the session can read the required checks but not the up-to-date flag (owner, 2026-11-08).
- `scripts/deploy.sh` deploys nothing. It waits until the live site serves this commit's files, byte for byte, then writes the outputs the deploy comment reads. Comparing the files proves what is live without any Cloudflare credential. On 2026-11-08 all 84 site files on https://games.meirmsn.dev matched `main` at `bddcbe9`. Rejected: reading the app's "Workers Builds" check run, which needs a `checks: read` permission the template's deploy job doesn't grant and still doesn't prove what is served (session proposal).
- `version` is the commit's short SHA and `previous_version` is the commit `main` was at before the push. Cloudflare's own version ids need an API token, which this setup has none of. The rollback line names the Cloudflare dashboard (Workers & Pages → games → Deployments) or a revert PR (session proposal).
- `deployed=yes` is written before the check starts, because the app deploys every merge whatever this job does. A failure therefore says "the new version may be live" (session proposal).
- Previews get their own data bindings: wrangler's `previews` block holds preview-only D1, R2, KV and other bindings, and previews don't inherit production's (checked in `wrangler@4.158.0`'s config schema, `PreviewsConfig`). The site has no bindings today. A fast-tier check keeps any future preview binding from naming a production resource; rejected: relying on review alone (owner, 2026-11-08).
- The comment's wording when checks fail or are cancelled on `main` ("production is unchanged") is the devshop's `scripts/deploy-comment.mjs`, which this repo keeps unchanged. It is fixed in the devshop with the preset, not here (owner, 2026-11-08).
- After the merge: this PR's own deploy comment reaches "Live in production" and says the domain serves this build. The session checks this and reports it to the owner.

## Acceptance items

- **AC-1** `scripts/deploy.sh` exits 0 when every site file (tracked, not excluded by `.assetsignore`) served under `SITE_URL` is byte-identical to the commit's copy on two checks in a row. It writes `url`, `site_url`, `version`, `previous_version`, `rollback`, `deployed=yes` and `site_smoke=passed` to `$GITHUB_OUTPUT`.
- **AC-2** When the site first serves older files and then this commit's files, `scripts/deploy.sh` keeps checking at its interval and passes once they match.
- **AC-3** When the files never match within its tries, `scripts/deploy.sh` exits 1 with `deployed=yes`, `site_smoke=failed` and the rollback line written, and names the first file that differs.
- **AC-4** Files excluded by `.assetsignore` are never fetched. `index.html` is fetched at its directory's path (`/`, `/googly-faces/`).
- **AC-5** `scripts/deploy.sh` exits 2 (can't run), without fetching anything, when `SITE_URL` isn't an https origin or `BUILD_SHA` isn't the checked-out commit.
- **AC-6** `scripts/preview-bindings-check.mjs` fails when a binding in `wrangler.jsonc`'s `previews` block names a resource (an id, bucket, database or namespace) that a top-level binding also names. It passes when they differ or when there are none, and passes on this repo's `wrangler.jsonc`. `scripts/check-fast.sh` runs it.
- **AC-7** CI's `deploy` job runs `scripts/deploy.sh` with `SITE_URL=https://games.meirmsn.dev` and `PREVIOUS_SHA` set to the commit `main` was at before the push. The workflow still passes the devshop's `ci-tiers-check.py`.

## Out of scope

- Any change to the Cloudflare app's settings, the site's pages, or `wrangler.jsonc`'s current behaviour.
- A Cloudflare API token, Cloudflare's own version ids, or a rollback run from CI (rollback stays the owner's).
- The devshop preset itself and the comment's wording for failed checks on `main`: both go to the devshop after this has worked on real merges.
- The post-deploy canary and the pre-merge health check (the devshop's Cloudflare guide: not built yet).
- Native previews in a separate Cloudflare account (a possible later preset).
