const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

// Configuração do Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://petcardio-9cabf-default-rtdb.firebaseio.com'
});

const auth = admin.auth();
const db = admin.database();
const ecgRef = db.ref("/ecgData");

const clients = [];

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
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
    const snapshot = await ecgRef.orderByChild("timestamp").limitToLast(1).once("value");
    const data = snapshot.val();
    if (data) {
      res.status(200).json({ message: "Dados encontrados", data });
    } else {
      res.status(404).json({ message: "Nenhum dado encontrado." });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Configuração do WebSocket
const wss = new WebSocket.Server({ server: app });

wss.on('connection', ws => {
  console.log('Novo cliente conectado');

  // Enviar dados para o cliente
  ws.send(JSON.stringify({ message: 'Conexão WebSocket estabelecida' }));

  // Escutar por mensagens do cliente (se necessário)
  ws.on('message', message => {
    console.log('Mensagem recebida:', message);
  });

  // Escutar por desconexão
  ws.on('close', () => {
    console.log('Cliente desconectado');
  });
});

// Escutar novos dados de ECG e enviar para os clientes WebSocket
ecgRef.orderByChild("timestamp").limitToLast(1).on("child_added", (snapshot) => {
  const newData = snapshot.val();
  if (newData) {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(newData)); // Envia os dados para o cliente
      }
    });
  }
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
