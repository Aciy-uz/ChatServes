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

// POST /friend/add - 添加好友（双向）
router.post('/add', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId } = req.body;

    // 不能添加自己
    if (userId === friendId) {
      return res.status(400).json({ code: 400, msg: '不能添加自己为好友' });
    }

    // 检查对方是否存在
    const [exists] = await pool.query('SELECT id FROM users WHERE id = ?', [friendId]);
    if (exists.length === 0) {
      return res.status(400).json({ code: 400, msg: '用户不存在' });
    }

    // 检查是否已经是好友
    const [dup] = await pool.query(
      'SELECT id FROM friends WHERE user_id = ? AND friend_id = ?',
      [userId, friendId]
    );
    if (dup.length > 0) {
      return res.status(400).json({ code: 400, msg: '已经是好友了' });
    }

    // 插入双向好友关系
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)',
      [userId, friendId, friendId, userId]
    );

    res.json({ code: 200, msg: '添加成功' });
  } catch (err) {
    console.error('添加好友失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /friend/list - 获取好友列表
router.get('/list', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.nickname, u.avatar, u.last_online
       FROM friends f JOIN users u ON f.friend_id = u.id
       WHERE f.user_id = ?`,
      [req.user.id]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('获取好友列表失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
