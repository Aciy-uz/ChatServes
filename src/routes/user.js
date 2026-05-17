const express = require('express');
const router = express.Router();
const pool = require('../db');
const { decrypt } = require('../utils/rsa');
const { sign, verify } = require('../utils/jwt');
const { createCaptcha } = require('../utils/captcha');
const upload = require('../utils/upload');

// 用内存存储验证码，生产环境建议用 Redis
const captchaStore = new Map();

// GET /user/captcha - 获取验证码图片
router.get('/captcha', (req, res) => {
  const { svg, text } = createCaptcha();
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  captchaStore.set(id, { text, expire: Date.now() + 5 * 60 * 1000 });
  res.json({ id, svg });
});

// POST /user/login - 用户登录
router.post('/login', async (req, res) => {
  try {
    const { username, encrypted, captchaId, captchaCode } = req.body;

    // 1. 验证验证码
    const record = captchaStore.get(captchaId);
    if (!record || Date.now() > record.expire) {
      return res.status(400).json({ code: 400, msg: '验证码已过期' });
    }
    if (captchaCode.toLowerCase() !== record.text) {
      return res.status(400).json({ code: 400, msg: '验证码错误' });
    }
    captchaStore.delete(captchaId);

    // 2. 解密密码
    const password = decrypt(encrypted);

    // 3. 查询用户
    const [rows] = await pool.query(
      'SELECT id, username, nickname, avatar FROM users WHERE username = ? AND password = ?',
      [username, password]
    );
    if (rows.length === 0) {
      return res.status(401).json({ code: 401, msg: '用户名或密码错误' });
    }

    // 4. 签发 token
    const user = rows[0];
    user.avatarUrl = 'http://localhost:3000' + user.avatar;
    const token = sign({ id: user.id, username: user.username });

    res.json({ code: 200, msg: '登录成功', data: { token, user } });
  } catch (err) {
    console.error('登录失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

// POST /user/register - 用户注册（接收头像图片）
router.post('/register', upload.single('avatar'), async (req, res) => {
  try {
    const { username, encrypted, nickname, captchaId, captchaCode } = req.body;

    // 1. 验证验证码
    const record = captchaStore.get(captchaId);
    if (!record || Date.now() > record.expire) {
      return res.status(400).json({ code: 400, msg: '验证码已过期' });
    }
    if (captchaCode.toLowerCase() !== record.text) {
      return res.status(400).json({ code: 400, msg: '验证码错误' });
    }
    captchaStore.delete(captchaId);

    // 2. 解密密码
    const password = decrypt(encrypted);

    // 3. 检查用户名是否已存在
    const [exists] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
    if (exists.length > 0) {
      return res.status(400).json({ code: 400, msg: '用户名已存在' });
    }

    // 4. 处理头像路径
    const avatar = req.file ? '/uploads/' + req.file.filename : '/default-avatar.png';

    // 5. 插入数据库
    const [result] = await pool.query(
      'INSERT INTO users (username, password, nickname, avatar) VALUES (?, ?, ?, ?)',
      [username, password, nickname || username, avatar]
    );

    res.json({ code: 200, msg: '注册成功', data: { id: result.insertId } });
  } catch (err) {
    console.error('注册失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

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

// GET /user/search - 搜索用户（按用户名或昵称模糊匹配）
router.get('/search', auth, async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ code: 400, msg: '请输入搜索关键字' });

    const [rows] = await pool.query(
      `SELECT id, username, nickname, avatar
       FROM users
       WHERE id != ? AND (username LIKE ? OR nickname LIKE ?)
       LIMIT 20`,
      [req.user.id, `%${keyword}%`, `%${keyword}%`]
    );
    res.json({ code: 200, data: rows });
  } catch (err) {
    console.error('搜索用户失败:', err.message);
    res.status(500).json({ code: 500, msg: '服务器错误' });
  }
});

module.exports = router;
