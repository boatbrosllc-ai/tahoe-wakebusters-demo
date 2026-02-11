# GitHub setup

## Current state (confirm this is the right account)

- **Remote (origin):** `https://github.com/boatbrosllc-ai/Boat-Bros.git`  
  → Repo lives under GitHub user/org **boatbrosllc-ai**, repo name **Boat-Bros**.
- **Git config (commits):** `Michael` / `usalandspecialist@gmail.com` (global).
- **GitHub CLI:** run `gh auth status` to see who is logged in (e.g. **mikemacmadeit**).  
  Pushes go to the remote above; your `gh` user must have push access to **boatbrosllc-ai/Boat-Bros** (member/collaborator or org access).

## Confirm the right account

- **Which repo are we pushing to?**  
  `git remote -v`  
  Right now: **boatbrosllc-ai/Boat-Bros**.
- **Who is GitHub CLI using?**  
  `gh auth status`  
  That account must have push access to the repo above (e.g. be a collaborator or in the **boatbrosllc-ai** org).
- **To point to a different repo (different account/org):**
  ```bash
  git remote set-url origin https://github.com/YOUR_ACCOUNT/YOUR_REPO.git
  git remote -v   # confirm
  ```

## If you need to use a different GitHub account

1. **Switch GitHub CLI account**
   ```bash
   gh auth logout
   gh auth login
   ```
   Follow the prompts and sign in with the correct GitHub account.

2. **Optional: change name/email for commits**
   ```bash
   git config --global user.name "Your Name"
   git config --global user.email "your@email.com"
   ```

## Connect and push

### Option A: Create a new repo on GitHub and push (recommended)

1. Create a new repository on GitHub:
   - Go to https://github.com/new
   - Sign in as the account you want (e.g. **mikemacmadeit**).
   - Name it (e.g. `boat-bros-atx` or `Boat-Bros-Project`).
   - Leave “Initialize with README” **unchecked** (we already have code).
   - Create the repository.

2. Add the remote and push (replace `YOUR_USERNAME` and `REPO_NAME` with your values):
   ```bash
   cd "c:\dev\Boat Bros\Project"
   git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
   git branch -M main
   git push -u origin main
   ```

   **Example** (if repo is `mikemacmadeit/boat-bros-atx`):
   ```bash
   git remote add origin https://github.com/mikemacmadeit/boat-bros-atx.git
   git branch -M main
   git push -u origin main
   ```

### Option B: Use GitHub CLI to create the repo

From the project folder:

```bash
cd "c:\dev\Boat Bros\Project"
gh repo create boat-bros-atx --private --source=. --remote=origin --push
```

(Use `--public` if you want a public repo. Change `boat-bros-atx` to your desired repo name.)

## Verify

- **Who am I on GitHub?**  
  `gh auth status`
- **Which remote?**  
  `git remote -v`
- **Branch?**  
  `git branch`
