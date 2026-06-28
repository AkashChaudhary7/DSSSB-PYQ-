/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut, 
  updateProfile,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { 
  initializeFirestore,
  getFirestore, 
  persistentLocalCache,
  persistentMultipleTabManager,
  getDocFromServer,
  doc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  arrayUnion,
  arrayRemove,
  where,
  startAfter,
  setDoc as fsetDoc,
  getDoc as fgetDoc,
  getDocs as fgetDocs,
  updateDoc as fupdateDoc,
  deleteDoc as fdeleteDoc,
  writeBatch as fwriteBatch
} from 'firebase/firestore';

// DB Monitor to track Firestore reads and writes in the current session
class DBMonitor {
  public reads = Number(localStorage.getItem('cs_mcq_session_reads') || '0');
  public writes = Number(localStorage.getItem('cs_mcq_session_writes') || '0');
  private listeners = new Set<() => void>();

  getStats() {
    return { reads: this.reads, writes: this.writes };
  }

  reset() {
    this.reads = 0;
    this.writes = 0;
    localStorage.setItem('cs_mcq_session_reads', '0');
    localStorage.setItem('cs_mcq_session_writes', '0');
    this.notify();
  }

  incrementReads(count: number = 1) {
    this.reads += count;
    localStorage.setItem('cs_mcq_session_reads', String(this.reads));
    this.notify();
  }

  incrementWrites(count: number = 1) {
    this.writes += count;
    localStorage.setItem('cs_mcq_session_writes', String(this.writes));
    this.notify();
  }

  subscribe(cb: () => void) {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify() {
    this.listeners.forEach(cb => {
      try {
        cb();
      } catch (e) {
        console.error('Error in DBMonitor listener', e);
      }
    });
  }

  isBypassed() {
    return localStorage.getItem('cs_mcq_bypass_cloud_sync') === 'true';
  }

  setBypass(val: boolean) {
    localStorage.setItem('cs_mcq_bypass_cloud_sync', val ? 'true' : 'false');
    this.notify();
  }
}

export const dbMonitor = new DBMonitor();

// Wrap core operations for live tracking and quota simulation
export async function getDoc(ref: any) {
  if (dbMonitor.isBypassed()) {
    throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
  }
  dbMonitor.incrementReads(1);
  return await fgetDoc(ref);
}

export async function getDocs(q: any) {
  if (dbMonitor.isBypassed()) {
    throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
  }
  const snap = await fgetDocs(q);
  dbMonitor.incrementReads(snap.size || 1);
  return snap;
}

export async function setDoc(ref: any, data: any, options?: any) {
  if (dbMonitor.isBypassed()) {
    throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
  }
  dbMonitor.incrementWrites(1);
  return await fsetDoc(ref, data, options);
}

export async function updateDoc(ref: any, data: any) {
  if (dbMonitor.isBypassed()) {
    throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
  }
  dbMonitor.incrementWrites(1);
  return await fupdateDoc(ref, data);
}

export async function deleteDoc(ref: any) {
  if (dbMonitor.isBypassed()) {
    throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
  }
  dbMonitor.incrementWrites(1);
  return await fdeleteDoc(ref);
}

export function writeBatch(firestoreDb: any) {
  const batch = fwriteBatch(firestoreDb);
  let count = 0;
  return {
    set(ref: any, data: any, options?: any) {
      count++;
      batch.set(ref, data, options);
      return this;
    },
    update(ref: any, data: any) {
      count++;
      batch.update(ref, data);
      return this;
    },
    delete(ref: any) {
      count++;
      batch.delete(ref);
      return this;
    },
    async commit() {
      if (dbMonitor.isBypassed()) {
        throw new Error('Firestore Quota Exhausted: Bypassed by Administrator (Simulated offline mode).');
      }
      const res = await batch.commit();
      dbMonitor.incrementWrites(count);
      return res;
    }
  };
}

export { 
  initializeFirestore,
  getFirestore, 
  persistentLocalCache,
  persistentMultipleTabManager,
  getDocFromServer,
  doc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  arrayUnion,
  arrayRemove,
  where,
  startAfter
};
import { UserProfile, Badge, QuizAttempt, BookmarkedQuestion, LeaderboardEntry, WrongQuestion } from '../types';

import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Initialize Firestore with robust persistent local cache for flawless offline operation
let dbInstance;
try {
  dbInstance = initializeFirestore(app, {
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager()
    })
  }, firebaseConfig.firestoreDatabaseId);
  console.log('[Firestore] Successfully initialized with persistent local cache.');
} catch (e) {
  console.warn('[Firestore] Failed to initialize with persistent local cache, falling back to standard initialization:', e);
  dbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
}

export const db = dbInstance;

