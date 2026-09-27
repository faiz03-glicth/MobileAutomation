# Git workflow and remotes

## Branches

- `main`: always green against the current app build. Protect it on both hosts.
- Topic branches, one per area of work, merged through a merge/pull request:
  `feature/onboarding-tests`, `feature/auth-tests`, `feature/heatmap-tests`, `feature/navigation-tests`,
  `fix/<what>` for selector or flake fixes.
- Before merging: `npm run check` and the flows you touched (`npm run test:flow -- <file>`), ideally the
  smoke suite. Say in the description which app build you ran against (the run summary records it).

## Publishing to GitLab and GitHub

Create two empty repositories named `MobileAutomation` (no README or licence, so the first push is clean):
GitLab (e.g. `gitlab.com/faiz03-glicth/MobileAutomation`) and GitHub (`github.com/faiz03-glicth/MobileAutomation`).

**Option A: GitLab is the source of truth, GitHub mirrors it** (same model as the Streak app repo):

```bash
git remote add origin git@gitlab.com:faiz03-glicth/MobileAutomation.git
git remote add github https://github.com/faiz03-glicth/MobileAutomation.git
git push -u origin main
git push github main
```

Merge requests and CI live on GitLab; push `main` (and tags) to `github` after merging, or let GitLab do it
(Settings → Repository → Mirroring repositories → push mirror to GitHub with a GitHub token).

**Option B: push every change to both** with two push URLs on one remote:

```bash
git remote add origin git@gitlab.com:faiz03-glicth/MobileAutomation.git
git remote set-url --add --push origin git@gitlab.com:faiz03-glicth/MobileAutomation.git
git remote set-url --add --push origin https://github.com/faiz03-glicth/MobileAutomation.git
git push -u origin main
```

Pick one host for reviews and merges; merging on both creates diverging `main` branches.

Check with `git remote -v`.

## What is and isn't committed

Committed: flows, screens, components, config (including the generated `maestro/config/test-data.js`), test
data, test cases, docs, tools, `.env.example`.

Never committed (`.gitignore`): `.env`, anything under `reports/` except its README, `node_modules/`.
`npm run check` also fails if something that looks like a key or token appears in `maestro/` or `test-data/`.
