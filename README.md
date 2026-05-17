# Maes Website

Site statique minimal pour visualiser des résultats de simulations MAES dans une interface web légère.

## Aperçu

Ce dépôt contient :

- `index.html` : structure de la page.
- `styles.css` : styles de l’interface.
- `data/` : jeux de données compressés (`.json.gz`) utilisés par la visualisation.

## Démarrage rapide

Comme il s’agit d’un site statique, aucune installation n’est nécessaire.

1. Clonez le dépôt.
2. Ouvrez `index.html` directement dans votre navigateur.

## Développement local (recommandé)

Pour éviter certains problèmes liés à la lecture de fichiers locaux (`file://`), lancez un serveur HTTP local :

```bash
python3 -m http.server 8000
```

Puis ouvrez : `http://localhost:8000`

## Structure du projet

```text
.
├── index.html
├── styles.css
├── README.md
└── data/
    └── ... fichiers de simulation (.json.gz)
```

## Personnalisation

- Modifiez le contenu et les composants dans `index.html`.
- Ajustez le rendu visuel dans `styles.css`.
- Remplacez/ajoutez des données dans `data/` en conservant le format attendu par le front.

## Bonnes pratiques

- Garder les noms de fichiers cohérents dans `data/`.
- Tester la page avec un serveur local avant publication.
- Versionner les changements de données et de style séparément quand possible.
