const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Obter a variável de ambiente com as credenciais
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Inicializar o Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

// Referência para o Firebase Auth
const auth = admin.auth();

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await auth.createUser({
      email,
      password,
    });
    res.status(201).json({ message: "Usuário criado com sucesso", user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Rota para login de usuário (com verificação de credenciais)
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await admin.auth().getUserByEmail(email);

    res.status(200).json({ message: "Login bem-sucedido", user });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
