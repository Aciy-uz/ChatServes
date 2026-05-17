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

// POST /friend/request - 发送好友申请
router.post('/request', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId, message = '' } = req.body;

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

    // 检查是否已有待处理的申请（双向）
    const [pending] = await pool.query(
      `SELECT id FROM friend_requests
       WHERE status = 'pending' AND (
         (from_user_id = ? AND to_user_id = ?) OR
         (from_user_id = ? AND to_user_id = ?)
       )`,
      [userId, friendId, friendId, userId]
    );
    if (pending.length > 0) {
      return res.status(400).json({ code: 400, msg: '已有待处理的好友申请' });
    }

    await pool.query(
      'INSERT INTO friend_requests (from_user_id, to_user_id, message) VALUES (?, ?, ?)',
      [userId, friendId, message]
    );

    res.json({ code: 200, msg: '申请已发送' });
  } catch (err) {
    console.error('发送好友申请失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /friend/accept - 接受好友申请
router.post('/accept', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.body;

    // 查找申请
    const [rows] = await pool.query(
      `SELECT * FROM friend_requests WHERE id = ? AND to_user_id = ? AND status = 'pending'`,
      [requestId, userId]
    );
    if (rows.length === 0) {
      return res.status(400).json({ code: 400, msg: '申请不存在或已处理' });
    }

    const request = rows[0];

    // 更新申请状态
    await pool.query(
      "UPDATE friend_requests SET status = 'accepted' WHERE id = ?",
      [requestId]
    );

    // 建立双向好友关系
    await pool.query(
      'INSERT INTO friends (user_id, friend_id) VALUES (?, ?), (?, ?)',
      [request.from_user_id, request.to_user_id, request.to_user_id, request.from_user_id]
    );

    res.json({ code: 200, msg: '已接受好友申请' });
  } catch (err) {
    console.error('接受好友申请失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /friend/reject - 拒绝好友申请
router.post('/reject', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { requestId } = req.body;

    const [result] = await pool.query(
      "UPDATE friend_requests SET status = 'rejected' WHERE id = ? AND to_user_id = ? AND status = 'pending'",
      [requestId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(400).json({ code: 400, msg: '申请不存在或已处理' });
    }

    res.json({ code: 200, msg: '已拒绝好友申请' });
  } catch (err) {
    console.error('拒绝好友申请失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /friend/requests - 获取收到的好友申请列表
router.get('/requests', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT fr.id, fr.from_user_id, fr.message, fr.created_at,
              u.username, u.nickname, u.avatar
       FROM friend_requests fr
       JOIN users u ON fr.from_user_id = u.id
       WHERE fr.to_user_id = ? AND fr.status = 'pending'
       ORDER BY fr.created_at DESC`,
      [req.user.id]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('获取好友申请失败:', err.message);
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

// POST /friend/delete - 删除好友（双向）
router.post('/delete', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { friendId } = req.body;

    await pool.query(
      'DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)',
      [userId, friendId, friendId, userId]
    );

    res.json({ code: 200, msg: '已删除好友' });
  } catch (err) {
    console.error('删除好友失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
