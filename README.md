# Tsundere Bot

This is a demo Tsundere-style chatbot built with **Node.js + Express + SQLite**.

## Demo Behavior vs Real Spec
- positive: **+20（デモ）** / 本来は **+5**
- negative: -5
- cheat: 強制0（冷徹返答固定）
- nsfw: affection < 80 → 0 & 強拒否 / ≥ 80 → 維持して恥ずかしがりつつ甘受

## Getting Started
```bash
npm install
node backend/server.js
## スクリーンショット
![チャット画面](docs/screenshot.png)
