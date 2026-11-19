// Single Firebase initialization for the whole site. Do not initialize Firebase anywhere else.
// Paste your EXISTING web app config here (Firebase console > Project settings > Your apps).
// These values are public identifiers, not secrets; security comes from Firestore/Storage rules.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBYCDLvWHTU3nUORw_a1c4wChLehnYU7ZY",
  authDomain: "ririrish.firebaseapp.com",
  projectId: "ririrish",
  storageBucket: "ririrish.firebasestorage.app",
  messagingSenderId: "856996226712",
  appId: "1:856996226712:web:8ab2ed85c3be2be63e12ed"
};

export const isConfigured = !firebaseConfig.apiKey.startsWith("YOUR_");
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
