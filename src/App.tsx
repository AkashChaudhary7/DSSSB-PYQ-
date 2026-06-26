/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
const HomeView = lazy(() => import('./components/HomeView'));
const PracticeView = lazy(() => import('./components/PracticeView'));
const QuizView = lazy(() => import('./components/QuizView'));
const BookmarkedQuestions = lazy(() => import('./components/BookmarkedQuestions'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const QuestionUploader = lazy(() => import('./components/QuestionUploader'));
const UserAuth = lazy(() => import('./components/UserAuth'));
const RoadmapView = lazy(() => import('./components/RoadmapView'));
import { Question, QuizAttempt, UserProfile, Badge, WrongQuestion } from './types';
import { 
  getAllQuestions, 
  getQuizAttempts, 
  saveQuizAttempt, 
  clearAllUserData,
  saveAllBookmarks,
  saveAllAttempts,
  getBookmarks,
  saveAllWrongQuestions,
  getWrongQuestions,
  addWrongQuestion,
  getSelectedExams
} from './lib/storage';
import { 
  auth, 
  getUserProfile, 
  syncUserData, 
  setupUserProfile, 
  getUserAttempts, 
  getUserBookmarks,
  getUserWrongQuestions,
  runDiagnosticLogs
} from './lib/firebase';
import { onAuthStateChanged, User, signInAnonymously } from 'firebase/auth';
import * as Icons from 'lucide-react';
import { getQuestionsCached, clearQuestionsCached } from './lib/indexedDB';
import { syncQuestionsFromFirestore } from './lib/questionSync';
import { syncGlobalData, forceCloudPull } from './lib/syncEngine';
import { motion, AnimatePresence } from 'motion/react';

type MainView = 'home' | 'practice' | 'quiz' | 'bookmarks' | 'analytics' | 'generator' | 'roadmap';

export default function App() {
  const [view, setView] = useState<MainView>('home');
  const [currentExam, setCurrentExam] = useState<string>(() => {
    try {
      const active = localStorage.getItem('cs_mcq_active_exam');
      return active || '';
    } catch {
      return '';
    }
  });

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('cs_mcq_theme');
      return (saved as 'light' | 'dark') || 'dark';
    } catch {
      return 'dark';
    }
  });

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      localStorage.setItem('cs_mcq_theme', nextTheme);
    } catch (e) {}
  };
  
  // Auth state buckets (Fully offline-first!)
  const [currentUser, setCurrentUser] = useState<any | null>(() => {
    try {
      const name = localStorage.getItem('cs_mcq_local_name') || 'Scholar';
      return {
        uid: 'offline_guest',
        displayName: name,
        email: 'guest@offline.local'
      };
    } catch {
      return {
        uid: 'offline_guest',
        displayName: 'Scholar',
        email: 'guest@offline.local'
      };
    }
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('cs_mcq_local_profile');
      if (saved) return JSON.parse(saved);
    } catch {}
    
    const initialProfile: UserProfile = {
      uid: 'offline_guest',
      email: 'guest@offline.local',
      displayName: localStorage.getItem('cs_mcq_local_name') || 'Scholar',
      points: Number(localStorage.getItem('cs_mcq_points') || '0'),
      badges: [],
      targetExam: localStorage.getItem('cs_mcq_active_exam') || '',
      flashcardSessionsCount: 0
    };
    try {
      const rawBadges = localStorage.getItem('cs_mcq_badges');
      if (rawBadges) {
        initialProfile.badges = JSON.parse(rawBadges);
      }
    } catch {}
    return initialProfile;
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [firestoreSyncError, setFirestoreSyncError] = useState<string | null>(null);

  // Local Guest states (or default fallbacks)
  const [localPoints, setLocalPoints] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('cs_mcq_points') || '0');
    } catch {
      return 0;
    }
  });
  const [localBadges, setLocalBadges] = useState<Badge[]>(() => {
    try {
      const raw = localStorage.getItem('cs_mcq_badges');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  // State buckets
  const [questionPool, setQuestionPool] = useState<Question[]>([]);
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [showAuthScreen, setShowAuthScreen] = useState(false);
  const [newUnlockedBadge, setNewUnlockedBadge] = useState<Badge | null>(null);
  
  // Admin password states
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(() => {
    try {
      return localStorage.getItem('cs_mcq_admin_unlocked') === 'true';
    } catch {
      return false;
    }
  });
  const [showAdminPasswordModal, setShowAdminPasswordModal] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [adminErrorMsg, setAdminErrorMsg] = useState('');
  
  // Current active quiz config
  const [quizConfig, setQuizConfig] = useState<{
    topic: string;
    subtopic: string;
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
    isTimed: boolean;
    isMockExam?: boolean;
    customCount?: number;
    overrideQuestions?: Question[];
  } | null>(null);

  // PWA Install State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showIOSPrompt, setShowIOSPrompt] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true) {
      setIsInstalled(true);
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (isIOS && isSafari) {
      setShowIOSPrompt(true);
    }

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      if (showIOSPrompt) {
        alert('To install on iOS: tap the Share button and select "Add to Home Screen".');
      }
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
      setDeferredPrompt(null);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const [pullProgress, setPullProgress] = useState(0); // 0 to 1
  const startY = useRef(0);
  const isPulling = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    const container = document.getElementById('main-view-container');
    if (container && container.scrollTop === 0) {
      startY.current = e.touches[0].clientY;
      isPulling.current = true;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling.current || isSyncing) return;
    const y = e.touches[0].clientY;
    const diff = y - startY.current;
    if (diff > 0) {
      // Pull down
      const progress = Math.min(diff / 100, 1);
      setPullProgress(progress);
    }
  };

  const handleTouchEnd = async () => {
    if (isPulling.current && pullProgress > 0.8 && !isSyncing) {
      setIsSyncing(true);
      try {
        const selectedExams = getSelectedExams();
        const syncedQs = await syncQuestionsFromFirestore(selectedExams);
        if (syncedQs && syncedQs.length > 0) {
          localStorage.setItem('cs_mcq_last_sync_time', Date.now().toString());
        }
      } catch (err) {
        console.warn('[Sync] Pull-to-refresh questions pull failed:', err);
      }
      await syncLocalState();
      setTimeout(() => {
        setIsSyncing(false);
        setPullProgress(0);
      }, 800); // little delay to show success
    } else {
      setPullProgress(0);
    }
    isPulling.current = false;
  };

  // Subtopic parameter to pass to generator
  const [generatorPreFill, setGeneratorPreFill] = useState<string>('');

  // Local-only fast profile persistence
  const saveLocalUserProfile = (updatedProfile: UserProfile) => {
    setUserProfile(updatedProfile);
    try {
      localStorage.setItem('cs_mcq_local_profile', JSON.stringify(updatedProfile));
      localStorage.setItem('cs_mcq_local_name', updatedProfile.displayName);
      localStorage.setItem('cs_mcq_points', String(updatedProfile.points));
      localStorage.setItem('cs_mcq_badges', JSON.stringify(updatedProfile.badges));
    } catch (e) {
      console.warn("Storage write error:", e);
    }
  };

  useEffect(() => {
    if (currentExam && userProfile && userProfile.targetExam !== currentExam) {
      const updated = { ...userProfile, targetExam: currentExam };
      saveLocalUserProfile(updated);
    }
  }, [currentExam]);

  const syncLocalState = async () => {
    // Refresh local user profile and guest states
    try {
      const name = localStorage.getItem('cs_mcq_local_name') || 'Scholar';
      setCurrentUser({
        uid: 'offline_guest',
        displayName: name,
        email: 'guest@offline.local'
      });
      
      const saved = localStorage.getItem('cs_mcq_local_profile');
      if (saved) {
        setUserProfile(JSON.parse(saved));
      } else {
        setUserProfile({
          uid: 'offline_guest',
          email: 'guest@offline.local',
          displayName: name,
          points: Number(localStorage.getItem('cs_mcq_points') || '0'),
          badges: [],
          targetExam: localStorage.getItem('cs_mcq_active_exam') || '',
          flashcardSessionsCount: 0
        });
      }
    } catch (e) {
      console.warn(e);
    }

    // 1. Set the initial pool from defaults + local storage custom
    const baseQuestions = getAllQuestions();
    
    // 2. Load cached questions from IndexedDB and combine
    try {
      const cached = await getQuestionsCached();
      const seenIds = new Set(baseQuestions.map(q => q.id));
      const uniqueCached = cached.filter(q => !seenIds.has(q.id));
      setQuestionPool([...baseQuestions, ...uniqueCached]);
    } catch (err) {
      console.error("Failed to load IndexedDB cached questions:", err);
      setQuestionPool(baseQuestions);
    }

    setAttempts(getQuizAttempts());
    
    // Check and trigger active bookmarks count badge
    const currentBookmarks = getBookmarks();
    if (currentBookmarks.length >= 3) {
      triggerBookmarkBadgeUnlock();
    }
  };

  // Run initial local state sync
  useEffect(() => {
    syncLocalState();
  }, []);

  // Background anonymous auth sign-in for seamless Firestore rules compliance
  useEffect(() => {
    signInAnonymously(auth)
      .then(async (cred) => {
        console.log('[Auth] Logged in anonymously under Firebase UID:', cred.user.uid);
        try {
          const selectedExams = getSelectedExams();
          await syncQuestionsFromFirestore(selectedExams);
          await syncLocalState();
        } catch (syncErr) {
          console.warn('[Sync] Initial background questions pull failed:', syncErr);
        }
      })
      .catch(async (err: any) => {
        if (err?.code === 'auth/admin-restricted-operation') {
          console.info('[Auth] Note: Anonymous auth is disabled in your Firebase Console. Continuing with unauthenticated sync (fully supported & safe!).');
        } else {
          console.warn('[Auth] Anonymous auth failed (continuing with unauthenticated sync):', err);
        }
        try {
          const selectedExams = getSelectedExams();
          const syncedQs = await syncQuestionsFromFirestore(selectedExams);
          if (syncedQs && syncedQs.length > 0) {
            localStorage.setItem('cs_mcq_last_sync_time', Date.now().toString());
          }
          await syncLocalState();
        } catch (syncErr) {
          console.warn('[Sync] Unauthenticated background questions pull failed:', syncErr);
        }
      });
  }, []);

  const handleForceCloudPull = async () => {
    setAuthLoading(true);
    setFirestoreSyncError(null);
    try {
      console.log('[Sync] Forcefully pulling questions from cloud database...');
      const selectedExams = getSelectedExams();
      localStorage.removeItem('cs_mcq_questions_last_sync_timestamp');
      await clearQuestionsCached();
      const syncedQs = await syncQuestionsFromFirestore(selectedExams);
      console.log(`[Sync] Force cloud pull completed. Fetched ${syncedQs.length} questions.`);
      localStorage.setItem('cs_mcq_last_sync_time', Date.now().toString());
      await syncLocalState();
    } catch (err: any) {
      console.error('[Sync] Force cloud pull failed:', err);
      setFirestoreSyncError(err?.message || String(err));
    } finally {
      setAuthLoading(false);
    }
  };

  const triggerBookmarkBadgeUnlock = () => {
    const existingBadges = userProfile?.badges || localBadges;
    if (!existingBadges.some(b => b.id === 'revision_scholar')) {
      const badge: Badge = {
        id: 'revision_scholar',
        title: 'Active Recall Patron',
        description: 'Bookmarked 3 or more tricky questions for targeted revision.',
        icon: 'BookMarked',
        unlockedAt: new Date().toISOString(),
        category: 'revision'
      };
      const updatedBadges = [...existingBadges, badge];
      setNewUnlockedBadge(badge);

      const nextProfile: UserProfile = {
        ...(userProfile || {
          uid: 'offline_guest',
          email: 'guest@offline.local',
          displayName: 'Scholar',
          targetExam: currentExam,
          flashcardSessionsCount: 0
        }),
        badges: updatedBadges
      };
      saveLocalUserProfile(nextProfile);
      setLocalBadges(updatedBadges);
    }
  };

  const handleSelectSubtopic = (
    topic: string, 
    subtopic: string, 
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed', 
    isTimed: boolean,
    isMockExam?: boolean,
    customCount?: number
  ) => {
    setQuizConfig({ topic, subtopic, difficulty, isTimed, isMockExam, customCount });
    setView('quiz');
  };

  const handleQuizFinished = async (newAttempt: QuizAttempt) => {
    // 1. Calculate points
    let pointsEarned = 50; // base finished quiz
    newAttempt.questions.forEach((q) => {
      if (q.isCorrect) {
        const fullQ = questionPool.find(qp => qp.id === q.questionId);
        const diff = fullQ?.difficulty || 'medium';
        if (diff === 'easy') pointsEarned += 10;
        else if (diff === 'medium') pointsEarned += 15;
        else if (diff === 'hard') pointsEarned += 20;
      }
    });

    // Speed bonus
    if (newAttempt.isTimed && newAttempt.timeTakenSeconds < 90) {
      pointsEarned += 15;
    }

    saveQuizAttempt(newAttempt);

    // Save incorrect questions to the wrong questions pool automatically
    newAttempt.questions.forEach((q) => {
      if (!q.isCorrect) {
        addWrongQuestion(q.questionId);
      }
    });

    // 2. Handle badges checks
    const currentTotalPoints = (userProfile?.points || localPoints) + pointsEarned;
    const existingBadges = userProfile?.badges || localBadges;
    const unlockedBadges = [...existingBadges];

    const hasId = (id: string) => unlockedBadges.some(b => b.id === id);

    const unlock = (id: string, title: string, description: string, icon: string, category: Badge['category']) => {
      const badge: Badge = { id, title, description, icon, unlockedAt: new Date().toISOString(), category };
      unlockedBadges.push(badge);
      setNewUnlockedBadge(badge);
    };

    const allAttempts = [...attempts, newAttempt];
    const isPerfect = newAttempt.correctAnswersCount === newAttempt.questionsCount && newAttempt.questionsCount > 0;
    const isFast = newAttempt.isTimed && newAttempt.timeTakenSeconds < 90;

    if (!hasId('first_steps') && allAttempts.length >= 1) {
      unlock('first_steps', 'First Steps', 'Completed your first subtopic practice quiz attempt.', 'Compass', 'quiz');
    }
    if (!hasId('perfect_accuracy') && isPerfect) {
      unlock('perfect_accuracy', 'Perfect Mastery', 'Achieved 100% accuracy on a subtopic practice quiz.', 'Target', 'accuracy');
    }
    if (!hasId('speed_demon') && isFast) {
      unlock('speed_demon', 'Speed Demon', 'Finished any practice quiz under 90 seconds.', 'Zap', 'speed');
    }
    if (!hasId('quiz_master') && allAttempts.length >= 5) {
      unlock('quiz_master', 'Trivia Commander_01', 'Completed at least 5 different quiz attempts.', 'Award', 'quiz');
    }
    if (!hasId('leaderboard_climber') && currentTotalPoints > 500) {
      unlock('leaderboard_climber', 'Leaderboard Hero', 'Amassed over 500 practice points on the scoreboards.', 'TrendingUp', 'social');
    }

    // 3. Local-first offline-only persistence
    setLocalPoints(currentTotalPoints);
    setLocalBadges(unlockedBadges);
    localStorage.setItem('cs_mcq_points', String(currentTotalPoints));
    localStorage.setItem('cs_mcq_badges', JSON.stringify(unlockedBadges));

    // Update active local profile
    const saved = localStorage.getItem('cs_mcq_local_profile');
    const profile = saved ? JSON.parse(saved) : {};
    profile.points = currentTotalPoints;
    profile.badges = unlockedBadges;
    localStorage.setItem('cs_mcq_local_profile', JSON.stringify(profile));
    setUserProfile(profile);

    syncLocalState(); // load newest attempts
    setView('analytics'); // transition to dashboard instantly to view progress
  };

  const handleGoToGenerator = (subtopic: string) => {
    setGeneratorPreFill(subtopic);
    setView('generator');
  };

  const handleInstantQuizFromGenerator = (topic: string, subtopic: string, questions: Question[]) => {
    // Save updated pool
    syncLocalState();
    // Begin Quiz Instantly
    setQuizConfig({
      topic,
      subtopic,
      difficulty: 'mixed',
      isTimed: true
    });
    setView('quiz');
  };

  const handleResetData = () => {
    clearAllUserData();
    setLocalPoints(0);
    setLocalBadges([]);
    localStorage.removeItem('cs_mcq_points');
    localStorage.removeItem('cs_mcq_badges');
    
    syncLocalState();
    setView('home');
  };

  // Top overall stats card shown in the main outer frame (brief feedback)
  const quickAccuracy = () => {
    if (attempts.length === 0) return null;
    const answered = attempts.reduce((acc, current) => acc + current.questionsCount, 0);
    const corrects = attempts.reduce((acc, current) => acc + current.correctAnswersCount, 0);
    return answered > 0 ? Math.round((corrects / answered) * 100) : 0;
  };

  const handleAuthChanged = () => {
    syncLocalState();
    setShowAuthScreen(false);
  };


  const handleAdminClick = () => {
    if (adminUnlocked) {
      setView('generator');
    } else {
      setAdminErrorMsg('');
      setAdminPasswordInput('');
      setShowAdminPasswordModal(true);
    }
  };

  const handleAdminVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPasswordInput === 'dsssb123') {
      setAdminUnlocked(true);
      try {
        localStorage.setItem('cs_mcq_admin_unlocked', 'true');
      } catch {}
      setShowAdminPasswordModal(false);
      setView('generator');
    } else {
      setAdminErrorMsg('Incorrect Admin Password');
    }
  };

  const handleAdminLock = () => {
    setAdminUnlocked(false);
    try {
      localStorage.removeItem('cs_mcq_admin_unlocked');
    } catch {}
    setView('home');
  };

  if (!currentExam) {
    return (
      <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0B0C0E]' : 'bg-gradient-to-br from-[#e0eaf3] via-[#e8f0f7] to-[#eef4fa]'} text-slate-800 dark:text-slate-150 flex items-center justify-center p-0 sm:p-6 lg:p-8 selection:bg-indigo-500/20 transition-colors duration-300`}>
        <div className="w-full max-w-md h-screen sm:h-[820px] shadow-2xl sm:rounded-3xl border border-slate-250/50 dark:border-white/5 overflow-hidden flex flex-col relative transform transition-all bg-[#eef4fa] dark:bg-[#0B0C0E] text-slate-800 dark:text-slate-100 justify-center p-6">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-md bg-white/90 dark:bg-slate-900/40 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 text-center mx-auto"
          >
            <div className="mx-auto w-12 h-12 bg-blue-50 dark:bg-indigo-950/40 border border-blue-100 dark:border-indigo-900/40 rounded-2xl flex items-center justify-center text-blue-600 dark:text-indigo-400">
              <Icons.GraduationCap className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100 tracking-tight uppercase">Select Target Exam</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-medium">Choose your primary target exam path to configure your mock curriculum.</p>
            </div>

            <div className="space-y-3">
              {[
                { id: 'dsssb_tgt_cs', name: 'DSSSB TGT CS', desc: 'Computer Science & general subjects syllabus matching TGT Computer Teacher posts.' },
                { id: 'dsssb_it', name: 'DSSSB IT', desc: 'Information Technology & allied technical curricula matching IT Assistant posts.' },
                { id: 'cet_xii', name: 'CET-XII', desc: 'Rajasthan Senior Secondary Common Eligibility Test syllabus & general subjects.' },
                { id: 'cet_graduation', name: 'CET-GRADUATION', desc: 'Rajasthan Graduation Level Common Eligibility Test full syllabus curriculum.' }
              ].map((exam, idx) => (
                <motion.button
                  key={exam.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: idx * 0.08 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setCurrentExam(exam.id);
                    localStorage.setItem('cs_mcq_active_exam', exam.id);
                    localStorage.setItem('cs_mcq_selected_exams', JSON.stringify([exam.id]));
                  }}
                  className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-950/40 hover:bg-slate-50 dark:hover:bg-slate-900/60 hover:border-blue-300 dark:hover:border-neon-lime/30 hover:shadow-lg dark:hover:shadow-[0_0_15px_rgba(158,255,51,0.15)] transition-all text-left block group cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 group-hover:text-blue-600 dark:group-hover:text-neon-lime transition-colors">{exam.name}</span>
                    <Icons.ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-450 group-hover:translate-x-0.5 group-hover:text-blue-600 dark:group-hover:text-neon-lime transition-all" />
                  </div>
                  <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-1 leading-normal font-medium">{exam.desc}</p>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${theme === 'dark' ? 'dark bg-[#0B0C0E]' : 'bg-gradient-to-br from-[#e0eaf3] via-[#e8f0f7] to-[#eef4fa]'} text-slate-800 dark:text-slate-150 flex items-center justify-center p-0 sm:p-6 lg:p-8 selection:bg-indigo-500/20 transition-colors duration-300`}>
      
      {/* 
        High-fidelity smartphone frame layout on wide viewports (desktop-first luxury)
        Spans beautifully on natural screens, respecting both the full-width mobile focus and aesthetic precision.
      */}
      <div className="w-full max-w-md h-screen sm:h-[820px] shadow-2xl sm:rounded-3xl border border-slate-250/50 dark:border-white/5 overflow-hidden flex flex-col relative transform transition-all bg-[#eef4fa] dark:bg-[#0B0C0E] text-slate-800 dark:text-slate-100">
        
        {/* Sleek top toolbar info row with top theme color bar */}
        <header className="relative p-4 border-b border-slate-150 dark:border-white/5 flex items-center justify-between bg-white/90 dark:bg-[#161A1D]/90 backdrop-blur-md shrink-0 text-slate-800 dark:text-slate-200 gap-2 select-none">
          {/* Accent theme line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500 via-purple-500 to-emerald-500 z-50" />
          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setView('home')}>
            <div 
              className="p-1.5 bg-blue-50 dark:bg-indigo-950/40 border border-blue-100 dark:border-white/10 rounded-lg shrink-0"
            >
              <Icons.GraduationCap className="w-4 h-4 text-blue-600 dark:text-indigo-400 font-bold" />
            </div>
            <div className="flex flex-col text-left">
              <h1 className="text-xs font-black text-slate-900 dark:text-slate-100 tracking-tight leading-none uppercase font-display">AT Mocks</h1>
              <span className="text-[8px] text-slate-500 dark:text-slate-400 font-mono mt-0.5 leading-none font-bold">by Akash Chaudhary</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isInstalled && (deferredPrompt || showIOSPrompt) && (
              <button
                onClick={handleInstallClick}
                className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                title="Install App"
              >
                <Icons.Download className="w-3.5 h-3.5" />
                <span>Install</span>
              </button>
            )}

            {/* Password protected Admin icon - Highly premium & contrasting lock badge */}
            <button
              onClick={handleAdminClick}
              className={`px-2.5 py-1.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden group ${
                view === 'generator'
                  ? 'bg-gradient-to-r from-amber-500 to-yellow-600 border-amber-400 text-white shadow-md shadow-amber-500/20'
                  : adminUnlocked
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 shadow-xs'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 hover:bg-slate-850'
              }`}
              title={adminUnlocked ? "Open Admin Panel (Unlocked)" : "Admin Password Unlock"}
              id="admin-security-lock-btn"
            >
              {adminUnlocked ? (
                <div className="flex items-center gap-1">
                  <Icons.ShieldAlert className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span className="text-[9px] font-black uppercase tracking-wider font-mono">Staff</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Icons.ShieldAlert className="w-4 h-4 text-slate-400 group-hover:text-amber-400 transition-colors" />
                  <span className="text-[9px] font-black uppercase tracking-wider font-mono text-slate-500 group-hover:text-amber-400 transition-colors">Admin</span>
                </div>
              )}
            </button>

            {/* Dark Mode sliding scroll switch */}
            <div 
              onClick={toggleTheme}
              className="relative w-11 h-6 rounded-full p-0.5 cursor-pointer flex items-center transition-all bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-white/10"
              id="theme-scroll-toggle"
              title="Switch Theme Mode"
            >
              <motion.div
                layout
                className="w-4.5 h-4.5 rounded-full flex items-center justify-center shadow-md bg-white dark:bg-neon-lime"
                animate={{ x: theme === 'dark' ? 18 : 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 30 }}
              >
                {theme === 'dark' ? (
                  <Icons.Moon className="w-2.5 h-2.5 text-black" />
                ) : (
                  <Icons.Sun className="w-2.5 h-2.5 text-amber-500" />
                )}
              </motion.div>
            </div>

            <button
              onClick={() => setShowAuthScreen(!showAuthScreen)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900 hover:bg-slate-150 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 cursor-pointer transition-colors overflow-hidden"
              title="Toggle Account Access"
              id="global-auth-toggle-btn"
            >
              {currentUser ? (
                <div className="w-4.5 h-4.5 rounded-full bg-blue-100 dark:bg-indigo-900/60 flex items-center justify-center text-[10px] font-bold text-blue-700 dark:text-indigo-300">
                  {userProfile?.displayName?.charAt(0).toUpperCase() || currentUser.email?.charAt(0).toUpperCase() || 'U'}
                </div>
              ) : (
                <Icons.User className="w-4 h-4 text-blue-600 dark:text-indigo-400" />
              )}
            </button>
          </div>
        </header>

        {/* Scrollable View Containment Area */}
        <main 
          className="flex-1 p-4 overflow-y-auto bg-transparent relative" 
          id="main-view-container"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Pull to Refresh Indicator */}
          <motion.div 
            className="absolute top-0 left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
            initial={{ y: -50, opacity: 0 }}
            animate={{ 
              y: isSyncing ? 20 : pullProgress * 40 - 20, 
              opacity: isSyncing ? 1 : pullProgress,
              scale: isSyncing ? 1 : 0.8 + (pullProgress * 0.2)
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          >
            <div className={`p-2 rounded-full shadow-lg flex items-center justify-center ${theme === 'dark' ? 'bg-[#1A1D21] border border-white/10' : 'bg-white border border-slate-200'}`}>
              <Icons.RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin text-blue-500' : 'text-slate-400'}`} />
            </div>
          </motion.div>
          
          {/* Admin Password Prompt Overlay Modal */}
          <AnimatePresence>
            {showAdminPasswordModal && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-slate-950/90 backdrop-blur-md z-50 flex items-center justify-center p-6"
                id="admin-password-modal"
              >
                <motion.div
                  initial={{ scale: 0.95, y: 15 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 15 }}
                  className="bg-slate-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-xl text-center"
                >
                  <div className="mx-auto w-10 h-10 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center text-indigo-400 mb-3">
                    <Icons.Lock className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-100">Admin Control Room</h3>
                  <p className="text-[11px] text-slate-450 mt-1 mb-4">Provide valid credentials to manage shared syllabus question banks.</p>

                  <form onSubmit={handleAdminVerify} className="space-y-3">
                    <input
                      type="password"
                      placeholder="Enter Password (dsssb123)"
                      value={adminPasswordInput}
                      onChange={(e) => setAdminPasswordInput(e.target.value)}
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-center font-mono outline-none focus:border-indigo-500 text-slate-250"
                      autoFocus
                    />
                    {adminErrorMsg && (
                      <p className="text-[10px] text-rose-400 font-bold">{adminErrorMsg}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowAdminPasswordModal(false)}
                        className="flex-1 py-1.5 border border-white/10 rounded-xl text-[10px] font-bold text-slate-400 hover:text-slate-250 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-[10px] font-bold text-white shadow-md cursor-pointer transition-colors"
                      >
                        Unlock
                      </button>
                    </div>
                  </form>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          
          {/* Expanding Auth Overlay workspace */}
          <AnimatePresence>
            {showAuthScreen && (
              <motion.div 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="mb-4 z-40 relative"
              >
                <div className="relative">
                  <UserAuth 
                    onAuthChanged={handleAuthChanged} 
                    currentUser={currentUser} 
                    userProfile={userProfile} 
                  />
                  <button 
                    onClick={() => setShowAuthScreen(false)}
                    className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 p-1"
                  >
                    <Icons.X className="w-4 h-4" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.18 }}
              className="h-full"
            >
              <Suspense fallback={
                <div className="flex items-center justify-center h-full w-full opacity-50">
                  <div className="w-8 h-8 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin" />
                </div>
              }>
                {view === 'home' && (
                  <HomeView
                    isLoading={authLoading}
                    currentExam={currentExam}
                    onChangeExam={(exam) => {
                      setCurrentExam(exam);
                      localStorage.setItem('cs_mcq_active_exam', exam);
                    }}
                    questionPool={questionPool}
                    attempts={attempts}
                    userProfile={userProfile}
                    localBadges={localBadges}
                    theme={theme}
                    onNavigate={(targetView) => setView(targetView)}
                    isAdmin={adminUnlocked}
                    onSelectSubtopic={handleSelectSubtopic}
                    onForceCloudPull={handleForceCloudPull}
                  />
                )}

                {view === 'practice' && (
                  <div className="space-y-4 h-full">
                    <PracticeView
                      currentExam={currentExam}
                      onChangeExam={(exam) => {
                        setCurrentExam(exam);
                        localStorage.setItem('cs_mcq_active_exam', exam);
                      }}
                      theme={theme}
                      onSelectSubtopic={handleSelectSubtopic}
                      questionPool={questionPool}
                    />
                  </div>
                )}

                {view === 'quiz' && quizConfig && (
                  <QuizView
                    topic={quizConfig.topic}
                    subtopic={quizConfig.subtopic}
                    difficulty={quizConfig.difficulty}
                    isTimed={quizConfig.isTimed}
                    questionPool={questionPool}
                    onQuit={() => setView('practice')}
                    onQuizFinished={handleQuizFinished}
                    onGoToGenerator={handleGoToGenerator}
                    examType={currentExam}
                    isMockExam={quizConfig.isMockExam}
                    customCount={quizConfig.customCount}
                    overrideQuestions={quizConfig.overrideQuestions}
                  />
                )}

                {view === 'bookmarks' && (
                  <BookmarkedQuestions
                    onBack={() => setView('home')}
                    questionPool={questionPool}
                    onBookmarksUpdated={syncLocalState}
                    onStartAttemptQuiz={(topicName: string, qs: Question[]) => {
                      setQuizConfig({
                        topic: topicName,
                        subtopic: 'Revision Drill',
                        difficulty: 'mixed',
                        isTimed: false,
                        overrideQuestions: qs
                      });
                      setView('quiz');
                    }}
                    currentExam={currentExam}
                    theme={theme}
                  />
                )}

                {view === 'analytics' && (
                  <Dashboard
                    isLoading={authLoading}
                    onBack={() => setView('home')}
                    attempts={attempts}
                    onResetData={handleResetData}
                    userProfile={userProfile}
                    localBadges={localBadges}
                    questionPool={questionPool}
                    theme={theme}
                    currentExam={currentExam}
                    syncError={firestoreSyncError}
                    currentUser={currentUser}
                    onForceCloudPull={handleForceCloudPull}
                    onReAttempt={(topic, subtopic, difficulty, isTimed, isMockExam) => {
                      setQuizConfig({
                        topic,
                        subtopic,
                        difficulty,
                        isTimed,
                        isMockExam
                      });
                      setView('quiz');
                    }}
                  />
                )}

                {view === 'generator' && (
                  <QuestionUploader
                    onBack={() => setView('home')}
                    onQuestionsSaved={syncLocalState}
                    currentUser={currentUser}
                    onLockAdmin={handleAdminLock}
                  />
                )}

                {view === 'roadmap' && (
                  <RoadmapView
                    onBack={() => setView('home')}
                    attempts={attempts}
                    currentExam={currentExam}
                    theme={theme}
                    onStartQuiz={(topic, subtopic, difficulty, isTimed, isMockExam) => {
                      handleSelectSubtopic(topic, subtopic, difficulty, isTimed, isMockExam);
                    }}
                    questionPool={questionPool}
                  />
                )}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Dynamic global navigation bottom tab controller with central floating circular Home button */}
        <footer className="shrink-0 bg-slate-100/70 dark:bg-[#0c101d]/85 backdrop-blur-xl border-t border-slate-200/50 dark:border-white/5 flex justify-between items-center px-4 py-2 relative z-40 shadow-2xl">
          {/* Accent theme line */}
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-500/30 via-purple-500/30 to-emerald-500/30" />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('roadmap')}
            className={`flex-1 flex flex-col items-center gap-1 text-[8px] font-extrabold font-sans cursor-pointer transition-all duration-200 ${view === 'roadmap' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-450 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            id="tab-roadmap"
          >
            <div className={`p-1.5 rounded-xl transition-all ${view === 'roadmap' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)] border border-indigo-500/20' : 'text-slate-400 border border-transparent'}`}>
              <Icons.Route className="w-4 h-4" />
            </div>
            <span>Roadmap</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('practice')}
            className={`flex-1 flex flex-col items-center gap-1 text-[8px] font-extrabold font-sans cursor-pointer transition-all duration-200 ${view === 'practice' || view === 'quiz' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-450 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            id="tab-practice-arena"
          >
            <div className={`p-1.5 rounded-xl transition-all ${view === 'practice' || view === 'quiz' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)] border border-indigo-500/20' : 'text-slate-450 border border-transparent'}`}>
              <Icons.Compass className="w-4 h-4" />
            </div>
            <span>Practice</span>
          </motion.button>

          {/* Centralized larger circular Home button */}
          <div className="flex-1 flex flex-col items-center justify-center relative -mt-4">
            <motion.button
              whileHover={{ scale: 1.15, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setView('home')}
              className={`flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/35 border border-white/20 cursor-pointer transition-all ${view === 'home' || view === 'generator' ? 'ring-4 ring-indigo-500/25' : ''}`}
              id="tab-home"
              title="Home Hub"
            >
              <Icons.Home className="w-5.5 h-5.5" />
            </motion.button>
            <span className={`text-[8.5px] font-black tracking-wider uppercase mt-1 ${view === 'home' || view === 'generator' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-450'}`}>
              Home
            </span>
          </div>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('analytics')}
            className={`flex-1 flex flex-col items-center gap-1 text-[8px] font-extrabold font-sans cursor-pointer transition-all duration-200 ${view === 'analytics' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-450 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            id="tab-analytics"
          >
            <div className={`p-1.5 rounded-xl transition-all ${view === 'analytics' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)] border border-indigo-500/20' : 'text-slate-450 border border-transparent'}`}>
              <Icons.BarChart3 className="w-4 h-4" />
            </div>
            <span>Analysis</span>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setView('bookmarks')}
            className={`flex-1 flex flex-col items-center gap-1 text-[8px] font-extrabold font-sans cursor-pointer transition-all duration-200 ${view === 'bookmarks' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-450 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
            id="tab-rev-deck"
          >
            <div className={`p-1.5 rounded-xl transition-all ${view === 'bookmarks' ? 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.15)] border border-indigo-500/20' : 'text-slate-450 border border-transparent'}`}>
              <Icons.Bookmark className="w-4 h-4" />
            </div>
            <span>Revision</span>
          </motion.button>
        </footer>

      </div>

      {/* GLORIOUS BADGE CELEBRATION TOAST OVERLAY */}
      <AnimatePresence>
        {newUnlockedBadge && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 selection:bg-indigo-500/20"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-linear-to-b from-slate-900 to-indigo-950/95 border-2 border-amber-500/30 w-full max-w-sm rounded-[24px] p-6 text-center shadow-2xl relative"
            >
              {/* Particles elements */}
              <div className="absolute inset-0 overflow-hidden rounded-[24px] pointer-events-none opacity-20">
                <div className="absolute top-1/4 left-1/4 w-20 h-20 bg-amber-500 rounded-full blur-2xl animate-pulse" />
                <div className="absolute bottom-1/4 right-1/4 w-20 h-20 bg-indigo-500 rounded-full blur-2xl animate-pulse" />
              </div>

              {/* Icon Container */}
              <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-500/40 text-amber-300 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                <Icons.Trophy className="w-10 h-10" />
              </div>

              <span className="text-[10px] uppercase font-bold tracking-widest text-amber-400 font-mono mb-1.5 block">
                ACHIEVEMENT UNLOCKED!
              </span>
              
              <h3 className="text-xl font-black text-slate-100 font-sans tracking-tight mb-2">
                {newUnlockedBadge.title}
              </h3>

              <div className="bg-black/40 border border-white/5 rounded-2xl p-4.5 mb-5 text-sm leading-relaxed text-slate-300 shadow-inner">
                {newUnlockedBadge.description}
              </div>

              <button
                onClick={() => setNewUnlockedBadge(null)}
                className="w-full py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-black font-extrabold rounded-xl text-xs tracking-wider uppercase transition-all shadow-lg shadow-amber-500/10 border border-white/10 cursor-pointer"
              >
                Assemble Next Challenge
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
