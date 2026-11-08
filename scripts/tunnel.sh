#!/usr/bin/env bash
# Keeps the Brev GPU's Nemotron NIM reachable at http://localhost:8000/v1.
# Reconnects by itself if the laptop sleeps or the network changes. Stop with Ctrl+C.
# Usage: npm run tunnel   (instance name defaults to opscrew-nim; override with BREV_INSTANCE=...)
#
# ControlMaster=no: Brev's ssh config shares one background connection between sessions. A tunnel
# riding on it exits immediately and dies whenever that shared connection closes, so use our own.
HOST="${BREV_INSTANCE:-opscrew-nim}"
while true; do
  echo "[tunnel] connecting localhost:8000 -> $HOST:8000"
  ssh -N -o ControlMaster=no -o ControlPath=none -o ServerAliveInterval=15 -o ServerAliveCountMax=4 \
    -o ExitOnForwardFailure=yes -L 8000:localhost:8000 "$HOST"
  echo "[tunnel] dropped, reconnecting in 3s"
  sleep 3
done
