#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_DIR="$HOME/.config/4q-tokens"
BIN_DIR="$HOME/.local/bin"
DIST_INDEX="$SCRIPT_DIR/dist/index.js"

echo "[4q-tokenz] Installing..."

# Pick package manager
if command -v pnpm &>/dev/null; then
  PKG="pnpm"
elif command -v npm &>/dev/null; then
  PKG="npm"
else
  echo "[4q-tokenz] Error: neither pnpm nor npm found. Install Node.js first." >&2
  exit 1
fi

echo "[4q-tokenz] Installing dependencies (using $PKG)..."
$PKG install

echo "[4q-tokenz] Building..."
$PKG run build

echo "[4q-tokenz] Creating config directory..."
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  echo "[4q-tokenz] Creating default config at $CONFIG_DIR/config.json"
  cp "$SCRIPT_DIR/config.example.json" "$CONFIG_DIR/config.json"
  echo "[4q-tokenz] Edit $CONFIG_DIR/config.json to configure upstream servers"
else
  echo "[4q-tokenz] Config already exists at $CONFIG_DIR/config.json"
fi

mkdir -p "$BIN_DIR"

echo "[4q-tokenz] Installing to $BIN_DIR/mcp-proxy"
cat > "$BIN_DIR/mcp-proxy" << EOF
#!/bin/bash
exec node "$DIST_INDEX" "\$@"
EOF
chmod +x "$BIN_DIR/mcp-proxy"

# Warn if BIN_DIR is not in PATH
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  echo ""
  echo "[4q-tokenz] Warning: $BIN_DIR is not in your PATH."
  echo "  Add this to your ~/.bashrc or ~/.zshrc:"
  echo "    export PATH=\"\$HOME/.local/bin:\$PATH\""
  echo "  Then restart your shell or run: source ~/.bashrc"
  echo ""
fi

echo "[4q-tokenz] Checking if systemd user service should be installed..."
if command -v systemctl &>/dev/null; then
  read -p "Install systemd user service? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    mkdir -p "$HOME/.config/systemd/user"
    cat > "$HOME/.config/systemd/user/mcp-proxy.service" << 'SYSTEMD'
[Unit]
Description=MCP Proxy Gateway
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/mcp-proxy
Restart=on-failure
RestartSec=5s
Environment="PATH=%h/.local/bin:/usr/local/bin:/usr/bin"
StandardOutput=journal
StandardError=journal
SyslogIdentifier=mcp-proxy

[Install]
WantedBy=default.target
SYSTEMD
    systemctl --user daemon-reload
    echo "[4q-tokenz] Systemd service installed. Start with:"
    echo "  systemctl --user start mcp-proxy"
    echo "  systemctl --user enable mcp-proxy  (for auto-start)"
  fi
fi

echo "[4q-tokenz] Installation complete!"
echo "[4q-tokenz] Note: mcp-proxy runs from $SCRIPT_DIR/dist/ — do not move or delete this directory."
echo "[4q-tokenz] To run:"
echo "  mcp-proxy"
