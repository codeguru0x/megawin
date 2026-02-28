#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# ─── Load .env.s3.local ──────────────────────────────────────────────
ENV_FILE="$PKG_DIR/.env.s3.local"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# ─── Defaults ─────────────────────────────────────────────────────────
BUMP_TYPE="${1:-patch}"
S3_BUCKET="${S3_BUCKET:-}"
AWS_PROFILE="${AWS_PROFILE:-}"
AWS_REGION="${AWS_REGION:-}"

# ─── Parse CLI args (override env) ───────────────────────────────────
shift 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --bucket)  S3_BUCKET="$2";  shift 2 ;;
    --profile) AWS_PROFILE="$2"; shift 2 ;;
    --region)  AWS_REGION="$2";  shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# ─── Validate ─────────────────────────────────────────────────────────
if [[ -z "$S3_BUCKET" ]]; then
  echo "Error: S3_BUCKET is required."
  echo "Set it in .env.s3.local or pass --bucket <name>"
  exit 1
fi

if [[ ! "$BUMP_TYPE" =~ ^(patch|minor|major)$ ]]; then
  echo "Error: Invalid bump type '$BUMP_TYPE'. Use: patch, minor, major"
  exit 1
fi

# Build AWS CLI flags
AWS_FLAGS=()
[[ -n "$AWS_PROFILE" ]] && AWS_FLAGS+=(--profile "$AWS_PROFILE")
[[ -n "$AWS_REGION" ]]  && AWS_FLAGS+=(--region "$AWS_REGION")

# ─── Bump version ────────────────────────────────────────────────────
cd "$PKG_DIR"

OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP_TYPE" --no-git-tag-version --no-workspaces-update > /dev/null
VERSION=$(node -p "require('./package.json').version")

echo "╔══════════════════════════════════════════════════╗"
echo "║  Player SDK — Upload to S3                       ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Version:  $OLD_VERSION → $VERSION ($BUMP_TYPE)"
echo "  Bucket:   $S3_BUCKET"
[[ -n "$AWS_PROFILE" ]] && echo "  Profile:  $AWS_PROFILE"
[[ -n "$AWS_REGION" ]]  && echo "  Region:   $AWS_REGION"
echo ""

# ─── Build + Pack ─────────────────────────────────────────────────────
echo "▸ Building..."
pnpm build

echo "▸ Packing .tgz..."
mkdir -p release
PACK_OUTPUT=$(pnpm pack --pack-gzip-level 9 --pack-destination release 2>&1)
TGZ_FILE="$PKG_DIR/release/megawin-player-sdk-${VERSION}.tgz"

if [[ ! -f "$TGZ_FILE" ]]; then
  echo "Error: Expected file not found: $TGZ_FILE"
  exit 1
fi

# ─── Build docs ───────────────────────────────────────────────────────
echo "▸ Generating docs..."
pnpm docs:build

S3_PREFIX="s3://$S3_BUCKET/player-sdk"

# ─── Upload versioned ────────────────────────────────────────────────
echo ""
echo "▸ Uploading v$VERSION..."
aws s3 cp "$TGZ_FILE" "$S3_PREFIX/v$VERSION/megawin-player-sdk.tgz" "${AWS_FLAGS[@]}"

if [[ -d "$PKG_DIR/docs" ]]; then
  aws s3 sync "$PKG_DIR/docs" "$S3_PREFIX/v$VERSION/docs/" --delete "${AWS_FLAGS[@]}"
fi

# ─── Upload latest ────────────────────────────────────────────────────
echo "▸ Uploading latest..."
aws s3 cp "$TGZ_FILE" "$S3_PREFIX/latest/megawin-player-sdk.tgz" "${AWS_FLAGS[@]}"

if [[ -d "$PKG_DIR/docs" ]]; then
  aws s3 sync "$PKG_DIR/docs" "$S3_PREFIX/latest/docs/" --delete "${AWS_FLAGS[@]}"
fi

# ─── Summary ──────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════╗"
echo "║  Upload complete!                                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  SDK (v$VERSION):"
echo "    $S3_PREFIX/v$VERSION/megawin-player-sdk.tgz"
echo ""
echo "  SDK (latest):"
echo "    $S3_PREFIX/latest/megawin-player-sdk.tgz"
echo ""
echo "  Docs (v$VERSION):"
echo "    $S3_PREFIX/v$VERSION/docs/"
echo ""
echo "  Docs (latest):"
echo "    $S3_PREFIX/latest/docs/"
echo ""
