document.addEventListener('DOMContentLoaded', function () {

  const firebaseConfig = {
    apiKey: "AIzaSyDyyEsEPJjCw3YAprH03OlWlovATy4SAFI",
    authDomain: "palletsystem-6ff16.firebaseapp.com",
    projectId: "palletsystem-6ff16",
    storageBucket: "palletsystem-6ff16.firebasestorage.app",
    messagingSenderId: "395589767694",
    appId: "1:395589767694:web:59e6797705a3e89fdca25f"
  };

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  window.db = firebase.firestore();
  window.auth = firebase.auth();

  window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(() => {
    })
    .catch((error) => {
    });

});
