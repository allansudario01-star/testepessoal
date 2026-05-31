// firebase-config.js
const firebaseConfig = {
    apiKey: "AIzaSyC1po4JIlse2knDtnkznBvGdUvllvEEGIE",
    authDomain: "mazproject-4c83a.firebaseapp.com",
    projectId: "mazproject-4c83a",
    storageBucket: "mazproject-4c83a.firebasestorage.app",
    messagingSenderId: "313036466415",
    appId: "1:313036466415:web:71f7bbe1310d761585531a"
};

// Inicializar Firebase
if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

// Exportar serviços
const db = firebase.firestore();
const auth = firebase.auth();

// Configurar persistência
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .catch((error) => {
        console.error("Erro na persistência:", error);
    });

// Disponibilizar globalmente
window.db = db;
window.auth = auth;
