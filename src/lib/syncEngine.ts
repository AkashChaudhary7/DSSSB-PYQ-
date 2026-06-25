/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  db,
  getUserProfile, 
  getUserAttempts, 
  getUserBookmarks, 
  getUserWrongQuestions 
} from './firebase';
import { 
  saveAllAttempts, 
  saveAllBookmarks, 
  saveAllWrongQuestions 
} from './storage';
import { 
  getQuestionsCached, 
  clearQuestionsCached 
} from './indexedDB';
import { syncQuestionsFromFirestore } from './questionSync';
import { Question, QuizAttempt, BookmarkedQuestion, WrongQuestion, UserProfile } from '../types';
import { getCountFromServer, collection, getDocs, query, limit } from 'firebase/firestore';

const LAST_SYNC_KEY = 'cs_mcq_questions_last_sync_timestamp';

export interface GlobalSyncResult {
  profile: UserProfile | null;
  attempts: QuizAttempt[];
  bookmarks: BookmarkedQuestion[];
  wrongQuestions: WrongQuestion[];
  newQuestionsSynced: Question[];
  dbStatus: 'Connected' | 'Disconnected' | 'Permission Denied';
}

/**
 * Validates if the device cache has valid question data.
 * If IndexedDB is empty, we consider it "empty/corrupted" and need a re-fetch.
 */
export async function isDeviceDataEmptyOrCorrupt(): Promise<boolean> {
  try {
    const cached = await getQuestionsCached();
    // If we have no cached questions, or if it is null/undefined
    return !cached || cached.length === 0;
  } catch (error) {
    console.error('[SyncEngine] Error checking cached questions status:', error);
    return true; // assume corrupt or empty if we fail to read IndexedDB
  }
}

/**
 * Single source of truth for global data syncing.
 * Synchronizes the user profile, attempts, bookmarks, wrong questions, and question pool.
 */
export async function syncGlobalData(
  uid: string,
  selectedExams: string[]
): Promise<GlobalSyncResult> {
  const result: GlobalSyncResult = {
    profile: null,
    attempts: [],
    bookmarks: [],
    wrongQuestions: [],
    newQuestionsSynced: [],
    dbStatus: 'Connected'
  };

  try {
    // 1. Fetch user's Firestore profile document if exists (optional display info)
    const profile = await getUserProfile(uid);
    if (profile) {
      result.profile = profile;
    }

    // 2. Synchronize new/updated questions from cloud (using bundles)
    const isEmptyOrCorrupt = await isDeviceDataEmptyOrCorrupt();
    if (isEmptyOrCorrupt) {
      console.log('[SyncEngine] Local device question bank is empty or corrupted. Forcing full pull...');
      // Clear last sync to force pull everything
      localStorage.removeItem(LAST_SYNC_KEY);
    }

    const syncedQs = await syncQuestionsFromFirestore(selectedExams);
    result.newQuestionsSynced = syncedQs;

  } catch (error: any) {
    console.error('[SyncEngine] Error during global data sync:', error);
    const msg = error?.message || String(error);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('auth') || error?.code === 'permission-denied') {
      result.dbStatus = 'Permission Denied';
    } else {
      result.dbStatus = 'Disconnected';
    }
  }

  return result;
}

/**
 * Force fully clears local IndexedDB question cache, clears last sync timestamp,
 * and re-fetches the entire question bank from Firestore along with all user data.
 */
export async function forceCloudPull(
  uid: string,
  selectedExams: string[]
): Promise<GlobalSyncResult> {
  console.log(`[SyncEngine] Initializing 'Force Cloud Pull' for user ${uid}...`);

  const result: GlobalSyncResult = {
    profile: null,
    attempts: [],
    bookmarks: [],
    wrongQuestions: [],
    newQuestionsSynced: [],
    dbStatus: 'Connected'
  };

  try {
    // 1. Reset questions sync state
    await clearQuestionsCached();
    localStorage.removeItem(LAST_SYNC_KEY);

    // 2. Load Firestore Profile if available
    const profile = await getUserProfile(uid);
    if (profile) {
      result.profile = profile;
    }

    // 3. Perform a complete question re-fetch from bundles
    const freshSyncedQs = await syncQuestionsFromFirestore(selectedExams);
    result.newQuestionsSynced = freshSyncedQs;

    console.log(`[SyncEngine] 'Force Cloud Pull' completed. Re-fetched ${freshSyncedQs.length} questions.`);

  } catch (error: any) {
    console.error('[SyncEngine] Error during Force Cloud Pull:', error);
    const msg = error?.message || String(error);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('auth') || error?.code === 'permission-denied') {
      result.dbStatus = 'Permission Denied';
    } else {
      result.dbStatus = 'Disconnected';
    }
  }

  return result;
}

/**
 * Highly efficient count retrieval of the total questions present in the global Firestore collection.
 */
export async function getCloudQuestionCount(): Promise<number> {
  try {
    const coll = collection(db, 'questions');
    const snapshot = await getCountFromServer(coll);
    return snapshot.data().count;
  } catch (error) {
    console.error('[SyncEngine] Error getting cloud question count via getCountFromServer, attempting fallback:', error);
    try {
      const snap = await getDocs(query(collection(db, 'questions'), limit(1000)));
      return snap.size;
    } catch (err) {
      console.error('[SyncEngine] Fallback cloud question count failed:', err);
      return 0;
    }
  }
}

