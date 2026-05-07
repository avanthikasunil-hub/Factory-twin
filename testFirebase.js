import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const factoryTwinConfig = {
    apiKey: "AIzaSyD9wx77qJkhSS7Ltxu59Bb5Slui_IFWdxA",
    authDomain: "factory-twin-a4026.firebaseapp.com",
    projectId: "factory-twin-a4026",
};

const app = initializeApp(factoryTwinConfig);
const db = getFirestore(app);

async function test() {
    try {
        console.log("Testing write to modifiedLayouts/WAREHOUSE...");
        const ref = doc(db, "modifiedLayouts", "WAREHOUSE");
        await setDoc(ref, { testData: "hello", timestamp: new Date().toISOString() }, { merge: true });
        console.log("Write success!");
        
        const snap = await getDoc(ref);
        console.log("Read back:", snap.data().testData);
        process.exit(0);
    } catch(err) {
        console.error("Firebase error:", err);
        process.exit(1);
    }
}
test();
