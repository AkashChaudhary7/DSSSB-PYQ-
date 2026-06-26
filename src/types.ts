/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Question {
  id: string;
  topic: string; // Used for Subject name
  subtopic: string;
  difficulty: Difficulty;
  text: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  source?: string;
  isCustom?: boolean;
  exam?: string;
  part?: 'A' | 'B';
}

export interface ExamRule {
  numQuestions: number;
  timeLimitMinutes: number;
  negativeMarking: number; // e.g. -0.25, -0.33, 0
  subjectAllotments: Record<string, number>;
}

export interface ExamSubject {
  name: string;
  topics: {
    name: string;
    subtopics: string[];
  }[];
}

export interface ExamConfig {
  id: string;
  name: string;
  subjects: ExamSubject[];
  rules: ExamRule;
  targetScore?: number;
  targetDate?: string;
}

export interface QuizAttempt {
  id: string;
  topic: string;
  subtopic: string;
  timestamp: string;
  questionsCount: number;
  correctAnswersCount: number;
  timeTakenSeconds: number;
  difficulty: Difficulty | 'mixed';
  isTimed: boolean;
  isMockExam?: boolean;
  examId?: string;
  questions: {
    questionId: string;
    questionText: string;
    selectedOptionIndex: number; // -1 if skipped or timed out
    correctOptionIndex: number;
    isCorrect: boolean;
    topic?: string;
    subtopic?: string;
  }[];
}

export interface TopicConfig {
  name: string;
  subtopics: string[];
  icon: string; // name of Lucide icon to display
}

export interface BookmarkedQuestion {
  questionId: string;
  bookmarkedAt: string;
}

export interface WrongQuestion {
  questionId: string;
  addedAt: string;
}

export interface Badge {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name
  unlockedAt: string;
  category: 'quiz' | 'accuracy' | 'speed' | 'flashcard' | 'revision' | 'social';
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string;
  points: number;
  badges: Badge[];
  flashcardSessionsCount: number;
  targetExam?: string;
}

export interface LeaderboardEntry {
  uid: string;
  displayName: string;
  points: number;
  badgesCount: number;
  quizzesCount: number;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  topic: string;
  subtopic: string;
  difficulty: Difficulty;
  front: string; // The concept question
  back: string;  // Detailed explanation & answer
  correctAnswer?: string; // Optional direct answer
  options?: string[]; // Optional options to help study
}

