const express = require("express");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const cors = require("cors");
const { Parser } = require("json2csv");
const fs = require("fs");
const path = require("path");
const nodemailer = require("nodemailer");


const app = express();
const PORT = 3000;

app.use(bodyParser.json());
app.use(cors());

// Configuração do Firebase (Com Variavis de Ambiente, coloque as suas suas credenciais)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://petcardio-9cabf-default-rtdb.firebaseio.com",
});

const auth = admin.auth();
const db = admin.database();
const ecgRef = db.ref("/ecgData");
const dbfire = admin.firestore();

let clients = [];

const transporter = nodemailer.createTransport({
  service: "gmail", // Ou qualquer serviço de e-mail que você preferir
  auth: {
    user: process.env.EMAIL_USER, // Seu e-mail
    pass: process.env.EMAIL_PASS, // Sua senha de e-mail ou App Password
  },
});

// Rota para cadastro de usuário
app.post("/signup", async (req, res) => {
  const { email, password, userType, cpf } = req.body; // Incluindo o cpf no corpo da requisição para veterinário
  try {
    // Verifique se o tipo de usuário é válido
    const validUserTypes = ["petDono", "veterinario"];
    if (!validUserTypes.includes(userType)) {
      return res.status(400).json({ message: "Tipo de usuário inválido!" });
    }

    // Se o tipo de usuário for "veterinario", verifique se o usuário atual tem permissão para criar esse tipo de usuário
    if (userType === "veterinario") {
      // Verifica se o usuário autenticado tem permissão de 'admin'
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({
          message: "Você não tem permissão para criar um veterinário!",
        });
      }

      // Verifica se o CPF foi fornecido para o veterinário
      if (!cpf) {
        return res
          .status(400)
          .json({ message: "CPF é obrigatório para cadastro de veterinário!" });
      }

      // Aqui, você pode validar o CPF.
    }

    // Criação do usuário no Firebase Authentication
    const userRecord = await admin.auth().createUser({
      email,
      password,
    });
    // Enviar link de verificação para o email do usuário
    try {
      const verificationLink = await admin
        .auth()
        .generateEmailVerificationLink(email);
      console.log(
        `Link de verificação enviado com sucesso: ${verificationLink}`
      );
      // Você pode incluir um envio de email customizado aqui se preferir
    } catch (error) {
      console.error("Erro ao enviar o link de verificação:", error.message);
      return res.status(500).json({
        message:
          "Erro ao enviar o link de verificação de email. Por favor, tente novamente mais tarde.",
      });
    }

    // Armazenando o tipo de usuário no Firestore na coleção "users"
    const role = userType === "veterinario" ? "veterinario" : "petDono"; // Atribui o tipo de 'role' baseado no tipo de usuário
    const userData = {
      userType, // 'petDono' ou 'veterinario'
      email,
      role, // Atribuindo 'role' conforme o tipo
      emailVerified: false, // Status de email não verificado
    };

    // Se for veterinário, adicionar o CPF
    if (userType === "veterinario") {
      userData.cpf = cpf;
    }

    // Salva o usuário no Firestore
    await dbfire.collection("users").doc(userRecord.uid).set(userData);

    res.status(201).json({
      message:
        "Usuário criado com sucesso. Por favor, verifique seu email para confirmar o cadastro.",
    });
  } catch (error) {
    console.error(error);
    res.status(400).json({ message: error.message });
  }
});

