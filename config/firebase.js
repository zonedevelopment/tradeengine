const { initializeApp, getApps, getApp } = require("firebase/app");
const { getFirestore } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyD-Z68xUENaTBREoLPkMYWBlhG5Z0rdHmw",
  authDomain: "trader-bot-eb01f.firebaseapp.com",
  projectId: "trader-bot-eb01f",
  storageBucket: "trader-bot-eb01f.firebasestorage.app",
  messagingSenderId: "457522674939",
  appId: "1:457522674939:web:0b4b84d33d1c34cbbcc45e",
  measurementId: "G-T7BDTFPLE5"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

module.exports = { app, db };