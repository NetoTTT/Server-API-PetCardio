const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware para parsing de JSON
app.use(bodyParser.json());

// Configurar CORS
app.use(cors());

// Configuração do Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Inicializar o Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://petcardio-9cabf-default-rtdb.firebaseio.com'
});

// Inicializar os serviços do Firebase
const auth = admin.auth();
const db = admin.database(); // Referência ao Firebase Realtime Database
const ecgRef = db.ref("/ecgData"); // Referência ao nó /ecgData

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Tenta verificar se o e-mail já está registrado
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
app.post("/login", async (req, res) => {
  const { token } = req.body;

  try {
    const decodedToken = await auth.verifyIdToken(token);
    const user = await auth.getUser(decodedToken.uid);
    res.status(200).json({ message: "Login bem-sucedido", user });
  } catch (error) {
    res.status(400).json({ message: "Token inválido ou expirado" });
  }
});

// Rota para pegar o dado mais recente de ECG
app.get("/ecg", async (req, res) => {
  try {
    // Fazendo a consulta para pegar o dado mais recente (limitToLast(1))
    const snapshot = await ecgRef.orderByChild("timestamp").limitToLast(1).once("value");
    const data = snapshot.val();

    if (data) {
      // Retorna o dado mais recente encontrado
      res.status(200).json(data);
    } else {
      res.status(404).json({ message: "Nenhum dado encontrado." });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Escutar em tempo real para novos dados
ecgRef.orderByChild("timestamp").limitToLast(1).on("child_added", (snapshot) => {
  const newData = snapshot.val();
  if (newData) {
    // Aqui você pode fazer o que quiser com os novos dados (ex. enviar para um front-end)
    console.log("Novo dado ECG recebido:", newData);
  }
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
