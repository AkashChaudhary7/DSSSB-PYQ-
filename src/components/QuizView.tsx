/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Question, QuizAttempt } from '../types';
import { toggleBookmark, getBookmarks, getQuizAttempts } from '../lib/storage';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

import { getExamsConfig, isQuestionForExam, getNormalizedSubject } from '../lib/storage';

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
  theme?: 'light' | 'dark';
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
  overrideQuestions,
  theme = 'dark'
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
  const [isReviewingQuestions, setIsReviewingQuestions] = useState<boolean>(false);
  
  // Master timing countdown
  const [timeLeft, setTimeLeft] = useState<number>(120 * 60); // Default 120 minutes for total mock exam
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTime = useRef<number>(Date.now());

  // Set up question list according to mock blueprint or single subtopic selection
  useEffect(() => {
    let list: Question[] = [];

    const activeExamConfig = getExamsConfig().find(e => e.id === examType) || getExamsConfig()[0];

    // Read full attempt history to calculate unique and wrong-first questions
    const attempts = getQuizAttempts();
    const examAttempts = attempts.filter(a => a.examId === examType);
    
    const qHistory: Record<string, { attempted: boolean; lastIsCorrect: boolean; correctCount: number }> = {};
    const sortedAttempts = [...examAttempts].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    
    sortedAttempts.forEach(attempt => {
      attempt.questions.forEach(q => {
        const prev = qHistory[q.questionId] || { attempted: false, lastIsCorrect: false, correctCount: 0 };
        qHistory[q.questionId] = {
          attempted: true,
          lastIsCorrect: q.isCorrect,
          correctCount: prev.correctCount + (q.isCorrect ? 1 : 0)
        };
      });
    });

    const shuffleArray = <T,>(arr: T[]): T[] => {
      const shuffled = [...arr];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    if (overrideQuestions && overrideQuestions.length > 0) {
      list = [...overrideQuestions];
    } else if (isMockExam && subtopic === 'All Subject Blueprints') {
      // Build dynamic mock based on subject allotments of active chosen exam
      if (activeExamConfig) {
        activeExamConfig.subjects.forEach((subj) => {
          const allotment = activeExamConfig.rules.subjectAllotments[subj.name] || 0;
          const targetSubjNorm = getNormalizedSubject(subj.name);
          const subQs = questionPool.filter(q => 
            getNormalizedSubject(q.topic) === targetSubjNorm && 
            isQuestionForExam(q, examType, activeExamConfig)
          );
          
          // Categorize subject questions into priority groups
          const wrongGroup = subQs.filter(q => qHistory[q.id]?.lastIsCorrect === false);
          const uniqueGroup = subQs.filter(q => !qHistory[q.id] || (qHistory[q.id].correctCount === 0 && qHistory[q.id].lastIsCorrect !== false));
          const exhaustedGroup = subQs.filter(q => qHistory[q.id]?.correctCount > 0 && qHistory[q.id]?.lastIsCorrect !== false);

          const shuffledWrong = shuffleArray(wrongGroup);
          const shuffledUnique = shuffleArray(uniqueGroup);
          const shuffledExhausted = shuffleArray(exhaustedGroup);

          let orderedSubCandidates = [...shuffledWrong, ...shuffledUnique];
          if (orderedSubCandidates.length < allotment) {
            orderedSubCandidates = [...orderedSubCandidates, ...shuffledExhausted];
          }

          const targetCount = Math.min(allotment, orderedSubCandidates.length);
          list.push(...orderedSubCandidates.slice(0, targetCount));
        });
      }

      // If pool was sparse, add random fallback questions of the current exam to ensure a good study flow
      if (list.length < 5) {
        const fallbackQs = questionPool.filter(q => isQuestionForExam(q, examType, activeExamConfig));
        const shuffledFallback = shuffleArray(fallbackQs);
        list = shuffledFallback.slice(0, Math.min(15, shuffledFallback.length));
      }
    } else if (isMockExam && subtopic !== 'All Subject Blueprints') {
      // PYQ / Uploaded Full Mock Mode - fetch directly without shuffling
      list = questionPool.filter(q => q.exam === examType && q.subtopic === subtopic);
    } else {
      // Direct subject/subtopic practice mode
      // Filter to current exam questions including shared common subject questions
      let filtered = questionPool.filter(q => isQuestionForExam(q, examType, activeExamConfig));
      if (topic !== 'All Subjects' && topic !== 'Entire Syllabus' && !topic.includes('Entire Syllabus')) {
        // Special mapping for Computer Science topic grouping
        if (topic === 'Computer Science') {
          const csKeywords = ['Computer Science', 'Operating Systems', 'Computer Networks', 'Database Systems', 'Data Structures & Algos'];
          filtered = filtered.filter(q => csKeywords.includes(q.topic));
        } else {
          // Compare normalized subjects to allow shared question banks
          const targetSubjNorm = getNormalizedSubject(topic);
          filtered = filtered.filter(q => getNormalizedSubject(q.topic) === targetSubjNorm);
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
      
      // Categorize practice questions into priority groups
      const wrongGroup = filtered.filter(q => qHistory[q.id]?.lastIsCorrect === false);
      const uniqueGroup = filtered.filter(q => !qHistory[q.id] || (qHistory[q.id].correctCount === 0 && qHistory[q.id].lastIsCorrect !== false));
      const exhaustedGroup = filtered.filter(q => qHistory[q.id]?.correctCount > 0 && qHistory[q.id]?.lastIsCorrect !== false);

      const shuffledWrong = shuffleArray(wrongGroup);
      const shuffledUnique = shuffleArray(uniqueGroup);
      const shuffledExhausted = shuffleArray(exhaustedGroup);

      // Prioritize Wrong questions, then unattempted Unique questions, then exhausted correct questions as fallback
      let orderedCandidates = [...shuffledWrong, ...shuffledUnique];
      
      // If we don't have enough unique or wrong questions, append exhausted correct ones to fill the session
      if (orderedCandidates.length === 0) {
        orderedCandidates = shuffledExhausted;
      } else {
        const targetCount = customCount && customCount > 0 ? customCount : filtered.length;
        if (orderedCandidates.length < targetCount) {
          orderedCandidates = [...orderedCandidates, ...shuffledExhausted];
        }
      }

      const itemsToPick = customCount && customCount > 0 ? Math.min(customCount, orderedCandidates.length) : orderedCandidates.length;
      list = orderedCandidates.slice(0, itemsToPick);
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
    if (isReviewingQuestions) {
      return (
        <div className="flex flex-col h-full bg-white dark:bg-[#111315] text-slate-800 dark:text-slate-100 rounded-[24px] overflow-hidden border border-slate-200 dark:border-white/10 relative animate-fade-in p-5 md:p-6" id="quiz-review-questions-screen">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-4 shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Icons.BookOpen className="w-5 h-5" />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white">Practice Drill Review</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Analyze correct solutions and explanations</p>
              </div>
            </div>
            <button
              onClick={() => setIsReviewingQuestions(false)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-300 cursor-pointer"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>

          {/* Scrollable list of questions */}
          <div className="flex-1 overflow-y-auto my-4 pr-1 space-y-5 scrollbar-thin text-left">
            {quizAttemptData.questions.map((qAttemptItem, index) => {
              const originalQ = questions.find(q => q.id === qAttemptItem.questionId);
              const isCorrect = qAttemptItem.isCorrect;
              const optionsList = originalQ ? originalQ.options : ["Option A", "Option B", "Option C", "Option D"];
              
              return (
                <div 
                  key={qAttemptItem.questionId}
                  className={`p-4 rounded-2xl border transition-all ${
                    isCorrect 
                      ? 'bg-emerald-500/5 border-emerald-500/15' 
                      : qAttemptItem.selectedOptionIndex === -1
                      ? 'bg-slate-500/5 border-slate-500/15'
                      : 'bg-rose-500/5 border-rose-500/15'
                  }`}
                >
                  {/* Topic / Difficulty Tags */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                    <span className="text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400">
                      Q{index + 1}
                    </span>
                    {originalQ?.topic && (
                      <span className="text-[8px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                        {originalQ.topic}
                      </span>
                    )}
                    <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                      isCorrect 
                        ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' 
                        : qAttemptItem.selectedOptionIndex === -1
                        ? 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-400'
                        : 'bg-rose-100 dark:bg-rose-500/10 text-rose-700 dark:text-rose-400'
                    }`}>
                      {isCorrect ? 'Correct' : qAttemptItem.selectedOptionIndex === -1 ? 'Skipped' : 'Incorrect'}
                    </span>
                  </div>

                  {/* Question Text */}
                  <p className="text-[12px] font-medium leading-relaxed text-slate-900 dark:text-slate-100 mb-3 select-none">
                    {qAttemptItem.questionText}
                  </p>

                  {/* Options list */}
                  <div className="space-y-1.5 mb-3.5">
                    {optionsList.map((option, oidx) => {
                      const isCorrectOption = oidx === qAttemptItem.correctOptionIndex;
                      const isSelectedOption = oidx === qAttemptItem.selectedOptionIndex;
                      
                      let bgBorderClass = 'bg-slate-50/50 border-slate-200 dark:bg-black/10 dark:border-white/5 text-slate-700 dark:text-slate-300';
                      let iconNode = null;
                      
                      if (isCorrectOption) {
                        bgBorderClass = 'bg-emerald-500/10 border-emerald-500/30 text-emerald-800 dark:text-emerald-400 font-bold';
                        iconNode = <Icons.Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
                      } else if (isSelectedOption) {
                        bgBorderClass = 'bg-rose-500/10 border-rose-500/30 text-rose-800 dark:text-rose-400 font-bold';
                        iconNode = <Icons.X className="w-3.5 h-3.5 text-rose-500 shrink-0" />;
                      }

                      return (
                        <div 
                          key={oidx}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] leading-snug transition-all ${bgBorderClass}`}
                        >
                          <span className="font-mono text-[9px] font-black opacity-60 uppercase bg-black/5 dark:bg-white/5 w-5 h-5 rounded-full flex items-center justify-center shrink-0">
                            {String.fromCharCode(65 + oidx)}
                          </span>
                          <span className="flex-1 select-none">{option}</span>
                          {iconNode}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation block */}
                  {originalQ?.explanation && (
                    <div className="p-3 rounded-xl bg-slate-100/60 dark:bg-black/25 border border-slate-200/50 dark:border-white/5 text-[10.5px] leading-relaxed text-slate-650 dark:text-slate-350 space-y-1">
                      <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[8.5px] text-indigo-600 dark:text-indigo-400 mb-1">
                        <Icons.BookOpen className="w-3 h-3" />
                        <span>Explanation Solution</span>
                      </div>
                      <p className="select-none">{originalQ.explanation}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Back Button to return to results card */}
          <button
            onClick={() => setIsReviewingQuestions(false)}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-black rounded-xl text-[11px] uppercase tracking-widest transition-all cursor-pointer shadow-lg flex items-center justify-center gap-1.5 shrink-0"
          >
            <Icons.ArrowLeft className="w-4 h-4" />
            <span>Back to Score Report</span>
          </button>
        </div>
      );
    }

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
      <div className="flex flex-col h-full bg-white/60 dark:bg-[#1A1D21]/90 backdrop-blur-xl text-slate-800 dark:text-slate-100 rounded-[24px] overflow-hidden border border-slate-200 dark:border-white/10 relative select-none animate-fade-in p-6 space-y-5 shadow-xl" id="quiz-results-screen">
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

        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={() => setIsReviewingQuestions(true)}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 font-extrabold rounded-[14px] text-[10px] uppercase tracking-widest transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <Icons.BookOpen className="w-4 h-4 text-indigo-500" />
            <span>Review Answers & Explanations</span>
          </button>
          
          <div className="flex gap-2">
            <button
              onClick={onQuit}
              className="flex-1 py-3 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 font-bold rounded-[14px] text-[10px] uppercase tracking-widest transition-all cursor-pointer"
            >
              Back
            </button>
            
            <button
              onClick={() => onQuizFinished(quizAttemptData)}
              className="flex-[2] py-3 bg-linear-to-r from-[#2F69FF] to-blue-600 hover:to-indigo-600 text-white font-black rounded-[14px] text-[11px] uppercase tracking-widest shadow-[0_4px_15px_rgba(47,105,255,0.3)] cursor-pointer transition-all flex items-center justify-center gap-2"
            >
              <span>Confirm & Save</span>
              <Icons.ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col h-full overflow-hidden relative select-none transition-colors duration-200 ${
      theme === 'dark'
        ? 'bg-[#0c0d14] text-slate-100'
        : 'bg-white text-slate-800'
    }`}>
      
      {/* Top Professional Sub-Navbar */}
      <div className={`border-b px-3 py-2.5 shrink-0 flex items-center justify-between text-xs z-10 animate-fade-in transition-colors duration-200 ${
        theme === 'dark'
          ? 'bg-[#151821] border-white/5 text-slate-300'
          : 'bg-slate-50 border-slate-200 text-slate-650'
      }`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className={`px-1.5 py-0.5 border rounded text-[8px] uppercase tracking-wider font-bold shrink-0 ${
            theme === 'dark'
              ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
              : 'bg-blue-50 border-blue-200 text-blue-600'
          }`}>
            {isMockExam ? 'MOCK' : 'DRILL'}
          </span>
          <span className={`font-sans font-bold truncate max-w-[120px] md:max-w-xs block text-[11px] ${
            theme === 'dark' ? 'text-slate-200' : 'text-slate-800'
          }`}>
            {isMockExam ? (examType === 'dsssb_tgt_cs' ? 'DSSSB TGT CS' : 'DSSSB IT') : activeQ.topic}
          </span>
        </div>

        <div className="flex items-center gap-2 font-mono font-bold shrink-0 text-[11px]">
          {isTimed && (
            <div className={`flex items-center gap-1 border px-1.5 py-0.5 rounded text-[10.5px] ${
              theme === 'dark'
                ? 'bg-red-500/10 border-red-500/25 text-red-400'
                : 'bg-red-50 border-red-200 text-red-600'
            }`}>
              <Icons.Clock className="w-3 h-3 text-red-500 animate-pulse" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
          <button
            onClick={onQuit}
            className={`px-2 py-0.5 border rounded transition-colors text-[10px] cursor-pointer font-bold ${
              theme === 'dark'
                ? 'bg-[#1d202d] hover:bg-red-500/20 hover:text-red-400 border-white/5 text-slate-300'
                : 'bg-slate-100 hover:bg-red-50 hover:text-red-600 border-slate-200 text-slate-600'
            }`}
          >
            Quit
          </button>
        </div>
      </div>

      {/* TCS Palette Mini Panel / Accordion Toggle bar */}
      <div className={`border-b px-3.5 py-2 flex items-center justify-between shrink-0 text-[10px] font-sans transition-colors duration-200 ${
        theme === 'dark'
          ? 'bg-[#12141c]/90 border-white/5 text-slate-400'
          : 'bg-slate-100/50 border-slate-200/60 text-slate-500'
      }`}>
        <div className="flex items-center gap-2 font-mono font-bold text-[10.5px]">
          <span className="text-blue-600 dark:text-indigo-400">Q. {currentIdx + 1} / {questions.length}</span>
          <span className="text-slate-300 dark:text-white/10">|</span>
          <span className="text-emerald-600 dark:text-emerald-400 font-extrabold">Ans: {answeredCount}</span>
        </div>
        
        <button
          onClick={() => setShowPalette(!showPalette)}
          className={`px-2 py-0.5 border rounded flex items-center gap-1 font-bold text-[9px] uppercase tracking-wide transition-all cursor-pointer ${
            theme === 'dark'
              ? 'bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/20'
              : 'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200/50'
          }`}
        >
          <Icons.LayoutGrid className="w-3 h-3" />
          <span>{showPalette ? 'Hide Matrix' : 'View Matrix'}</span>
        </button>
      </div>

      {/* Body Area */}
      <div className={`flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-4 pb-24 relative transition-colors duration-200 ${
        theme === 'dark' ? 'bg-[#0b0c11]' : 'bg-slate-50/30'
      }`}>
        
        {/* Collapsible Question numbers palette mapping (Hiding / Above the question) */}
        {showPalette && (
          <div className={`border p-2.5 rounded-xl space-y-2 select-none animate-fadeIn transition-colors duration-200 ${
            theme === 'dark'
              ? 'bg-[#161922] border-white/10'
              : 'bg-slate-50 border-slate-200'
          }`}>
            <div className={`flex items-center justify-between text-[9px] uppercase tracking-wider font-mono ${
              theme === 'dark' ? 'text-slate-400' : 'text-slate-500'
            }`}>
              <span>Navigation Matrix Map</span>
              <span>Total Questions: {questions.length}</span>
            </div>
            
            {/* Legend info row */}
            <div className={`grid grid-cols-4 gap-1 text-[8.5px] border-b pb-2 transition-colors duration-200 ${
              theme === 'dark' ? 'border-white/5 text-slate-450' : 'border-slate-200/60 text-slate-500'
            }`}>
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
                let circleColor = theme === 'dark'
                  ? "bg-[#1d202d] text-slate-350 border-white/5 hover:bg-[#282c3e] hover:text-white"
                  : "bg-slate-100 text-slate-600 border-slate-200/80 hover:bg-slate-200 hover:text-slate-800";

                if (idx === currentIdx) {
                  circleColor = "bg-blue-100 text-blue-700 border-blue-400 ring-1 ring-blue-300 font-extrabold dark:bg-indigo-900/55 dark:text-indigo-200 dark:border-indigo-450 dark:ring-indigo-500/30";
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
        <div className={`flex items-center justify-between text-[10.5px] font-mono ${theme === 'dark' ? 'text-slate-450' : 'text-slate-500'}`}>
          <span className="text-blue-600 dark:text-indigo-450 font-black uppercase tracking-tight text-[9.5px] truncate max-w-[200px] md:max-w-md">
            {activeQ.subtopic || 'General Practice'}
          </span>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleBookmarkToggle(activeQ.id)}
              className={`p-1 transition-colors cursor-pointer ${theme === 'dark' ? 'text-slate-500 hover:text-amber-400' : 'text-slate-400 hover:text-amber-500'}`}
              title="Bookmark Question"
            >
              <Icons.Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-400 text-amber-400' : ''}`} />
            </button>
            <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border uppercase ${
              activeQ.difficulty === 'easy' 
                ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:border-emerald-500/20' 
                : activeQ.difficulty === 'hard' 
                  ? 'bg-rose-50 text-rose-600 border-rose-200 dark:bg-rose-500/10 dark:text-rose-400 dark:border-rose-500/20' 
                  : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/20'
            }`}>
              {activeQ.difficulty}
            </span>
          </div>
        </div>

        {/* Question Text Prompt - tight & clean */}
        <div className={`border rounded-xl p-4.5 md:p-6 shadow-xs text-left transition-colors duration-200 ${
          theme === 'dark' ? 'bg-[#151720] border-white/5' : 'bg-slate-50 border-slate-200/80'
        }`}>
          <h3 className={`text-[13px] md:text-sm font-bold leading-relaxed font-sans select-none break-words ${
            theme === 'dark' ? 'text-slate-100' : 'text-slate-800'
          }`}>
            {activeQ.text}
          </h3>
        </div>

        {/* MCQ Option touch zones - perfectly sized for mobile view */}
        <div className="space-y-2.5 max-w-4xl mx-auto w-full animate-fade-in">
          {activeQ.options.map((option, idx) => {
            const isSelected = activeState?.selectedOptionIndex === idx;
            const isCorrectAnswer = idx === activeQ.correctIndex;
            const showVerification = !isMockExam && showExplanation;

            let cardStyles = theme === 'dark'
              ? "border-white/5 bg-[#12141c] hover:bg-[#1a1c26] text-slate-250"
              : "border-slate-200 bg-white hover:bg-slate-50 text-slate-700";
            let radioStyles = theme === 'dark'
              ? "border-white/10 text-slate-400 bg-black/20"
              : "border-slate-300 text-slate-400 bg-slate-50";

            if (showVerification) {
              if (isCorrectAnswer) {
                cardStyles = theme === 'dark'
                  ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 font-bold"
                  : "bg-emerald-50 border-emerald-300 text-emerald-800 font-bold";
                radioStyles = "border-emerald-400 bg-emerald-500 text-white";
              } else if (isSelected) {
                cardStyles = theme === 'dark'
                  ? "bg-rose-500/15 border-rose-500/40 text-rose-300 font-bold"
                  : "bg-rose-50 border-rose-300 text-rose-800 font-bold";
                radioStyles = "border-rose-450 bg-rose-500 text-white";
              }
            } else if (isSelected) {
              cardStyles = theme === 'dark'
                ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-300 font-bold shadow-xs"
                : "bg-blue-50 border-blue-400 text-blue-700 font-bold shadow-xs";
              radioStyles = theme === 'dark'
                ? "border-indigo-500 bg-indigo-500 text-white"
                : "border-blue-400 bg-blue-600 text-white";
            }

            return (
              <button
                key={idx}
                onClick={() => !showExplanation && handleSelectOption(idx)}
                disabled={showExplanation}
                className={`w-full text-left p-3.5 md:p-4 rounded-xl border flex items-center gap-3 cursor-pointer text-[12px] md:text-sm transition-all duration-150 min-h-[46px] shadow-2xs ${cardStyles}`}
              >
                <div className={`w-5 h-5 rounded-full border flex items-center justify-center font-bold text-[10px] shrink-0 ${radioStyles}`}>
                  {showVerification && isCorrectAnswer ? (
                    <Icons.Check className="w-3.5 h-3.5" />
                  ) : showVerification && isSelected ? (
                    <Icons.X className="w-3.5 h-3.5" />
                  ) : (
                    String.fromCharCode(65 + idx)
                  )}
                </div>
                <span className="leading-snug select-none break-words flex-1">{option}</span>
              </button>
            );
          })}
        </div>

        {/* Practice Mode Explanation Box */}
        {showExplanation && activeQ.explanation && (
          <div className={`p-4 border rounded-xl text-xs space-y-1.5 animate-fade-in max-w-4xl mx-auto w-full transition-colors duration-200 ${
            theme === 'dark'
              ? 'bg-emerald-500/5 border-emerald-500/15 text-slate-300'
              : 'bg-emerald-50/25 border-emerald-150 text-slate-650'
          }`}>
            <div className={`flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] ${
              theme === 'dark' ? 'text-emerald-400' : 'text-emerald-600'
            }`}>
              <Icons.BookOpen className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-emerald-400' : 'text-emerald-500'}`} />
              <span>Explanation</span>
            </div>
            <p className="leading-relaxed text-[11px] md:text-[12px] select-none text-slate-600 dark:text-slate-300">{activeQ.explanation}</p>
          </div>
        )}
      </div>

      {/* Compact TCS Action Footer perfect for mobile width - No wrap, small, elegant */}
      <footer className={`absolute bottom-0 left-0 right-0 py-3 px-4 border-t flex items-center justify-between gap-2 shrink-0 select-none z-10 font-sans animate-fade-in transition-colors duration-200 ${
        theme === 'dark'
          ? 'bg-[#12141c]/95 border-white/5'
          : 'bg-slate-50/95 border-slate-200/80'
      }`}>
        
        <div className="flex gap-1.5">
          {isMockExam && (
            <>
              <button
                onClick={handleMarkForReviewAndNext}
                className="py-2 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-300/30 text-amber-700 dark:text-amber-400 font-bold rounded-lg text-[9.5px] transition-colors cursor-pointer shrink-0"
              >
                Review
              </button>
              <button
                onClick={handleClearResponse}
                className={`py-2 px-2.5 border font-bold rounded-lg text-[9.5px] transition-colors cursor-pointer shrink-0 ${
                  theme === 'dark'
                    ? 'bg-[#1e212f] hover:bg-[#282c3e] border-white/10 text-slate-300'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-500 hover:text-slate-800'
                }`}
              >
                Clear
              </button>
            </>
          )}

          {currentIdx > 0 && (
            <button
              onClick={handlePrevious}
              className={`py-2 px-3 border font-bold rounded-lg text-[9.5px] leading-tight transition-colors cursor-pointer shrink-0 ${
                theme === 'dark'
                  ? 'bg-[#1e212f] hover:bg-[#282c3e] border-white/10 text-slate-300'
                  : 'bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-600 hover:text-slate-800'
              }`}
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
                className={`py-2 px-2.5 border font-bold rounded-lg text-[9.5px] transition-all cursor-pointer shrink-0 ${
                  theme === 'dark'
                    ? 'bg-[#1e212f] hover:bg-[#282c3e] border-white/10 text-slate-400 hover:text-white'
                    : 'bg-slate-100 hover:bg-slate-200 border-slate-250 text-slate-500 hover:text-slate-800'
                }`}
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