// Validate connection to Firestore as required by the Firebase Integration Skill
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firestore] Connection validated successfully.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    } else {
      console.info('[Firestore] Offline mode active or connection pending, utilizing offline cache safely.');
    }
  }
}
testConnection();

// Core initial badges
export const AVAILABLE_BADGES: Omit<Badge, 'unlockedAt'>[] = [
  {
    id: 'first_steps',
    title: 'First Steps',
    description: 'Completed your first subtopic practice quiz attempt.',
    icon: 'Compass',
    category: 'quiz'
  },
  {
    id: 'perfect_accuracy',
    title: 'Perfect Mastery',
    description: 'Achieved 100% accuracy on a subtopic practice quiz.',
    icon: 'Target',
    category: 'accuracy'
  },
  {
    id: 'speed_demon',
    title: 'Speed Demon',
    description: 'Finished any practice quiz under 90 seconds.',
    icon: 'Zap',
    category: 'speed'
  },
  {
    id: 'quiz_master',
    title: 'Trivia Commander_01',
    description: 'Completed at least 5 different quiz attempts.',
    icon: 'Award',
    category: 'quiz'
  },
  {
    id: 'revision_scholar',
    title: 'Active Recall Patron',
    description: 'Bookmarked 3 or more tricky questions for targeted revision.',
    icon: 'BookMarked',
    category: 'revision'
  },
  {
    id: 'flashcard_explorer',
    title: 'Flashcard Explorer',
    description: 'Studied flashcards to deep-dive conceptual terminology.',
    icon: 'Layers',
    category: 'flashcard'
  },
  {
    id: 'leaderboard_climber',
    title: 'Leaderboard Hero',
    description: 'Amassed over 500 practice points on the scoreboards.',
    icon: 'TrendingUp',
    category: 'social'
  }
];

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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

