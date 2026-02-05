# GitHub setup

## Current state

- **Git** is initialized and the first commit is done.
- **Git config (commits):** `Michael` / `usalandspecialist@gmail.com` (global).
- **GitHub CLI:** logged in as **mikemacmadeit** (used for creating repos and pushing).

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
