# ⚜️ AURUM TRADER — Gold Intelligence Platform

Plateforme de trading or professionnelle avec signaux algorithmiques, backtest, analyse des marchés corrélés et analyse IA en temps réel.

---

## 🚀 DÉPLOIEMENT EN 10 MINUTES — GUIDE COMPLET

### ÉTAPE 1 — Prérequis (à installer une seule fois)

1. **Node.js** → Télécharger sur https://nodejs.org (version 18 ou 20)
2. **Git** → Télécharger sur https://git-scm.com
3. **Compte GitHub** → Créer sur https://github.com (gratuit)

---

### ÉTAPE 2 — Mettre le projet sur GitHub

Ouvrez un **terminal** (PowerShell sur Windows, Terminal sur Mac) dans le dossier du projet :

```bash
# Initialiser Git
git init

# Ajouter tous les fichiers
git add .

# Premier commit
git commit -m "🚀 Initial commit — AURUM TRADER"

# Créer le repo sur GitHub (installez GitHub CLI : https://cli.github.com)
gh repo create aurum-trader --public --push --source=.
```

**OU manuellement sur GitHub.com :**
1. Allez sur https://github.com → "New repository"
2. Nommez-le `aurum-trader` → "Create repository"
3. Copiez les commandes affichées et collez-les dans votre terminal

---

### ÉTAPE 3 — Configurer la clé API Anthropic (pour l'analyse IA)

1. Allez sur https://console.anthropic.com → créez un compte
2. Dans "API Keys" → créez une nouvelle clé (commence par `sk-ant-...`)
3. Sur GitHub, allez dans votre repo → **Settings** → **Secrets and variables** → **Actions**
4. Cliquez **"New repository secret"**
   - Name: `VITE_ANTHROPIC_API_KEY`
   - Value: votre clé `sk-ant-...`
5. Cliquez **"Add secret"**

---

### ÉTAPE 4 — Activer GitHub Pages

1. Dans votre repo GitHub → **Settings** → **Pages**
2. Source: **"GitHub Actions"**
3. Sauvegardez

---

### ÉTAPE 5 — Déployer automatiquement

À chaque fois que vous faites un `git push`, le site se déploie automatiquement !

```bash
git add .
git commit -m "Update"
git push
```

Votre site sera disponible sur :
```
https://VOTRE-USERNAME.github.io/aurum-trader/
```

---

## 💻 DÉVELOPPEMENT EN LOCAL

```bash
# 1. Installer les dépendances
npm install

# 2. Créer votre fichier de config locale
cp .env.example .env.local
# Puis éditez .env.local et mettez votre vraie clé API

# 3. Lancer le serveur de développement
npm run dev
# → Ouvrez http://localhost:5173

# 4. Construire pour la production
npm run build
```

---

## 📁 STRUCTURE DU PROJET

```
aurum-trader/
├── .github/
│   └── workflows/
│       └── deploy.yml        ← Déploiement automatique GitHub Actions
├── src/
│   ├── App.jsx               ← Application principale (dashboard complet)
│   └── main.jsx              ← Point d'entrée React
├── .env.example              ← Template variables d'environnement
├── .gitignore                ← Fichiers ignorés par Git
├── index.html                ← Page HTML principale
├── package.json              ← Dépendances et scripts
├── vite.config.js            ← Configuration Vite
└── README.md                 ← Ce fichier
```

---

## ⚡ FONCTIONNALITÉS

| Fonctionnalité | Description |
|---|---|
| 📊 **Graphique live** | Prix XAU/USD simulé en temps réel, actualisé toutes les 2s |
| ⚡ **Signaux algo** | RSI + MACD + Bollinger Bands → signal BUY/SELL automatique |
| 🔬 **Backtest** | Test de stratégie sur 200 bougies avec courbe d'équité |
| 🌐 **Marchés corrélés** | DXY, S&P500, Pétrole, BTC, US10Y, Argent |
| 📅 **Agenda éco** | Événements macro avec impact prévu sur l'or |
| 🤖 **Analyse IA** | Claude AI analyse la situation en temps réel |

---

## ⚠️ AVERTISSEMENT

Ce projet est à **but éducatif uniquement**. Les prix affichés sont simulés.  
Ce n'est pas un conseil financier. Tradez à vos propres risques.

Pour des données de marché réelles, connectez un flux Bloomberg/Reuters via leur API.

---

## 🛠️ ALTERNATIVE DE DÉPLOIEMENT — VERCEL (encore plus simple)

1. Allez sur https://vercel.com → connectez votre compte GitHub
2. Cliquez "New Project" → importez `aurum-trader`
3. Dans "Environment Variables" → ajoutez `VITE_ANTHROPIC_API_KEY`
4. Cliquez "Deploy" → votre site est en ligne en 2 minutes !
