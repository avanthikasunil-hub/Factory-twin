import { initializeApp } from "firebase/app";
import { getFirestore, doc, deleteDoc } from "firebase/firestore";

const factoryTwinConfig = {
    apiKey: "AIzaSyD9wx77qJkhSS7Ltxu59Bb5Slui_IFWdxA",
    authDomain: "factory-twin-a4026.firebaseapp.com",
    projectId: "factory-twin-a4026",
};

const app = initializeApp(factoryTwinConfig);
const db = getFirestore(app);

async function clearCuttingLayout() {
    try {
        console.log("Clearing modifiedLayouts/CUTTING...");
        const ref = doc(db, "modifiedLayouts", "CUTTING");
        await deleteDoc(ref);
        console.log("Clear success!");
        process.exit(0);
    } catch(err) {
        console.error("Firebase error:", err);
        process.exit(1);
    }
}
clearCuttingLayout();
