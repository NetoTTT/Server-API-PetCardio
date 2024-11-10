const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");

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
      res.status(200).json(data);
    } else {
      res.status(404).json({ message: "Nenhum dado encontrado." });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Rota para abrir uma conexão SSE e enviar dados em tempo real
app.get("/ecg/stream", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Envia um "ping" inicial para abrir a conexão
  res.write('data: Conexão SSE aberta\n\n');

  // Adiciona o cliente à lista de SSE
  clients.push(res);

  // Mantém a conexão viva enviando "pings" periódicos
  const keepAliveInterval = setInterval(() => {
    res.write('data: \n\n'); // Envia um ping vazio a cada 20 segundos
  }, 20000);

  // Remove o cliente ao desconectar
  req.on('close', () => {
    clearInterval(keepAliveInterval); // Limpa o intervalo quando o cliente desconecta
    clients.splice(clients.indexOf(res), 1);
  });
});

// Função para enviar dados para todos os clientes conectados via SSE
function sendDataToClients(data) {
  const jsonData = JSON.stringify(data); // Transforma o dado em JSON
  clients.forEach(client => {
    client.write(`data: ${jsonData}\n\n`);
  });
}

// Escutar novos dados de ECG em tempo real e enviar para os clientes SSE
ecgRef.orderByChild("timestamp").limitToLast(1).on("child_added", (snapshot) => {
  const newData = snapshot.val();
  if (newData) {
    console.log("Novo dado ECG recebido:", newData);
    sendDataToClients(newData); // Envia os novos dados para os clientes conectados via SSE
  }
});

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
