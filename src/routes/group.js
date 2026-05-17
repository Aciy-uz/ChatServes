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

// POST /group/create - 创建群
router.post('/create', auth, async (req, res) => {
  try {
    const { name, members = [] } = req.body;
    if (!name) return res.status(400).json({ code: 400, msg: '请输入群名称' });

    const userId = req.user.id;

    // 创建群
    const [result] = await pool.query(
      'INSERT INTO user_groups (name, owner_id) VALUES (?, ?)',
      [name, userId]
    );
    const groupId = result.insertId;

    // 添加创建者和成员（去重，包含自己）
    const allMembers = [...new Set([userId, ...members])];
    const values = allMembers.map(uid => [groupId, uid]);
    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES ?',
      [values]
    );

    res.json({ code: 200, msg: '创建成功', data: { groupId } });
  } catch (err) {
    console.error('创建群失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /group/list - 获取我所在的群列表
router.get('/list', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT g.id, g.name, g.owner_id, g.created_at
       FROM user_groups g
       JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = ?`,
      [req.user.id]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('获取群列表失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /group/members - 获取群成员列表
router.get('/members', auth, async (req, res) => {
  try {
    const { groupId } = req.query;
    const [rows] = await pool.query(
      `SELECT u.id, u.username, u.nickname, u.avatar
       FROM group_members gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = ?`,
      [groupId]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('获取群成员失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /group/join - 加入群
router.post('/join', auth, async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    // 检查群是否存在
    const [group] = await pool.query('SELECT id FROM user_groups WHERE id = ?', [groupId]);
    if (group.length === 0) {
      return res.status(400).json({ code: 400, msg: '群不存在' });
    }

    // 检查是否已在群中
    const [dup] = await pool.query(
      'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );
    if (dup.length > 0) {
      return res.status(400).json({ code: 400, msg: '已经在群中' });
    }

    await pool.query(
      'INSERT INTO group_members (group_id, user_id) VALUES (?, ?)',
      [groupId, userId]
    );

    res.json({ code: 200, msg: '加入成功' });
  } catch (err) {
    console.error('加入群失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /group/quit - 退出群
router.post('/quit', auth, async (req, res) => {
  try {
    const { groupId } = req.body;
    const userId = req.user.id;

    // 检查是否是群主
    const [group] = await pool.query('SELECT owner_id FROM user_groups WHERE id = ?', [groupId]);
    if (group.length === 0) {
      return res.status(400).json({ code: 400, msg: '群不存在' });
    }
    if (group[0].owner_id === userId) {
      return res.status(400).json({ code: 400, msg: '群主不能退出群，请先转让或解散群' });
    }

    await pool.query(
      'DELETE FROM group_members WHERE group_id = ? AND user_id = ?',
      [groupId, userId]
    );

    res.json({ code: 200, msg: '已退出群' });
  } catch (err) {
    console.error('退出群失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// GET /group/history - 获取群聊天记录（分页）
router.get('/history', auth, async (req, res) => {
  try {
    const { groupId, page = 1, size = 20 } = req.query;
    const offset = (page - 1) * size;

    const [rows] = await pool.query(
      `SELECT gm.id, gm.sender_id, gm.content, gm.type, gm.created_at,
              u.username, u.nickname, u.avatar
       FROM group_messages gm
       JOIN users u ON gm.sender_id = u.id
       WHERE gm.group_id = ?
       ORDER BY gm.created_at DESC
       LIMIT ? OFFSET ?`,
      [groupId, parseInt(size), parseInt(offset)]
    );

    res.json({ code: 200, data: rows.reverse() });
  } catch (err) {
    console.error('获取群聊天记录失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
