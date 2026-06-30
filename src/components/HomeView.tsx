/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Question, QuizAttempt, Badge, ExamConfig } from '../types';
import { getBookmarks, getExamsConfig, getSelectedExams, saveSelectedExams, isQuestionForExam, getNormalizedSubject } from '../lib/storage';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlobalSearch from './GlobalSearch';
import { getCloudQuestionCount } from '../lib/syncEngine';

interface HomeViewProps {
  isLoading?: boolean;
  currentExam: string;
  onChangeExam: (exam: string) => void;
  questionPool: Question[];
  attempts: QuizAttempt[];
  userProfile: any | null;
  localBadges: Badge[];
  theme?: 'light' | 'dark';
  onNavigate: (view: 'practice' | 'bookmarks' | 'analytics' | 'generator' | 'roadmap' | 'quiz') => void;
  isAdmin: boolean;
  onSelectSubtopic?: (
    topic: string, 
    subtopic: string, 
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed', 
    isTimed: boolean,
    isMockExam?: boolean,
    customCount?: number
  ) => void;
  onForceCloudPull?: () => Promise<void>;
}

export default function HomeView({
  isLoading = false,
  currentExam,
  onChangeExam,
  questionPool,
  attempts,
  userProfile,
  localBadges,
  theme = 'dark',
  onNavigate,
  isAdmin,
  onSelectSubtopic,
  onForceCloudPull
}: HomeViewProps) {
  const [examsConfig, setExamsConfig] = useState<ExamConfig[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [showPathSelector, setShowPathSelector] = useState(false);
  const [firestoreTotalCount, setFirestoreTotalCount] = useState<number | null>(null);

  // Load configuration and active choices
  useEffect(() => {
    const load = () => {
      setExamsConfig(getExamsConfig());
      setSelectedExams(getSelectedExams());
    };
    load();
    window.addEventListener('exams-config-updated', load);
    return () => window.removeEventListener('exams-config-updated', load);
  }, [currentExam]);

  // Fetch Firestore total question count
  useEffect(() => {
    const fetchCloudCount = async () => {
      try {
        const count = await getCloudQuestionCount();
        setFirestoreTotalCount(count);
      } catch (e) {
        console.error("Failed to fetch cloud question count in HomeView:", e);
      }
    };
    fetchCloudCount();
  }, [questionPool]);

  const currentExamConfig = useMemo(() => {
    return examsConfig.find(e => e.id === currentExam) || examsConfig[0] || null;
  }, [examsConfig, currentExam]);

  // Available subjects for the chosen exam configuration
  const subjectsList = useMemo(() => {
    if (!currentExamConfig) return [];
    return currentExamConfig.subjects.map(s => s.name);
  }, [currentExamConfig]);

  const [activeSubjectTab, setActiveSubjectTab] = useState<string>('');
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  // Auto-set the first subject tab when the exam changes
  useEffect(() => {
    if (subjectsList.length > 0) {
      setActiveSubjectTab(subjectsList[0]);
    }
  }, [currentExam, currentExamConfig, subjectsList]);

  // Reset expanded topic on active tab change
  useEffect(() => {
    setExpandedTopic(null);
  }, [activeSubjectTab]);

  // Filter attempts belonging to the current exam
  const examFilteredAttempts = useMemo(() => {
    return attempts.filter(a => {
      // 1. Explicit examId match
      if (a.examId && a.examId === currentExam) return true;
      
      // 2. Question-level match
      const firstQ = a.questions?.[0];
      if (firstQ) {
        const qObj = questionPool.find(q => q.id === firstQ.questionId);
        if (qObj && qObj.exam === currentExam) return true;
      }
      
      // 3. Subject-level matching
      if (currentExamConfig) {
        const lowerTopic = a.topic?.toLowerCase() || '';
        const isSubjectOfCurrentExam = currentExamConfig.subjects.some(subj => {
          const lowerSubj = subj.name.toLowerCase();
          return lowerTopic === lowerSubj || lowerTopic.includes(lowerSubj) || lowerSubj.includes(lowerTopic);
        });
        if (isSubjectOfCurrentExam) return true;
      }
      
      // 4. Mock exam strings fallback
      if (a.topic?.toLowerCase().includes('mock') || a.subtopic?.toLowerCase().includes('mock')) {
        return true;
      }

      // 5. Default fallback if no examId is provided to not lose legacy attempts
      if (!a.examId) return true;

      return false;
    });
  }, [attempts, currentExam, questionPool, currentExamConfig]);

  // Retrieve today's practice progress
  const todayAttemptsCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return examFilteredAttempts.filter(a => new Date(a.timestamp).toDateString() === todayStr).length;
  }, [examFilteredAttempts]);

  const bookmarksCount = useMemo(() => {
    return getBookmarks().length;
  }, [currentExam]); // Trigger reload when currentExam changes or component loads

  // Get active topic configurations for the subject
  const currentSubjectTopics = useMemo(() => {
    if (!currentExamConfig || !activeSubjectTab) return [];
    const subjObj = currentExamConfig.subjects.find(s => s.name === activeSubjectTab);
    const originalTopics = subjObj ? subjObj.topics : [];
    
    // Check if there are any questions with empty/missing subtopic, or unmapped subtopics, for this subject
    const hasUnmappedQuestions = questionPool.some(q => {
      if (!isQuestionForExam(q, currentExam, currentExamConfig)) return false;
      if (getNormalizedSubject(q.topic) !== getNormalizedSubject(activeSubjectTab || '')) return false;
      
      const qSubLower = q.subtopic?.toLowerCase() || '';
      if (!qSubLower) return true; // empty subtopic is unmapped
      
      // Is it predefined in any of original topics?
      const isPredefined = originalTopics.some(topic => {
        const tLower = topic.name.toLowerCase();
        const matchSubtopic = topic.subtopics.some(st => st.toLowerCase() === qSubLower || qSubLower.includes(st.toLowerCase()));
        return matchSubtopic || qSubLower === tLower || qSubLower.includes(tLower);
      });
      return !isPredefined;
    });

    if (hasUnmappedQuestions) {
      return [
        ...originalTopics,
        {
          name: 'General & Core Concepts',
          subtopics: ['General Practice']
        }
      ];
    }
    return originalTopics;
  }, [currentExamConfig, activeSubjectTab, questionPool, currentExam]);

  const topicCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!currentSubjectTopics || currentSubjectTopics.length === 0) return counts;
    
    questionPool.forEach(q => {
      if (!isQuestionForExam(q, currentExam, currentExamConfig)) return;
      if (getNormalizedSubject(q.topic) !== getNormalizedSubject(activeSubjectTab || '')) return;
      
      const qSubLower = q.subtopic?.toLowerCase() || '';
      let matched = false;
      
      // Look for standard predefined topics
      const originalTopics = currentExamConfig?.subjects.find(s => s.name === activeSubjectTab)?.topics || [];
      originalTopics.forEach(topic => {
        const tLower = topic.name.toLowerCase();
        const matchSubtopic = topic.subtopics.some(st => st.toLowerCase() === qSubLower || qSubLower.includes(st.toLowerCase()));
        
        if (matchSubtopic || qSubLower === tLower || qSubLower.includes(tLower) || q.text?.toLowerCase().includes(tLower)) {
          counts[topic.name] = (counts[topic.name] || 0) + 1;
          matched = true;
        }
      });
      
      // If there are unmapped questions, group them under "General & Core Concepts"
      if (!matched && currentSubjectTopics.some(t => t.name === 'General & Core Concepts')) {
        counts['General & Core Concepts'] = (counts['General & Core Concepts'] || 0) + 1;
      }
    });
    return counts;
  }, [questionPool, currentExam, activeSubjectTab, currentSubjectTopics, currentExamConfig]);

  const totalExamQuestionsCount = useMemo(() => {
    return questionPool.filter(q => isQuestionForExam(q, currentExam, currentExamConfig)).length;
  }, [questionPool, currentExam, currentExamConfig]);

  const overallAccuracy = useMemo(() => {
    const totalCount = examFilteredAttempts.reduce((acc, a) => acc + a.questionsCount, 0);
    const correctCount = examFilteredAttempts.reduce((acc, a) => acc + a.correctAnswersCount, 0);
    return totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  }, [examFilteredAttempts]);

  const totalPracticedQuestions = useMemo(() => {
    return examFilteredAttempts.reduce((acc, a) => acc + a.questionsCount, 0);
  }, [examFilteredAttempts]);

  const subjectQuestionsCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    questionPool.forEach(q => {
      if (!isQuestionForExam(q, currentExam, currentExamConfig)) return;
      if (q.topic) {
        const topicNorm = getNormalizedSubject(q.topic);
        // Since we want the display name from subjectsList, map via normalized
        const matchSubj = subjectsList.find(s => getNormalizedSubject(s) === topicNorm);
        if (matchSubj) {
            counts[matchSubj] = (counts[matchSubj] || 0) + 1;
        }
      }
    });
    // Ensure all subjects have at least 0
    subjectsList.forEach(subj => {
        if (counts[subj] === undefined) counts[subj] = 0;
    });
    return counts;
  }, [questionPool, subjectsList, currentExam, currentExamConfig]);

  const mockAverageStats = useMemo(() => {
    if (!currentExamConfig) return null;
    
    // Filter attempts that are mock exams and match the current exam config.
    const examMocks = examFilteredAttempts.filter(a => a.isMockExam === true);
    const targetScore = currentExamConfig.targetScore || 100;

    if (examMocks.length === 0) {
      return {
        averageScore: 0,
        targetScore,
        progressPct: 0,
        count: 0
      };
    }

    const sortedMocks = [...examMocks].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const last7Mocks = sortedMocks.slice(0, 7);
    
    let totalScore = 0;
    const negativeMarking = currentExamConfig.rules.negativeMarking || 0;
    
    last7Mocks.forEach(m => {
      let correct = 0;
      let wrong = 0;
      m.questions.forEach(q => {
          if (q.isCorrect) correct++;
          else if (q.selectedOptionIndex !== -1) wrong++;
      });
      const score = correct - (wrong * Math.abs(negativeMarking));
      totalScore += score;
    });
    
    const averageScore = Math.max(0, Math.round((totalScore / last7Mocks.length) * 10) / 10);
    const progressPct = Math.min(100, Math.round((averageScore / targetScore) * 100));

    return {
      averageScore,
      targetScore,
      progressPct,
      count: last7Mocks.length
    };
  }, [examFilteredAttempts, currentExamConfig]);

  const daysLeft = useMemo(() => {
    if (!currentExamConfig || !currentExamConfig.targetDate) return null;
    const target = new Date(currentExamConfig.targetDate);
    const today = new Date();
    target.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diffTime = target.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }, [currentExamConfig]);

  const [isSyncingLocal, setIsSyncingLocal] = useState(false);

  const handleSyncClick = async () => {
    if (isSyncingLocal) return;
    setIsSyncingLocal(true);
    try {
      if (onForceCloudPull) {
        await onForceCloudPull();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSyncingLocal(false);
    }
  };

  const handleSelectExamPath = (examId: string) => {
    onChangeExam(examId);
    try {
      localStorage.setItem('cs_mcq_active_exam', examId);
    } catch {}
    setShowPathSelector(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-4 p-2 animate-pulse">
        {/* Scholar Welcome Skeleton */}
        <div className={`h-28 w-full rounded-[20px] ${theme === 'dark' ? 'bg-[#161A1D]' : 'bg-[#e2e8f0]'}`}></div>
        
        {/* Global Search Skeleton */}
        <div className={`h-12 w-full rounded-2xl ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-200/50'}`}></div>

        {/* Syllabus Explorer Skeleton */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between px-0.5">
            <div className={`h-4 w-32 rounded ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`}></div>
            <div className={`h-3 w-24 rounded ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-300'}`}></div>
          </div>
          
          <div className="flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className={`h-8 w-24 rounded-lg ${theme === 'dark' ? 'bg-slate-800/80' : 'bg-slate-200'}`}></div>
            ))}
          </div>

          <div className="space-y-2 mt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`h-16 w-full rounded-2xl ${theme === 'dark' ? 'bg-slate-800/40' : 'bg-slate-100'}`}></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-slate-800 dark:text-slate-100 font-sans w-full" id="home-view-container">

      {/* 1. Scholar Welcome & Preparation Goal Dropdown (Unified, Compact & Highly Premium) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className={`bg-gradient-to-br ${theme === 'dark' ? 'from-[#1A1D21] to-[#0D0F12] border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:border-neon-lime/40' : 'from-[#2F69FF] to-[#1a3891] border-white/20 shadow-[0_12px_40px_rgba(47,105,255,0.3)] hover:shadow-[0_16px_50px_rgba(47,105,255,0.4)]'} backdrop-blur-2xl border text-white rounded-[24px] p-6 text-left relative overflow-hidden group transition-all duration-500`}
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-400 via-transparent to-transparent pointer-events-none transition-opacity duration-500 group-hover:opacity-40" />
        
        <div className="flex items-start justify-between relative z-10">
          <div className="space-y-1.5">
            <h2 className="text-[15px] font-black tracking-tight flex items-center gap-2 font-display">
              Hello, {userProfile?.displayName || 'Scholar'} <span className="animate-pulse">👋</span>
            </h2>
            <div className="flex items-center gap-2.5 mt-1 flex-nowrap whitespace-nowrap overflow-x-auto no-scrollbar">
              <div className="flex items-center gap-1.5 shrink-0 relative group/goal">
                <span className={`text-[9px] font-mono font-black uppercase tracking-widest ${theme === 'dark' ? 'text-slate-400' : 'text-blue-200'}`}>Goal:</span>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowPathSelector(true)}
                  className="text-[11px] font-extrabold text-amber-300 hover:text-amber-200 underline decoration-amber-300/40 decoration-dotted underline-offset-4 transition-colors cursor-pointer flex items-center gap-0.5 leading-none"
                >
                  <span>{currentExamConfig?.name || 'Loading goal...'}</span>
                  <Icons.ChevronDown className="w-3 h-3 text-amber-300" />
                </motion.button>

                {/* Info Tooltip Icon */}
                <div className="relative inline-block ml-1 group/tooltip">
                  <Icons.Info className="w-3.5 h-3.5 text-blue-250 dark:text-slate-400 cursor-help hover:text-amber-300 dark:hover:text-amber-300 transition-colors shrink-0" />
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-slate-950 border border-white/10 text-white rounded-lg p-2.5 text-[10px] leading-relaxed font-sans font-medium opacity-0 pointer-events-none group-hover/tooltip:opacity-100 transition-opacity duration-200 z-[100] shadow-xl text-left whitespace-normal">
                    <span className="font-extrabold text-amber-300 block mb-1">Batch Question Loading</span>
                    We fetch syllabus-aligned batches from Cloud database bundles to keep offline caching extremely fast & optimize storage. Tap 'Pull Qs' to sync the latest questions.
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 -mb-1 border-4 border-transparent border-b-slate-950" />
                  </div>
                </div>
              </div>

              {daysLeft !== null && (
                <span className="text-white/20 text-xs font-mono shrink-0">|</span>
              )}

              {daysLeft !== null && (
                <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur-sm border border-white/10 px-2 py-0.5 rounded-lg shrink-0">
                  <Icons.Calendar className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                  <span className={`text-[9.5px] font-mono font-black ${daysLeft <= 15 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'}`}>
                    {daysLeft >= 0 ? `${daysLeft} Days Left` : 'Passed'}
                  </span>
                </div>
              )}
            </div>
          </div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSyncClick}
            disabled={isSyncingLocal || isLoading}
            className="bg-black/35 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 flex items-center gap-1.5 shrink-0 shadow-lg cursor-pointer hover:bg-black/55 hover:border-emerald-400/40 transition-all duration-300"
          >
            <Icons.RefreshCw className={`w-3 h-3 text-emerald-400 shrink-0 ${isSyncingLocal || isLoading ? 'animate-spin text-amber-400' : ''}`} />
            <span className="text-[9px] font-black tracking-widest uppercase font-mono text-emerald-300">
              {isSyncingLocal || isLoading ? 'Syncing...' : 'Pull Qs'}
            </span>
          </motion.button>
        </div>

        {/* Dynamic miniature stats grid */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-white/10 relative z-10 text-center">
          <div className="group/stat cursor-default">
            <span className={`text-[8px] block font-bold tracking-widest uppercase font-mono transition-colors ${theme === 'dark' ? 'text-slate-400 group-hover/stat:text-slate-300' : 'text-blue-200 group-hover/stat:text-blue-100'}`}>Practiced</span>
            <span className="text-[13px] font-black font-mono tracking-tight mt-1 block">{totalPracticedQuestions} <span className="text-[9px] opacity-70 font-sans">Qs</span></span>
          </div>
          <div className="border-l border-white/10 group/stat cursor-default relative">
            <span className={`text-[8px] flex items-center justify-center gap-0.5 font-bold tracking-widest uppercase font-mono transition-colors ${theme === 'dark' ? 'text-slate-400 group-hover/stat:text-slate-300' : 'text-blue-200 group-hover/stat:text-blue-100'}`}>
              Total Qs
              <Icons.Info className="w-2.5 h-2.5 cursor-help text-slate-350 hover:text-amber-300 dark:text-slate-400 dark:hover:text-amber-300 transition-colors shrink-0" title="Offline-cached questions present in IndexedDB on this device. Fetching the latest syllabus batch is triggered via Pull Qs." />
            </span>
            <span className="text-[13px] font-black font-mono tracking-tight mt-1 block">
              {totalExamQuestionsCount} <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold">({firestoreTotalCount !== null ? firestoreTotalCount : '...'} Cloud)</span>
            </span>
          </div>
          <div className="border-l border-white/10 group/stat cursor-default">
            <span className={`text-[8px] block font-bold tracking-widest uppercase font-mono transition-colors ${theme === 'dark' ? 'text-slate-400 group-hover/stat:text-slate-300' : 'text-blue-200 group-hover/stat:text-blue-100'}`}>Accuracy</span>
            <span className="text-[13px] font-black font-mono tracking-tight mt-1 block">{overallAccuracy}<span className="text-[10px] opacity-70">%</span></span>
          </div>
        </div>
      </motion.div>

      {/* 1.5 Prominent Mock Exam Target Progress Card - Highly Minimalist */}
      {mockAverageStats && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className={`p-3 rounded-2xl border ${
            theme === 'dark'
              ? 'bg-[#121518]/60 border-white/5 shadow-black/10'
              : 'bg-white border-slate-200/50 shadow-xs'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            {/* Left side: score details */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Icons.Target className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-indigo-400' : 'text-indigo-600'} shrink-0`} />
              <span className={`font-extrabold uppercase tracking-widest text-[9px] font-mono ${theme === 'dark' ? 'text-slate-400' : 'text-slate-500'}`}>
                Mock Avg:
              </span>
              <span className={`font-black font-mono text-[13px] ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>
                {mockAverageStats.averageScore}
              </span>
              <span className={`text-[10px] text-slate-400 dark:text-slate-500 font-bold font-mono`}>
                /{mockAverageStats.targetScore}
              </span>
              {mockAverageStats.count > 0 && (
                <span className="text-[8px] font-mono uppercase bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-1.5 py-0.5 rounded-sm ml-1">
                  {mockAverageStats.count} test{mockAverageStats.count > 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Right side: progress bar and % badge */}
            <div className="flex-1 flex items-center gap-2">
              <div className={`flex-1 h-1.5 rounded-full overflow-hidden relative ${theme === 'dark' ? 'bg-black/30' : 'bg-slate-100'}`}>
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, mockAverageStats.progressPct)}%` }}
                  transition={{ duration: 1.2, ease: 'easeOut' }}
                  className={`h-full rounded-full ${
                    mockAverageStats.progressPct >= 100
                      ? 'bg-emerald-500'
                      : (theme === 'dark' ? 'bg-indigo-500' : 'bg-indigo-600')
                  }`}
                />
              </div>
              <span className={`text-[10px] font-mono font-bold shrink-0 ${
                mockAverageStats.progressPct >= 100
                  ? (theme === 'dark' ? 'text-neon-lime' : 'text-emerald-600')
                  : (theme === 'dark' ? 'text-slate-300' : 'text-slate-700')
              }`}>
                {mockAverageStats.progressPct}%
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Interactive Practice Now Card */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15 }}
        onClick={() => onNavigate('practice')}
        className={`p-4 rounded-2xl border cursor-pointer group transition-all duration-300 relative overflow-hidden flex items-center justify-between gap-4 select-none ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-indigo-950/20 via-slate-900/40 to-indigo-950/20 border-white/5 hover:border-neon-lime/30 hover:shadow-[0_0_20px_rgba(158,255,51,0.1)]'
            : 'bg-gradient-to-r from-blue-50/60 via-indigo-50/30 to-blue-50/60 border-slate-200/60 hover:border-blue-400/50 hover:shadow-md'
        }`}
      >
        {/* Glow effect on hover */}
        <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity duration-500 bg-gradient-to-r ${theme === 'dark' ? 'from-neon-lime to-indigo-500' : 'from-blue-400 to-indigo-500'}`} />

        <div className="flex items-center gap-3 relative z-10">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-105 ${
            theme === 'dark' 
              ? 'bg-neon-lime/10 text-neon-lime border border-neon-lime/20' 
              : 'bg-blue-100 text-blue-600 border border-blue-200 shadow-sm'
          }`}>
            <Icons.Play className="w-5 h-5 ml-0.5 animate-pulse text-indigo-500 dark:text-neon-lime" />
          </div>
          <div className="text-left">
            <h4 className={`text-[12.5px] font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
              Interactive Study Arena
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">
              Create custom subject quizzes, PYQs, and test simulations.
            </p>
          </div>
        </div>

        <div className={`p-2 rounded-xl transition-all duration-300 ${
          theme === 'dark' 
            ? 'bg-white/5 group-hover:bg-neon-lime group-hover:text-black text-slate-400' 
            : 'bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-600'
        }`}>
          <Icons.ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-0.5" />
        </div>
      </motion.div>

      {/* Global Search Component */}
      <GlobalSearch
        theme={theme}
        currentExam={currentExam}
        questionPool={questionPool}
        onSelectSubtopic={onSelectSubtopic}
        onNavigate={(targetView) => {
          if (targetView === 'home') {
            onNavigate('practice');
          } else {
            onNavigate(targetView as any);
          }
        }}
      />

      {/* 2. Syllabus Subject Tabs selection */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="space-y-4 pt-2"
      >
        <div className="flex items-center justify-between px-1">
          <h3 className={`text-[12.5px] font-black uppercase tracking-tight font-display flex items-center gap-2 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`}>
            <Icons.Cpu className={`w-4 h-4 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
            <span>Syllabus Explorer</span>
          </h3>
          <span className={`text-[9px] font-extrabold tracking-widest uppercase font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
            {subjectsList.length} Subjects
          </span>
        </div>

        {/* Horizontal Category tabs with thematic color coordination */}
        <div className="flex gap-2 overflow-x-auto pb-2 select-none scrollbar-none px-1">
          {subjectsList.map((subj) => {
            const isActive = activeSubjectTab === subj;
            const count = subjectQuestionsCountMap[subj] || 0;

            return (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                key={subj}
                onClick={() => setActiveSubjectTab(subj)}
                className={`px-4 py-2 rounded-full text-[11px] font-extrabold shrink-0 flex items-center border transition-all duration-300 cursor-pointer ${
                  isActive
                    ? theme === 'dark'
                      ? 'border-neon-lime bg-neon-lime/15 text-neon-lime shadow-[0_4px_15px_rgba(158,255,51,0.2)]'
                      : 'border-[#2F69FF] bg-[#2F69FF] text-white shadow-[0_4px_15px_rgba(47,105,255,0.3)]'
                    : theme === 'dark'
                      ? 'border-white/5 bg-[#161A1D]/80 text-slate-400 hover:bg-[#1A1D21] hover:text-slate-200 hover:border-white/10'
                      : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300'
                }`}
              >
                <span>{subj} <span className="opacity-60 ml-1 font-mono text-[9px]">({count})</span></span>
              </motion.button>
            );
          })}
        </div>

        {/* Topics List under Selected Subject (Highly Minimalist, Clickable glassmorphic cards) */}
        <div className="space-y-3 px-1">
          {currentSubjectTopics.length === 0 ? (
            <div className={`p-10 text-center backdrop-blur-xl rounded-[24px] border border-dashed flex flex-col items-center justify-center gap-3 ${theme === 'dark' ? 'bg-[#161A1D]/50 border-white/10 text-slate-400' : 'bg-white/60 border-slate-300 text-slate-500'}`}>
              <Icons.BookOpen className="w-8 h-8 opacity-20" />
              <span className="text-[12px] font-bold tracking-tight">Select a subject above to explore chapter modules.</span>
            </div>
          ) : (
            currentSubjectTopics.map((topic, index) => {
              const isExpanded = expandedTopic === topic.name;
              const topicQuestionsCount = topicCountsMap[topic.name] || 0;

              return (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  key={topic.name}
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.name)}
                  className={`p-4 backdrop-blur-xl rounded-[20px] text-left space-y-3 transition-all duration-400 cursor-pointer group relative overflow-hidden border ${
                    theme === 'dark'
                      ? isExpanded 
                          ? 'bg-[#1A1D21] border-white/15 shadow-xl' 
                          : 'bg-[#161A1D]/80 border-white/5 hover:border-white/15 hover:bg-[#1A1D21]'
                      : isExpanded
                          ? 'bg-white border-slate-300 shadow-xl'
                          : 'bg-white/80 border-slate-200 hover:border-[#2F69FF]/40 hover:bg-white hover:shadow-lg'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 relative z-10">
                    <div className="space-y-1">
                      <h4 className={`text-[13px] font-black tracking-tight leading-tight transition-colors ${
                        theme === 'dark' 
                          ? 'text-slate-100 group-hover:text-neon-lime' 
                          : 'text-slate-800 group-hover:text-[#2F69FF]'
                      }`}>
                        {topic.name}
                      </h4>
                      <p className={`text-[10px] font-bold font-mono tracking-tight ${theme === 'dark' ? 'text-slate-500' : 'text-slate-400'}`}>
                        {topic.subtopics.length} core subtopics
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-[9px] font-mono font-black px-2 py-1 rounded-lg border ${
                        theme === 'dark'
                          ? 'text-neon-lime bg-neon-lime/10 border-neon-lime/20'
                          : 'text-[#2F69FF] bg-[#2F69FF]/10 border-[#2F69FF]/20'
                      }`}>
                        {topicQuestionsCount} Qs
                      </span>
                      <div className={`p-1.5 rounded-full transition-colors ${theme === 'dark' ? 'bg-white/5 group-hover:bg-white/10' : 'bg-slate-100 group-hover:bg-slate-200'}`}>
                        {isExpanded ? (
                          <Icons.ChevronDown className={`w-3.5 h-3.5 shrink-0 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                        ) : (
                          <Icons.ChevronRight className={`w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-all duration-200 shrink-0 ${
                            theme === 'dark' ? 'text-slate-400 group-hover:text-neon-lime' : 'text-slate-400 group-hover:text-[#2F69FF]'
                          }`} />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subtopics interactive tags list */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1.5 relative z-10">
                      {topic.subtopics.map((sub) => (
                        <span
                          key={sub}
                          className={`text-[9px] font-bold px-2 py-1 rounded-md border transition-colors ${
                            theme === 'dark'
                              ? 'text-slate-400 bg-black/20 border-white/5 group-hover:border-white/10'
                              : 'text-slate-500 bg-slate-50 border-slate-200 group-hover:border-slate-300'
                          }`}
                        >
                          {sub}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Expandable subtopic units action pane */}
                  {isExpanded && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={`pt-4 mt-2 border-t space-y-2.5 relative z-10 ${theme === 'dark' ? 'border-white/10' : 'border-slate-100'}`}
                      onClick={(e) => e.stopPropagation()} // Prevent double toggle
                    >
                      <span className={`text-[10px] uppercase tracking-widest font-mono font-black block mb-2 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-400'}`}>
                        Select Subtopic Unit to Practice:
                      </span>
                      <div className="space-y-2">
                        {topic.subtopics.map((sub) => (
                          <motion.div
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                            key={sub}
                            onClick={() => {
                              onSelectSubtopic?.(activeSubjectTab, sub, 'mixed', true, false);
                              onNavigate('quiz');
                            }}
                            className={`p-3 border rounded-[14px] transition-all flex items-center justify-between cursor-pointer group/item ${
                              theme === 'dark'
                                ? 'bg-black/20 hover:bg-neon-lime/10 border-white/5 hover:border-neon-lime/30'
                                : 'bg-slate-50 hover:bg-[#2F69FF]/5 border-slate-200 hover:border-[#2F69FF]/30 hover:shadow-sm'
                            }`}
                          >
                            <span className={`text-[12px] font-bold transition-colors ${
                              theme === 'dark'
                                ? 'text-slate-200 group-hover/item:text-neon-lime'
                                : 'text-slate-700 group-hover/item:text-[#2F69FF]'
                            }`}>
                              {sub}
                            </span>
                            <div className="flex items-center gap-2 shrink-0 bg-white/5 dark:bg-black/20 px-2 py-1 rounded-full group-hover/item:bg-transparent">
                              <span className={`text-[9px] font-bold opacity-0 group-hover/item:opacity-100 transition-opacity uppercase tracking-wider ${
                                theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'
                              }`}>
                                Start
                              </span>
                              <Icons.Play className={`w-3.5 h-3.5 transform group-hover/item:translate-x-0.5 transition-all ${
                                theme === 'dark'
                                  ? 'text-slate-500 group-hover/item:text-neon-lime'
                                  : 'text-slate-400 group-hover/item:text-[#2F69FF]'
                              }`} />
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </motion.div>

      {/* 4. Goal Selection overlay Modal */}
      <AnimatePresence>
        {showPathSelector && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className={`border rounded-t-[28px] sm:rounded-[24px] p-5 w-full max-w-sm shadow-xl text-left ${
                theme === 'dark' ? 'bg-[#161A1D] border-white/10' : 'bg-white border-slate-200'
              }`}
            >
              <div className={`flex items-center justify-between pb-3 border-b mb-4 ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'}`}>
                <div className="space-y-0.5">
                  <h3 className={`text-sm font-black font-display ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>Select Exam Path</h3>
                  <p className={`text-[10px] ${theme === 'dark' ? 'text-slate-450' : 'text-[#6C737F]'}`}>Choose curriculum context to filter pyq mocks.</p>
                </div>
                <button
                  onClick={() => setShowPathSelector(false)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-[#6C737F] hover:text-[#1A1D20]'
                  }`}
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {examsConfig.map((exam) => {
                  const isCurrent = currentExam === exam.id;
                  return (
                    <div
                      key={exam.id}
                      onClick={() => handleSelectExamPath(exam.id)}
                      className={`p-3 rounded-xl border cursor-pointer text-left transition-all flex items-center justify-between ${
                        isCurrent
                          ? theme === 'dark'
                            ? 'border-neon-lime bg-neon-lime/10 text-neon-lime'
                            : 'border-[#2F69FF] bg-[#2F69FF]/10 text-[#2F69FF]'
                          : theme === 'dark'
                            ? 'border-white/5 hover:border-white/20 bg-slate-950/50'
                            : 'border-slate-200 hover:border-[#2F69FF]/30 bg-slate-50/50 hover:bg-slate-50'
                      }`}
                    >
                      <div className="space-y-0.5">
                        <span className={`text-[11px] font-extrabold block ${theme === 'dark' ? 'text-slate-250' : 'text-[#1A1D20]'}`}>
                          {exam.name}
                        </span>
                        <span className={`text-[9px] font-medium font-mono ${theme === 'dark' ? 'text-slate-550' : 'text-[#6C737F]'}`}>
                          {exam.subjects.length} Subjects • {exam.id.toUpperCase()}
                        </span>
                      </div>
                      {isCurrent ? (
                        <Icons.CheckCircle2 className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                      ) : (
                        <Icons.Circle className="w-4 h-4 text-slate-300 dark:text-slate-700 shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
