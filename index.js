const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Configurar CORS
app.use(cors()); // Isso permite que todas as origens acessem sua API. Se precisar restringir, configure com opções.

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Inicializar o Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const auth = admin.auth();

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Tenta verificar se o e-mail já está registrado
    try {
      await auth.getUserByEmail(email);
      // Se o usuário for encontrado, significa que o e-mail já está registrado
      return res.status(400).json({ message: "Email já cadastrado!" });
    } catch (error) {
      // Se o erro for de 'user not found', significa que o e-mail não está registrado
      if (error.code === 'auth/user-not-found') {
        // Se o e-mail não existir, cria o novo usuário
        const user = await auth.createUser({
          email,
          password,
        });

        return res.status(201).json({ message: "Usuário criado com sucesso", user });
      } else {
        // Caso ocorra outro erro, retorne uma resposta genérica de erro
        throw error;
      }
    }
  } catch (error) {
    // Trata qualquer erro inesperado
    res.status(400).json({ message: error.message });
  }
});

// Rota para login de usuário (com verificação de credenciais)
app.post("/login", async (req, res) => {
  const { token } = req.body;

  try {
    // Verifique o token ID do Firebase
    const decodedToken = await auth.verifyIdToken(token);
    const user = await auth.getUser(decodedToken.uid);
    res.status(200).json({ message: "Login bem-sucedido", user });
  } catch (error) {
    res.status(400).json({ message: "Token inválido ou expirado" });
  }
});


// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
