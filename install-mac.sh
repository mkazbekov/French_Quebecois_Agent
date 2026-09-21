#!/bin/bash
# One-line installer for people who don't use Git or the terminal normally:
#
#   curl -fsSL https://raw.githubusercontent.com/mkazbekov/French_Quebecois_Agent/main/install-mac.sh | bash
#
# Downloads the repo, installs it to a normal-looking folder, creates a
# Desktop double-click shortcut, and starts the tutor. bash 3.2 compatible
# (macOS's default, unmaintained bash) - no associative arrays, no
# ${var,,}, no mapfile. Also runs fine on Linux for testing.
#
# Everything lives inside main(), called only on the very last line: bash
# must read this whole file (and find the closing brace) before it can call
# main, so a connection that drops partway through the download can never
# run half a script.

main() {
  set -e

  archive_url="${TUTOR_ARCHIVE_URL:-https://github.com/mkazbekov/French_Quebecois_Agent/archive/refs/heads/main.tar.gz}"
  install_dir="${TUTOR_INSTALL_DIR:-$HOME/Quebec French Tutor}"
  # An update replaces this folder, so never accept a folder that holds other things.
  case "$install_dir" in
    "" | "/" | "$HOME" | "$HOME/" | "$HOME/Desktop" | "$HOME/Documents" | "$HOME/Downloads")
      fail "Refusing to install into \"$install_dir\". Set TUTOR_INSTALL_DIR to a dedicated folder." ;;
  esac

  echo ""
  echo "== Québec French Voice Tutor - installer =="
  echo ""

  tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/tutor-install.XXXXXX")"
  trap 'rm -rf "$tmp_dir"' EXIT

  echo "Downloading the tutor..."
  archive_path="$tmp_dir/source.tar.gz"
  case "$archive_url" in
    file://*)
      # Only used for local testing (TUTOR_ARCHIVE_URL=file://...).
      src_path="${archive_url#file://}"
      cp "$src_path" "$archive_path" || fail "Could not read the local archive at $src_path"
      ;;
    *)
      curl -fsSL -o "$archive_path" "$archive_url" || fail "Could not download the tutor. Check your internet connection and try again."
      ;;
  esac

  echo "Extracting..."
  tar -xzf "$archive_path" -C "$tmp_dir" || fail "Could not extract the downloaded archive."

  extracted_dir=""
  for d in "$tmp_dir"/*/; do
    if [ -d "$d" ]; then
      extracted_dir="${d%/}"
      break
    fi
  done
  [ -n "$extracted_dir" ] || fail "The downloaded archive did not contain a folder - something is wrong with the download."

  # If this is an update (the install folder already exists), keep the
  # learner's saved key, progress, downloaded Node.js, and installed
  # dependencies - only the app code itself gets replaced.
  keep_dir=""
  if [ -d "$install_dir" ]; then
    echo "Found an existing install - updating it and keeping your saved settings and progress..."
    keep_dir="$tmp_dir/keep"
    mkdir -p "$keep_dir"
    for item in .env data .runtime node_modules; do
      if [ -e "$install_dir/$item" ]; then
        mv "$install_dir/$item" "$keep_dir/$item"
      fi
    done
    rm -rf "$install_dir"
  else
    echo "Installing to \"$install_dir\"..."
  fi

  mkdir -p "$(dirname "$install_dir")"
  mv "$extracted_dir" "$install_dir"

  if [ -n "$keep_dir" ] && [ -d "$keep_dir" ]; then
    for item in .env data .runtime node_modules; do
      if [ -e "$keep_dir/$item" ]; then
        rm -rf "${install_dir:?}/$item"
        mv "$keep_dir/$item" "$install_dir/$item"
      fi
    done
  fi

  launcher="$install_dir/Start Tutor (Mac).command"
  chmod +x "$launcher"

  # A Desktop shortcut so the learner never has to find this folder again or
  # touch a terminal. Files this script writes itself (as opposed to files
  # downloaded by a browser) don't get macOS's quarantine flag, so
  # double-clicking it won't trigger a Gatekeeper "unidentified developer"
  # prompt.
  desktop_dir="$HOME/Desktop"
  desktop_launcher=""
  if [ -d "$desktop_dir" ]; then
    desktop_launcher="$desktop_dir/Quebec French Tutor.command"
    cat > "$desktop_launcher" <<EOF
#!/bin/bash
exec "$launcher" "\$@"
EOF
    chmod +x "$desktop_launcher"
  fi

  # Give the launchers the app's own icon instead of the default blank-page
  # .command icon. Best-effort only: this whole script runs under `set -e`,
  # so every step here is guarded/non-fatal - a machine missing sips,
  # iconutil or Python's plistlib, or one that refuses the AppleScript
  # automation prompt, must still finish the install cleanly.
  # NOTE: this codepath is unverified on a real Mac (only tested on
  # Linux/WSL, where sips/iconutil/osascript don't exist and it just skips).
  set_launcher_icon() {
    source_png="$install_dir/assets/tutor-1024.png"
    [ -f "$source_png" ] || return 0
    command -v sips >/dev/null 2>&1 || return 0
    command -v iconutil >/dev/null 2>&1 || return 0
    command -v osascript >/dev/null 2>&1 || return 0

    iconset_dir="$tmp_dir/tutor.iconset"
    icns_path="$tmp_dir/tutor.icns"
    mkdir -p "$iconset_dir" || return 0

    for spec in "16:icon_16x16" "32:icon_16x16@2x" "32:icon_32x32" "64:icon_32x32@2x" \
                "128:icon_128x128" "256:icon_128x128@2x" "256:icon_256x256" \
                "512:icon_256x256@2x" "512:icon_512x512" "1024:icon_512x512@2x"; do
      px="${spec%%:*}"
      name="${spec##*:}"
      sips -z "$px" "$px" "$source_png" --out "$iconset_dir/$name.png" >/dev/null 2>&1 || true
    done

    iconutil -c icns "$iconset_dir" -o "$icns_path" >/dev/null 2>&1 || return 0
    [ -f "$icns_path" ] || return 0

    for target in "$launcher" "$desktop_launcher"; do
      [ -n "$target" ] || continue
      [ -e "$target" ] || continue
      osascript \
        -e 'use framework "AppKit"' \
        -e 'use scripting additions' \
        -e "set i to current application's NSImage's alloc()'s initWithContentsOfFile:\"$icns_path\"" \
        -e "current application's NSWorkspace's sharedWorkspace()'s setIcon:i forFile:\"$target\" options:0" \
        >/dev/null 2>&1 || true
    done
    return 0
  }
  set_launcher_icon || true

  echo ""
  echo "Done:"
  echo "  - Installed to: $install_dir"
  if [ -n "$desktop_launcher" ]; then
    echo "  - Created a Desktop shortcut: Quebec French Tutor"
  fi
  echo ""

  # curl | bash means our own stdin is the piped script, not the keyboard -
  # reading a key from it would just read leftover script text. Reopen the
  # real keyboard via /dev/tty for the launcher's interactive key prompt; if
  # there is no tty at all (e.g. run from some automation), don't try to run
  # it non-interactively - just point the learner at the Desktop shortcut.
  if [ -r /dev/tty ]; then
    "$launcher" < /dev/tty
  elif [ -n "$desktop_launcher" ]; then
    echo "Now double-click \"Quebec French Tutor\" on your Desktop to start the tutor."
  else
    echo "Open \"$install_dir\" and double-click \"Start Tutor (Mac).command\" to start the tutor."
  fi
}

fail() {
  echo ""
  echo "$1" >&2
  exit 1
}

main "$@"
