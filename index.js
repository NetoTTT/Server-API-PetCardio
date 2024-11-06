const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");

const app = express();
const PORT = 3000;

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Inicializar o Firebase Admin SDK
const serviceAccount = require("./adminasdk/petcardio-9cabf-firebase-adminsdk-yrafq-831960aa46.json");

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
    // Aqui, você precisa autenticar o usuário via Firebase Authentication SDK no frontend
    // Depois, enviar o token JWT gerado pelo login para essa rota, onde você verificará o token.

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
