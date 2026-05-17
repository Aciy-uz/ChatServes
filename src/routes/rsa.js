const express = require('express');
const router = express.Router();
const { publicKey, decrypt } = require('../utils/rsa');

// GET /rsa/public-key - 获取 RSA 公钥，前端用公钥加密密码
router.get('/public-key', (req, res) => {
  res.json({ publicKey });
});

// POST /rsa/decrypt - RSA 解密，传入加密后的 Base64 密文，返回解密结果
router.post('/decrypt', (req, res) => {
  try {
    const { encrypted } = req.body;
    const decrypted = decrypt(encrypted);
    res.json({ msg: '解密成功', decrypted });
  } catch (err) {
    res.status(400).json({ msg: '解密失败', error: err.message });
  }
});

module.exports = router;
