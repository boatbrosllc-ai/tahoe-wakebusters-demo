# Pre-commit hook: block staging of files that may contain secrets.
# Used on Windows when husky runs the hook (husky can run .sh via Git Bash or use this).

$staged = git diff --cached --name-only
if ($staged -match '\.env\.local$') {
  Write-Error "ERROR: Refusing to commit .env.local (may contain secrets). Remove it: git reset HEAD -- .env.local"
  exit 1
}
$block = $staged | Where-Object { $_ -match 'service.*account.*\.json$|\.(pem|key)$' }
if ($block) {
  Write-Error "ERROR: Refusing to commit possible secret file(s): $($block -join ', ')"
  exit 1
}
exit 0
