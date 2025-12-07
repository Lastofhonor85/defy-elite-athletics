#!/bin/bash
# Auto Sync Script for Defy Elite Athletics

BRANCH="main"
REPO="https://github.com/Lastofhonor85/defy-elite-athletics.git"

echo "🔄 Auto-sync started..."

git add .
CHANGES=$(git status --porcelain)

if [ -n "$CHANGES" ]; then
  git commit -m "Auto-sync: $(date +"%Y-%m-%d %H:%M:%S")"
  git push origin "$BRANCH"
  echo "✅ Changes pushed successfully to $BRANCH."
else
  echo "✅ No changes to commit."
fi
