#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# Load .env if present (not needed in CI where env vars come from secrets)
if [ -f "$ENV_FILE" ]; then
  set -a; source "$ENV_FILE"; set +a
fi

# Validate required env vars
: "${GDRIVE_FOLDER_ID:?GDRIVE_FOLDER_ID not set in .env}"
: "${RCLONE_REMOTE:?RCLONE_REMOTE not set in .env}"

# Check rclone is installed
if ! command -v rclone &>/dev/null; then
  echo "Error: rclone is not installed. Run: brew install rclone && rclone config"
  exit 1
fi

# Determine bump type (default: patch)
BUMP="${1:-patch}"
if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Usage: $0 [patch|minor|major]"
  exit 1
fi

cd "$ROOT_DIR"

# Ensure working tree is clean before release
if [ -n "$(git status --porcelain)" ]; then
  echo "Error: Working tree is not clean. Commit or stash changes before releasing."
  exit 1
fi

MAIN_BRANCH=$(git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@' || echo "main")

# Bump version
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "Version bumped: $OLD_VERSION -> $NEW_VERSION"

# Write update-config.json with manifest URL for the build (temporary — reset after)
if [ -n "${UPDATE_MANIFEST_ID:-}" ]; then
  MANIFEST_URL="https://drive.usercontent.google.com/download?id=${UPDATE_MANIFEST_ID}&export=download&confirm=t"
  echo "{\"manifestUrl\":\"${MANIFEST_URL}\"}" > "$ROOT_DIR/src/update-config.json"
  echo "Auto-update configured: manifest ID $UPDATE_MANIFEST_ID"
else
  echo "{\"manifestUrl\":\"\"}" > "$ROOT_DIR/src/update-config.json"
  echo "Note: UPDATE_MANIFEST_ID not set — auto-update disabled for this build."
  echo "       After first release, re-run to enable auto-update."
fi

# Build
echo "Building macOS DMG..."
npm run build

# Find the built DMG
DMG=$(find "$ROOT_DIR/dist" -maxdepth 1 -name "*.dmg" -type f | head -1)
if [ -z "$DMG" ]; then
  echo "Error: No DMG found in dist/"
  exit 1
fi
DMG_NAME=$(basename "$DMG")
echo "Built: $DMG"

# Upload DMG to Google Drive
echo "Uploading DMG to Google Drive..."
rclone copy "$DMG" "${RCLONE_REMOTE}:/" \
  --drive-root-folder-id="$GDRIVE_FOLDER_ID"
echo "Uploaded $DMG_NAME"

# Get DMG file ID from Google Drive
echo "Getting DMG file ID..."
DMG_ID=$(rclone lsjson "${RCLONE_REMOTE}:/" --drive-root-folder-id="$GDRIVE_FOLDER_ID" \
  | node -e "
    let d='';
    process.stdin.on('data',c=>d+=c);
    process.stdin.on('end',()=>{
      const f=JSON.parse(d).find(x=>x.Name==='${DMG_NAME}');
      console.log(f?f.ID:'');
    });
")

if [ -z "$DMG_ID" ]; then
  echo "Warning: Could not get DMG file ID. latest.json not updated."
else
  DOWNLOAD_URL="https://drive.usercontent.google.com/download?id=${DMG_ID}&export=download&confirm=t"
  echo "DMG file ID: $DMG_ID"

  # Create and upload latest.json
  cat > "$ROOT_DIR/dist/latest.json" <<MANIFEST
{
  "version": "${NEW_VERSION}",
  "downloadUrl": "${DOWNLOAD_URL}",
  "dmgName": "${DMG_NAME}",
  "releasedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
MANIFEST

  echo "Uploading latest.json..."
  rclone copy "$ROOT_DIR/dist/latest.json" "${RCLONE_REMOTE}:/" \
    --drive-root-folder-id="$GDRIVE_FOLDER_ID"
  echo "Uploaded latest.json"

  # First-time setup: get the latest.json file ID and save to .env
  if [ -z "${UPDATE_MANIFEST_ID:-}" ]; then
    MANIFEST_ID=$(rclone lsjson "${RCLONE_REMOTE}:/" --drive-root-folder-id="$GDRIVE_FOLDER_ID" \
      | node -e "
        let d='';
        process.stdin.on('data',c=>d+=c);
        process.stdin.on('end',()=>{
          const f=JSON.parse(d).find(x=>x.Name==='latest.json');
          console.log(f?f.ID:'');
        });
    ")

    if [ -n "$MANIFEST_ID" ]; then
      if [ -f "$ENV_FILE" ]; then
        echo "UPDATE_MANIFEST_ID=$MANIFEST_ID" >> "$ENV_FILE"
        echo "Added UPDATE_MANIFEST_ID to .env automatically."
      fi
      echo ""
      echo "========================================="
      echo " FIRST-TIME SETUP COMPLETE"
      echo "========================================="
      echo " UPDATE_MANIFEST_ID=$MANIFEST_ID"
      echo ""
      echo " This build does NOT have auto-update."
      echo " Save this ID as a secret and re-run"
      echo " to enable auto-update."
      echo "========================================="
    fi
  fi
fi

# Reset update-config.json so the manifest URL is not committed
echo '{"manifestUrl":""}' > "$ROOT_DIR/src/update-config.json"
echo "Reset update-config.json (manifest URL stays in .env only)"

# Auto-commit version bump and create PR
RELEASE_BRANCH="release/v${NEW_VERSION}"
git checkout -b "$RELEASE_BRANCH"
git add package.json package-lock.json
git commit -m "chore: bump version to ${NEW_VERSION}"
git push -u origin "$RELEASE_BRANCH"

echo "Creating pull request..."
PR_URL=$(gh pr create \
  --title "chore: release v${NEW_VERSION}" \
  --body "Automated release PR — bumps version from ${OLD_VERSION} to ${NEW_VERSION}." \
  --base "$MAIN_BRANCH" \
  --head "$RELEASE_BRANCH")

echo ""
echo "========================================="
echo " Release v$NEW_VERSION complete!"
echo "========================================="
echo " PR: $PR_URL"
echo "========================================="
