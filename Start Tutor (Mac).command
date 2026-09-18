#!/bin/bash
# One-click launcher for macOS (also works on Linux/WSL for testing).
# Double-clicking a .command file in Finder runs it with a very minimal PATH
# and bash 3.2 (macOS's default, unmaintained bash) - so this script avoids
# associative arrays, ${var,,}, mapfile, and anything else bash 4+ only.

# Resolve our own folder robustly: $0 may be relative (run as ./Start...,
# or exec'd from the Desktop-shortcut wrapper with a relative path from some
# other cwd), so `cd "$(dirname "$0")"` alone can land in the wrong place.
# cd there first, then ask the shell for the absolute path with `pwd`.
cd "$(dirname "$0")" || exit 1
SCRIPT_DIR="$(pwd)"
cd "$SCRIPT_DIR" || exit 1

NODE_VERSION="v24.18.0"
RUNTIME_DIR="$SCRIPT_DIR/.runtime"
NODE_DIR="$RUNTIME_DIR/node"
NODE_BIN=""

fail() {
  echo ""
  echo "$1"
  echo ""
  read -r -p "Press Enter to close this window... " _unused
  exit 1
}

# --- 1. Already have a portable copy from a previous run? ---
if [ -x "$NODE_DIR/bin/node" ]; then
  NODE_BIN="$NODE_DIR/bin"
fi

# --- 2. Is there a good-enough Node.js already reachable? ---
# Double-clicked .command scripts often get a minimal PATH, so also check the
# common Homebrew locations even if `node` isn't found on PATH.
if [ -z "$NODE_BIN" ]; then
  for candidate_dir in "" "/opt/homebrew/bin" "/usr/local/bin"; do
    if [ -n "$candidate_dir" ]; then
      candidate="$candidate_dir/node"
    else
      candidate="$(command -v node 2>/dev/null)"
    fi
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      ver="$("$candidate" -v 2>/dev/null)"           # e.g. v24.18.0
      ver="${ver#v}"
      major="${ver%%.*}"
      rest="${ver#*.}"
      minor="${rest%%.*}"
      if [ -n "$major" ] && [ "$major" -gt 20 ] 2>/dev/null; then
        NODE_BIN="$(dirname "$candidate")"
        break
      fi
      if [ -n "$major" ] && [ "$major" -eq 20 ] 2>/dev/null && [ -n "$minor" ] && [ "$minor" -ge 9 ] 2>/dev/null; then
        NODE_BIN="$(dirname "$candidate")"
        break
      fi
    fi
  done
fi

# --- 3. Download a portable copy of Node.js (no admin rights needed) ---
if [ -z "$NODE_BIN" ]; then
  echo ""
  echo "Node.js was not found on this computer (or the version is too old)."
  echo "Downloading Node.js (about 40 MB, only needed the first time)..."
  echo ""

  os_name="$(uname -s)"
  arch_name="$(uname -m)"

  case "$arch_name" in
    arm64|aarch64) node_arch="arm64" ;;
    *) node_arch="x64" ;;
  esac

  case "$os_name" in
    Darwin) node_platform="darwin" ;;
    Linux) node_platform="linux" ;;
    *) fail "This launcher only supports macOS and Linux. Please install Node.js 20.9+ yourself from https://nodejs.org" ;;
  esac

  mkdir -p "$RUNTIME_DIR"
  archive_path="$RUNTIME_DIR/node.tar.gz"
  node_url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-$node_platform-$node_arch.tar.gz"

  if ! curl -fL --progress-bar -o "$archive_path" "$node_url"; then
    echo ""
    echo "Could not download Node.js $NODE_VERSION - looking up the latest version instead..."
    found_version="$(curl -fsL https://nodejs.org/dist/index.json \
      | tr ',' '\n' \
      | grep -o '"version":"v24\.[0-9.]*"' \
      | head -n1 \
      | sed 's/.*"v/v/; s/"$//')"
    if [ -z "$found_version" ]; then
      fail "Sorry, we could not download Node.js automatically. Check your internet connection and try again, or install Node.js yourself from https://nodejs.org"
    fi
    NODE_VERSION="$found_version"
    node_url="https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-$node_platform-$node_arch.tar.gz"
    if ! curl -fL --progress-bar -o "$archive_path" "$node_url"; then
      fail "Still could not download Node.js. Check your internet connection and try again, or install Node.js yourself from https://nodejs.org"
    fi
  fi

  echo "Extracting Node.js..."
  if ! tar -xzf "$archive_path" -C "$RUNTIME_DIR"; then
    fail "Failed to extract the downloaded Node.js archive."
  fi
  rm -f "$archive_path"

  extracted_dir="$(find "$RUNTIME_DIR" -maxdepth 1 -type d -name 'node-*' | head -n1)"
  if [ -z "$extracted_dir" ]; then
    fail "Something went wrong setting up Node.js."
  fi
  mv "$extracted_dir" "$NODE_DIR"

  if [ ! -x "$NODE_DIR/bin/node" ]; then
    fail "Something went wrong setting up Node.js."
  fi
  NODE_BIN="$NODE_DIR/bin"
fi

export PATH="$NODE_BIN:$PATH"

"$NODE_BIN/node" scripts/launch.mjs "$@"
result=$?

if [ "$result" -ne 0 ]; then
  echo ""
  echo "Something went wrong - read the message above."
  read -r -p "Press Enter to close this window... " _unused
fi

exit "$result"
