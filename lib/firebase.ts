import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDCYs7oEnHutQv5gJg3WXOdBwDwKs6pKB0",
  authDomain: "guest-5f49e.firebaseapp.com",
  projectId: "guest-5f49e",
  storageBucket: "guest-5f49e.firebasestorage.app",
  messagingSenderId: "453968902048",
  appId: "1:453968902048:web:22e77d2bfa311d9c1d16c5",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);