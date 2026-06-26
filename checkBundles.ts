import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";
import fs from "fs";

const firebaseConfig = JSON.parse(fs.readFileSync('./firebase-applet-config.json', 'utf8'));
const app = initializeApp(firebaseConfig);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

async function run() {
  const snapshot = await getDocs(collection(db, "question_bundles"));
  console.log("Total bundles:", snapshot.docs.length);
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    console.log(`Bundle ID: ${doc.id}, examId: ${data.examId}, questions length: ${data.questions?.length}, array? ${Array.isArray(data.questions)}`);
  });
  process.exit(0);
}
run();
