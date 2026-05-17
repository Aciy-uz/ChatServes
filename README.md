# ChatServer - 仿微信即时通讯后端

基于 Express + MySQL + Socket.io 的即时通讯后端服务，支持私聊、群聊、好友管理、消息撤回等功能。

## 技术栈

- **运行时**：Node.js
- **Web 框架**：Express 5
- **数据库**：MySQL（mysql2/promise）
- **实时通讯**：Socket.io
- **认证**：JWT（jsonwebtoken）
- **加密**：RSA（前端加密密码）
- **文件上传**：Multer

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

在项目根目录创建 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=你的数据库密码
DB_NAME=graduation
JWT_SECRET=你的JWT密钥
```

### 3. 初始化数据库

在 MySQL 中创建数据库和表：

```sql
CREATE DATABASE IF NOT EXISTS graduation DEFAULT CHARSET utf8mb4;
USE graduation;

-- 用户表
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  nickname VARCHAR(50) DEFAULT NULL,
  avatar VARCHAR(255) DEFAULT '/default-avatar.png',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_online TIMESTAMP DEFAULT NULL
);

-- 好友关系表
CREATE TABLE friends (
  id INT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  friend_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (friend_id) REFERENCES users(id)
);

-- 好友申请表
CREATE TABLE friend_requests (
  id INT PRIMARY KEY AUTO_INCREMENT,
  from_user_id INT NOT NULL,
  to_user_id INT NOT NULL,
  status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
  message VARCHAR(200) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_user_id) REFERENCES users(id),
  FOREIGN KEY (to_user_id) REFERENCES users(id)
);

-- 私聊消息表
CREATE TABLE messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  sender_id INT NOT NULL,
  receiver_id INT NOT NULL,
  content TEXT NOT NULL,
  type ENUM('text', 'image', 'file') DEFAULT 'text',
  is_read TINYINT(1) DEFAULT 0,
  is_recalled TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

-- 群表
CREATE TABLE user_groups (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  owner_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 群成员表
CREATE TABLE group_members (
  group_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, user_id),
  FOREIGN KEY (group_id) REFERENCES user_groups(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 群消息表
CREATE TABLE group_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  group_id INT NOT NULL,
  sender_id INT NOT NULL,
  content TEXT NOT NULL,
  type ENUM('text', 'image', 'file') DEFAULT 'text',
  is_recalled TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES user_groups(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);
```

### 4. 启动服务

```bash
npm start
```

服务默认运行在 `http://localhost:3000`。

## 功能特性

### 用户系统
- 用户注册（支持头像上传）
- 用户登录（RSA 加密密码 + 验证码 + JWT）
- 用户搜索（按用户名/昵称模糊匹配）
- 修改昵称和头像

### 好友系统
- 好友申请 → 接受/拒绝流程
- 好友列表（含未读消息数）
- 删除好友

### 私聊
- 基于 WebSocket 的实时消息收发
- 支持文字、图片、文件发送
- 消息撤回（2 分钟内）
- 消息已读/未读状态
- 离线消息推送

### 群聊
- 创建群、加入/退出群
- 群主踢人、转让群主、解散群
- 群消息实时广播
- 群消息撤回

## 项目结构

```
chatServer/
├── src/
│   ├── app.js              # 主入口，Express + Socket.io 初始化
│   ├── db/
│   │   ├── config.js       # 数据库配置
│   │   └── index.js        # 数据库连接池
│   ├── routes/
│   │   ├── rsa.js          # RSA 加密路由
│   │   ├── user.js         # 用户路由（注册/登录/搜索/资料）
│   │   ├── friend.js       # 好友路由（申请/列表/删除）
│   │   ├── message.js      # 消息路由（历史/未读/撤回/上传）
│   │   └── group.js        # 群聊路由（创建/管理/撤回）
│   ├── socket/
│   │   └── index.js        # Socket.io 事件处理
│   ├── utils/
│   │   ├── jwt.js          # JWT 签发/验证
│   │   ├── rsa.js          # RSA 密钥生成/解密
│   │   ├── captcha.js      # 验证码生成
│   │   └── upload.js       # Multer 文件上传配置
│   ├── keys/               # RSA 密钥文件
│   └── uploads/            # 上传文件存储目录
├── test.html               # 接口测试页面
├── api-doc.html            # API 接口文档
├── package.json
└── .env                    # 环境变量配置
```

## 接口文档

启动服务后，在浏览器打开 `api-doc.html` 查看完整的接口文档，包含：

- 30+ REST API 接口详细说明
- 10 个 WebSocket 事件定义
- 7 张数据库表结构

也可以直接访问 [api-doc.html](./api-doc.html) 查看。

## WebSocket 连接

```javascript
// 浏览器端
const socket = io('http://localhost:3000', {
  auth: { token: 'your-jwt-token' }
});

// 发送私聊消息
socket.emit('private_message', { receiverId: 2, content: '你好', type: 'text' });

// 接收消息
socket.on('private_message', (msg) => {
  console.log(msg); // { id, senderId, receiverId, content, type, createdAt }
});

// 发送群消息
socket.emit('group_message', { groupId: 1, content: '大家好', type: 'text' });
```

## License

MIT
