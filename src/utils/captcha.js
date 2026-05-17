const svgCaptcha = require('svg-captcha');

function createCaptcha() {
  const captcha = svgCaptcha.create({
    size: 4,
    ignoreChars: '0o1ilI',
    noise: 2,
    color: true,
    background: '#f0f0f0',
  });
  return { svg: captcha.data, text: captcha.text.toLowerCase() };
}

module.exports = { createCaptcha };
