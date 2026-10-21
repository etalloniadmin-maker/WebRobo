#!/bin/bash
cd "$(dirname "$0")"
echo "== Web Robo: instalare =="
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nu e instalat. Descarcă-l de la https://nodejs.org (LTS), instalează-l, apoi rulează din nou acest fișier."
  open "https://nodejs.org"
  read -p "Apasă Enter pentru a închide."; exit 1
fi
echo "Node $(node -v), npm $(npm -v)"
npm install --no-audit --no-fund && echo && echo "✅ Gata. Pornește '2 - Porneste.command'." || echo "❌ A apărut o eroare mai sus."
read -p "Apasă Enter pentru a închide."
