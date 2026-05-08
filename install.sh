#!/bin/bash
set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
CONFIG_DIR="$HOME/.config/4q-tokens"
BIN_DIR="$HOME/.local/bin"
DIST_INDEX="$SCRIPT_DIR/dist/index.js"

echo "[4q-tokens] Installing..."

echo "[4q-tokens] Installing dependencies..."
pnpm install

echo "[4q-tokens] Building..."
pnpm build

echo "[4q-tokens] Creating config directory..."
mkdir -p "$CONFIG_DIR"

if [ ! -f "$CONFIG_DIR/config.json" ]; then
  echo "[4q-tokens] Creating default config at $CONFIG_DIR/config.json"
  cp "$SCRIPT_DIR/config.example.json" "$CONFIG_DIR/config.json"
  echo "[4q-tokens] Edit $CONFIG_DIR/config.json to configure upstream servers"
else
  echo "[4q-tokens] Config already exists at $CONFIG_DIR/config.json"
fi

mkdir -p "$BIN_DIR"

echo "[4q-tokens] Installing to $BIN_DIR/mcp-proxy"
cat > "$BIN_DIR/mcp-proxy" << EOF
#!/bin/bash
export MCP_PROXY_CONFIG="$CONFIG_DIR/config.json"
exec node "$DIST_INDEX" "\$@"
EOF
chmod +x "$BIN_DIR/mcp-proxy"

echo "[4q-tokens] Checking if systemd user service should be installed..."
if [ -d "$HOME/.config/systemd/user" ]; then
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
    echo "[4q-tokens] Systemd service installed. Start with:"
    echo "  systemctl --user start mcp-proxy"
    echo "  systemctl --user enable mcp-proxy  (for auto-start)"
  fi
fi

echo "[4q-tokens] Installation complete!"
echo "[4q-tokens] To run:"
echo "  mcp-proxy"
