# Production ready gate

Use this so you're not chasing one review tool forever. Define "ready" once, fix to that bar, then run one gate before deploy.

---

## 1. Single definition of "production ready"

The repo is **production ready** when all of this passes:

| Check | Command | If it fails |
|-------|---------|-------------|
| Lint | `npm run lint` | Fix ESLint errors; add rules or disable only with a short comment. |
| Tests | `npm run test:booking` | Fix or add tests until they pass. |
| Build | `npm run build` | Fix TypeScript and build errors. |
| Config (required) | `npm run check-env` | Set missing env in your host; run when NODE_ENV and env are set. CI runs check-env with placeholder values to validate required variable names. |

**Do not** add another tool to this list until the above is stable. Otherwise the bar keeps moving.

---

## 2. One command before every deploy

Run:

```bash
npm run production-ready
```

This runs lint → tests → build in order. If any step fails, fix it. Don’t deploy until it passes.

(Add the script once; see below.)

---

## 3. How to stop "review keeps finding more"

1. **Export everything once**  
   Run your review (Traycer or whatever) and export **all** findings to one list (e.g. `review-findings.md` or a spreadsheet).

2. **Group by type**  
   e.g. Security, Performance, Code style, Dependencies, Accessibility.

3. **Decide what counts for "production ready"**  
   For each group, decide:  
   - Must fix before launch  
   - Fix soon after launch  
   - Ignore or backlog  

   Put the "must fix" items into the list you’ll work through (or into ESLint / tests where possible).

4. **Fix in one pass**  
   Work through the "must fix" list. Don’t run the review again until you’re done. That way you’re not constantly reacting to new-looking issues that were always there.

5. **Lock the bar**  
   After that pass, the only gate for "production ready" is:  
   `npm run production-ready` (and in CI: lint + test + build + check-env).  
   Add new review tools or rules only when you’re ready to raise the bar on purpose.

---

## 4. When a review finds "new" issues later

- If it’s a **bug or security issue**: fix it and add a test or ESLint rule so it doesn’t come back.
- If it’s **style or best practice**: either fix it or add it to a "post-launch" backlog and don’t block deploy on it.
- If the same tool keeps reporting the same thing: make sure you’re not re-running it on an old branch or before your fixes are in.

---

## 5. Summary

- **One bar:** lint + tests + build + check-env (required).
- **One command:** `npm run production-ready`.
- **One pass:** Export all review findings → decide must-fix → fix them → then use the gate.
- **No moving target:** Don’t add new checks to the gate until the current one is green and you’re ready.
