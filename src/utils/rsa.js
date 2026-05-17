const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const keysDir = path.join(__dirname, '..', 'keys');
const publicKey = fs.readFileSync(path.join(keysDir, 'public.pem'), 'utf-8');
const privateKey = fs.readFileSync(path.join(keysDir, 'private.pem'), 'utf-8');

function decrypt(encryptedBase64) {
  const buffer = Buffer.from(encryptedBase64, 'base64');
  return crypto.privateDecrypt(
    { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
    buffer
  ).toString('utf-8');
}

module.exports = { publicKey, decrypt };
