#!/usr/bin/env bash

set -euo pipefail

BATCH_SIZE="${1:-500}"
REMOTE="origin"

# Vérifier la taille du lot.
if ! [[ "$BATCH_SIZE" =~ ^[1-9][0-9]*$ ]]; then
    echo "Erreur : la taille du lot doit être un entier positif."
    echo "Exemple : $0 500"
    exit 1
fi

# Vérifier que nous sommes dans un dépôt Git.
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    echo "Erreur : ce script doit être lancé depuis un dépôt Git."
    exit 1
fi

# Se placer automatiquement à la racine du dépôt.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

BRANCH="$(git branch --show-current)"

if [ -z "$BRANCH" ]; then
    echo "Erreur : aucune branche Git active."
    exit 1
fi

echo "Dépôt : $REPO_ROOT"
echo "Branche : $BRANCH"
echo "Taille des lots : $BATCH_SIZE fichiers"

# Ignorer localement les fichiers propres à macOS et le script lui-même.
touch .git/info/exclude

for EXCLUDED_FILE in ".DS_Store" "push_changes_batches.sh"; do
    if ! grep -qxF "$EXCLUDED_FILE" .git/info/exclude; then
        echo "$EXCLUDED_FILE" >> .git/info/exclude
    fi
done

# Ne pas mélanger le traitement avec des changements déjà préparés.
if ! git diff --cached --quiet; then
    echo
    echo "Erreur : des modifications sont déjà dans la zone de préparation."
    echo "Examine-les avec :"
    echo "  git status"
    exit 1
fi

echo
echo "Récupération de l'état actuel du dépôt distant..."

git fetch "$REMOTE" "$BRANCH"

# Vérifier la relation entre la branche locale et la branche distante.
read -r BEHIND AHEAD < <(
    git rev-list --left-right --count \
        "$REMOTE/$BRANCH...HEAD"
)

if [ "$BEHIND" -gt 0 ]; then
    echo
    echo "Erreur : la branche locale est en retard de $BEHIND commit(s)."

    if [ "$AHEAD" -gt 0 ]; then
        echo "Elle contient aussi $AHEAD commit(s) locaux : les branches ont divergé."
    fi

    echo "Récupère et résous d'abord les changements distants."
    exit 1
fi

# Si un précédent push a échoué, envoyer d'abord les commits locaux existants.
if [ "$AHEAD" -gt 0 ]; then
    echo
    echo "$AHEAD commit(s) locaux ne sont pas encore sur GitHub."
    echo "Tentative d'envoi..."

    git push --no-thin "$REMOTE" "$BRANCH"
fi

PART=1

while true; do
    # Construire la liste de tous les chemins modifiés :
    # nouveaux fichiers, fichiers modifiés et fichiers supprimés.
    CHANGED_COUNT="$(
        python3 <<'PY'
import subprocess

commands = [
    ["git", "diff", "--name-only", "-z"],
    ["git", "ls-files", "--others", "--exclude-standard", "-z"],
]

paths = set()

for command in commands:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        check=True,
    )

    for path in result.stdout.split(b"\0"):
        if path:
            paths.add(path)

print(len(paths))
PY
    )"

    if [ "$CHANGED_COUNT" -eq 0 ]; then
        echo
        echo "Terminé : le clone local et GitHub sont synchronisés."
        break
    fi

    echo
    echo "Lot $PART — $CHANGED_COUNT fichier(s) restent à traiter."

    # Sélectionner au maximum BATCH_SIZE chemins parmi toutes
    # les modifications du dépôt.
    python3 - "$BATCH_SIZE" <<'PY'
import subprocess
import sys

limit = int(sys.argv[1])

commands = [
    # Fichiers suivis modifiés ou supprimés.
    ["git", "diff", "--name-only", "-z"],

    # Nouveaux fichiers non suivis.
    ["git", "ls-files", "--others", "--exclude-standard", "-z"],
]

paths = []
seen = set()

for command in commands:
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        check=True,
    )

    for path in result.stdout.split(b"\0"):
        if path and path not in seen:
            seen.add(path)
            paths.append(path)

selected = paths[:limit]

if not selected:
    sys.exit(0)

# git add -A prend en compte les ajouts, modifications et suppressions.
subprocess.run(
    [b"git", b"add", b"-A", b"--", *selected],
    check=True,
)

print(f"{len(selected)} chemin(s) préparé(s).")
PY

    STAGED="$(
        git diff --cached --name-only -z |
        python3 -c '
import sys
paths = [p for p in sys.stdin.buffer.read().split(b"\0") if p]
print(len(paths))
'
    )"

    if [ "$STAGED" -eq 0 ]; then
        echo "Erreur : aucune modification n'a été préparée."
        exit 1
    fi

    echo
    echo "Résumé du lot :"
    git diff --cached --stat

    git commit -m "Synchronisation du dépôt — lot $PART"

    echo
    echo "Envoi du lot $PART vers GitHub..."
    git push --no-thin "$REMOTE" "$BRANCH"

    PART=$((PART + 1))
done