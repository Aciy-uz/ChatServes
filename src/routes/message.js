const express = require('express');
const router = express.Router();
const pool = require('../db');
const { verify } = require('../utils/jwt');

// 验证 token 的中间件
function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 401, msg: '未登录' });
  try {
    req.user = verify(token);
    next();
  } catch {
    res.status(401).json({ code: 401, msg: 'token 无效或已过期' });
  }
}

// GET /message/history - 获取与某好友的聊天记录（分页）
router.get('/history', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId, page = 1, size = 20 } = req.query;
    const offset = (page - 1) * size;

    const [rows] = await pool.query(
      `SELECT id, sender_id, receiver_id, content, type, is_read, created_at
       FROM messages
       WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [userId, friendId, friendId, userId, parseInt(size), parseInt(offset)]
    );

    res.json({ code: 200, data: rows.reverse() });
  } catch (err) {
    console.error('获取聊天记录失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /message/unread - 获取未读消息统计（按发送者分组）
router.get('/unread', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT sender_id, COUNT(*) as count
       FROM messages
       WHERE receiver_id = ? AND is_read = 0
       GROUP BY sender_id`,
      [req.user.id]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('获取未读消息失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
