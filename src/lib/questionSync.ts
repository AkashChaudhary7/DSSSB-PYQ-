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
const LAST_SYNC_KEY = 'cs_mcq_questions_last_sync_timestamp';

/**
 * Uploads a list of questions to Firestore in batches/chunks of 50.
 * Also caches them locally in IndexedDB immediately.
 */
export async function uploadQuestionsInChunks(
  questions: Question[],
  onProgress?: (uploadedCount: number) => void
): Promise<void> {
  if (!questions || questions.length === 0) return;

  // 1. Save to local IndexedDB immediately for instant availability
  await saveQuestionsCached(questions);

  // 2. Sync to Firestore in chunks if the user is authenticated
  const user = auth.currentUser;
  if (!user) {
    console.log('Skipping Firestore upload: User is not authenticated.');
    if (onProgress) {
      onProgress(questions.length);
    }
    return;
  }

  const chunkSize = 50;
  const pathForWrite = QUESTIONS_COLLECTION;

  try {
    for (let i = 0; i < questions.length; i += chunkSize) {
      const chunk = questions.slice(i, i + chunkSize);
      const batch = writeBatch(db);

      for (const q of chunk) {
        // Enforce safe unique ID and track updated timestamp for sync
        const docId = q.id || `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const docRef = doc(db, QUESTIONS_COLLECTION, docId);
        
        const qWithMeta = {
          ...q,
          id: docId,
          creatorId: user.uid,
          updatedAt: new Date().toISOString(),
        };
        batch.set(docRef, qWithMeta);
      }

      await batch.commit();
      const currentUploaded = Math.min(i + chunk.length, questions.length);
      console.log(`Successfully uploaded chunk of ${chunk.length} questions to Firestore. Progress: ${currentUploaded}/${questions.length}`);
      if (onProgress) {
        onProgress(currentUploaded);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, pathForWrite);
  }
}

/**
 * Synchronizes new questions from Firestore in incremental batches since last sync.
 * Saves Firestore daily read limits by only requesting newly added/updated records.
 */
export async function syncQuestionsFromFirestore(selectedExams: string[]): Promise<Question[]> {
  const user = auth.currentUser;
  if (!user) {
    console.log('Skipping Firestore pull: User is not authenticated.');
    return [];
  }

  if (!selectedExams || selectedExams.length === 0) {
    console.log('No selected exams to sync.');
    return [];
  }

  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || '1970-01-01T00:00:00.000Z';
  const pathForList = QUESTIONS_COLLECTION;

  try {
    let newQuestions: Question[] = [];
    let currentLastSync = lastSync;
    
    // We can fetch in chunks to avoid hitting read limits heavily at once
    let hasMore = true;
    let chunksFetched = 0;
    
    while (hasMore && chunksFetched < 5) {
      const q = query(
        collection(db, QUESTIONS_COLLECTION),
        where('updatedAt', '>', currentLastSync),
        orderBy('updatedAt', 'asc'),
        limit(100)
      );

      const snapshot = await getDocs(q);
      let fetchedCount = 0;

      snapshot.forEach((docSnap) => {
        fetchedCount++;
        const data = docSnap.data();
        if (data.updatedAt > currentLastSync) {
          currentLastSync = data.updatedAt; // update to the latest we saw
        }
        
        // Filter locally for exams
        if (selectedExams.includes(data.exam)) {
          newQuestions.push({
            id: docSnap.id,
            topic: data.topic,
            subtopic: data.subtopic,
            difficulty: data.difficulty,
            text: data.text,
            options: data.options,
            correctIndex: data.correctIndex,
            explanation: data.explanation,
            source: data.source || 'Firestore Sync',
            isCustom: true,
            exam: data.exam,
            part: data.part
          } as Question);
        }
      });

      if (fetchedCount < 100) {
        hasMore = false;
      }
      chunksFetched++;
    }

    if (newQuestions.length > 0) {
      // Store in local IndexedDB cache
      await saveQuestionsCached(newQuestions);
      console.log(`Synchronized ${newQuestions.length} new questions from Firestore into IndexedDB cache.`);
    }

    // Update the last sync timestamp to the highest synced time
    localStorage.setItem(LAST_SYNC_KEY, currentLastSync);
    return newQuestions;
  } catch (error) {
    // Fallback gracefully on query failures (e.g. if indexes are still building)
    console.warn('Incremental sync warning, continuing offline: ', error);
    return [];
  }
}
