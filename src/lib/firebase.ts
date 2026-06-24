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
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  limit, 
  updateDoc, 
  arrayUnion,
  arrayRemove,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { UserProfile, Badge, QuizAttempt, BookmarkedQuestion, LeaderboardEntry, WrongQuestion } from '../types';

// Configuration from firebase-applet-config.json
const firebaseConfig = {
  apiKey: "AIzaSyAIX08t52dOObRKfSslQBdodY_kqaDfVQA",
  authDomain: "corded-sight-05xj8.firebaseapp.com",
  projectId: "corded-sight-05xj8",
  storageBucket: "corded-sight-05xj8.firebasestorage.app",
  messagingSenderId: "586788799831",
  appId: "1:586788799831:web:c6aeda2bcb25b5c1032a12"
};

const databaseId = "ai-studio-a6e92202-5cbc-4357-bc91-3f7ae6512a23";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, databaseId);

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

// Helper to initialize custom firestore profile
export async function setupUserProfile(user: User, customName?: string): Promise<UserProfile> {
  const userRef = doc(db, 'users', user.uid);
  const userSnap = await getDoc(userRef);

  if (userSnap.exists()) {
    return userSnap.data() as UserProfile;
  }

  const profile: UserProfile = {
    uid: user.uid,
    email: user.email,
    displayName: customName || user.displayName || user.email?.split('@')[0] || 'Anonymous Developer',
    points: 0,
    badges: [],
    flashcardSessionsCount: 0
  };

  await setDoc(userRef, profile);

  // Initialize Leaderboard entry
  await updateLeaderboardEntry(profile, 0);

  return profile;
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
