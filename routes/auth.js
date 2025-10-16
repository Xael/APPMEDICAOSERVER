const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { PrismaClient } = require('@prisma/client');
const { protect } = require('../middleware/auth');
const prisma = new PrismaClient();

// ==========================================================
// 🔑 Função utilitária para gerar JWT
// ==========================================================
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

// ==========================================================
// 🟢 LOGIN - /api/auth/login
// ==========================================================
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Por favor, informe e-mail e senha.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    if (user && (await bcrypt.compare(password, user.password))) {
      res.json({
        access_token: generateToken(user.id),
        user: { id: user.id, email: user.email, role: user.role },
      });
    } else {
      res.status(401).json({ message: 'Credenciais inválidas.' });
    }
  } catch (error) {
    console.error('Erro no login:', error);
    res.status(500).json({ message: 'Erro interno no login.' });
  }
});

// ==========================================================
// 👤 ROTA: Usuário logado atual
// ==========================================================
router.get('/me', protect, (req, res) => {
  res.status(200).json(req.user);
});

// ==========================================================
// 📨 SOLICITAR RECUPERAÇÃO DE SENHA
// ==========================================================
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Informe um e-mail válido.' });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Resposta genérica (não revelar se o e-mail existe)
      return res.status(200).json({ message: 'Se o e-mail existir, um link será enviado.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutos

    await prisma.user.update({
      where: { email },
      data: { resetToken: token, resetTokenExpires: expires },
    });

    // Configurar transporte de e-mail
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: `"CRB Serviços" <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Recuperação de senha - CRB Serviços',
      html: `
        <p>Olá,</p>
        <p>Você solicitou redefinir sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha (válido por 30 minutos):</p>
        <p><a href="${resetLink}" style="color:#352f91;font-weight:bold;">Redefinir senha</a></p>
        <p>Se você não solicitou essa redefinição, ignore este e-mail.</p>
      `,
    });

    res.status(200).json({ message: 'Se o e-mail existir, um link será enviado.' });
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    res.status(500).json({ message: 'Erro ao enviar e-mail.', error: error.message });
  }
});

// ==========================================================
// 🔄 REDEFINIR SENHA
// ==========================================================
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token e nova senha são obrigatórios.' });
  }

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpires: { gt: new Date() },
      },
    });

    if (!user) {
      return res.status(400).json({ message: 'Token inválido ou expirado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpires: null,
      },
    });

    res.json({ message: 'Senha redefinida com sucesso.' });
  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    res.status(500).json({ message: 'Erro interno ao redefinir senha.', error: error.message });
  }
});

module.exports = router;
