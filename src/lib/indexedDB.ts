import { Question } from '../types';

const DB_NAME = 'dsssb_cs_prep_cache';
const DB_VERSION = 1;
const STORE_NAME = 'questions';

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Failed to open IndexedDB:', request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
  });
}

export async function getQuestionsCached(): Promise<Question[]> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = () => {
        console.error('Error fetching questions from IndexedDB:', request.error);
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('IndexedDB getQuestionsCached failed, falling back to empty array', error);
    return [];
  }
}

export async function saveQuestionsCached(questions: Question[], enforceSubjectLimit: boolean = false): Promise<void> {
  if (!questions || questions.length === 0) return;
  try {
    let allowedToSave = questions;
    if (enforceSubjectLimit) {
      const existing = await getQuestionsCached();
      const subjectCounts: Record<string, number> = {};
      for (const q of existing) {
        const subj = q.topic || 'Unknown';
        subjectCounts[subj] = (subjectCounts[subj] || 0) + 1;
      }

      allowedToSave = [];
      const csTopics = ['Computer Science', 'Operating Systems', 'Computer Networks', 'Database Systems', 'Data Structures & Algos', 'Digital Logic', 'Web Tech & Programming', 'Tech Core', 'Information Tech'];
      for (const q of questions) {
        const subj = q.topic || 'Unknown';
        const currentCount = subjectCounts[subj] || 0;
        
        // Removed 500 question capping 
        allowedToSave.push(q);
        subjectCounts[subj] = currentCount + 1;
      }
    }

    if (allowedToSave.length === 0) return;

    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      let errorOccurred = false;
      for (const question of allowedToSave) {
        const req = store.put(question);
        req.onerror = () => {
          errorOccurred = true;
          console.error('Error putting question into IndexedDB:', req.error);
        };
      }

      transaction.oncomplete = () => {
        if (errorOccurred) {
          reject(new Error('Some questions failed to save in IndexedDB'));
        } else {
          resolve();
        }
      };

      transaction.onerror = () => {
        reject(transaction.error);
      };
    });
  } catch (error) {
    console.error('IndexedDB saveQuestionsCached failed', error);
  }
}

export async function clearQuestionsCached(): Promise<void> {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (error) {
    console.error('IndexedDB clearQuestionsCached failed', error);
  }
}
