import { db, auth } from './firebase';
import { Question } from '../types';
import { getQuestionsCached, saveQuestionsCached } from './indexedDB';
import { 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  writeBatch, 
  doc 
} from 'firebase/firestore';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path
  };
  console.error('Firestore Sync Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const QUESTIONS_COLLECTION = 'questions';
const BUNDLES_COLLECTION = 'question_bundles';
const LAST_SYNC_KEY = 'cs_mcq_questions_last_sync_timestamp';

/**
 * Uploads a list of questions to Firestore in bundles of up to 200.
 * Saves Firestore daily read/write limits by aggregating questions into a single document.
 * Also caches them locally in IndexedDB immediately.
 */
export async function uploadQuestionsInChunks(
  questions: Question[],
  onProgress?: (uploadedCount: number) => void
): Promise<void> {
  if (!questions || questions.length === 0) return;

  // 1. Save to local IndexedDB immediately for instant availability
  await saveQuestionsCached(questions);

  // 2. Sync to Firestore in aggregated bundles
  try {
    // Group questions by exam ID
    const groups: Record<string, Question[]> = {};
    for (const q of questions) {
      const examId = q.exam || 'general';
      if (!groups[examId]) groups[examId] = [];
      groups[examId].push(q);
    }

    let processedCount = 0;

    for (const [examId, groupQs] of Object.entries(groups)) {
      // Fetch existing bundles for this exam to check index/space
      const q = query(
        collection(db, BUNDLES_COLLECTION),
        where('examId', '==', examId)
      );
      const snapshot = await getDocs(q);
      
      let lastBundleDoc: any = null;
      let lastIndex = -1;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id;
        const match = docId.match(/bundle_[^_]+_(\d+)/);
        if (match) {
          const idx = parseInt(match[1], 10);
          if (idx > lastIndex) {
            lastIndex = idx;
            lastBundleDoc = { id: docSnap.id, ref: docSnap.ref, ...data };
          }
        }
      });

      let currentBundleQs: Question[] = [];
      let nextIndex = lastIndex;

      if (lastBundleDoc && lastBundleDoc.questions && lastBundleDoc.questions.length < 200) {
        currentBundleQs = [...lastBundleDoc.questions];
      } else {
        // Create new bundle
        nextIndex = lastIndex + 1;
        currentBundleQs = [];
      }

      // Distribute questions
      const batch = writeBatch(db);
      let qToInsert = [...groupQs];

      // If we are appending to the last bundle
      if (currentBundleQs.length > 0 && lastBundleDoc) {
        const spaceLeft = 200 - currentBundleQs.length;
        const fillQs = qToInsert.slice(0, spaceLeft);
        qToInsert = qToInsert.slice(spaceLeft);

        // Deduplicate and append
        const seenIds = new Set(currentBundleQs.map(q => q.id));
        for (const f of fillQs) {
          if (!seenIds.has(f.id)) {
            currentBundleQs.push(f);
          }
        }

        batch.set(lastBundleDoc.ref, {
          id: lastBundleDoc.id,
          examId,
          updatedAt: new Date().toISOString(),
          questions: currentBundleQs
        }, { merge: true });
      }

      // For the remaining questions, chunk them into new bundles of 200
      const bundleSize = 200;
      for (let i = 0; i < qToInsert.length; i += bundleSize) {
        const chunk = qToInsert.slice(i, i + bundleSize);
        const bundleId = `bundle_${examId}_${nextIndex}`;
        const docRef = doc(db, BUNDLES_COLLECTION, bundleId);

        batch.set(docRef, {
          id: bundleId,
          examId,
          updatedAt: new Date().toISOString(),
          questions: chunk
        });

        nextIndex++;
      }

      await batch.commit();

      processedCount += groupQs.length;
      if (onProgress) {
        onProgress(processedCount);
      }
    }
  } catch (error) {
    console.error('Failed to upload question bundles to Firestore:', error);
  }
}

/**
 * Synchronizes new questions from Firestore in incremental bundles since last sync.
 * Saves Firestore daily read limits by only requesting newly added/updated records.
 */
export async function syncQuestionsFromFirestore(selectedExams: string[]): Promise<Question[]> {
  if (!selectedExams || selectedExams.length === 0) {
    console.log('No selected exams to sync.');
    return [];
  }

  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
  
  try {
    const newQuestions: Question[] = [];
    let currentLastSync = lastSync;

    // Fetch bundles updated since last sync for selected exams
    // Firestore has a maximum list length of 10 for 'in' operator, which is more than enough for selectedExams
    const q = query(
      collection(db, BUNDLES_COLLECTION),
      where('examId', 'in', selectedExams),
      where('updatedAt', '>', lastSync)
    );

    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.updatedAt > currentLastSync) {
        currentLastSync = data.updatedAt;
      }

      if (data.questions && Array.isArray(data.questions)) {
        for (const qObj of data.questions) {
          newQuestions.push({
            ...qObj,
            source: qObj.source || 'Firestore Sync'
          });
        }
      }
    });

    if (newQuestions.length > 0) {
      // Store in local IndexedDB cache
      await saveQuestionsCached(newQuestions);
      console.log(`Synchronized ${newQuestions.length} questions from Firestore into IndexedDB cache (from bundles).`);
    }

    localStorage.setItem(LAST_SYNC_KEY, currentLastSync);
    return newQuestions;
  } catch (error) {
    console.warn('Incremental bundle sync warning, continuing offline: ', error);
    return [];
  }
}
