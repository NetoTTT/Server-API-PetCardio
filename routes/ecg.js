// routes/ecg.js
const express = require("express");
const { database } = require("firebase-admin");  // Agora já é possível usar o Firebase aqui diretamente

const router = express.Router();
const ecgRef = database().ref('ecgData'); // Referência para a coleção de ECG no Firebase
let clients = []; // Array para armazenar os clientes SSE conectados

// Função para enviar dados para os clientes SSE
function sendDataToClients(data) {
  // Envia os dados para todos os clientes conectados
  clients.forEach(client => {
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

// Rota para pegar o dado mais recente de ECG
router.get("/ecg", async (req, res) => {
  try {
    // Pega o dado mais recente com base no campo timestamp
    const snapshot = await ecgRef.orderByChild("timestamp").limitToLast(1).once("value");
    const data = snapshot.val();
    
    if (data) {
      res.status(200).json(data); // Retorna os dados encontrados
    } else {
      res.status(404).json({ message: "Nenhum dado encontrado." }); // Caso não haja dados
    }
  } catch (error) {
    res.status(500).json({ message: error.message }); // Caso ocorra um erro no banco de dados
  }
});

// Rota para abrir uma conexão SSE e enviar dados em tempo real
router.get("/ecg/stream", (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Envia um "ping" inicial para manter a conexão aberta
  res.write('data: Conexão SSE aberta\n\n');

  // Adiciona o cliente à lista de clientes SSE
  clients.push(res);

  // Remove o cliente da lista quando a conexão for fechada
  req.on('close', () => {
    clients = clients.filter(client => client !== res);
  });
});

// Escutar novos dados de ECG em tempo real e enviar para os clientes SSE
ecgRef.orderByChild("timestamp").limitToLast(1).on("child_added", (snapshot) => {
  const newData = snapshot.val();
  if (newData) {
    console.log("Novo dado ECG recebido:", newData);
    sendDataToClients(newData); // Envia os novos dados para os clientes conectados via SSE
  }
});

module.exports = router;
