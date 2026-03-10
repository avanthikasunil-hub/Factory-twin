import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
    apiKey: "AIzaSyD9wx77qJkhSS7Ltxu59Bb5Slui_IFWdxA",
    authDomain: "factory-twin-a4026.firebaseapp.com",
    projectId: "factory-twin-a4026",
    storageBucket: "factory-twin-a4026.firebasestorage.app",
    messagingSenderId: "331074956703",
    appId: "1:331074956703:web:00f7893a0e9b512ba121aa",
    measurementId: "G-TPJ4HMV5QT"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

export { db, storage };
export default app;
