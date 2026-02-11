const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../database/db');
const OTPAuth = require('otpauth');
const QRCode = require('qrcode');

const router = express.Router();

// 查询 2FA 是否已启用（不需要认证）
router.get('/2fa-status', async (req, res) => {
  try {
    const user = await dbGet('SELECT totp_enabled FROM users WHERE username = ?', ['admin']);
    res.json({ success: true, enabled: !!(user && user.totp_enabled) });
  } catch (error) {
    res.json({ success: true, enabled: false });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password, totpCode } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: '用户名和密码不能为空'
      });
    }

    const user = await dbGet('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '用户名或密码错误'
      });
    }

    // 检查是否启用了 2FA
    if (user.totp_enabled && user.totp_secret) {
      if (!totpCode) {
        // 密码正确但需要 2FA 验证码
        return res.json({
          success: false,
          requires2FA: true,
          message: '请输入两步验证码'
        });
      }

      // 验证 TOTP
      const totp = new OTPAuth.TOTP({
        secret: OTPAuth.Secret.fromBase32(user.totp_secret),
        algorithm: 'SHA1',
        digits: 6,
        period: 30
      });

      const delta = totp.validate({ token: totpCode, window: 1 });
      if (delta === null) {
        return res.status(401).json({
          success: false,
          requires2FA: true,
          message: '验证码错误'
        });
      }
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'default-secret-key',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        username: user.username
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// 生成 2FA 密钥和二维码（需要认证）
router.post('/2fa-setup', async (req, res) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: '未授权' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key');
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 生成新的 TOTP 密钥
    const secret = new OTPAuth.Secret({ size: 20 });
    const totp = new OTPAuth.TOTP({
      issuer: 'CF-CDN-Optimizer',
      label: user.username,
      secret: secret,
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    });

    const uri = totp.toString();
    const qrDataUrl = await QRCode.toDataURL(uri);

    // 临时保存密钥（未启用，等待用户验证后才启用）
    await dbRun('UPDATE users SET totp_secret = ? WHERE id = ?', [secret.base32, user.id]);

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrDataUrl
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 验证并启用 2FA（需要认证）
router.post('/2fa-enable', async (req, res) => {
  try {
    const { code } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: '未授权' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key');
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user || !user.totp_secret) {
      return res.status(400).json({ success: false, message: '请先生成密钥' });
    }

    // 验证用户输入的验证码
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(user.totp_secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) {
      return res.status(400).json({ success: false, message: '验证码错误，请重试' });
    }

    // 启用 2FA
    await dbRun('UPDATE users SET totp_enabled = 1 WHERE id = ?', [user.id]);

    res.json({ success: true, message: '两步验证已启用' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 关闭 2FA（需要认证）
router.post('/2fa-disable', async (req, res) => {
  try {
    const { password } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: '未授权' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key');
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(404).json({ success: false, message: '用户不存在' });
    }

    // 验证密码
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ success: false, message: '密码错误' });
    }

    await dbRun('UPDATE users SET totp_enabled = 0, totp_secret = NULL WHERE id = ?', [user.id]);

    res.json({ success: true, message: '两步验证已关闭' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 修改密码
router.post('/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const token = req.headers.authorization?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({
        success: false,
        message: '未授权'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default-secret-key');
    const user = await dbGet('SELECT * FROM users WHERE id = ?', [decoded.id]);

    const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: '原密码错误'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await dbRun('UPDATE users SET password = ? WHERE id = ?', [hashedPassword, user.id]);

    res.json({
      success: true,
      message: '密码修改成功'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

module.exports = router;
