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
  startAfter,
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
        const docId = docSnap.id;
        const prefix = `bundle_${examId}_`;
        if (docId.startsWith(prefix)) {
          const indexStr = docId.substring(prefix.length);
          const idx = parseInt(indexStr, 10);
          if (!isNaN(idx) && idx > lastIndex) {
            lastIndex = idx;
            lastBundleDoc = { id: docSnap.id, ref: docSnap.ref, ...docSnap.data() };
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

      // Distribute questions sequentially
      let qToInsert = [...groupQs];

      // If we are appending to the last bundle
      if (currentBundleQs.length > 0 && lastBundleDoc && qToInsert.length > 0) {
        const batch = writeBatch(db);
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

        await batch.commit();
        processedCount += fillQs.length;
        if (onProgress) {
          onProgress(processedCount);
        }
      }

      // For the remaining questions, chunk them into new bundles of 200 and commit sequentially
      const bundleSize = 200;
      for (let i = 0; i < qToInsert.length; i += bundleSize) {
        const batch = writeBatch(db);
        const chunk = qToInsert.slice(i, i + bundleSize);
        const bundleId = `bundle_${examId}_${nextIndex}`;
        const docRef = doc(db, BUNDLES_COLLECTION, bundleId);

        batch.set(docRef, {
          id: bundleId,
          examId,
          updatedAt: new Date().toISOString(),
          questions: chunk
        });

        await batch.commit();
        nextIndex++;
        processedCount += chunk.length;
        if (onProgress) {
          onProgress(processedCount);
        }
      }
    }
  } catch (error) {
    console.error('Failed to upload question bundles to Firestore:', error);
    throw error;
  }
}

/**
 * Synchronizes new questions from Firestore in incremental bundles since last sync.
 * Saves Firestore daily read limits by only requesting newly added/updated records.
 */
export async function syncQuestionsFromFirestore(selectedExams?: string[]): Promise<Question[]> {
  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
  
  try {
    const allSyncedQuestions: Question[] = [];
    let currentLastSync = lastSync;

    // Process with limit-based cursor pagination based solely on updatedAt.
    // Fetch 1 bundle (up to 200 questions) per request to avoid memory strain
    const BATCH_LIMIT = 20;
    let lastVisible: any = null;
    let hasMore = true;
    let fetchAttempts = 0;

    while (hasMore && fetchAttempts < 100) {
      fetchAttempts++;
      let q;
      if (lastVisible) {
        q = query(
          collection(db, BUNDLES_COLLECTION),
          where('updatedAt', '>', lastSync),
          orderBy('updatedAt'),
          startAfter(lastVisible),
          limit(BATCH_LIMIT)
        );
      } else {
        q = query(
          collection(db, BUNDLES_COLLECTION),
          where('updatedAt', '>', lastSync),
          orderBy('updatedAt'),
          limit(BATCH_LIMIT)
        );
      }

      console.log(`[Sync] Querying bundles with lastSync=${lastSync}, attempt=${fetchAttempts}`);
      const snapshot = await getDocs(q);
      console.log(`[Sync] Fetched ${snapshot.docs.length} bundles in this batch.`);
      
      if (snapshot.empty) {
        hasMore = false;
        break;
      }

      const batchQuestions: Question[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as any;
        console.log(`[Sync Debug] Doc ID: ${docSnap.id}, examId: ${data.examId}, questions length: ${data.questions?.length}`);
        
        if (data.updatedAt > currentLastSync) {
          currentLastSync = data.updatedAt;
        }

        // Load all bundles
        if (data.examId) {
          if (data.questions && Array.isArray(data.questions)) {
            console.log(`[Sync Debug] Match found! Adding ${data.questions.length} questions for exam ${data.examId}`);
            for (const qObj of data.questions) {
              batchQuestions.push({
                ...qObj,
                source: qObj.source || 'Firestore Sync'
              });
            }
          } else {
            console.warn(`[Sync Debug] Questions field is invalid or not an array for doc: ${docSnap.id}`);
          }
        }
      });

      if (batchQuestions.length > 0) {
        // Store in local IndexedDB cache incrementally
        try {
          await saveQuestionsCached(batchQuestions);
        } catch (dbErr) {
          console.error(`[Sync Debug] saveQuestionsCached failed!`, dbErr);
          throw dbErr; // Let the outer catch handle it
        }
        allSyncedQuestions.push(...batchQuestions);
      }

      lastVisible = snapshot.docs[snapshot.docs.length - 1];
      if (snapshot.docs.length < BATCH_LIMIT) {
        hasMore = false;
      }
    }

    if (allSyncedQuestions.length > 0) {
      console.log(`Synchronized ${allSyncedQuestions.length} questions from Firestore into IndexedDB cache (from bundles).`);
    }

    localStorage.setItem(LAST_SYNC_KEY, currentLastSync);
    return allSyncedQuestions;
  } catch (error) {
    console.warn('Incremental bundle sync warning, continuing offline: ', error);
    return [];
  }
}
