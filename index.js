const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Parser } = require('json2csv');
const fs = require('fs');
const path = require('path');

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

let clients = [];

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

// Rota para pegar os dados de ECG e convertê-los para CSV
app.get("/ecg", async (req, res) => {
  try {
    const snapshot = await ecgRef.orderByChild("timestamp").once("value");
    const data = snapshot.val();

    if (data) {
      // Convertendo os dados JSON para CSV
      const jsonData = Object.values(data); // Converte o objeto em um array
      const parser = new Parser();
      const csv = parser.parse(jsonData);

      // Definindo os headers para o envio do CSV como um arquivo
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=ecg_data.csv');
      res.status(200).send(csv);
    } else {
      res.status(404).json({ message: "Nenhum dado encontrado." });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Rota para gerenciar a conexão SSE
app.get("/events", (req, res) => {
  // Configura os headers necessários para SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Adiciona o cliente à lista
  clients.push(res);

  // Envia uma mensagem inicial para o cliente
  res.write(`data: ${JSON.stringify({ message: 'Conexão SSE estabelecida' })}\n\n`);

  // Remove o cliente da lista quando a conexão é fechada
  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// Escutar novos dados de ECG e enviar para os clientes SSE
ecgRef.orderByChild("timestamp").limitToLast(1).on("child_added", (snapshot) => {
  const newData = snapshot.val();
  if (newData) {
    // Envia os novos dados para todos os clientes conectados
    clients.forEach(client => {
      client.write(`data: ${JSON.stringify(newData)}\n\n`);
    });
  }
});

// Nova rota para verificar a senha de administrador
app.post("/admin/auth", async (req, res) => {
  const { password } = req.body;

  try {

    if (password === 'admin_123') {
      res.status(200).json({ message: "Senha correta" });
    } else {
      res.status(401).json({ message: "Senha incorreta" });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
