const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");
const ecgRoutes = require("./routes/ecg"); // Importa o arquivo de rotas do ECG
const authRoutes = require("./routes/auth"); // Importa o arquivo de rotas de autenticação (se houver)

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

// Usar as rotas de autenticação e ECG
app.use("/auth", authRoutes); // Rota para autenticação
app.use("/ecgroute", ecgRoutes);   // Rota para dados ECG

// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