export function handleFirestoreError(error: any, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid || null,
      email: auth.currentUser?.email || null,
      emailVerified: auth.currentUser?.emailVerified || null,
      isAnonymous: auth.currentUser?.isAnonymous || null,
    },
    operationType,
    path
  };
  console.error('Firestore Error details:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Helper to initialize custom firestore profile
export async function setupUserProfile(user: User, customName?: string): Promise<UserProfile> {
  const profile: UserProfile = {
    uid: user.uid,
    email: user.email || null,
    displayName: customName || user.displayName || user.email?.split('@')[0] || 'Anonymous Developer',
    points: 0,
    badges: [],
    flashcardSessionsCount: 0
  };

  const userRef = doc(db, 'users', user.uid);
  try {
    const userSnap = await getDoc(userRef);

    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }

    await setDoc(userRef, profile);

    // Initialize Leaderboard entry
    await updateLeaderboardEntry(profile, 0);

  } catch (error: any) {
    console.error('Error in setupUserProfile (often due to rules propagation delay):', error);
    const msg = error?.message || String(error);
    if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('auth') || error?.code === 'permission-denied') {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}`);
    }
  }

  return profile;
}

// Diagnostic helper to debug firebase access and profile issues live in the console
export async function runDiagnosticLogs(user: User): Promise<void> {
  console.log(`[Diagnostic] Starting Firebase diagnostics for user ${user.uid} (${user.email || 'no-email'})`);
  
  // 1. Check user document existence
  try {
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      console.log(`[Diagnostic] SUCCESS: User document exists in users/${user.uid}. Data:`, userSnap.data());
    } else {
      console.log(`[Diagnostic] INFO: User document does NOT exist in users/${user.uid} yet (will be created on first profile setup).`);
    }
  } catch (err: any) {
    console.error(`[Diagnostic] ERROR reading user document at users/${user.uid}:`, err.message || err);
  }

  // 2. Check attempts sub-collection
  try {
    const attemptsRef = collection(db, 'users', user.uid, 'attempts');
    const attemptsSnap = await getDocs(query(attemptsRef, limit(1)));
    console.log(`[Diagnostic] SUCCESS: Successfully read 'attempts' sub-collection. Found ${attemptsSnap.size} documents.`);
  } catch (err: any) {
    console.error(`[Diagnostic] ERROR reading 'attempts' sub-collection:`, err.message || err);
  }

  // 3. Check bookmarks sub-collection
  try {
    const bookmarksRef = collection(db, 'users', user.uid, 'bookmarks');
    const bookmarksSnap = await getDocs(query(bookmarksRef, limit(1)));
    console.log(`[Diagnostic] SUCCESS: Successfully read 'bookmarks' sub-collection. Found ${bookmarksSnap.size} documents.`);
  } catch (err: any) {
    console.error(`[Diagnostic] ERROR reading 'bookmarks' sub-collection:`, err.message || err);
  }
}

// Fetch user profile
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
      return userSnap.data() as UserProfile;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user profile:', error);
    return null;
  }
}

// Update points and potentially award badges
export async function syncUserData(
  uid: string, 
  updates: Partial<UserProfile> & { newAttempts?: QuizAttempt[], newBookmarks?: BookmarkedQuestion[] }
): Promise<UserProfile | null> {
  try {
    const userRef = doc(db, 'users', uid);
    const profile = await getUserProfile(uid);
    if (!profile) return null;

    const merged = { ...profile, ...updates };
    delete (merged as any).newAttempts;
    delete (merged as any).newBookmarks;

    await updateDoc(userRef, merged);

    // Helper to chunk arrays into batches of 100
    const chunkArray = <T>(arr: T[], size: number): T[][] => {
      const chunks = [];
      for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
      }
      return chunks;
    };

    // Sync subcollections in batches
    if (updates.newAttempts && updates.newAttempts.length > 0) {
      const chunks = chunkArray(updates.newAttempts, 100);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const attempt of chunk) {
          batch.set(doc(db, 'users', uid, 'attempts', attempt.id), attempt);
        }
        await batch.commit();
      }
    }

    if (updates.newBookmarks && updates.newBookmarks.length > 0) {
      const chunks = chunkArray(updates.newBookmarks, 100);
      for (const chunk of chunks) {
        const batch = writeBatch(db);
        for (const b of chunk) {
          batch.set(doc(db, 'users', uid, 'bookmarks', b.questionId), b);
        }
        await batch.commit();
      }
    }

    // Refresh Leaderboard entry
    const attemptsColl = await getDocs(collection(db, 'users', uid, 'attempts'));
    const quizzesCount = attemptsColl.size;

    await updateLeaderboardEntry(merged, quizzesCount);

    return merged;
  } catch (error) {
    console.error('Error syncing user data:', error);
    return null;
  }
}

// Global leaderboard update
export async function updateLeaderboardEntry(profile: UserProfile, quizzesCount: number): Promise<void> {
  try {
    const leadRef = doc(db, 'leaderboard', profile.uid);
    const entry: LeaderboardEntry = {
      uid: profile.uid,
      displayName: profile.displayName,
      points: profile.points,
      badgesCount: profile.badges.length,
      quizzesCount: quizzesCount,
      updatedAt: new Date().toISOString()
    };
    await setDoc(leadRef, entry);
  } catch (error) {
    console.error('Error updating leaderboard entry:', error);
  }
}

// Fetch general leaderboard data
export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const q = query(
      collection(db, 'leaderboard'), 
      orderBy('points', 'desc'), 
      limit(25)
    );
    const snap = await getDocs(q);
    const leaders: LeaderboardEntry[] = [];
    snap.forEach((doc) => {
      leaders.push(doc.data() as LeaderboardEntry);
    });
    return leaders;
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}

// Fetch user subcollection efforts
export async function getUserAttempts(uid: string): Promise<QuizAttempt[]> {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'attempts'));
    const attempts: QuizAttempt[] = [];
    snap.forEach((doc) => {
      attempts.push(doc.data() as QuizAttempt);
    });
    return attempts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  } catch (e) {
    console.error('Error fetching user attempts: ', e);
    return [];
  }
}

export async function getUserBookmarks(uid: string): Promise<BookmarkedQuestion[]> {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'bookmarks'));
    const bookmarks: BookmarkedQuestion[] = [];
    snap.forEach((doc) => {
      bookmarks.push(doc.data() as BookmarkedQuestion);
    });
    return bookmarks;
  } catch (e) {
    console.error('Error fetching user bookmarks: ', e);
    return [];
  }
}

export async function addFirestoreBookmark(uid: string, bookmark: BookmarkedQuestion): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid, 'bookmarks', bookmark.questionId), bookmark);
  } catch (e) {
    console.error(e);
  }
}

export async function removeFirestoreBookmark(uid: string, questionId: string): Promise<void> {
  try {
    const docRef = doc(db, 'users', uid, 'bookmarks', questionId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error(e);
  }
}

export async function getUserWrongQuestions(uid: string): Promise<WrongQuestion[]> {
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'wrong_questions'));
    const wrongQs: WrongQuestion[] = [];
    snap.forEach((doc) => {
      wrongQs.push(doc.data() as WrongQuestion);
    });
    return wrongQs;
  } catch (e) {
    console.error('Error fetching user wrong questions: ', e);
    return [];
  }
}

export async function addFirestoreWrongQuestion(uid: string, wrongQ: WrongQuestion): Promise<void> {
  try {
    await setDoc(doc(db, 'users', uid, 'wrong_questions', wrongQ.questionId), wrongQ);
  } catch (e) {
    console.error(e);
  }
}

export async function removeFirestoreWrongQuestion(uid: string, questionId: string): Promise<void> {
  try {
    const docRef = doc(db, 'users', uid, 'wrong_questions', questionId);
    await deleteDoc(docRef);
  } catch (e) {
    console.error(e);
  }
}
