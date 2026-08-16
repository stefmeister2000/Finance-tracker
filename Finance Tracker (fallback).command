#!/bin/bash
cd "/Users/stefkeppens/Desktop/finance tracker"

# If the server is already running, just open the app.
if curl -s --max-time 1 http://localhost:3001/api/data > /dev/null; then
  open http://localhost:3001
  exit 0
fi

# Open the app in the browser once the server is ready
( until curl -s http://localhost:3001 > /dev/null; do sleep 0.3; done; open http://localhost:3001 ) &

# Serve the pre-built app + API from one fast Node server (no Vite dev server)
node server/index.js
