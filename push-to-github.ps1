# Push Boat Bros project to GitHub
# Run this in PowerShell or Cursor Terminal (right-click -> Run)
Set-Location $PSScriptRoot

# Ensure we're on main and push
git branch -M main
git push -u origin main

if ($LASTEXITCODE -eq 0) {
    Write-Host "Done. Code is on GitHub: https://github.com/mikemacmadeit/boat-bros-atx" -ForegroundColor Green
} else {
    Write-Host "Push failed. Run: gh auth login" -ForegroundColor Yellow
    Write-Host "Then run this script again, or run: git push -u origin main" -ForegroundColor Yellow
}
