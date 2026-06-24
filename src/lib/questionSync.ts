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
  const currentSyncTime = new Date().toISOString();
  const pathForList = QUESTIONS_COLLECTION;

  try {
    // Single-field index query on 'exam' to avoid missing composite index errors.
    // Loads in moderate chunks to protect limits and syncs only those exams chosen.
    const q = query(
      collection(db, QUESTIONS_COLLECTION),
      where('exam', 'in', selectedExams),
      limit(250)
    );

    const snapshot = await getDocs(q);
    const newQuestions: Question[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const updatedAt = data.updatedAt || '1970-01-01T00:00:00.000Z';
      
      // Filter locally for incremental updates to save write overhead
      if (updatedAt > lastSync) {
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

    if (newQuestions.length > 0) {
      // Store in local IndexedDB cache
      await saveQuestionsCached(newQuestions);
      console.log(`Synchronized ${newQuestions.length} new questions from Firestore into IndexedDB cache.`);
    }

    // Update the last sync timestamp to the current sync time
    localStorage.setItem(LAST_SYNC_KEY, currentSyncTime);
    return newQuestions;
  } catch (error) {
    // Fallback gracefully on query failures (e.g. if indexes are still building)
    console.warn('Incremental sync warning, continuing offline: ', error);
    return [];
  }
}
