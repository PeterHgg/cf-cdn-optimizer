const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../database/db');

const router = express.Router();

// 查询令牌是否已启用（不需要认证）
router.get('/token-status', async (req, res) => {
  try {
    const row = await dbGet("SELECT value FROM settings WHERE key = 'panel_token'");
    res.json({ success: true, enabled: !!(row && row.value) });
  } catch (error) {
    res.json({ success: true, enabled: false });
  }
});

// 验证6位数字令牌（不需要认证）
router.post('/verify-token', async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: '请输入访问令牌' });
    }

    const row = await dbGet("SELECT value FROM settings WHERE key = 'panel_token'");
    if (!row || !row.value) {
      // 未设置令牌，直接通过
      return res.json({ success: true });
    }

    if (token === row.value) {
      return res.json({ success: true });
    }

    return res.status(401).json({ success: false, message: '访问令牌错误' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 登录
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

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
