#!/bin/bash
cd "$(dirname "$0")"
REPO="https://github.com/etalloniadmin-maker/WebRobo.git"
echo "== Web Robo: publicare pe GitHub =="
if ! command -v git >/dev/null 2>&1; then
  echo "git nu e instalat. Rulează în Terminal: xcode-select --install"; read -p "Enter pentru a închide."; exit 1
fi
if [ ! -d .git ]; then
  git init -b main
  git remote add origin "$REPO"
fi
git remote set-url origin "$REPO"
git add -A
if git diff --cached --quiet; then
  echo "Nimic nou de publicat."
else
  MSG="${1:-Web Robo: $(date '+%Y-%m-%d %H:%M')}"
  git -c user.name="${GIT_AUTHOR_NAME:-$(git config user.name || echo 'Web Robo')}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-$(git config user.email || echo 'webrobo@local')}" \
      commit -q -m "$MSG" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_014sbFsWnTtiNaD2MDnTCqQR"
  echo "Commit: $MSG"
fi
echo "Push către $REPO ..."
echo "(dacă ți se cere parola: folosește un Personal Access Token de la github.com/settings/tokens, nu parola contului)"
if git push -u origin main; then
  echo; echo "✅ Publicat: https://github.com/etalloniadmin-maker/WebRobo"
else
  echo; echo "❌ Push-ul a eșuat. Cel mai des: autentificare. Instalează GitHub CLI (brew install gh) și rulează 'gh auth login', apoi dă dublu-click din nou."
fi
read -p "Apasă Enter pentru a închide."
