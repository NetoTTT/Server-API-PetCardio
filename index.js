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
const dbfire = admin.firestore();

let clients = [];

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
  const { email, password, userType, cpf } = req.body;  // Incluindo o cpf no corpo da requisição para veterinário
  try {
    // Verifique se o tipo de usuário é válido
    const validUserTypes = ["petDono", "veterinario"];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({ message: "Tipo de usuário inválido!" });
    }

    // Se o tipo de usuário for "veterinario", verifique se o usuário atual tem permissão para criar esse tipo de usuário
    if (userType === "veterinario") {
      // Verifica se o usuário autenticado tem permissão de 'admin'
      if (!req.user || req.user.role !== "admin") {  // Supondo que req.user seja o usuário autenticado
        return res.status(403).json({ message: "Você não tem permissão para criar um veterinário!" });
      }

      // Verifica se o CPF foi fornecido para o veterinário
      if (!cpf) {
        return res.status(400).json({ message: "CPF é obrigatório para cadastro de veterinário!" });
      }

      // Aqui, você pode validar o CPF de acordo com sua lógica, se necessário.
    }

    // Agora, criamos o usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });

    // Armazenando o tipo de usuário no Firestore na coleção "users"
    const role = userType === "veterinario" ? "veterinario" : "petDono"; // Atribui o tipo de 'role' baseado no tipo de usuário
    const userData = {
      userType,  // 'petDono' ou 'veterinario'
      email,
      role, // Atribuindo 'role' conforme o tipo
    };

    // Se for veterinário, adicionar o CPF
    if (userType === "veterinario") {
      userData.cpf = cpf;
    }

    await dbfire.collection("users").doc(userRecord.uid).set(userData);

    res.status(201).json({ message: "Usuário criado com sucesso", user: userRecord });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { token } = req.body;  // O token deve ser enviado do front-end

  try {
    // Verifica e valida o token JWT do Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid;  // Pega o UID do usuário a partir do token

    // Verifica o usuário no Firebase Authentication
    const userRecord = await admin.auth().getUser(uid);

    // Verifica o tipo de usuário no Firestore
    const userDoc = await dbfire.collection("users").doc(userRecord.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res.status(404).json({ message: "Usuário não encontrado no Firestore" });
    }

    // Aqui, você pode verificar o tipo de usuário (petDono ou veterinario)
    if (userData.userType === 'veterinario') {
      // Se for um veterinário, redireciona para a página de veterinário
      res.status(200).json({ message: "Login realizado com sucesso", userType: 'veterinario' });
    } else if (userData.userType === 'petDono') {
      // Se for um dono de pet, redireciona para a página de dono de pet
      res.status(200).json({ message: "Login realizado com sucesso", userType: 'petDono' });
    } else {
      res.status(400).json({ message: "Tipo de usuário inválido" });
    }
    
  } catch (error) {
    res.status(400).json({ message: "Erro ao autenticar o usuário: " + error.message });
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
