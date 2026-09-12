#!/bin/bash

# 1. Check if the current directory is a git repository
if ! git rev-parse --is-inside-work-tree > /dev/null 2>&1; then
    echo "❌ Error: This directory is not a Git repository."
    exit 1
fi

# 2. Get the name of the current branch
CURRENT_BRANCH=$(git branch --show-current)

# 3. Stage all modified and new files
echo "📦 Staging changes (git add .)..."
git add .

# Show the user what is about to be committed
echo "------------------------------------"
git status --short
echo "------------------------------------"

# 4. Prompt the user for a commit message
echo -n "📝 Enter your commit message: "
read -r COMMIT_MSG

# If the user just presses Enter, use a default message
if [ -z "$COMMIT_MSG" ]; then
    COMMIT_MSG="Auto-commit: Updates made on $(date '+%Y-%m-%d %H:%M:%S')"
fi

# 5. Commit the changes
git commit -m "$COMMIT_MSG"

# 6. Push to the remote server
echo "🚀 Pushing changes to origin/$CURRENT_BRANCH..."
git push origin "$CURRENT_BRANCH"

# 7. Success message
if [ $? -eq 0 ]; then
    echo "✅ Successfully added, committed, and pushed!"
else
    echo "❌ Push failed. Please check your network or branch status."
fi