#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

# Load .env
if [ ! -f "$ENV_FILE" ]; then
  echo "Error: .env file not found at $ENV_FILE"
  exit 1
fi
set -a; source "$ENV_FILE"; set +a

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

# Bump version
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")
echo "Version bumped: $OLD_VERSION -> $NEW_VERSION"

# Write update-config.json with manifest URL (if manifest ID is known)
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
      echo "UPDATE_MANIFEST_ID=$MANIFEST_ID" >> "$ENV_FILE"
      echo ""
      echo "========================================="
      echo " FIRST-TIME SETUP COMPLETE"
      echo "========================================="
      echo " UPDATE_MANIFEST_ID=$MANIFEST_ID"
      echo " Added to .env automatically."
      echo ""
      echo " This build does NOT have auto-update."
      echo " Run 'npm run release' again to create"
      echo " a build with auto-update enabled."
      echo "========================================="
    fi
  fi
fi

echo ""
echo "Release v$NEW_VERSION complete!"
