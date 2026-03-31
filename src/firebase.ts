import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const devConfig = {
    apiKey: "AIzaSyD9wx77qJkhSS7Ltxu59Bb5Slui_IFWdxA",
    authDomain: "factory-twin-a4026.firebaseapp.com",
    projectId: "factory-twin-a4026",
    storageBucket: "factory-twin-a4026.firebasestorage.app",
    messagingSenderId: "331074956703",
    appId: "1:331074956703:web:00f7893a0e9b512ba121aa",
    measurementId: "G-TPJ4HMV5QT"
};

const firebaseConfig = {
    apiKey: "AIzaSyDFGqcLU8TSynFUI9nP3YDC09J7v1Vdlg0",
    authDomain: "lagunaclothing-ishika.firebaseapp.com",
    projectId: "lagunaclothing-ishika",
    storageBucket: "lagunaclothing-ishika.firebasestorage.app",
    messagingSenderId: "1056026503792",
    appId: "1:1056026503792:web:5b4d1ecc17c1b8e45b62b5",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const storage = getStorage(app);

// Keep the dev project available as devDb
import { getApp, getApps } from "firebase/app";
const devApp = !getApps().some(a => a.name === "development") ? initializeApp(devConfig, "development") : getApp("development");
const devDb = getFirestore(devApp);
const prodDb = db; // For backwards compatibility

export { db, storage, prodDb, devDb };
export default app;
