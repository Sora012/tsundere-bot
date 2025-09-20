import { Router } from "express";
import db from "../db.js";

const router = Router();

router.get("/", (req, res) => {
  const { conversationId = "default", limit = 50 } = req.query;

  const sql = `
    SELECT id, role, content, mood, created_at, edited_at, deleted_at
    FROM messages
    WHERE conversation_id = ?
      AND (deleted_at IS NULL OR deleted_at = '')
    ORDER BY id DESC
    LIMIT ?
  `;

  const rows = db.prepare(sql).all(conversationId, Number(limit));
  res.json({ messages: rows });
});

export default router;
