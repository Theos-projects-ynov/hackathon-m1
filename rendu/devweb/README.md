# Interface Web - Phi-3.5-Financial (TechCorp)

**Auteurs** : Theo Stoffelbach et Fabre Clément

Interface de chat web (Flask + HTML/JS) connectee a un serveur **Ollama** local
exposant le modele Phi-3.5-Financial.

## Prerequis

1. [Ollama](https://ollama.com/download) installe et demarre (`ollama serve`, ou
   automatique sur Windows/macOS).
2. Le modele financier cree a partir du `Modelfile` fourni par l'equipe INFRA :

   ```bash
   ollama create phi3-financial -f ../../ollama_server/Modelfile
   ```

   Verifiez ensuite que le modele repond :

   ```bash
   ollama run phi3-financial "Explique-moi ce qu'est un ETF"
   ```

## Lancement

Depuis `rendu/devweb/` :

```bash
pip install -r requirements.txt
python app.py
```

Puis ouvrez [http://localhost:5000](http://localhost:5000).

## Configuration

Variables d'environnement optionnelles :

| Variable | Defaut | Description |
| --- | --- | --- |
| `OLLAMA_API_URL` | `http://localhost:11434` | URL du serveur Ollama |
| `OLLAMA_MODEL` | `phi3-financial` | Nom du modele a interroger |
| `OLLAMA_NUM_PREDICT` | `2048` | Nombre maximum de tokens generes par reponse |
| `OLLAMA_REQUEST_TIMEOUT` | `300` | Timeout du proxy Flask vers Ollama, en secondes |

Ne pas utiliser `OLLAMA_HOST` : cette variable est deja utilisee par Ollama
lui-meme pour son adresse d'ecoute (ex. `0.0.0.0`), ce n'est pas une URL cliente.

Exemple :

```bash
OLLAMA_API_URL=http://192.168.1.42:11434 OLLAMA_MODEL=phi3-financial OLLAMA_NUM_PREDICT=2048 python app.py
```

## Fonctionnalites

- Chat en streaming, les tokens s'affichent au fur et a mesure.
- **Bouton Stop** pour interrompre une generation en cours (le texte partiel est conserve).
- **Nouvelle conversation** (bouton +) et **Regenerer** la derniere reponse.
- **Persistance** : l'historique est sauvegarde en `localStorage` et survit au rafraichissement.
- **Copier** une reponse en un clic, avec **horodatage** de chaque message.
- **Mode clair / sombre** (bouton lune/soleil), preference memorisee et respect du theme systeme.
- Rendu Markdown simple pour les reponses du modele.
- Indicateur d'etat de connexion au serveur Ollama, verifie toutes les 5 secondes via `/api/health`.
- **Bandeau hors-ligne** : quand Ollama est injoignable ou le modele absent, un bandeau
  affiche la commande exacte a lancer pour corriger.
- Backend Flask proxy vers Ollama : le navigateur ne contacte jamais Ollama directement.

## Architecture

```text
rendu/devweb/
|-- app.py                # Backend Flask : UI + proxy /api/chat, /api/health
|-- templates/index.html  # Page de chat
|-- static/style.css      # Style de l'interface
|-- static/script.js      # Chat + streaming + Markdown + statut
`-- requirements.txt
```
