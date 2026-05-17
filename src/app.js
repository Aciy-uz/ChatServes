const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const rsaRouter = require('./routes/rsa');
const userRouter = require('./routes/user');
const friendRouter = require('./routes/friend');
const messageRouter = require('./routes/message');
const { initSocket } = require('./socket');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// 静态资源：uploads 目录可通过 /uploads/xxx 访问
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =============================================
// 测试路由
// =============================================

// GET /test-db - 测试数据库连接是否正常
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS result');
    res.json({ msg: '数据库连接成功', data: rows[0] });
  } catch (err) {
    console.error('数据库连接失败:', err.message);
    res.status(500).json({ msg: '数据库连接失败', error: err.message });
  }
});

// =============================================
// RSA 加密相关路由
// =============================================

// /rsa/public-key  - 获取 RSA 公钥（前端加密密码用）
// /rsa/decrypt     - RSA 解密接口（传入加密后的 Base64 密文）
app.use('/rsa', rsaRouter);

// =============================================
// 用户相关路由
// =============================================

// /user/captcha  - 获取验证码图片
// /user/login    - 用户登录（RSA 解密密码 + 验证码校验 + JWT 签发）
// /user/register - 用户注册（接收头像图片 + RSA 解密密码 + 验证码校验）
app.use('/user', userRouter);

// =============================================
// 好友相关路由（需要 token）
// =============================================

// /friend/add  - 添加好友（双向关系）
// /friend/list - 获取好友列表
app.use('/friend', friendRouter);

// =============================================
// 消息相关路由（需要 token）
// =============================================

// /message/history - 获取聊天记录
// /message/unread  - 获取未读消息统计
app.use('/message', messageRouter);

// =============================================
// 启动服务（HTTP + WebSocket）
// =============================================

const server = http.createServer(app);
initSocket(server);

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