app.post("/login", async (req, res) => {
  const { token } = req.body; // O token deve ser enviado do front-end

  try {
    // Verifica e valida o token JWT do Firebase
    const decodedToken = await admin.auth().verifyIdToken(token);
    const uid = decodedToken.uid; // Pega o UID do usuário a partir do token

    // Verifica o usuário no Firebase Authentication
    const userRecord = await admin.auth().getUser(uid);

    // Verifica o tipo de usuário no Firestore
    const userDoc = await dbfire.collection("users").doc(userRecord.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res
        .status(404)
        .json({ message: "Usuário não encontrado no Firestore" });
    }

    // Log para depuração
    console.log("Tipo de usuário obtido:", userData.userType);
    console.log("Email do Usuario:", userRecord.email);

    // Verifica se o email do usuário foi verificado
    if (!userRecord.emailVerified) {
      const lastVerificationSent = userData.lastVerificationSent || 0;
      const currentTime = Date.now();
      const fiveMinutes = 5 * 60 * 1000;

      // Verifica se já passou 5 minutos desde o último envio
      if (currentTime - lastVerificationSent >= fiveMinutes) {
        // Loga o email para o qual a verificação será enviada
        console.log("Enviando email de verificação para:", userRecord.email);

        // Envia o email de verificação // Desativado por escolha minha (Neto)
        const verificationLink = await admin
          .auth()
          .generateEmailVerificationLink(userRecord.email);
        await dbfire.collection("users").doc(userRecord.uid).update({
          lastVerificationSent: currentTime,
        });
        return res.status(403).json({
          message:
            "Por favor, verifique seu email para fazer login. Um email de verificação foi enviado.",
        });
      } else {
        return res.status(403).json({
          message:
            "Um email de verificação já foi enviado recentemente. Por favor, verifique seu email.",
        });
      }
    }

    // Verifica o tipo de usuário (petDono ou veterinario)
    if (userData.userType === "veterinario") {
      return res.status(200).json({
        message: "Login realizado com sucesso",
        userType: "veterinario",
      });
    } else if (userData.userType === "petDono") {
      return res.status(200).json({
        message: "Login realizado com sucesso",
        userType: "petDono",
      });
    } else {
      console.log("Tipo de usuário inválido:", userData.userType);
      return res.status(400).json({ message: "Tipo de usuário inválido" });
    }
  } catch (error) {
    return res.status(400).json({
      message: "Erro ao autenticar o usuário: " + error.message,
    });
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
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=ecg_data.csv");
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
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Adiciona o cliente à lista
  clients.push(res);

  // Envia uma mensagem inicial para o cliente
  res.write(
    `data: ${JSON.stringify({ message: "Conexão SSE estabelecida" })}\n\n`
  );

  // Remove o cliente da lista quando a conexão é fechada
  req.on("close", () => {
    clients = clients.filter((client) => client !== res);
  });
});

// Escutar novos dados de ECG e enviar para os clientes SSE
ecgRef
  .orderByChild("timestamp")
  .limitToLast(1)
  .on("child_added", (snapshot) => {
    const newData = snapshot.val();
    if (newData) {
      // Envia os novos dados para todos os clientes conectados
      clients.forEach((client) => {
        client.write(`data: ${JSON.stringify(newData)}\n\n`);
      });
    }
  });

// Nova rota para verificar a senha de administrador
app.post("/admin/auth", async (req, res) => {
  const { email, password } = req.body;

  try {
    // Verifique se o email existe no Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    // Verifique se o usuário está presente na coleção 'users' e se tem o 'role' igual a 'admin'
    const userDoc = await dbfire.collection("users").doc(userRecord.uid).get();
    const userData = userDoc.data();

    if (!userData) {
      return res
        .status(404)
        .json({ message: "Usuário não encontrado no Firestore" });
    }

    if (userData.role === "admin" && password === "admin_123") {
      // Senha correta e o usuário tem o role de 'admin'
      res.status(200).json({ message: "Senha correta" });
    } else {
      // Senha incorreta ou o usuário não é admin
      res.status(401).json({
        message: "Senha incorreta ou você não tem permissão de admin",
      });
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Rota para verificar o e-mail e enviar o link de verificação
app.post("/verifyEmail", async (req, res) => {
  const { email } = req.body;

  // Verificação do formato do email
  if (!email || !email.includes('@')) {
    return res.status(400).json({
      message: "Por favor, forneça um e-mail válido."
    });
  }

  try {
    // Verificar se o e-mail existe no Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    // Gerar o link de verificação de e-mail
    const verificationLink = await admin.auth().generateEmailVerificationLink(email);

    // Configurar o e-mail de envio
    const mailOptions = {
      from: process.env.EMAIL_USER, // De onde o e-mail será enviado
      to: email, // Para quem o e-mail será enviado
      subject: "Verifique seu e-mail",
      text: `Por favor, clique no seguinte link para verificar seu e-mail: ${verificationLink}`,
    };

    // Enviar o e-mail
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Erro ao enviar e-mail:", error);
        return res.status(500).json({
          message: "Erro ao enviar o link de verificação. Tente novamente mais tarde.",
        });
      }

      res.status(200).json({
        message: "Link de verificação enviado para o seu e-mail. Por favor, verifique sua caixa de entrada.",
      });
    });
  } catch (error) {
    console.error("Erro ao gerar link de verificação:", error.message);
    res.status(400).json({
      message: `Erro ao enviar o link de verificação: ${error.message}`
    });
  }
});

// Rota para redefinir a senha (enviar o link de redefinição)
app.post("/resetPassword", async (req, res) => {
  const { email } = req.body;

  // Verificação do formato do email
  if (!email || !email.includes('@')) {
    return res.status(400).json({
      message: "Por favor, forneça um e-mail válido."
    });
  }

  try {
    // Verificar se o e-mail existe no Firebase Authentication
    const userRecord = await admin.auth().getUserByEmail(email);

    // Gerar o link de redefinição de senha
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    // Configurar o e-mail de envio
    const mailOptions = {
      from: process.env.EMAIL_USER, // Seu e-mail
      to: email, // Para quem o e-mail será enviado
      subject: "Redefinição de Senha",
      text: `Por favor, clique no seguinte link para redefinir sua senha: ${resetLink}`,
    };

    // Enviar o e-mail
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.error("Erro ao enviar e-mail:", error);
        return res.status(500).json({
          message: "Erro ao enviar o link de redefinição de senha. Tente novamente mais tarde.",
        });
      }

      res.status(200).json({
        message: "Link de redefinição de senha enviado para o seu e-mail. Por favor, verifique sua caixa de entrada.",
      });
    });
  } catch (error) {
    console.error("Erro ao gerar link de redefinição de senha:", error.message);
    res.status(400).json({
      message: `Erro ao enviar o link de redefinição de senha: ${error.message}`,
    });
  }
});


// Inicializar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
