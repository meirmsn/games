# Deploys reported from Cloudflare's own build (builds_previews_deploys: all-cloudflare)

**Go:** "go" (owner, 2026-11-08)

## Intent

The owner keeps Cloudflare's GitHub app building every PR's preview and deploying `main`, in the
one Cloudflare account the site already uses ("I'm liking the previews. And I want to keep them in
the same account"). The merged PR's deploy comment should follow that real deploy: merged →
deploying → live or failed. Today it says "this project has no deploy step yet; production is
unchanged", which is false, because the app deploys every merge. Previews must never reach
production data ("we should not be hooking them up to production data. We should hooking them up
to separate bindings"). This repo is where the setup is built and proven ("first we should set it
up here and make sure that it works"). Once it has worked on real merges, the owner takes it to the
devshop as a preset. The owner named the preset `builds_previews_deploys`, with the values "all
Cloudflare" (`all-cloudflare`, this repo) and "GitHub and Cloudflare" (`github-and-cloudflare`, the
devshop's existing two-account setup). No page changes.

## Decisions

- One Cloudflare account. The Cloudflare app builds previews and deploys production, and no Cloudflare token goes into GitHub: the owner relies on the app's native previews, has a limited number of accounts, and doesn't want to pay for two; rejected: the devshop's two-account, GitHub-deploys setup for this repo (owner, 2026-11-08).
- The deploy is gated at merge time. `main` requires `fast` and `slow` on the PR, and "Require branches to be up to date before merging" is on, so a merged PR makes `main` exactly the code that just passed. The Cloudflare app can't wait for GitHub's checks: no setting for it was found, and Cloudflare's own docs couldn't be read from the session. Anything that reaches `main` some other way (an admin bypass) is deployed untested. The owner confirmed both settings; the session can read the required checks but not the up-to-date flag (owner, 2026-11-08).
- `scripts/deploy.sh` deploys nothing. It waits until the live site serves this commit's files, byte for byte, then writes the outputs the deploy comment reads. Comparing the files proves what is live without any Cloudflare credential. On 2026-11-08 all 84 site files on https://games.meirmsn.dev matched `main` at `bddcbe9`. Rejected: reading the app's "Workers Builds" check run, which needs a `checks: read` permission the template's deploy job doesn't grant and still doesn't prove what is served (session proposal).
- How it fetches. `curl` follows redirects (`/index.html` answers 307 to `/`), sends `Cache-Control: no-cache` and no `Accept-Encoding`, and compares sha256 hashes. It waits 20 s between tries, 27 tries (9 minutes), inside the job's 15-minute limit; both numbers can be set in env for tests. The site file list is `git ls-files` minus `git ls-files -ci --exclude-from=.assetsignore` (gitignore rules, as wrangler reads it) (session proposal).
- `version` is the commit's short SHA and `previous_version` is the commit `main` was at before the push. When there is no usable previous commit (all zeros on a first push, or one that no longer exists after a force-push), `previous_version` is `unknown` and the deleted-files check is skipped with a line saying so. Cloudflare's own version ids need an API token, which this setup has none of. The rollback line names the Cloudflare dashboard (Workers & Pages → games → Deployments) or a revert PR (session proposal).
- A newer merge that goes live first counts as a pass. If `origin/main` has moved past this commit and the live files match the newer tip, which includes this commit, the deploy passes and says which commit is live. Otherwise a fast pair of merges would fail the older one (session proposal, from the spec review).
- `deployed=yes` is written only once the live site has stopped serving the previous commit. If every file still matches the previous commit when the tries run out, `deployed` is left out, so the comment says "production is unchanged", which is then true (session proposal, from the spec review).
- The setting is recorded as the line `builds_previews_deploys: all-cloudflare` in `CLAUDE.md`. `scripts/deploy.sh` reads it and refuses to run without it, so the devshop can later read the same line (session proposal).
- Previews get their own data bindings. Wrangler's `previews` block holds preview-only D1, R2, KV and service bindings (checked in `wrangler@4.158.0`'s config schema, `PreviewsConfig`). Inheritance hasn't been tested, so the check doesn't rely on it: every top-level data binding must have a preview counterpart that names a different resource. The site has no bindings today; rejected: relying on review alone (owner, 2026-11-08).
- The comment's wording when checks fail or are cancelled on `main` ("production is unchanged") is the devshop's `scripts/deploy-comment.mjs`, which this repo keeps unchanged. It is fixed in the devshop with the preset, not here (owner, 2026-11-08).
- Proven on this PR and after its merge, checked by the session and reported to the owner: this PR's Cloudflare preview still builds; after the merge, its deploy comment goes merged → deploying → "Live in production" and says the domain serves this build.

## Acceptance items

- **AC-1** `scripts/deploy.sh` exits 0 when every site file served under `SITE_URL` is byte-identical to the commit's copy, and every file the commit deleted answers 404, on two checks in a row. It writes `url`, `site_url`, `version`, `previous_version`, `rollback`, `deployed=yes` and `site_smoke=passed` to `$GITHUB_OUTPUT`.
- **AC-2** When the site first serves the previous commit's files and then this commit's, `scripts/deploy.sh` keeps checking at its interval and passes once they match.
- **AC-3** When the live files change away from the previous commit but never match this commit within the tries, `scripts/deploy.sh` exits 1 with `deployed=yes`, `site_smoke=failed` and the rollback line written, and names the first file that differs. When they still match the previous commit throughout, it exits 1 without writing `deployed`.
- **AC-4** When `origin/main` is past this commit and the live files match its tip, `scripts/deploy.sh` exits 0 and names the live commit.
- **AC-5** Files excluded by `.assetsignore` (including a nested match of a bare name such as `ui`) are never fetched. `index.html` is fetched at its directory's path (`/`, `/googly-faces/`).
- **AC-6** With an all-zeros `PREVIOUS_SHA`, `scripts/deploy.sh` writes `previous_version=unknown` and skips the deleted-files check with a line saying so.
- **AC-7** `scripts/deploy.sh` exits 2 (can't run), without fetching anything, when `SITE_URL` isn't an https origin, when `BUILD_SHA` isn't the checked-out commit, or when `CLAUDE.md` has no `builds_previews_deploys: all-cloudflare` line.
- **AC-8** `scripts/preview-bindings-check.mjs` reads `wrangler.jsonc` with its comments. It fails when a top-level data binding (D1, R2, KV, service) has no counterpart in the `previews` block, or when the counterpart names the same resource (id, bucket, database or service). It passes when every binding has a different preview resource, or when there are none. It passes on this repo's `wrangler.jsonc`, and `scripts/check-fast.sh` runs it.
- **AC-9** CI's `deploy` job sets `SITE_URL=https://games.meirmsn.dev` and `PREVIOUS_SHA` (the push's `before` commit) only on its "---" env line, and runs `scripts/deploy.sh`.

## Out of scope

- Any change to the Cloudflare app's settings, the site's pages, or how `wrangler.jsonc` deploys today.
- A Cloudflare API token, Cloudflare's own version ids, or a rollback run from CI (rollback stays the owner's).
- The devshop preset itself and the comment's wording for failed checks on `main`: both go to the devshop after this has worked on real merges.
- The post-deploy canary and the pre-merge health check (the devshop's Cloudflare guide: not built yet).
- Native previews in a separate Cloudflare account (a possible later preset).
- `_headers` and `_redirects` files: the site has none. A change that adds one also adds it to the deploy check's exclusions.
