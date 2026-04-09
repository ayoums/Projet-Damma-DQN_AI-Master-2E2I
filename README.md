# 🇲🇦 Moroccan Dama — Heritage Edition

> **Deep Reinforcement Learning applied to the Moroccan Dama board game**  
> A fully playable web game powered by a Double DQN neural network running entirely in the browser.

---

## 🎮 Play Now

No installation required. No server needed. The AI runs 100% client-side via TensorFlow.js.

---

## 📖 About the Project

This project was developed as part of the **Master d'Excellence (2E2I)** programme at:

> 🏛️ **Université Chouaïb Doukkali — Faculté des Sciences El Jadida**  
> Module 117 : Intelligence Artificielle appliquée à la physique  
> Supervised by : **Pr. Otmane Houdaif**


## 🧠 How the AI Works

The AI agent was trained using a **Double Deep Q-Network (Double DQN)** with a CNN backbone, following a 3-phase progressive training pipeline:

### Phase A — Imitation Learning (500 episodes)
The neural network first learns by **imitating a Minimax algorithm (depth=2)**. This gives the agent solid tactical foundations before any autonomous exploration.

### Phase B — Self-Play DQN (1500 episodes)
The agent plays **against itself**, discovering strategies beyond what Minimax could teach. Exploration decays from ε=0.4 → ε=0.05 over 70% of training.

### Phase C — Curriculum Learning (2000 episodes)
The agent faces **progressively harder opponents**:
- Level 0: Random opponent
- Level 1: Minimax depth=1
- Level 2: Minimax depth=2

The level advances automatically when the agent exceeds **60% win rate on 2 consecutive evaluations**.

### 📊 Results

| Opponent | Win Rate |
|----------|----------|
| Random player | **~72%** |
| Minimax d=1 | **100%** |
| Minimax d=2 | Competitive (draws/losses) |

Total training time: **197 minutes** on Google Colab GPU (4000 episodes)

---

## 🏗️ Architecture

```
Input (8×8×1 board tensor)
      ↓
Conv2D (32 filters, 3×3, ReLU)
      ↓
Conv2D (64 filters, 3×3, ReLU)
      ↓
GlobalAveragePooling2D
      ↓
Dense (256, ReLU)
      ↓
Dense (128, ReLU)
      ↓
Output (4096 Q-values — one per possible move)
```

Two identical networks run in parallel (Double DQN):
- **Main network** — updated every 2 steps
- **Target network** — frozen, synced every 500 steps

### Key Hyperparameters

| Parameter | Value | Purpose |
|-----------|-------|---------|
| γ (discount) | 0.95 | Long-term strategic vision |
| Batch size | 512 | Stable gradient estimation |
| Replay buffer | 100,000 | Break temporal correlations |
| Target update | every 500 steps | Training stability |
| Learning rate | 2×10⁻⁴ (with warmup) | Smooth convergence |
| R_WIN | +1.0 | Win reward |
| R_CAPTURE | +0.3 | Capture reward |
| R_PROMOTE | +0.5 | King promotion reward |
| R_STEP | −0.002 | Encourages aggressive play |

---

## 🎮 Game Features

- ♟️ Full **Moroccan Dama** rules (mandatory captures, multi-jump chains, king promotion)
- 📅 **Daily Challenge** mode
- 🏪 **Item Shop** — unlock board skins and piece styles with earned coins
- 📊 **Stats & Achievements** system
- 💡 **Hint** and **Undo** actions
- 🔊 Web Audio sound effects
- 📱 Fully responsive (mobile + desktop)

---

## 🗂️ Project Structure

```
DamaProject - v2/
├── index.html              # Main entry point
├── sw.js                   # Service Worker (model caching)
├── js/
│   ├── main.js             # Game loop & core logic
│   ├── ai.js               # AI interface & worker bridge
│   ├── model-worker.js     # TF.js inference in Web Worker
│   ├── board.js            # Board rendering & interaction
│   ├── ui.js               # Screens, sounds, achievements
│   ├── state.js            # Persistent game state
│   └── store.js            # Shop logic & item catalogue
├── css/
│   ├── themes.css          # Board & piece skin themes
│   ├── ui.css              # Layout & UI components
│   └── board.css           # Board grid & piece animations
├── model/
│   ├── model.json          # TensorFlow.js model topology
│   └── group1-shard1of1.bin # Trained model weights
└── assets/                 # Images, icons, textures
```

---

## 🚀 Run Locally

```bash

# Start a local server (Python required)
python -m http.server 8000

# Open in browser
http://localhost:8000
```

> ⚠️ Must be served over HTTP — opening `index.html` directly won't load the AI model.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| AI Training | Python, TensorFlow/Keras, Gymnasium |
| AI Inference | TensorFlow.js (WASM backend, Web Worker) |
| Frontend | Vanilla JS (ES Modules), HTML5, CSS3 |
| Fonts | Google Fonts (Cinzel + Nunito) |
| Hosting | GitHub Pages |
| Training Platform | Google Colab (GPU) |

---

## 📄 License

This project was developed for academic purposes at Université Chouaïb Doukkali, FS El Jadida.  
© 2026 — G4 Team, Master 2E2I.

---

<div align="center">
  <strong>🇲🇦 Built with pride at Faculté des Sciences El Jadida</strong>
</div>
