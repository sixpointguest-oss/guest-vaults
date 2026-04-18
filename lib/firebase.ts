import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDh9bzwf-E9iqZoNsKKw1VX9G-amCuUyno",
  authDomain: "guest-vaults.firebaseapp.com",
  projectId: "guest-vaults",
  storageBucket: "guest-vaults.firebasestorage.app",
  messagingSenderId: "563547786394",
  appId: "1:563547786394:web:34bd4859beea45ca396323"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);