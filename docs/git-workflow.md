# Git workflow and remotes

## Branches

- `main`: always green against the current app build. Protect it on both hosts.
- Topic branches, one per area of work, merged through a merge/pull request:
  `feature/onboarding-tests`, `feature/auth-tests`, `feature/heatmap-tests`, `feature/navigation-tests`,
  `fix/<what>` for selector or flake fixes.
- Before merging: `npm run check` and the flows you touched (`npm run test:flow -- <file>`), ideally the
  smoke suite. Say in the description which app build you ran against (the run summary records it).

## Publishing to GitLab and GitHub

The repository lives on both hosts and they are kept identical:

- GitLab: https://gitlab.com/faiz03-glicth/MobileAutomation, **the source of truth** (merge requests, CI).
- GitHub: https://github.com/faiz03-glicth/MobileAutomation, a mirror of GitLab.

Same model as the Streak app repo. Merge on GitLab only: merging on both creates diverging `main` branches.

### 1. Local pushes go to both

`origin` fetches from GitLab and pushes to both, so every `git push` updates both hosts:

```bash
git remote add origin git@gitlab.com:faiz03-glicth/MobileAutomation.git
git remote set-url --add --push origin git@gitlab.com:faiz03-glicth/MobileAutomation.git
git remote set-url --add --push origin https://github.com/faiz03-glicth/MobileAutomation.git
git remote add github https://github.com/faiz03-glicth/MobileAutomation.git   # only to fetch/compare
git push -u origin main
```

`git remote -v` shows one fetch URL (GitLab) and two push URLs for `origin`. To check both hosts agree:

```bash
git fetch origin && git fetch github && git rev-parse origin/main github/main
```

### 2. GitLab mirrors to GitHub (for merges made on gitlab.com)

Merging a merge request on GitLab doesn't go through your laptop, so GitLab pushes to GitHub itself:

1. GitHub → Settings → Developer settings → Fine-grained tokens → token for **only** the MobileAutomation
   repository with **Contents: Read and write**.
2. GitLab → the project → Settings → Repository → **Mirroring repositories**:
   URL `https://github.com/faiz03-glicth/MobileAutomation.git`, direction **Push**, authentication
   **Username and Password** (username `faiz03-glicth`, password = the token), and tick
   **Mirror only protected branches** if you want only `main`.
3. **Mirror repository**, then **Update now** to test. GitLab then updates GitHub after every push or merge.

Never force-push on GitHub by hand: the mirror would overwrite it, and GitHub-only commits would be lost.

## What is and isn't committed

Committed: flows, screens, components, config (including the generated `maestro/config/test-data.js`), test
data, test cases, docs, tools, `.env.example`.

Never committed (`.gitignore`): `.env`, anything under `reports/` except its README, `node_modules/`.
`npm run check` also fails if something that looks like a key or token appears in `maestro/` or `test-data/`.
