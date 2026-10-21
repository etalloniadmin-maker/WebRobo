#!/bin/bash
cd "$(dirname "$0")"
echo "== Web Robo: pornire =="
echo "Dashboard:  http://localhost:3000"
echo "Inngest:    http://localhost:8288"
echo "(închide fereastra sau Ctrl+C ca să oprești)"
echo
npx inngest-cli@latest dev -u http://localhost:3000/api/inngest > /tmp/inngest.log 2>&1 &
INNGEST_PID=$!
trap "kill $INNGEST_PID 2>/dev/null" EXIT
sleep 2; (sleep 6; open http://localhost:3000) &
npm run dev
