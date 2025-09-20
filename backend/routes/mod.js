import { Router } from "express";
import db from "../db.js";

const router = Router();

// メッセージ編集（本文を書き換え、edited_at を更新）
router.patch("/:id", (req, res) => {
  const id = Number(req.params.id);
  const { content } = req.body || {};
  if (!id || !content) return res.status(400).json({ error: "id and content required" });

  const info = db.prepare(`
    UPDATE messages
    SET content = ?, edited_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(content, id);

  if (info.changes === 0) return res.status(404).json({ error: "not found or deleted" });
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id);
  res.json({ message: row });
});

// 論理削除（deleted_at を埋める）
router.delete("/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const info = db.prepare(`
    UPDATE messages
    SET deleted_at = datetime('now')
    WHERE id = ? AND deleted_at IS NULL
  `).run(id);

  if (info.changes === 0) return res.status(404).json({ error: "not found or already deleted" });
  res.json({ ok: true, id });
});

// 復元（deleted_at を NULL に戻す）
router.post("/:id/restore", (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "id required" });

  const info = db.prepare(`
    UPDATE messages
    SET deleted_at = NULL
    WHERE id = ? AND deleted_at IS NOT NULL
  `).run(id);

  if (info.changes === 0) return res.status(404).json({ error: "not found or not deleted" });
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id);
  res.json({ message: row });
});

export default router;

