/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Question, QuizAttempt, BookmarkedQuestion, WrongQuestion, ExamConfig } from '../types';
import { DEFAULT_QUESTIONS } from '../data/defaultQuestions';
import { DSSSB_DEFAULT_QUESTIONS } from '../data/dsssbDefaultQuestions';
import { EXAMS_PRESET } from '../data/examsPreset';
import { auth, addFirestoreBookmark, removeFirestoreBookmark, db, addFirestoreWrongQuestion, removeFirestoreWrongQuestion } from './firebase';
import { doc, setDoc } from 'firebase/firestore';
import { uploadQuestionsInChunks } from './questionSync';

const CUSTOM_QUESTIONS_KEY = 'cs_mcq_custom_questions';
const ATTEMPTS_KEY = 'cs_mcq_quiz_attempts';
const BOOKMARKS_KEY = 'cs_mcq_bookmarks';
const EXAMS_CONFIG_KEY = 'cs_mcq_exams_config';
const SELECTED_EXAMS_KEY = 'cs_mcq_selected_exams';

export function getExamsConfig(): ExamConfig[] {
  try {
    const raw = localStorage.getItem(EXAMS_CONFIG_KEY);
    if (!raw) {
      return EXAMS_PRESET;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse exams config, returning presets', e);
    return EXAMS_PRESET;
  }
}

export function saveExamsConfig(configs: ExamConfig[]): void {
  try {
    localStorage.setItem(EXAMS_CONFIG_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error('Failed to save exams config', e);
  }
}

export function getSelectedExams(): string[] {
  try {
    const raw = localStorage.getItem(SELECTED_EXAMS_KEY);
    if (!raw) {
      return ['dsssb_tgt_cs', 'dsssb_it']; // default selection
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length >= 1) {
      return parsed;
    }
    return ['dsssb_tgt_cs', 'dsssb_it'];
  } catch (e) {
    console.error('Failed to parse selected exams', e);
    return ['dsssb_tgt_cs', 'dsssb_it'];
  }
}

export function saveSelectedExams(examIds: string[]): void {
  try {
    localStorage.setItem(SELECTED_EXAMS_KEY, JSON.stringify(examIds));
  } catch (e) {
    console.error('Failed to save selected exams', e);
  }
}

// Helper to check user and save background
async function saveAttemptToFirestore(attempt: QuizAttempt) {
  try {
    const user = auth.currentUser;
    if (user) {
      await setDoc(doc(db, 'users', user.uid, 'attempts', attempt.id), attempt);
    }
  } catch (e) {
    console.error('Error saving attempt to Firestore in background:', e);
  }
}

async function saveBookmarkToFirestore(questionId: string, isDeleted: boolean) {
  try {
    const user = auth.currentUser;
    if (user) {
      if (isDeleted) {
        await removeFirestoreBookmark(user.uid, questionId);
      } else {
        await addFirestoreBookmark(user.uid, {
          questionId,
          bookmarkedAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.error('Error saving bookmark to Firestore in background:', e);
  }
}

// Retrieve all available questions (default packaged questions + custom generated questions)
export function getAllQuestions(): Question[] {
  try {
    const customStr = localStorage.getItem(CUSTOM_QUESTIONS_KEY);
    const customQuestions: Question[] = customStr ? JSON.parse(customStr) : [];
    return [...DEFAULT_QUESTIONS, ...DSSSB_DEFAULT_QUESTIONS, ...customQuestions];
  } catch (e) {
    console.error('Failed to parse custom questions:', e);
    return [...DEFAULT_QUESTIONS, ...DSSSB_DEFAULT_QUESTIONS];
  }
}

// Save a pool of newly generated questions (caches to IndexedDB and triggers Firestore upload)
export function saveCustomQuestions(newQuestions: Question[]): void {
  try {
    const customStr = localStorage.getItem(CUSTOM_QUESTIONS_KEY);
    const existingCustom: Question[] = customStr ? JSON.parse(customStr) : [];
    
    // Prevent duplicate insertion
    const existingIds = new Set(existingCustom.map(q => q.id));
    const uniqueNew = newQuestions.filter(q => !existingIds.has(q.id));
    
    const updatedCustom = [...existingCustom, ...uniqueNew];
    localStorage.setItem(CUSTOM_QUESTIONS_KEY, JSON.stringify(updatedCustom));

    // Upload to Firestore and save in IndexedDB in the background
    uploadQuestionsInChunks(newQuestions).catch((err) => {
      console.error('Background question upload failed:', err);
    });
  } catch (e) {
    console.error('Failed to save custom questions:', e);
  }
}

// Retrieve custom subtopic generated questions
export function getCustomQuestions(): Question[] {
  try {
    const customStr = localStorage.getItem(CUSTOM_QUESTIONS_KEY);
    return customStr ? JSON.parse(customStr) : [];
  } catch (e) {
    console.error('Failed to parse custom questions:', e);
    return [];
  }
}

// Retrieve historical quiz attempts
export function getQuizAttempts(): QuizAttempt[] {
  try {
    const attemptsStr = localStorage.getItem(ATTEMPTS_KEY);
    return attemptsStr ? JSON.parse(attemptsStr) : [];
  } catch (e) {
    console.error('Failed to parse quiz attempts:', e);
    return [];
  }
}

// Save a new completed quiz attempt
export function saveQuizAttempt(attempt: QuizAttempt): void {
  const attempts = getQuizAttempts();
  attempts.unshift(attempt); // newest first
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  
  // Firestore sync
  saveAttemptToFirestore(attempt);
}

// Retrieve bookmarked question IDs
export function getBookmarks(): BookmarkedQuestion[] {
  try {
    const bookmarksStr = localStorage.getItem(BOOKMARKS_KEY);
    return bookmarksStr ? JSON.parse(bookmarksStr) : [];
  } catch (e) {
    console.error('Failed to parse bookmarks:', e);
    return [];
  }
}

// Overwrite all bookmarks
export function saveAllBookmarks(bookmarks: BookmarkedQuestion[]): void {
  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
}

// Overwrite all attempts
export function saveAllAttempts(attempts: QuizAttempt[]): void {
  localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
}

// Toggle a bookmark
export function toggleBookmark(questionId: string): boolean {
  const bookmarks = getBookmarks();
  const index = bookmarks.findIndex(b => b.questionId === questionId);
  let isBookmarkedNow = false;

  if (index >= 0) {
    bookmarks.splice(index, 1);
    isBookmarkedNow = false;
    saveBookmarkToFirestore(questionId, true);
  } else {
    bookmarks.push({
      questionId,
      bookmarkedAt: new Date().toISOString()
    });
    isBookmarkedNow = true;
    saveBookmarkToFirestore(questionId, false);
  }

  localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks));
  return isBookmarkedNow;
}

const WRONG_QUESTIONS_KEY = 'cs_mcq_wrong_questions';

async function saveWrongQuestionToFirestore(questionId: string, isDeleted: boolean) {
  try {
    const user = auth.currentUser;
    if (user) {
      if (isDeleted) {
        await removeFirestoreWrongQuestion(user.uid, questionId);
      } else {
        await addFirestoreWrongQuestion(user.uid, {
          questionId,
          addedAt: new Date().toISOString()
        });
      }
    }
  } catch (e) {
    console.error('Error saving wrong question to Firestore in background:', e);
  }
}

export function getWrongQuestions(): WrongQuestion[] {
  try {
    const wrongStr = localStorage.getItem(WRONG_QUESTIONS_KEY);
    return wrongStr ? JSON.parse(wrongStr) : [];
  } catch (e) {
    console.error('Failed to parse wrong questions:', e);
    return [];
  }
}

export function saveAllWrongQuestions(wrongQs: WrongQuestion[]): void {
  localStorage.setItem(WRONG_QUESTIONS_KEY, JSON.stringify(wrongQs));
}

export function addWrongQuestion(questionId: string): void {
  const wrongQs = getWrongQuestions();
  if (!wrongQs.some(q => q.questionId === questionId)) {
    wrongQs.push({
      questionId,
      addedAt: new Date().toISOString()
    });
    localStorage.setItem(WRONG_QUESTIONS_KEY, JSON.stringify(wrongQs));
    saveWrongQuestionToFirestore(questionId, false);
  }
}

export function removeWrongQuestion(questionId: string): void {
  const wrongQs = getWrongQuestions();
  const idx = wrongQs.findIndex(q => q.questionId === questionId);
  if (idx >= 0) {
    wrongQs.splice(idx, 1);
    localStorage.setItem(WRONG_QUESTIONS_KEY, JSON.stringify(wrongQs));
    saveWrongQuestionToFirestore(questionId, true);
  }
}

// Reset data (for analytics testing & user sanity)
export function clearAllUserData(): void {
  localStorage.removeItem(CUSTOM_QUESTIONS_KEY);
  localStorage.removeItem(ATTEMPTS_KEY);
  localStorage.removeItem(BOOKMARKS_KEY);
  localStorage.removeItem(WRONG_QUESTIONS_KEY);
}
