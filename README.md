# ChatServer - 仿微信即时通讯后端

基于 Express + MySQL + Socket.io 的即时通讯后端服务。

> 桌面端：[chatDesktop](https://github.com/Aciy-uz/chatDesktop)

---

## 项目概述

这是一个基于 Electron + Vue3 的 Windows 桌面 IM 应用，主要目的是还原即时通讯的核心技术链路，并重点攻克三个真实开发痛点：**断网下历史消息不可见**、**弱网重连时消息丢失**、**登录密码明文传输风险**。系统覆盖登录、好友、私聊/群聊、消息撤回、文件传输等基础功能。

## 技术栈

| 端 | 技术 |
|---|------|
| 前端 | Electron + Vue3 + TypeScript + SQLite + Socket.io + RSA |
| 后端 | Node.js + Express 5 + MySQL（mysql2/promise 连接池）+ Socket.io + JWT + RSA + Multer + svg-captcha |

## 核心工作与演进过程

### 1. 离线消息存储

最初所有消息只存后端 MySQL，断网后前端聊天界面完全空白，体验很差。

改为**本地优先架构**：在 Electron 主进程中封装 SQLite 模块，每条消息先存入本地数据库，再通过 Socket 发送。网络恢复后自动拉取缺失消息，按时间戳合并去重；渲染进程通过 IPC 调用 DB 模块，避免界面卡顿。

### 2. 弱网重连与消息可靠性

直接使用 Socket.io 默认配置时，网络闪断后虽能重连成功，但重连期间发出的消息会丢失。

增加**心跳检测**（每 25 秒 ping/pong）和**消息确认队列**：每条消息生成唯一 ID 存入 pending 队列，收到服务端回执后移出；超时未回执则自动重发。重连后刷新队列，并利用接收端去重表过滤重复消息。

### 3. 密码传输安全

初期采用明文 POST 登录，存在被抓包风险。借鉴本校教务系统的做法：前端用 RSA 公钥加密密码（JSEncrypt），后端用 Node.js crypto 模块的 `privateDecrypt` 解密（RSA_PKCS1_OAEP_PADDING + SHA256），再与数据库比对；RSA 密钥对以 PEM 文件存储在服务端，公钥通过接口下发给前端。

JWT token 存储在 Electron 的 sessionStorage 中，退出登录时主动销毁。

### 4. Socket.io 实时通讯架构（后端）

- 服务端维护在线用户映射表（`userId → socketId`），用户上线时自动加入其所有群聊的 room（`group_{id}`），并推送离线期间的未读消息（按发送者分组）。
- **私聊消息流程**：客户端发送 → 服务端持久化到 MySQL → 通过 socketId 定向推送给接收者 → 同时回执给发送者；接收者不在线时消息存库，上线后自动拉取。
- **群聊消息**通过 Socket.io 的 room 机制广播：发送前校验群成员身份，消息存库后 emit 到 `group_{id}` 房间，所有成员实时接收。
- **消息已读机制**：接收者打开聊天时触发 `message_read` 事件，服务端批量更新 `is_read` 字段，并通过 socket 通知发送者。

### 5. 好友系统与群聊管理（后端）

- 好友关系采用**双向存储**（A→B 和 B→A 各一条记录），支持申请→接受/拒绝完整流程，申请时校验重复和待处理状态。
- 好友列表查询通过 JOIN 关联用户表，并用**子查询实时统计每个好友的未读消息数**，一次请求返回完整数据。
- 群聊权限模型：群主可踢人、转让群主、解散群（级联删除群消息和成员记录）；普通成员可加入/退出群，退出前校验是否为群主。

### 6. 消息撤回与文件上传

- 消息撤回采用**软删除**（`is_recalled` 字段），后端校验发送者身份和 2 分钟时间窗口，前端直接隐藏超时后的"撤回"按钮。
- 撤回通过 WebSocket 实时通知对方：私聊撤回通知接收者，群聊撤回广播到群房间。
- 文件上传基于 Multer，支持图片和通用文件（10MB 限制），上传后返回文件 URL、类型和大小信息。

### 7. 其他工程工作

- 基于 Vue3 组合式 API + TypeScript 开发消息列表、好友列表等组件，利用 `<script setup>` 减少样板代码。
- 后端配置 JWT 认证（REST API 通过 Authorization 请求头校验，WebSocket 在握手阶段通过 `auth.token` 中间件验证）、Multer 文件上传、图形验证码（svg-captcha，5 分钟过期）、CORS 跨域。
- 后端共实现 **30+ REST API 接口**（涵盖用户、好友、消息、群聊、RSA 五大模块），**10 个 WebSocket 事件**，设计 **7 张数据库表**。

## 取得成果

- 完全断开 Wi-Fi 后，仍可查看最近 **500 条历史消息**；重连后 **3 秒内**自动补全聊天记录，无重复。
- 模拟弱网（限速 100KB/s，丢包 10%），消息最终到达率 **100%**，无乱序，重复消息由前端去重表过滤。
- 登录抓包验证：密码字段为 RSA 密文（OAEP+SHA256），无法直接还原，安全级别与本校教务系统一致。
- 群聊支持实时消息广播、撤回、成员管理（踢人/转让/解散），权限校验覆盖所有敏感操作。
- 好友列表一次请求返回完整信息（含未读消息数），减少前端请求次数，提升加载性能。

---

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
│   │   ├── user.js         # 用户路由
│   │   ├── friend.js       # 好友路由
│   │   ├── message.js      # 消息路由
│   │   └── group.js        # 群聊路由
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
└── package.json
```

## License

MIT
