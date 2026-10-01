// src/app/core/firebase/firebase.config.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Sustituye con tus credenciales del console de Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDRTIdqeikjJJuBga56Gpkz6TTaTBoXPXk",
  authDomain: "brainy-learning-3dd79.firebaseapp.com",
  projectId: "brainy-learning-3dd79",
  storageBucket: "brainy-learning-3dd79.firebasestorage.app",
  messagingSenderId: "565914155955",
  appId: "1:565914155955:web:91a6d95c44aa2fcd70e9c6",
  measurementId: "G-E95VP8NSTZ"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
