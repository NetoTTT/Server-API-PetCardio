const express = require("express");
const { auth } = require("firebase-admin"); // Assumindo que você já configurou o Firebase Admin SDK

const router = express.Router();

// Rota para cadastro de usuário
router.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  try {
    try {
      await auth.getUserByEmail(email);
      return res.status(400).json({ message: "Email já cadastrado!" });
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        const user = await auth.createUser({
          email,
          password,
        });
        return res.status(201).json({ message: "Usuário criado com sucesso", user });
      } else {
        throw error;
      }
    }
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Rota para login de usuário
router.post("/login", async (req, res) => {
  const { token } = req.body;
  try {
    const decodedToken = await auth.verifyIdToken(token);
    const user = await auth.getUser(decodedToken.uid);
    res.status(200).json({ message: "Login bem-sucedido", user });
  } catch (error) {
    res.status(400).json({ message: "Token inválido ou expirado" });
  }
});

module.exports = router;
