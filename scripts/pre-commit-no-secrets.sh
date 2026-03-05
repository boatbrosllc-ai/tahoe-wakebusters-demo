#!/bin/sh
# Pre-commit hook: block staging of files that may contain secrets.
# Install: copy to .git/hooks/pre-commit and chmod +x, or use husky (npm run prepare).

if git diff --cached --name-only | grep -q '\.env\.local$'; then
  echo "ERROR: Refusing to commit .env.local (may contain secrets)."
  echo "Remove it from the commit: git reset HEAD -- .env.local"
  exit 1
fi
if git diff --cached --name-only | grep -qE '\.(pem|key|json)$'; then
  for f in $(git diff --cached --name-only | grep -E '\.(pem|key|json)$'); do
    case "$f" in
      package.json | package-lock.json | tsconfig*.json | *.config.js | *.config.ts) ;;
      *service*account*.json | *.pem | *.key)
        echo "ERROR: Refusing to commit possible secret file: $f"
        exit 1
        ;;
    esac
  done
fi
exit 0
