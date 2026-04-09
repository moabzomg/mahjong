# 🀄 Mahjong AI

A fully playable 4-player Mahjong game with AI opponents featuring distinct strategies.

## Features
- 🎮 Play against 3 AI opponents simultaneously
- 🤖 4 unique AI strategies: Aggressive Dragon, Defensive Turtle, Chaotic Monkey, Greedy Panda
- ✨ Tenpai detection (shows when you're one tile away from winning)
- 🏆 Win detection: Tsumo (self-draw) and Ron (claiming discard)
- 🎨 Beautiful mahjong table aesthetic with authentic tile symbols

## AI Strategies
| Strategy | Description |
|----------|-------------|
| 🐉 Aggressive Dragon | Discards isolated tiles fast, goes for speed wins |
| 🐢 Defensive Turtle | Prefers safe discards, avoids dangerous tiles |
| 🐒 Chaotic Monkey | Completely random — utterly unpredictable |
| 🐼 Greedy Panda | Evaluates all discard options mathematically |

## How to Play
1. Select "Start Game" — you are dealt 13 tiles automatically
2. A tile is drawn for you each turn
3. **Click a tile** to select it, **click again** (or press "Discard") to discard it
4. If an AI discards a tile you can complete a winning hand with, a **"Claim Discard (Ron!)"** button appears — click it to win!
5. If you draw a tile that completes your hand, you win automatically (Tsumo)

## Deploy to Vercel

```bash
npm install
npm run dev       # local dev
npm run build     # production build
```

Then connect to Vercel:
1. Push to GitHub
2. Import repo on vercel.com
3. Vercel auto-detects Vite — click Deploy!

## Tech Stack
- React 18 + Vite
- Pure CSS (no UI library)
- Custom game engine with full Mahjong win detection
