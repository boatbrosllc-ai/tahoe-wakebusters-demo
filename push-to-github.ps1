# Push Boat Bros project to GitHub
# Run this in PowerShell or Cursor Terminal (right-click -> Run)
# Current remote: https://github.com/boatbrosllc-ai/Boat-Bros (confirm this is the right account)
Set-Location $PSScriptRoot

Write-Host "Remote: $(git remote get-url origin)" -ForegroundColor Cyan
Write-Host "Pushing to main..." -ForegroundColor Gray

git branch -M main
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Code is on GitHub: https://github.com/boatbrosllc-ai/Boat-Bros" -ForegroundColor Green
} else {
    Write-Host "Push failed. Run: gh auth login" -ForegroundColor Yellow
    Write-Host "Then run this script again, or run: git push -u origin main" -ForegroundColor Yellow
}
