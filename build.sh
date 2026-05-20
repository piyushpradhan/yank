#!/usr/bin/env bash
# Yank — Linux build wrapper.
#
# Mirrors build.ps1 (Windows) and the Makefile, with one extra trick:
#   `./build.sh install` also installs the Tauri system prereqs for your
#   distro (libwebkit2gtk, libxdo, etc.) so you don't have to look them up.
#
# Usage:
#   ./build.sh             # same as ./build.sh build
#   ./build.sh install     # system prereqs + npm deps (one-time)
#   ./build.sh dev         # hot-reload dev server
#   ./build.sh build       # release bundles (.AppImage + .deb)
#   ./build.sh deb         # .deb only — skips AppImage (faster, no FUSE needed)
#   ./build.sh dist        # clean build + copy artifacts to dist-installers/
#   ./build.sh clean       # wipe target/bundle and dist-installers/

set -euo pipefail

DIST_DIR="dist-installers"
BUNDLE_DIR="src-tauri/target/release/bundle"

# --- pretty print -----------------------------------------------------------
cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*" >&2; }

# --- distro detection -------------------------------------------------------
detect_pm() {
    if   command -v apt-get >/dev/null 2>&1; then echo apt
    elif command -v dnf     >/dev/null 2>&1; then echo dnf
    elif command -v pacman  >/dev/null 2>&1; then echo pacman
    elif command -v zypper  >/dev/null 2>&1; then echo zypper
    else echo ""
    fi
}

install_system_deps() {
    local pm
    pm=$(detect_pm)
    if [[ -z "$pm" ]]; then
        red "==> Could not detect your package manager."
        red "    Install Tauri prereqs manually: https://v2.tauri.app/start/prerequisites/#linux"
        return 1
    fi

    cyan "==> Installing Tauri system prereqs via $pm (sudo)"
    case "$pm" in
        apt)
            sudo apt-get update
            # libwebkit2gtk-4.1 is required by Tauri v2; the older 4.0 is for v1.
            # libgtk-3-dev and libsoup-3.0-dev are technically transitive
            # deps of webkit2gtk-4.1, but on PopOS / some Ubuntu setups apt
            # doesn't pull the -dev variants automatically. Listing them
            # explicitly keeps the build hermetic.
            sudo apt-get install -y \
                libwebkit2gtk-4.1-dev \
                libgtk-3-dev \
                libsoup-3.0-dev \
                libjavascriptcoregtk-4.1-dev \
                libayatana-appindicator3-dev \
                librsvg2-dev \
                libssl-dev \
                libxdo-dev \
                libfuse2 \
                build-essential \
                pkg-config \
                curl wget file
            ;;
        dnf)
            sudo dnf install -y \
                webkit2gtk4.1-devel \
                gtk3-devel \
                libsoup3-devel \
                openssl-devel \
                libappindicator-gtk3-devel \
                librsvg2-devel \
                libxdo-devel \
                fuse-libs \
                pkgconf-pkg-config \
                @development-tools \
                curl wget file
            ;;
        pacman)
            sudo pacman -S --needed --noconfirm \
                webkit2gtk-4.1 \
                gtk3 \
                libsoup3 \
                base-devel \
                openssl \
                libayatana-appindicator \
                librsvg \
                xdotool \
                fuse2 \
                pkgconf \
                curl wget file
            ;;
        zypper)
            sudo zypper install -y \
                webkit2gtk3-soup2-devel \
                gtk3-devel \
                libsoup-devel \
                libopenssl-devel \
                libayatana-appindicator3-devel \
                librsvg-devel \
                xdotool-devel \
                libfuse2 \
                pkgconf-pkg-config \
                curl wget file
            sudo zypper install -y -t pattern devel_basis
            ;;
    esac
}

# --- toolchain checks -------------------------------------------------------
need_tool() {
    if ! command -v "$1" >/dev/null 2>&1; then
        red "==> Missing required tool: $1"
        red "    $2"
        exit 1
    fi
}

ensure_toolchain() {
    need_tool node "Install Node 18+ from https://nodejs.org"
    need_tool npm  "Comes with Node — see https://nodejs.org"
    need_tool cargo "Install Rust from https://rustup.rs"
}

# --- targets ----------------------------------------------------------------
do_install() {
    install_system_deps
    cyan "==> Installing npm dependencies"
    npm install
    green "==> install complete"
}

do_dev() {
    ensure_toolchain
    npm run tauri -- dev
}

do_build() {
    ensure_toolchain
    cyan "==> Building Yank release bundles"
    # linuxdeploy ships as an AppImage and tries to FUSE-mount itself.
    # Setting APPIMAGE_EXTRACT_AND_RUN=1 makes it fall back to extracting
    # itself instead — works even without libfuse2, in containers, etc.
    # Cheap belt-and-suspenders alongside the libfuse2 install.
    export APPIMAGE_EXTRACT_AND_RUN=1
    npm run tauri -- build

    cyan ""
    cyan "==> Artifacts:"
    # macOS produces dmg + .app; Linux produces AppImage + deb. Print whatever
    # we find so the script works on both without branching.
    local found=0
    for pattern in \
        "$BUNDLE_DIR/appimage/"*.AppImage \
        "$BUNDLE_DIR/deb/"*.deb \
        "$BUNDLE_DIR/rpm/"*.rpm \
        "$BUNDLE_DIR/dmg/"*.dmg
    do
        for f in $pattern; do
            [[ -e "$f" ]] || continue
            ls -lh "$f"
            found=1
        done
    done
    [[ $found -eq 0 ]] && red "    (no installer artifacts found — check tauri build output above)"
}

do_dist() {
    do_clean
    do_build
    mkdir -p "$DIST_DIR"
    # Copy whatever bundles exist for the host platform.
    for pattern in \
        "$BUNDLE_DIR/appimage/"*.AppImage \
        "$BUNDLE_DIR/deb/"*.deb \
        "$BUNDLE_DIR/rpm/"*.rpm \
        "$BUNDLE_DIR/dmg/"*.dmg
    do
        for f in $pattern; do
            [[ -e "$f" ]] || continue
            cp -f "$f" "$DIST_DIR/"
        done
    done
    green ""
    green "==> Installers copied to $DIST_DIR/:"
    ls -lh "$DIST_DIR/" 2>/dev/null || red "    (empty)"
}

do_clean() {
    cyan "==> Cleaning bundle output"
    rm -rf "$BUNDLE_DIR" "$DIST_DIR"
}

# Skip AppImage entirely — useful when linuxdeploy is broken or you only
# need a Debian package. Much faster than the default (~20 s vs ~2 min).
do_deb() {
    ensure_toolchain
    cyan "==> Building .deb only (no AppImage)"
    npm run tauri -- build --bundles deb
    for f in "$BUNDLE_DIR/deb/"*.deb; do
        [[ -e "$f" ]] || continue
        ls -lh "$f"
    done
}

# --- dispatch ---------------------------------------------------------------
target="${1:-build}"
case "$target" in
    install) do_install ;;
    dev)     do_dev     ;;
    build)   do_build   ;;
    deb)     do_deb     ;;
    dist)    do_dist    ;;
    clean)   do_clean   ;;
    -h|--help|help)
        # Print the leading comment block (everything before the first blank line).
        awk 'NR==1 {next} /^$/ {exit} /^#/ {sub(/^# ?/,""); print}' "$0"
        ;;
    *)
        red "Unknown target: $target"
        red "Run '$0 --help' for usage."
        exit 1
        ;;
esac
