import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Main Factory Twin project (Primary)
const factoryTwinConfig = {
    apiKey: "AIzaSyD9wx77qJkhSS7Ltxu59Bb5Slui_IFWdxA",
    authDomain: "factory-twin-a4026.firebaseapp.com",
    projectId: "factory-twin-a4026",
    storageBucket: "factory-twin-a4026.firebasestorage.app",
    messagingSenderId: "331074956703",
    appId: "1:331074956703:web:00f7893a0e9b512ba121aa",
    measurementId: "G-TPJ4HMV5QT"
};

// Ishika project (Secondary)
const ishikaConfig = {
    apiKey: "AIzaSyDFGqcLU8TSynFUI9nP3YDC09J7v1Vdlg0",
    authDomain: "lagunaclothing-ishika.firebaseapp.com",
    projectId: "lagunaclothing-ishika",
    storageBucket: "lagunaclothing-ishika.firebasestorage.app",
    messagingSenderId: "1056026503792",
    appId: "1:1056026503792:web:5b4d1ecc17c1b8e45b62b5",
};

import { getApp, getApps } from "firebase/app";

const app = initializeApp(factoryTwinConfig);
const db = getFirestore(app);
const storage = getStorage(app);

const ishikaApp = !getApps().some(a => a.name === "ishika") ? initializeApp(ishikaConfig, "ishika") : getApp("ishika");
const ishikaDb = getFirestore(ishikaApp);

const devDb = ishikaDb; 
const prodDb = ishikaDb; 

export { db, storage, prodDb, devDb, ishikaDb };
export default app;
