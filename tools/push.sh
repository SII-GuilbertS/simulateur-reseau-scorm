#!/bin/bash
# Usage: tools/push.sh "message de commit"
# Se place à la racine du projet.

MSG="${1:-update}"
cd "$(dirname "$0")/.."

git add scorm-builder.html tests/sim-tests.js README.md \
        docs/doc-prof.pdf docs/doc-eleve.pdf 2>/dev/null

STAGED=$(git diff --cached --name-only)
if [ -z "$STAGED" ]; then
  echo "✅ Rien à commiter — tout est déjà à jour."
  exit 0
fi

echo "📦 Fichiers à commiter :"
echo "$STAGED"
git commit -m "$MSG" || { echo "❌ Commit refusé — rien n'a été poussé."; exit 1; }
git push || { echo "❌ Push échoué — le commit reste en local."; exit 1; }
echo "✅ Poussé sur GitHub."
