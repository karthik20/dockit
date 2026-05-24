#!/bin/bash
# Sets up the Tauri build environment without requiring sudo.
# Downloads system deps to /tmp/tauri-deps and writes .cargo/config.toml.
# Run once. Then use: npm run desktop:dev

set -euo pipefail

DEPS_DIR=/tmp/tauri-deps
mkdir -p "$DEPS_DIR"

echo "[1/4] Downloading build dependencies..."
PKGS=(
  pkgconf-bin libpkgconf3 libglib2.0-dev libpcre2-dev zlib1g-dev libffi-dev
  libgtk-3-dev libcairo2-dev libpango1.0-dev libatk1.0-dev libgdk-pixbuf-2.0-dev
  libsoup-3.0-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev
  libjavascriptcoregtk-4.1-dev librsvg2-dev patchelf libharfbuzz-dev
  libfreetype-dev libfontconfig-dev libxft-dev libx11-dev libxext-dev
  libxrender-dev libxcb-shm0-dev libxcb-render0-dev libxau-dev
  libepoxy-dev libpixman-1-dev libxkbcommon-dev libpng-dev libbrotli-dev
  libayatana-indicator3-dev libdbusmenu-glib-dev libxcb-util-dev
  libwayland-dev libx11-xcb-dev libgraphite2-dev libayatana-ido3-dev
  libatk-bridge2.0-dev libxfixes-dev libxcursor-dev libxi-dev
  libxrandr-dev libxcomposite-dev libxdamage-dev libxxf86vm-dev
  libxinerama-dev libxcb1-dev libxml2-dev libsqlite3-dev
  libmount-dev libblkid-dev libfribidi-dev libthai-dev libxdmcp-dev
  libegl-dev libgl-dev libegl-mesa0 libgl1-mesa-dev
  libatspi2.0-dev libdbus-1-dev libsysprof-capture-4-dev
  libxtst-dev libzstd-dev liblzma-dev libdeflate-dev libsharpyuv-dev
  libpsl-dev libnghttp2-dev libjpeg-turbo8-dev
  # runtime libs for linking
  libpango-1.0-0 libharfbuzz0b libgdk-pixbuf-2.0-0 libcairo2 libgtk-3-0t64
  libglib2.0-0t64 libatk1.0-0t64 libfribidi0 libpcre3 libepoxy0
  libfontconfig1 libfreetype6 libpixman-1-0 libpng16-16t64 zlib1g
  libx11-6 libxcb1 libxau6 libxdmcp6 libxrender1 libxext6 libxfixes3
  libxcursor1 libxi6 libxrandr2 libxcomposite1 libxdamage1 libxxf86vm1
  libxinerama1 libxkbcommon0 libxft2 libxtst6 libwayland-client0
  libmount1 libblkid1 libpcre2-8-0 libsoup-3.0-0
  libjavascriptcoregtk-4.1-0 libwebkit2gtk-4.1-0
  libgraphene-1.0-0 libsecret-1-0 libenchant-2-2 libgstreamer1.0-0
  libgstreamer-plugins-base1.0-0 libgstreamer-plugins-bad1.0-0
  libwoff1 libsrtp2-1 libopenjp2-7 libmanette-0.2-0 libyaml-0-2
  libselinux1 libsepol2 libdatrie1 libthai0 liblzma5 libzstd1
  libjpeg-turbo8 libsharpyuv0 libbrotli1 libdeflate0 libxcb-shm0
  libxcb-render0 libxml2 libwayland-cursor0 libwayland-egl1
  libpangocairo-1.0-0 libcairo-gobject2
  libatk-bridge2.0-0t64 libatspi2.0-0t64 libdbus-1-3
  libdbusmenu-glib4 libcrypt1 libffi8 libgraphite2-3
  libstdc++6 libsystemd0 librsvg2-2 libx11-xcb1
  libxslt1.1 libwebpdemux2 libwebpmux3 libharfbuzz-icu0
  libwayland-server0 libhyphen0 liborc-0.4-0t64 libevdev2 libgudev-1.0-0
)
for pkg in "${PKGS[@]}"; do
  apt-get download "$pkg" 2>/dev/null
done

echo "[2/4] Extracting..."
for deb in /tmp/*.deb; do
  dpkg-deb -x "$deb" "$DEPS_DIR" 2>/dev/null
done

echo "[3/4] Writing .cargo/config.toml..."
mkdir -p apps/client/src-tauri/.cargo
cat > apps/client/src-tauri/.cargo/config.toml << EOF
[env]
PKG_CONFIG = "$DEPS_DIR/usr/bin/pkg-config"
PKG_CONFIG_PATH = "$DEPS_DIR/usr/lib/aarch64-linux-gnu/pkgconfig:$DEPS_DIR/usr/share/pkgconfig"
PKG_CONFIG_SYSROOT_DIR = "$DEPS_DIR"
PKG_CONFIG_ALLOW_SYSTEM_CFLAGS = "1"
C_INCLUDE_PATH = "$DEPS_DIR/usr/include"
CPLUS_INCLUDE_PATH = "$DEPS_DIR/usr/include"
LIBRARY_PATH = "$DEPS_DIR/usr/lib/aarch64-linux-gnu"

[build]
rustflags = ["-C", "link-args=-L$DEPS_DIR/usr/lib/aarch64-linux-gnu", "-C", "link-args=-Wl,--allow-shlib-undefined"]
EOF

echo "[4/4] Done. Run: npm run desktop:dev"
