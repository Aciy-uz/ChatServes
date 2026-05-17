const { Server } = require('socket.io');
const { verify } = require('../utils/jwt');
const pool = require('../db');

// 在线用户映射: userId -> socketId
const onlineUsers = new Map();

function initSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // 连接认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('未提供 token'));
    try {
      socket.user = verify(token);
      next();
    } catch {
      next(new Error('token 无效或已过期'));
    }
  });

  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`用户上线: ${userId} (socket: ${socket.id})`);

    // 注册在线状态
    onlineUsers.set(userId, socket.id);

    // 自动加入所有群的房间
    try {
      const [groups] = await pool.query(
        'SELECT group_id FROM group_members WHERE user_id = ?',
        [userId]
      );
      for (const g of groups) {
        socket.join(`group_${g.group_id}`);
      }
    } catch (err) {
      console.error('加入群房间失败:', err.message);
    }

    // 广播上线通知
    socket.broadcast.emit('user_online', { userId });

    // 发送当前在线用户列表给新连接的用户
    socket.emit('online_users', Array.from(onlineUsers.keys()));

    // 推送未读消息
    try {
      const [unread] = await pool.query(
        'SELECT id, sender_id, content, type, created_at FROM messages WHERE receiver_id = ? AND is_read = 0',
        [userId]
      );
      if (unread.length > 0) {
        // 按发送者分组
        const grouped = {};
        for (const msg of unread) {
          if (!grouped[msg.sender_id]) grouped[msg.sender_id] = [];
          grouped[msg.sender_id].push({
            id: msg.id,
            senderId: msg.sender_id,
            content: msg.content,
            type: msg.type,
            createdAt: msg.created_at,
          });
        }
        socket.emit('unread_messages', grouped);
      }
    } catch (err) {
      console.error('推送未读消息失败:', err.message);
    }

    // 私聊消息
    socket.on('private_message', async ({ receiverId, content, type = 'text' }) => {
      try {
        console.log(`[消息] 用户${userId} -> 用户${receiverId}: ${content}`);
        console.log(`[在线用户]`, Array.from(onlineUsers.entries()));

        // 存入数据库
        const [result] = await pool.query(
          'INSERT INTO messages (sender_id, receiver_id, content, type) VALUES (?, ?, ?, ?)',
          [userId, receiverId, content, type]
        );

        const message = {
          id: result.insertId,
          senderId: userId,
          receiverId,
          content,
          type,
          createdAt: new Date(),
        };

        // 发给接收者（如果在线）
        const receiverSocketId = onlineUsers.get(receiverId);
        console.log(`[接收者socket] receiverId=${receiverId}, socketId=${receiverSocketId}`);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('private_message', message);
          console.log(`[推送] 消息已推送给用户${receiverId}`);
        } else {
          console.log(`[离线] 用户${receiverId}不在线，消息已存库`);
        }

        // 回执给发送者
        socket.emit('private_message', message);
      } catch (err) {
        console.error('发送消息失败:', err.message);
        socket.emit('error_message', { msg: '消息发送失败' });
      }
    });

    // 消息已读
    socket.on('message_read', async ({ senderId }) => {
      try {
        await pool.query(
          'UPDATE messages SET is_read = 1 WHERE sender_id = ? AND receiver_id = ? AND is_read = 0',
          [senderId, userId]
        );

        // 通知发送者消息已被读
        const senderSocketId = onlineUsers.get(senderId);
        if (senderSocketId) {
          io.to(senderSocketId).emit('messages_read', { readerId: userId });
        }
      } catch (err) {
        console.error('标记已读失败:', err.message);
      }
    });

    // 消息撤回通知
    socket.on('message_recall', async ({ messageId, receiverId }) => {
      try {
        // 通知接收者消息已撤回
        const receiverSocketId = onlineUsers.get(receiverId);
        if (receiverSocketId) {
          io.to(receiverSocketId).emit('message_recall', { messageId, senderId: userId });
        }
      } catch (err) {
        console.error('撤回通知失败:', err.message);
      }
    });

    // 群聊消息
    socket.on('group_message', async ({ groupId, content, type = 'text' }) => {
      try {
        // 检查用户是否在群中
        const [member] = await pool.query(
          'SELECT * FROM group_members WHERE group_id = ? AND user_id = ?',
          [groupId, userId]
        );
        if (member.length === 0) {
          return socket.emit('error_message', { msg: '你不在该群中' });
        }

        // 存入数据库
        const [result] = await pool.query(
          'INSERT INTO group_messages (group_id, sender_id, content, type) VALUES (?, ?, ?, ?)',
          [groupId, userId, content, type]
        );

        const message = {
          id: result.insertId,
          groupId,
          senderId: userId,
          content,
          type,
          createdAt: new Date(),
        };

        // 广播给群内所有成员（包括发送者）
        io.to(`group_${groupId}`).emit('group_message', message);
      } catch (err) {
        console.error('发送群消息失败:', err.message);
        socket.emit('error_message', { msg: '群消息发送失败' });
      }
    });

    // 断开连接
    socket.on('disconnect', async () => {
      console.log(`用户下线: ${userId}`);
      onlineUsers.delete(userId);

      // 更新最后在线时间
      try {
        await pool.query('UPDATE users SET last_online = NOW() WHERE id = ?', [userId]);
      } catch (err) {
        console.error('更新最后在线时间失败:', err.message);
      }

      // 广播下线通知
      socket.broadcast.emit('user_offline', { userId, lastOnline: new Date() });
    });
  });

  return io;
}

module.exports = { initSocket, onlineUsers };
