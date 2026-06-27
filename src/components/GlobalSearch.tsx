/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { Question } from '../types';
import { EXAMS_PRESET } from '../data/examsPreset';
import { isQuestionForExam } from '../lib/storage';

interface GlobalSearchProps {
  theme: 'light' | 'dark';
  currentExam: string;
  questionPool: Question[];
  onSelectSubtopic?: (
    subjectName: string,
    subtopicName: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed',
    isTimed: boolean,
    isMockExam?: boolean
  ) => void;
  onNavigate?: (view: 'home' | 'practice' | 'quiz' | 'bookmarks' | 'analytics' | 'generator' | 'roadmap') => void;
}

export default function GlobalSearch({
  theme,
  currentExam,
  questionPool = [],
  onSelectSubtopic,
  onNavigate,
}: GlobalSearchProps) {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close search results dropdown on clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Retrieve current active exam details
  const currentExamConfig = useMemo(() => {
    return EXAMS_PRESET.find((e) => e.id === currentExam) || EXAMS_PRESET[0];
  }, [currentExam]);

  // Compute matches based on query
  const examQuestions = useMemo(() => {
    return questionPool.filter((q) => isQuestionForExam(q, currentExam, currentExamConfig));
  }, [questionPool, currentExam, currentExamConfig]);

  const searchResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return { subjects: [], topics: [], quizzes: [], questions: [] };
    }

    // 1. Subjects Matching (with real-time count in active pool)
    const matchedSubjectsMap = new Map<string, { name: string; count: number }>();
    examQuestions.forEach((q) => {
      const subjectName = q.topic;
      if (subjectName && subjectName.toLowerCase().includes(trimmed)) {
        const key = subjectName.toLowerCase();
        matchedSubjectsMap.set(key, {
          name: subjectName,
          count: (matchedSubjectsMap.get(key)?.count || 0) + 1,
        });
      }
    });
    // Fill from preset if missing
    if (currentExamConfig) {
      currentExamConfig.subjects.forEach((s) => {
        if (s.name.toLowerCase().includes(trimmed) && !matchedSubjectsMap.has(s.name.toLowerCase())) {
          matchedSubjectsMap.set(s.name.toLowerCase(), { name: s.name, count: 0 });
        }
      });
    }
    const subjectsResult = Array.from(matchedSubjectsMap.values());

    // 2. Topics Matching (from syllabus metadata)
    const topicsResult: { name: string; subjectName: string; subtopics: string[] }[] = [];
    if (currentExamConfig) {
      currentExamConfig.subjects.forEach((subj) => {
        subj.topics.forEach((topic) => {
          if (topic.name.toLowerCase().includes(trimmed)) {
            topicsResult.push({
              name: topic.name,
              subjectName: subj.name,
              subtopics: topic.subtopics,
            });
          }
        });
      });
    }

    // 3. Quizzes / Subtopics Matching (with question counts)
    const matchedQuizzesMap = new Map<string, { subtopicName: string; subjectName: string; count: number }>();
    examQuestions.forEach((q) => {
      if (q.subtopic && q.subtopic.toLowerCase().includes(trimmed)) {
        const key = q.subtopic.toLowerCase();
        matchedQuizzesMap.set(key, {
          subtopicName: q.subtopic,
          subjectName: q.topic,
          count: (matchedQuizzesMap.get(key)?.count || 0) + 1,
        });
      }
    });
    // Enrich from preset
    if (currentExamConfig) {
      currentExamConfig.subjects.forEach((subj) => {
        subj.topics.forEach((topic) => {
          topic.subtopics.forEach((sub) => {
            if (sub.toLowerCase().includes(trimmed) && !matchedQuizzesMap.has(sub.toLowerCase())) {
              matchedQuizzesMap.set(sub.toLowerCase(), {
                subtopicName: sub,
                subjectName: subj.name,
                count: 0,
              });
            }
          });
        });
      });
    }
    const quizzesResult = Array.from(matchedQuizzesMap.values());

    // 4. Question Match
    const matchedQuestions = examQuestions.filter((q) => {
      return (
        q.text.toLowerCase().includes(trimmed) ||
        (q.explanation && q.explanation.toLowerCase().includes(trimmed)) ||
        q.options.some((opt) => opt.toLowerCase().includes(trimmed))
      );
    });

    return {
      subjects: subjectsResult.slice(0, 3),
      topics: topicsResult.slice(0, 4),
      quizzes: quizzesResult.slice(0, 5),
      questions: matchedQuestions.slice(0, 5),
    };
  }, [query, currentExamConfig, examQuestions]);

  const hasResults =
    searchResults.subjects.length > 0 ||
    searchResults.topics.length > 0 ||
    searchResults.quizzes.length > 0 ||
    searchResults.questions.length > 0;

  return (
    <div ref={containerRef} className="relative w-full z-45" id="global-search-container">
      {/* Search Input Box with Glassmorphism and slide-in entrance */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="w-full"
      >
        <motion.div
          animate={{
            scale: isFocused ? 1.02 : 1,
            boxShadow: isFocused
              ? theme === 'dark'
                ? '0 0 25px rgba(158,255,51,0.12), inset 0 1px 0 rgba(255,255,255,0.1)'
                : '0 12px 30px rgba(47,105,255,0.15), inset 0 1px 0 rgba(255,255,255,0.6)'
              : theme === 'dark'
              ? '0 4px 20px rgba(0,0,0,0.15)'
              : '0 4px 15px rgba(0,0,0,0.03)',
            borderColor: isFocused
              ? theme === 'dark'
                ? 'rgba(158,255,51,0.5)'
                : 'rgba(47,105,255,0.5)'
              : theme === 'dark'
              ? 'rgba(255,255,255,0.08)'
              : 'rgba(0,0,0,0.08)',
          }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border backdrop-blur-xl transition-all ${
            theme === 'dark'
              ? 'bg-slate-900/60 text-white'
              : 'bg-white/70 text-[#1A1D20]'
          }`}
        >
          <Icons.Search
            className={`w-4 h-4 shrink-0 transition-colors ${
              isFocused
                ? theme === 'dark'
                  ? 'text-neon-lime'
                  : 'text-[#2F69FF]'
                : theme === 'dark'
                ? 'text-slate-400'
                : 'text-slate-500'
            }`}
          />
          <input
            type="text"
            value={query}
            onFocus={() => setIsFocused(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsFocused(true);
            }}
            placeholder="Search syllabus topics, roadmap units or practice quizzes..."
            className="w-full bg-transparent border-none outline-none text-xs font-semibold placeholder-slate-400 dark:placeholder-slate-500 pr-1"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className={`p-1 rounded-md transition-colors ${
                theme === 'dark'
                  ? 'hover:bg-white/10 text-slate-400 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icons.X className="w-3.5 h-3.5" />
            </button>
          )}
        </motion.div>
      </motion.div>

      {/* Dropdown Overlay with glassmorphism for search results */}
      <AnimatePresence>
        {isFocused && query.trim() !== '' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className={`absolute left-0 right-0 mt-2 p-3 rounded-[20px] border backdrop-blur-xl shadow-2xl max-h-[380px] overflow-y-auto z-50 text-left ${
              theme === 'dark'
                ? 'bg-[#161A1D]/95 border-white/10 text-white'
                : 'bg-white/95 border-slate-200/80 text-[#1A1D20]'
            }`}
          >
            {!hasResults ? (
              <div className="py-8 text-center">
                <Icons.Search className="w-8 h-8 text-slate-350 dark:text-slate-600 mx-auto mb-2 animate-pulse" />
                <p className={`text-xs font-bold ${theme === 'dark' ? 'text-slate-300' : 'text-[#1A1D20]'}`}>
                  No matching results found
                </p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Try searching other concepts or topics (e.g., CPU, Memory, Array)
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* 1. Subjects Matches */}
                {searchResults.subjects.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase tracking-wider font-mono text-slate-450 dark:text-slate-500 flex items-center gap-1">
                      <Icons.GraduationCap className="w-3 h-3 text-emerald-500" />
                      <span>Matching Subjects ({searchResults.subjects.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-1.5">
                      {searchResults.subjects.map((item, idx) => {
                        const firstSub = currentExamConfig?.subjects.find(s => s.name === item.name)?.topics[0]?.subtopics[0] || 'General';
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (onSelectSubtopic) {
                                onSelectSubtopic(item.name, firstSub, 'mixed', true, false);
                              }
                              if (onNavigate) {
                                onNavigate('quiz');
                              }
                              setIsFocused(false);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 group ${
                              theme === 'dark'
                                ? 'bg-[#1C2024]/60 hover:bg-emerald-550/5 border-white/5 hover:border-emerald-500/25'
                                : 'bg-slate-50 hover:bg-emerald-50 border-slate-100 hover:border-emerald-200'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="text-[7.5px] font-black uppercase tracking-wider font-mono text-emerald-600 dark:text-emerald-400">
                                SUBJECT
                              </span>
                              <h5 className="text-[10.5px] font-bold truncate mt-0.5">
                                {item.name} <span className="text-[9px] font-medium text-slate-500">({item.count} Qs)</span>
                              </h5>
                            </div>
                            <Icons.Play className="w-3 h-3 text-emerald-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. Topics Matches */}
                {searchResults.topics.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase tracking-wider font-mono text-slate-450 dark:text-slate-500 flex items-center gap-1">
                      <Icons.Folder className="w-3 h-3 text-amber-500" />
                      <span>Matching Syllabus Topics ({searchResults.topics.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-1.5">
                      {searchResults.topics.map((item, idx) => {
                        const firstSub = item.subtopics[0] || 'General';
                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (onSelectSubtopic) {
                                onSelectSubtopic(item.subjectName, firstSub, 'mixed', true, false);
                              }
                              if (onNavigate) {
                                onNavigate('quiz');
                              }
                              setIsFocused(false);
                            }}
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 group ${
                              theme === 'dark'
                                ? 'bg-[#1C2024]/60 hover:bg-amber-500/5 border-white/5 hover:border-amber-500/25'
                                : 'bg-slate-50 hover:bg-amber-50 border-slate-100 hover:border-amber-200'
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <span className="text-[7.5px] font-black uppercase tracking-wider font-mono text-slate-500 dark:text-slate-400">
                                {item.subjectName} • TOPIC AREA
                              </span>
                              <h5 className="text-[10.5px] font-bold truncate mt-0.5">
                                {item.name}
                              </h5>
                            </div>
                            <Icons.ArrowRight className="w-3 h-3 text-amber-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 3. Quizzes Matches */}
                {searchResults.quizzes.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase tracking-wider font-mono text-slate-450 dark:text-slate-500 flex items-center gap-1">
                      <Icons.HelpCircle className="w-3 h-3 text-indigo-500" />
                      <span>Matching Quizzes ({searchResults.quizzes.length})</span>
                    </h4>
                    <div className="grid grid-cols-1 gap-1.5">
                      {searchResults.quizzes.map((item, idx) => (
                        <div
                          key={idx}
                          onClick={() => {
                            if (onSelectSubtopic) {
                              onSelectSubtopic(item.subjectName, item.subtopicName, 'mixed', true, false);
                            }
                            if (onNavigate) {
                              onNavigate('quiz');
                            }
                            setIsFocused(false);
                          }}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all duration-200 group ${
                            theme === 'dark'
                              ? 'bg-[#1C2024]/60 hover:bg-neon-lime/5 border-white/5 hover:border-neon-lime/20'
                              : 'bg-slate-50 hover:bg-brand-blue/5 border-slate-100 hover:border-brand-blue/20'
                          }`}
                        >
                          <div className="min-w-0 pr-2">
                            <span className="text-[7.5px] font-black uppercase tracking-wider font-mono text-slate-550 dark:text-neon-lime/75">
                              {item.subjectName} • QUIZ
                            </span>
                            <h5 className="text-[10.5px] font-bold truncate mt-0.5">
                              {item.subtopicName} <span className="text-[9px] font-medium text-slate-500">({item.count} Qs)</span>
                            </h5>
                          </div>
                          <Icons.Play className="w-3 h-3 text-indigo-500 opacity-60 group-hover:opacity-100 transition-opacity" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 4. Questions Matches */}
                {searchResults.questions.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-[9px] font-black uppercase tracking-wider font-mono text-slate-450 dark:text-slate-500 flex items-center gap-1">
                      <Icons.FileText className="w-3 h-3 text-sky-500" />
                      <span>Quiz Questions ({searchResults.questions.length})</span>
                    </h4>
                    <div className="space-y-1.5">
                      {searchResults.questions.map((q) => (
                        <div
                          key={q.id}
                          onClick={() => {
                            setSelectedQuestion(q);
                          }}
                          className={`p-2.5 rounded-xl border text-left space-y-1.5 cursor-pointer transition-all ${
                            theme === 'dark'
                              ? 'bg-[#1C2024]/60 hover:bg-slate-850 border-white/5'
                              : 'bg-slate-50 hover:bg-white border-slate-100 hover:shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="text-[7.5px] font-mono px-1 py-0.2 rounded bg-slate-200/50 dark:bg-white/5 text-[#4B5563] dark:text-slate-400 border border-slate-300/30 dark:border-white/5 uppercase font-bold truncate max-w-[180px]">
                              {q.topic} • {q.subtopic}
                            </span>
                            <span className={`text-[7.5px] font-bold font-mono uppercase tracking-wider flex items-center gap-0.5 ${
                              theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'
                            }`}>
                              <span>Preview</span>
                              <Icons.ChevronRight className="w-2.5 h-2.5" />
                            </span>
                          </div>
                          <p className="text-[10px] leading-relaxed font-semibold line-clamp-2">
                            {q.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Custom Question Preview Modal */}
      <AnimatePresence>
        {selectedQuestion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-55 flex items-center justify-center p-4"
            onClick={() => setSelectedQuestion(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className={`border rounded-3xl p-5 w-full max-w-sm shadow-2xl text-left relative overflow-hidden ${
                theme === 'dark'
                  ? 'bg-[#161A1D] border-white/10 text-white'
                  : 'bg-white border-slate-200 text-[#1A1D20]'
              }`}
            >
              {/* Top Bar */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-200/50 dark:border-white/5 mb-4">
                <div className="space-y-0.5">
                  <h3 className={`text-xs font-black uppercase font-mono ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                    Question Preview
                  </h3>
                  <span className="text-[8.5px] block text-slate-500 dark:text-slate-400 font-mono">
                    {selectedQuestion.topic} • {selectedQuestion.subtopic}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedQuestion(null)}
                  className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                    theme === 'dark' ? 'hover:bg-white/5 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-500 hover:text-[#1A1D20]'
                  }`}
                >
                  <Icons.X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="space-y-4 max-h-[350px] overflow-y-auto pr-1">
                <p className="text-[11.5px] leading-relaxed font-bold font-sans">
                  {selectedQuestion.text}
                </p>

                {/* Options List */}
                <div className="space-y-2">
                  <span className="text-[8px] font-bold text-slate-450 dark:text-slate-500 font-mono uppercase tracking-wide">
                    Options:
                  </span>
                  <div className="space-y-1.5">
                    {selectedQuestion.options.map((opt, oIdx) => {
                      const isCorrect = opt === selectedQuestion.answer;
                      return (
                        <div
                          key={oIdx}
                          className={`p-2.5 rounded-xl border text-[10.5px] font-semibold transition-all ${
                            isCorrect
                              ? theme === 'dark'
                                ? 'bg-emerald-950/20 border-emerald-500/35 text-emerald-400'
                                : 'bg-emerald-50 border-emerald-200 text-[#047857]'
                              : theme === 'dark'
                              ? 'bg-slate-950/40 border-white/5 text-slate-400'
                              : 'bg-slate-50 border-slate-100 text-[#4B5563]'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-4 h-4 rounded-full border flex items-center justify-center text-[8.5px] font-bold ${
                                isCorrect
                                  ? theme === 'dark'
                                    ? 'bg-emerald-500 text-black border-transparent'
                                    : 'bg-[#10B981] text-white border-transparent'
                                  : theme === 'dark'
                                  ? 'border-white/10 text-slate-500'
                                  : 'border-slate-300 text-slate-400'
                              }`}
                            >
                              {String.fromCharCode(65 + oIdx)}
                            </span>
                            <span className="truncate">{opt}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation */}
                {selectedQuestion.explanation && (
                  <div
                    className={`p-3 rounded-xl border ${
                      theme === 'dark' ? 'bg-[#22272B]/35 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-[#4B5563]'
                    }`}
                  >
                    <span className="text-[8px] font-bold text-slate-450 dark:text-slate-500 font-mono uppercase tracking-wide block mb-1">
                      Explanation:
                    </span>
                    <p className="text-[10px] leading-relaxed font-sans font-medium">
                      {selectedQuestion.explanation}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
