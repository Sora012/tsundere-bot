# 🌸 Tsundere Bot
ツンデレAIチャットボット（Node.js + Express + SQLite）

![Node.js](https://img.shields.io/badge/Node.js-18.x-green)
![Express](https://img.shields.io/badge/Express.js-4.x-lightgrey)
![SQLite](https://img.shields.io/badge/SQLite-3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🚀 セットアップ
```bash
git clone https://github.com/Sora012/tsundere-bot.git
cd tsundere-bot
npm install
node backend/server.js
```
## 🛠️ 機能一覧
- 好感度システム  
  - 本来仕様: +5  
  - デモ仕様: +20（README で明記済み）  
  - negative → -5  
  - cheat（浮気関連）→ 強制0  
  - nsfw → 好感度80未満なら拒否、80以上なら照れながら甘受  
- 会話履歴保存（リロード後も残る）  
- 編集・削除機能（ユーザー & Bot）  
- アイコン変更機能（localStorage保存）  
- NSFWワード対応  

## 📸 スクリーンショット
![チャット画面のスクリーンショット](docs/screenshot.png)

📖 学び・ポイント
- Node.js/Express でのAPI設計
- SQLiteでの履歴保存と操作
- フロントエンドとバックエンドの連携
- GitHubでの公開・ポートフォリオ化

🌐 [English README](README.en.md)　