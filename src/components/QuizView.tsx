/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Question, QuizAttempt } from '../types';
import { toggleBookmark, getBookmarks, getQuizAttempts } from '../lib/storage';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { getExamsConfig } from '../lib/storage';

interface QuizViewProps {
  topic: string; // "Full Mock" or Subject Name
  subtopic: string; // "All Subtopics" or Subtopic Name
  difficulty: 'easy' | 'medium' | 'hard' | 'mixed';
  isTimed: boolean;
  questionPool: Question[];
  onQuit: () => void;
  onQuizFinished: (attempt: QuizAttempt) => void;
  onGoToGenerator: (subtopic: string) => void;
  examType?: string;
  isMockExam?: boolean; // True if mimicking real 200 Questions blueprint
  customCount?: number;
  overrideQuestions?: Question[];
}

// State categories for TCS iON palette
type QuestionState = 'not_visited' | 'not_answered' | 'answered' | 'marked_for_review' | 'answered_marked_for_review';

interface TCSQuestionState {
  questionId: string;
  state: QuestionState;
  selectedOptionIndex: number; // -1 if unselected
}

export default function QuizView({
  topic,
  subtopic,
  difficulty,
  isTimed,
  questionPool,
  onQuit,
  onQuizFinished,
  onGoToGenerator,
  examType = 'dsssb_tgt_cs',
  isMockExam = false,
  customCount,
  overrideQuestions
}: QuizViewProps) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  
  // TCS iON status states representation
  const [tcsStates, setTcsStates] = useState<TCSQuestionState[]>([]);
  const [showPalette, setShowPalette] = useState<boolean>(false);

  // Results screen states
  const [showResults, setShowResults] = useState<boolean>(false);
  const [quizAttemptData, setQuizAttemptData] = useState<QuizAttempt | null>(null);
  
  // Master timing countdown
  const [timeLeft, setTimeLeft] = useState<number>(120 * 60); // Default 120 minutes for total mock exam
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTime = useRef<number>(Date.now());

  // Set up question list according to mock blueprint or single subtopic selection
  useEffect(() => {
    let list: Question[] = [];

    const activeExamConfig = getExamsConfig().find(e => e.id === examType) || getExamsConfig()[0];

    if (overrideQuestions && overrideQuestions.length > 0) {
      list = [...overrideQuestions];
    } else if (isMockExam && subtopic === 'All Subject Blueprints') {
      // Build dynamic mock based on subject allotments of active chosen exam
      if (activeExamConfig) {
        activeExamConfig.subjects.forEach((subj) => {
          const allotment = activeExamConfig.rules.subjectAllotments[subj.name] || 0;
          const subQs = questionPool.filter(q => q.topic.toLowerCase() === subj.name.toLowerCase() && (q.exam === examType));
          
          // Use the actual pattern allotment! If there are enough questions in the pool, use allotment.
          const targetCount = Math.min(allotment, subQs.length);
          
          // Fast random sampling
          const shuffled = [...subQs];
          for (let i = shuffled.length - 1; i > 0 && (shuffled.length - i) <= targetCount; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          list.push(...shuffled.slice(Math.max(0, shuffled.length - targetCount)));
        });
      }

      // If pool was sparse, add random fallback questions of the current exam to ensure a good study flow
      if (list.length < 5) {
        const fallbackQs = questionPool.filter(q => q.exam === examType);
        const shuffledFallback = [...fallbackQs];
        for (let i = shuffledFallback.length - 1; i > 0 && (shuffledFallback.length - i) <= 15; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffledFallback[i], shuffledFallback[j]] = [shuffledFallback[j], shuffledFallback[i]];
        }
        list = shuffledFallback.slice(Math.max(0, shuffledFallback.length - 15));
      }
    } else if (isMockExam && subtopic !== 'All Subject Blueprints') {
      // PYQ / Uploaded Full Mock Mode - fetch directly without shuffling
      list = questionPool.filter(q => q.exam === examType && q.subtopic === subtopic);
    } else {
      // Direct subject/subtopic practice mode
      // Filter strictly to current exam questions
      let filtered = questionPool.filter(q => q.exam === examType);
      if (topic !== 'All Subjects' && topic !== 'Entire Syllabus' && !topic.includes('Entire Syllabus')) {
        // Special mapping for Computer Science topic grouping
        if (topic === 'Computer Science') {
          const csKeywords = ['Computer Science', 'Operating Systems', 'Computer Networks', 'Database Systems', 'Data Structures & Algos'];
          filtered = filtered.filter(q => csKeywords.includes(q.topic));
        } else {
          filtered = filtered.filter(q => q.topic.toLowerCase() === topic.toLowerCase());
        }
      }
      if (subtopic !== 'All Subtopics' && subtopic !== 'All Section Units' && !subtopic.includes('All Section Units')) {
        if (subtopic.toLowerCase() === 'general practice') {
          const matchedSubject = activeExamConfig?.subjects.find(s => s.name.toLowerCase() === topic.toLowerCase());
          const predefinedSubtopics = matchedSubject ? matchedSubject.topics.flatMap(t => t.subtopics.map(st => st.toLowerCase())) : [];
          filtered = filtered.filter(q => {
            const qSubLower = q.subtopic?.toLowerCase() || '';
            return qSubLower === '' || qSubLower === 'general practice' || !predefinedSubtopics.includes(qSubLower);
          });
        } else {
          filtered = filtered.filter(q => q.subtopic && q.subtopic.toLowerCase() === subtopic.toLowerCase());
        }
      }
      if (difficulty !== 'mixed') {
        filtered = filtered.filter(q => q.difficulty === difficulty);
      }
      
      const shuffled = [...filtered];
      const itemsToPick = customCount && customCount > 0 ? Math.min(customCount, shuffled.length) : shuffled.length;
      
      for (let i = shuffled.length - 1; i > 0 && (shuffled.length - i) <= itemsToPick; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      list = shuffled.slice(Math.max(0, shuffled.length - itemsToPick));
    }

    // Sort final list of questions subject-wise to match official section-wise TCS pattern
    if (activeExamConfig && list.length > 0) {
      const subjectOrder = activeExamConfig.subjects.map(s => s.name.toLowerCase());
      list.sort((a, b) => {
        const idxA = subjectOrder.indexOf(a.topic.toLowerCase());
        const idxB = subjectOrder.indexOf(b.topic.toLowerCase());
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }

    setQuestions(list);

    // Bootstrap TCS iON state objects mapping
    const bStates: TCSQuestionState[] = list.map(q => ({
      questionId: q.id,
      state: 'not_visited',
      selectedOptionIndex: -1
    }));
    if (bStates.length > 0) {
      bStates[0].state = 'not_answered'; // first question visited immediately
    }
    setTcsStates(bStates);

    // Load bookmarks
    setBookmarks(getBookmarks().map(b => b.questionId));

    // Time configuration
    const allocatedTime = isMockExam 
      ? (activeExamConfig.rules.timeLimitMinutes * 60) 
      : (list.length * 60);
    setTimeLeft(allocatedTime);
  }, [topic, subtopic, difficulty, questionPool, examType, isMockExam, customCount, overrideQuestions]);

  // Master Timer Listener
  useEffect(() => {
    if (!isTimed || questions.length === 0) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [questions, isTimed]);

  const handleSelectOption = (oIdx: number) => {
    setTcsStates(prev => {
      const updated = [...prev];
      if (updated[currentIdx]) {
        updated[currentIdx].selectedOptionIndex = oIdx;
        if (updated[currentIdx].state === 'marked_for_review') {
          updated[currentIdx].state = 'answered_marked_for_review';
        } else if (updated[currentIdx].state === 'not_answered' || updated[currentIdx].state === 'not_visited') {
          updated[currentIdx].state = 'answered';
        }
      }
      return updated;
    });
  };

  const handleBookmarkToggle = (qId: string) => {
    toggleBookmark(qId);
    setBookmarks(prev => 
      prev.includes(qId) ? prev.filter(id => id !== qId) : [...prev, qId]
    );
  };

  const handleNext = () => {
    // Current question becomes marked as "not_answered" if is not answered when moving forward
    setTcsStates(prev => {
      const updated = [...prev];
      const cur = updated[currentIdx];
      if (cur && cur.state === 'not_visited') {
        cur.state = 'not_answered';
      }
      
      // Lookahead: set next question as 'not_answered' if 'not_visited' so it registers on palette
      if (currentIdx + 1 < questions.length) {
        const next = updated[currentIdx + 1];
        if (next && next.state === 'not_visited') {
          next.state = 'not_answered';
        }
      }
      return updated;
    });

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      setShowExplanation(false);
    }
  };

  const handlePrevious = () => {
    if (currentIdx > 0) {
      setCurrentIdx(currentIdx - 1);
      setShowExplanation(false);
    }
  };

  const handleSaveAndNext = () => {
    // Save state & advance
    setTcsStates(prev => {
      const updated = [...prev];
      const cur = updated[currentIdx];
      if (cur) {
        if (cur.selectedOptionIndex !== -1) {
          cur.state = 'answered';
        } else {
          cur.state = 'not_answered';
        }
      }
      
      // Lookahead next
      if (currentIdx + 1 < questions.length) {
        const next = updated[currentIdx + 1];
        if (next && next.state === 'not_visited') {
          next.state = 'not_answered';
        }
      }
      return updated;
    });

    if (!isMockExam) {
      setShowExplanation(true); // display feedback instantly in Practice Mode
    }

    setTimeout(() => {
      if (currentIdx + 1 < questions.length) {
        setCurrentIdx(currentIdx + 1);
        setShowExplanation(false);
      }
    }, isMockExam ? 0 : 1200);
  };

  const handleClearResponse = () => {
    setTcsStates(prev => {
      const updated = [...prev];
      if (updated[currentIdx]) {
        updated[currentIdx].selectedOptionIndex = -1;
        updated[currentIdx].state = 'not_answered';
      }
      return updated;
    });
    setShowExplanation(false);
  };

  const handleMarkForReviewAndNext = () => {
    setTcsStates(prev => {
      const updated = [...prev];
      const cur = updated[currentIdx];
      if (cur) {
        cur.state = cur.selectedOptionIndex !== -1 ? 'answered_marked_for_review' : 'marked_for_review';
      }

      // Lookahead next
      if (currentIdx + 1 < questions.length) {
        const next = updated[currentIdx + 1];
        if (next && next.state === 'not_visited') {
          next.state = 'not_answered';
        }
      }
      return updated;
    });

    if (currentIdx + 1 < questions.length) {
      setCurrentIdx(currentIdx + 1);
      setShowExplanation(false);
    }
  };

  const handlePaletteClick = (idx: number) => {
    setTcsStates(prev => {
      const updated = [...prev];
      const target = updated[idx];
      if (target && target.state === 'not_visited') {
        target.state = 'not_answered';
      }
      return updated;
    });
    setCurrentIdx(idx);
    setShowExplanation(false);
  };

  const handleSubmitExam = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    
    // Process results structure
    const totalTimeTaken = Math.round((Date.now() - startTime.current) / 1000);
    const results = questions.map((q, idx) => {
      const stateObj = tcsStates[idx];
      const selected = stateObj ? stateObj.selectedOptionIndex : -1;
      const isCorrect = selected === q.correctIndex;
      return {
        questionId: q.id,
        questionText: q.text,
        selectedOptionIndex: selected,
        correctOptionIndex: q.correctIndex,
        isCorrect,
        topic: q.topic || topic,
        subtopic: q.subtopic || subtopic
      };
    });

    const correctAnswersCount = results.filter(r => r.isCorrect).length;
    const activeExamConfig = getExamsConfig().find(e => e.id === examType) || getExamsConfig()[0];

    const attempt: QuizAttempt = {
      id: `att-${Date.now()}`,
      topic: isMockExam && subtopic === 'All Subject Blueprints' ? `${activeExamConfig?.name || examType} Mock Exam` : topic,
      subtopic: isMockExam && subtopic === 'All Subject Blueprints' ? 'All Subject Blueprints' : subtopic,
      timestamp: new Date().toISOString(),
      questionsCount: questions.length,
      correctAnswersCount,
      timeTakenSeconds: totalTimeTaken,
      difficulty: isMockExam ? 'mixed' : difficulty,
      isTimed,
      isMockExam,
      examId: examType,
      questions: results
    };

    setQuizAttemptData(attempt);
    setShowResults(true);
  };

  // Helper formatting for count stopwatch
  const formatTime = (secs: number) => {
    const hrs = Math.floor(secs / 3600);
    const mins = Math.floor((secs % 3600) / 60);
    const remainingSecs = secs % 60;
    return `${hrs > 0 ? hrs + ':' : ''}${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  // TCS Palette Metrics
  const countState = (s: QuestionState) => tcsStates.filter(t => t.state === s).length;
  const answeredCount = tcsStates.filter(t => t.state === 'answered' || t.state === 'answered_marked_for_review').length;
  const markedReviewCount = tcsStates.filter(t => t.state === 'marked_for_review' || t.state === 'answered_marked_for_review').length;

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full gap-4 bg-white text-slate-800">
        <Icons.HelpCircle className="w-12 h-12 text-blue-500 animate-spin" />
        <div>
          <span className="font-extrabold text-sm text-slate-800">Assembling Practice Catalog...</span>
          <p className="text-xs text-slate-500 mt-1">Downloading target question structures into temporary memory streams.</p>
        </div>
      </div>
    );
  }

  const activeQ = questions[currentIdx];
  const activeState = tcsStates[currentIdx];
  const isBookmarked = bookmarks.includes(activeQ.id);

  if (showResults && quizAttemptData) {
    const correctCount = quizAttemptData.correctAnswersCount;
    const totalCount = quizAttemptData.questionsCount;
    const wrongCount = totalCount - correctCount;
    const scorePct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    // Calculate total attempts including current one
    const savedAttempts = getQuizAttempts();
    const isCurrentSaved = savedAttempts.some(a => a.id === quizAttemptData.id);
    const totalAttemptsCount = savedAttempts.length + (isCurrentSaved ? 0 : 1);

    // Color code properties based on threshold of 70% accuracy
    const isSuccess = scorePct >= 70;
    
    return (
      <div className="flex flex-col h-full bg-white/60 dark:bg-[#1A1D21]/90 backdrop-blur-xl text-slate-800 dark:text-slate-100 rounded-[24px] overflow-hidden border border-slate-200 dark:border-white/10 relative select-none animate-fade-in p-6 space-y-6 shadow-xl" id="quiz-results-screen">
        {/* Header Title */}
        <div className="text-center pt-2 pb-4 shrink-0 border-b border-slate-200 dark:border-white/5">
          <div className="w-12 h-12 bg-linear-to-br from-[#2F69FF] to-indigo-600 rounded-[16px] flex items-center justify-center mx-auto mb-3 shadow-lg text-white">
            <Icons.Sparkles className="w-6 h-6" />
          </div>
          <h2 className="text-[15px] font-black text-slate-900 dark:text-white tracking-tight uppercase font-display">
            {isMockExam ? 'Simulation Complete' : 'Practice Drill Results'}
          </h2>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 block font-mono uppercase tracking-widest">
            Performance Summary
          </span>
        </div>

        {/* Big Percentage Wheel Card */}
        <div className="relative p-6 bg-slate-50 dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-[20px] text-center space-y-4 flex flex-col items-center shadow-inner">
          <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
            {/* Circular SVG Meter */}
            <svg className="absolute w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 36 36">
              <path
                className="text-slate-200 dark:text-white/5"
                strokeWidth="2.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <motion.path
                initial={{ strokeDasharray: "0, 100" }}
                animate={{ strokeDasharray: `${scorePct}, 100` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className={`${isSuccess ? 'text-emerald-500 dark:text-neon-lime' : scorePct >= 40 ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500'}`}
                strokeWidth="2.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
            <div className="text-center z-10 mt-1">
              <span className={`text-3xl font-black block tracking-tighter ${isSuccess ? 'text-emerald-600 dark:text-white' : 'text-slate-800 dark:text-white'}`}>{scorePct}<span className="text-sm opacity-70">%</span></span>
              <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block -mt-1">Accuracy</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 dark:text-slate-400 max-w-[280px] mx-auto leading-relaxed">
            {scorePct >= 80 ? 'Excellent job! You are exhibiting high competency in this domain.' :
             scorePct >= 70 ? 'Good work! Passing score achieved. Steady progress.' :
             scorePct >= 50 ? 'Steady performance. Targeted revision will close remaining comprehension gaps.' :
             'Requires focus. Review incorrect answers and check explanations to establish fundamentals.'}
          </p>
        </div>

        {/* Detailed Grid Stats */}
        <div className="grid grid-cols-2 gap-3 shrink-0">
          {/* Correct Count */}
          <div className="p-3.5 bg-white dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/5 rounded-[16px] flex items-center gap-3 transition-colors hover:border-emerald-500/30 dark:hover:border-neon-lime/30 group">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${isSuccess ? 'bg-emerald-50 dark:bg-neon-lime/10 text-emerald-500 dark:text-neon-lime group-hover:bg-emerald-100 dark:group-hover:bg-neon-lime/20' : 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-500 group-hover:bg-emerald-100 dark:group-hover:bg-emerald-500/20'}`}>
              <Icons.Check className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black block text-slate-800 dark:text-slate-100 leading-tight">{correctCount} <span className="text-[9px] font-normal opacity-70">Right</span></span>
            </div>
          </div>

          {/* Incorrect/Wrong Count */}
          <div className="p-3.5 bg-white dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/5 rounded-[16px] flex items-center gap-3 transition-colors hover:border-rose-500/30 group">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-rose-50 dark:bg-rose-500/10 text-rose-500 group-hover:bg-rose-100 dark:group-hover:bg-rose-500/20">
              <Icons.X className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black block text-slate-800 dark:text-slate-100 leading-tight">{wrongCount} <span className="text-[9px] font-normal opacity-70">Wrong</span></span>
            </div>
          </div>

          {/* Total Quiz Attempts */}
          <div className="p-3.5 bg-white dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/5 rounded-[16px] flex items-center gap-3 transition-colors group hover:border-[#2F69FF]/30">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-blue-50 dark:bg-blue-500/10 text-[#2F69FF] dark:text-blue-400 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20">
              <Icons.Layers className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black block text-slate-800 dark:text-slate-100 leading-tight">Run #{totalAttemptsCount}</span>
            </div>
          </div>

          {/* Time Taken */}
          <div className="p-3.5 bg-white dark:bg-[#161A1D]/80 border border-slate-200 dark:border-white/5 rounded-[16px] flex items-center gap-3 transition-colors group hover:border-slate-400/30 dark:hover:border-white/20">
            <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-50 dark:bg-white/5 text-slate-500 dark:text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-white/10">
              <Icons.Clock className="w-4.5 h-4.5" />
            </div>
            <div className="text-left">
              <span className="text-xs font-black block text-slate-800 dark:text-slate-100 leading-tight">{formatTime(quizAttemptData.timeTakenSeconds)}</span>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex-1" />

        <div className="flex gap-2 pt-2 shrink-0">
          <button
            onClick={onQuit}
            className="flex-1 py-3.5 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-[14px] text-[10px] uppercase tracking-widest transition-all cursor-pointer"
          >
            Back
          </button>
          
          <button
            onClick={() => onQuizFinished(quizAttemptData)}
            className="flex-[2] py-3.5 bg-linear-to-r from-[#2F69FF] to-blue-600 hover:to-indigo-600 text-white font-black rounded-[14px] text-[11px] uppercase tracking-widest shadow-[0_4px_15px_rgba(47,105,255,0.3)] cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>Confirm & Save</span>
            <Icons.ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white text-slate-800 rounded-3xl overflow-hidden border border-slate-200 relative select-none">
      
      {/* Top Professional Sub-Navbar */}
      <div className="bg-slate-50 border-b border-slate-200 px-3 py-2.5 shrink-0 flex items-center justify-between text-xs z-10 animate-fade-in">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-[8px] uppercase tracking-wider text-blue-600 font-bold shrink-0">
            {isMockExam ? 'MOCK' : 'DRILL'}
          </span>
          <span className="font-sans font-bold text-slate-800 truncate max-w-[120px] md:max-w-xs block text-[11px]">
            {isMockExam ? (examType === 'dsssb_tgt_cs' ? 'DSSSB TGT CS' : 'DSSSB IT') : activeQ.topic}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono font-bold shrink-0 text-[11px]">
          {isTimed && (
            <div className="flex items-center gap-1 bg-red-50 border border-red-200 text-red-600 px-1.5 py-0.5 rounded text-[10.5px]">
              <Icons.Clock className="w-3 h-3 text-red-500 animate-pulse" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
          <button
            onClick={onQuit}
            className="px-2 py-0.5 bg-slate-100 hover:bg-red-50 hover:text-red-600 border border-slate-200 rounded transition-colors text-[10px] cursor-pointer text-slate-600 font-bold"
          >
            Quit
          </button>
        </div>
      </div>

      {/* TCS Palette Mini Panel / Accordion Toggle bar */}
      <div className="bg-slate-100/50 border-b border-slate-200/60 px-3.5 py-2 flex items-center justify-between shrink-0 text-[10px] text-slate-500 font-sans">
        <div className="flex items-center gap-2 font-mono font-bold text-[10.5px]">
          <span className="text-blue-600">Q. {currentIdx + 1} / {questions.length}</span>
          <span className="text-slate-300">|</span>
          <span className="text-emerald-600 font-extrabold">Ans: {answeredCount}</span>
        </div>
        
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200/50 rounded flex items-center gap-1 font-bold text-[9px] uppercase tracking-wide transition-all cursor-pointer"
        >
          <Icons.LayoutGrid className="w-3 h-3" />
          <span>{showPalette ? 'Hide Matrix' : 'View Matrix'}</span>
        </button>
      </div>

      {/* Body Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 pb-20 relative bg-slate-50/30">
        
        {/* Collapsible Question numbers palette mapping (Hiding / Above the question) */}
        {showPalette && (
          <div className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl space-y-2 select-none animate-fadeIn">
            <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase tracking-wider font-mono">
              <span>Navigation Matrix Map</span>
              <span>Total Questions: {questions.length}</span>
            </div>
            
            {/* Legend info row */}
            <div className="grid grid-cols-4 gap-1 text-[8.5px] text-slate-500 border-b border-slate-200/60 pb-2">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span>Ans ({answeredCount})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                <span>Unans ({countState('not_answered')})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                <span>Review ({markedReviewCount})</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-slate-400 rounded-full" />
                <span>Skip ({countState('not_visited')})</span>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1.5 max-h-[140px] overflow-y-auto pr-1">
              {tcsStates.map((stateObj, idx) => {
                let circleColor = "bg-slate-100 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-800";

                if (idx === currentIdx) {
                  circleColor = "bg-blue-100 text-blue-700 border-blue-400 ring-1 ring-blue-300 font-extrabold";
                } else if (stateObj.state === 'answered') {
                  circleColor = "bg-emerald-500 text-white border-transparent font-black";
                } else if (stateObj.state === 'not_answered') {
                  circleColor = "bg-rose-500 text-white border-transparent";
                } else if (stateObj.state === 'marked_for_review') {
                  circleColor = "bg-amber-400 text-slate-900 border-transparent font-bold";
                } else if (stateObj.state === 'answered_marked_for_review') {
                  circleColor = "bg-purple-500 text-white border-transparent font-bold";
                }

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      handlePaletteClick(idx);
                      setShowPalette(false); // Auto close palette on select for mobile view
                    }}
                    className={`h-7 rounded text-[10px] font-bold border flex items-center justify-center transition-all cursor-pointer relative ${circleColor}`}
                  >
                    <span>{idx + 1}</span>
                    {stateObj.state === 'answered_marked_for_review' && (
                      <span className="absolute bottom-0.5 right-0.5 w-1 h-1 bg-emerald-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Header Details (Difficulty + Bookmark) */}
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
          <span className="text-blue-600 font-extrabold uppercase tracking-tight text-[9px] truncate max-w-[200px]">
            {activeQ.subtopic || 'General Practice'}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleBookmarkToggle(activeQ.id)}
              className="p-1 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
              title="Bookmark Question"
            >
              <Icons.Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border uppercase ${activeQ.difficulty === 'easy' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : activeQ.difficulty === 'hard' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'}`}>
              {activeQ.difficulty}
            </span>
          </div>
        </div>

        {/* Question Text Prompt - tight & clean */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 shadow-xs text-left">
          <h3 className="text-[12.5px] font-bold text-slate-800 leading-relaxed font-sans select-none break-words">
            {activeQ.text}
          </h3>
        </div>

        {/* MCQ Option touch zones - perfectly sized for mobile view */}
        <div className="space-y-2">
          {activeQ.options.map((option, idx) => {
            const isSelected = activeState?.selectedOptionIndex === idx;
            const isCorrectAnswer = idx === activeQ.correctIndex;
            const showVerification = !isMockExam && showExplanation;

            let cardStyles = "border-slate-200 bg-white hover:bg-slate-50 text-slate-700";
            let radioStyles = "border-slate-300 text-slate-400 bg-slate-50";

            if (showVerification) {
              if (isCorrectAnswer) {
                cardStyles = "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold";
                radioStyles = "border-emerald-400 bg-emerald-500 text-white";
              } else if (isSelected) {
                cardStyles = "bg-rose-50 border-rose-300 text-rose-800 font-bold";
                radioStyles = "border-rose-400 bg-rose-505 text-white";
              }
            } else if (isSelected) {
              cardStyles = "bg-blue-50 border-blue-400 text-blue-700 font-bold shadow-sm";
              radioStyles = "border-blue-400 bg-blue-600 text-white";
            }

            return (
              <button
                key={idx}
                onClick={() => !showExplanation && handleSelectOption(idx)}
                disabled={showExplanation}
                className={`w-full text-left p-3 rounded-xl border flex items-center gap-2.5 cursor-pointer text-[11.5px] transition-all duration-155 min-h-[44px] ${cardStyles}`}
              >
                <div className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center font-bold text-[9px] shrink-0 ${radioStyles}`}>
                  {showVerification && isCorrectAnswer ? <Icons.Check className="w-3 h-3" /> : showVerification && isSelected ? <Icons.X className="w-3 h-3" /> : String.fromCharCode(65 + idx)}
                </div>
                <span className="leading-snug select-none break-words">{option}</span>
              </button>
            );
          })}
        </div>

        {/* Practice Mode Explanation Box */}
        {showExplanation && activeQ.explanation && (
          <div className="p-3 bg-emerald-50/20 border border-emerald-150 rounded-xl text-xs text-slate-650 space-y-1.5 animate-fade-in">
            <div className="flex items-center gap-1.5 text-emerald-600 font-bold uppercase tracking-wider text-[9px]">
              <Icons.BookOpen className="w-3.5 h-3.5 text-emerald-500" />
              <span>Explanation</span>
            </div>
            <p className="leading-relaxed text-[11px] text-slate-600 select-none">{activeQ.explanation}</p>
          </div>
        )}
      </div>

      {/* Compact TCS Action Footer perfect for mobile width - No wrap, small, elegant */}
      <footer className="absolute bottom-0 left-0 right-0 py-2.5 px-3 bg-slate-50/95 border-t border-slate-200/80 flex items-center justify-between gap-1.5 shrink-0 select-none z-10 font-sans animate-fade-in">
        
        <div className="flex gap-1.5">
          {isMockExam && (
            <>
              <button
                onClick={handleMarkForReviewAndNext}
                className="py-2 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300/30 text-amber-700 font-bold rounded-lg text-[9.5px] transition-colors cursor-pointer shrink-0"
              >
                Review
              </button>
              <button
                onClick={handleClearResponse}
                className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-500 hover:text-slate-800 font-bold rounded-lg text-[9.5px] transition-colors cursor-pointer shrink-0"
              >
                Clear
              </button>
            </>
          )}

          {currentIdx > 0 && (
            <button
              onClick={handlePrevious}
              className="py-2 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-600 hover:text-slate-800 font-bold rounded-lg text-[9.5px] leading-tight transition-colors cursor-pointer shrink-0"
            >
              Prev
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={handleSaveAndNext}
            className="py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-lg text-[9.5px] transition-colors cursor-pointer shadow border border-white/10 shrink-0"
          >
            Save & Next
          </button>

          {currentIdx === questions.length - 1 ? (
            <button
              onClick={handleSubmitExam}
              className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-lg text-[9.5px] transition-colors cursor-pointer shadow-md shadow-emerald-500/15 shrink-0 border border-white/10"
            >
              Submit
            </button>
          ) : (
            isMockExam ? (
              <button
                onClick={handleNext}
                className="py-2 px-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-250 text-slate-500 hover:text-slate-800 font-bold rounded-lg text-[9.5px] transition-all cursor-pointer shrink-0"
              >
                Skip
              </button>
            ) : null
          )}
        </div>

      </footer>

    </div>
  );
}
