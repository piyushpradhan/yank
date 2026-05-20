# Yank — build targets
#
# One-command builds that produce installers for the host OS:
#   - Windows → .msi + .exe (NSIS) in src-tauri/target/release/bundle/{msi,nsis}/
#   - macOS   → .dmg + .app  in src-tauri/target/release/bundle/{dmg,macos}/
#   - Linux   → .AppImage + .deb in src-tauri/target/release/bundle/{appimage,deb}/
#
# Usage:
#   make            # same as `make build`
#   make install    # install js deps (one-time)
#   make dev        # hot-reload dev server
#   make build      # release bundle for the host OS
#   make dist       # clean build + copy artifacts into ./dist/
#   make clean      # wipe target/ and dist/
#
# Prerequisites (one-time, per machine):
#   - Node 18+ and npm
#   - Rust stable (https://rustup.rs)
#   - Windows : Visual Studio Build Tools + WebView2 Runtime
#   - macOS   : Xcode Command Line Tools
#   - Linux   : see https://v2.tauri.app/start/prerequisites/#linux

SHELL := /bin/sh

# ---- host detection --------------------------------------------------------
ifeq ($(OS),Windows_NT)
    HOST := windows
    EXE_EXT := .exe
    BUNDLE_GLOB := src-tauri/target/release/bundle/msi/*.msi src-tauri/target/release/bundle/nsis/*setup.exe
else
    UNAME_S := $(shell uname -s)
    ifeq ($(UNAME_S),Darwin)
        HOST := macos
        EXE_EXT :=
        BUNDLE_GLOB := src-tauri/target/release/bundle/dmg/*.dmg
    else
        HOST := linux
        EXE_EXT :=
        BUNDLE_GLOB := src-tauri/target/release/bundle/appimage/*.AppImage src-tauri/target/release/bundle/deb/*.deb
    endif
endif

DIST_DIR := dist-installers

.PHONY: all install dev build dist clean print-host

all: build

print-host:
	@echo "host: $(HOST)"

install:
	npm install

dev:
	npm run tauri -- dev

build:
	@echo "==> Building Smart Clipboard for $(HOST)"
	npm run tauri -- build
	@echo ""
	@echo "==> Artifacts:"
	@ls -lh $(BUNDLE_GLOB) 2>/dev/null || dir $(subst /,\,$(BUNDLE_GLOB)) 2>nul || true

dist: clean build
	@mkdir -p $(DIST_DIR)
	@cp -f $(BUNDLE_GLOB) $(DIST_DIR)/ 2>/dev/null || true
	@echo ""
	@echo "==> Installers copied to $(DIST_DIR)/:"
	@ls -lh $(DIST_DIR)/ || true

clean:
	@echo "==> Cleaning bundle output"
	rm -rf src-tauri/target/release/bundle $(DIST_DIR)
