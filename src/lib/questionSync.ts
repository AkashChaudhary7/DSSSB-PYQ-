import { 
  db, 
  auth,
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  limit, 
  startAfter,
  writeBatch, 
  doc,
  getDoc,
  setDoc
} from './firebase';
import { Question, ExamConfig } from '../types';
import { getQuestionsCached, saveQuestionsCached } from './indexedDB';
import { saveExamsConfig } from './storage';

export async function syncExamsConfigFromFirestore(): Promise<void> {
  try {
    const docRef = doc(db, 'metadata', 'exams_config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as any;
      if (data && data.configs && Array.isArray(data.configs)) {
        console.log('[Sync] Fetched custom exams config from Firestore:', data.configs);
        saveExamsConfig(data.configs);
      }
    }
  } catch (error) {
    console.warn('[Sync] Failed to sync exams config from Firestore:', error);
  }
}

export async function saveExamsConfigToFirestore(configs: ExamConfig[]): Promise<void> {
  try {
    const docRef = doc(db, 'metadata', 'exams_config');
    await setDoc(docRef, {
      configs,
      updatedAt: new Date().toISOString()
    });
    console.log('[Sync] Saved custom exams config to Firestore successfully.');
  } catch (error) {
    console.error('[Sync] Failed to save exams config to Firestore:', error);
  }
}

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
const FIRESTORE_MAX_BYTES = 1048576;
const MAX_PAYLOAD_BYTES = Math.floor(FIRESTORE_MAX_BYTES * 0.95); // 996,147 bytes

/**
 * Estimating UTF-8 bytes for a serialized object, adding 500 bytes safety buffer for Firestore envelope.
 */
function estimateBytes(obj: any): number {
  const str = JSON.stringify(obj);
  let bytes = 0;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code < 0xd800 || code >= 0xe000) {
      bytes += 3;
    } else {
      i++;
      bytes += 4;
    }
  }
  return bytes + 500;
}

/**
 * Uploads a list of questions to Firestore in bundles.
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
            lastBundleDoc = { id: docSnap.id, ref: docSnap.ref, ...(docSnap.data() as object) };
          }
        }
      });

      let currentBundleQs: Question[] = [];
      let nextIndex = lastIndex;
      let lastBundleHasSpace = false;

      if (lastBundleDoc && lastBundleDoc.questions) {
        const lastBundleBytes = estimateBytes(lastBundleDoc);
        if (lastBundleBytes < MAX_PAYLOAD_BYTES) {
          currentBundleQs = [...lastBundleDoc.questions];
          lastBundleHasSpace = true;
        }
      }

      if (!lastBundleHasSpace) {
        nextIndex = lastIndex + 1;
        currentBundleQs = [];
      }

      // Distribute questions sequentially
      let qToInsert = [...groupQs];

      // If we are appending to the last bundle
      if (lastBundleHasSpace && lastBundleDoc && qToInsert.length > 0) {
        const batch = writeBatch(db);
        const fillQs: Question[] = [];
        const simulatedBundleQs = [...currentBundleQs];
        const seenIds = new Set(simulatedBundleQs.map(q => q.id));

        let appendCount = 0;
        for (const q of qToInsert) {
          if (seenIds.has(q.id)) {
            appendCount++;
            continue;
          }

          simulatedBundleQs.push(q);
          const simulatedDoc = {
            id: lastBundleDoc.id,
            examId,
            updatedAt: new Date().toISOString(),
            questions: simulatedBundleQs
          };

          if (estimateBytes(simulatedDoc) <= MAX_PAYLOAD_BYTES) {
            fillQs.push(q);
            appendCount++;
          } else {
            // Reached size capacity for last bundle
            break;
          }
        }

        if (fillQs.length > 0) {
          for (const f of fillQs) {
            currentBundleQs.push(f);
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

        qToInsert = qToInsert.slice(appendCount);
      }

      // For the remaining questions, chunk them dynamically into new bundles and commit using a high-performance sliding window concurrency pool
      const chunks: { ref: any; data: any; size: number }[] = [];
      let chunkIndex = 0;

      while (chunkIndex < qToInsert.length) {
        const currentChunk: Question[] = [];
        const bundleId = `bundle_${examId}_${nextIndex}`;
        const docRef = doc(db, BUNDLES_COLLECTION, bundleId);

        while (chunkIndex < qToInsert.length) {
          const nextQ = qToInsert[chunkIndex];
          const simulatedChunk = [...currentChunk, nextQ];
          const simulatedDoc = {
            id: bundleId,
            examId,
            updatedAt: new Date().toISOString(),
            questions: simulatedChunk
          };

          if (currentChunk.length === 0 || estimateBytes(simulatedDoc) <= MAX_PAYLOAD_BYTES) {
            currentChunk.push(nextQ);
            chunkIndex++;
          } else {
            // Reached capacity for this chunk, proceed to next bundle
            break;
          }
        }

        chunks.push({
          ref: docRef,
          size: currentChunk.length,
          data: {
            id: bundleId,
            examId,
            updatedAt: new Date().toISOString(),
            questions: currentChunk
          }
        });
        nextIndex++;
      }

      // Concurrency limit of 6 to speed up the process by 6x without hitting quotas or rate limits
      const CONCURRENCY_LIMIT = 6;
      let activePromises: Promise<void>[] = [];

      for (const item of chunks) {
        if (activePromises.length >= CONCURRENCY_LIMIT) {
          await Promise.race(activePromises);
        }

        const p = (async () => {
          const batch = writeBatch(db);
          batch.set(item.ref, item.data);
          await batch.commit();
          processedCount += item.size;
          if (onProgress) {
            onProgress(processedCount);
          }
        })();

        activePromises.push(p);
        p.then(() => {
          activePromises = activePromises.filter(activeP => activeP !== p);
        });
      }

      // Await any remaining in-flight batches
      if (activePromises.length > 0) {
        await Promise.all(activePromises);
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
  // Sync the exam configurations first so any newly added subjects are pulled instantly
  await syncExamsConfigFromFirestore();

  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
  
  try {
    const allSyncedQuestions: Question[] = [];
    let currentLastSync = lastSync;

    // Process with limit-based cursor pagination based solely on updatedAt.
    // Fetch bundles (each up to 1000 questions) per request to avoid memory strain
    const BATCH_LIMIT = 20;
    let lastVisible: any = null;
    let hasMore = true;
    let fetchAttempts = 0;

    while (hasMore && fetchAttempts < 100) {
      fetchAttempts++;
      let q;
      if (lastSync === '1970-01-01T00:00:00.000Z') {
        if (lastVisible) {
          q = query(
            collection(db, BUNDLES_COLLECTION),
            startAfter(lastVisible),
            limit(BATCH_LIMIT)
          );
        } else {
          q = query(
            collection(db, BUNDLES_COLLECTION),
            limit(BATCH_LIMIT)
          );
        }
      } else {
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
        
        if (data.updatedAt && data.updatedAt > currentLastSync) {
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
