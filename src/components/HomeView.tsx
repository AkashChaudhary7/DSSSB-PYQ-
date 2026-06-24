/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Question, QuizAttempt, Badge, ExamConfig } from '../types';
import { getBookmarks, getExamsConfig, getSelectedExams, saveSelectedExams } from '../lib/storage';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import GlobalSearch from './GlobalSearch';

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
  onSelectSubtopic
}: HomeViewProps) {
  const [examsConfig, setExamsConfig] = useState<ExamConfig[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [showPathSelector, setShowPathSelector] = useState(false);

  // Load configuration and active choices
  useEffect(() => {
    setExamsConfig(getExamsConfig());
    setSelectedExams(getSelectedExams());
  }, [currentExam]);

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

  // Retrieve today's practice progress
  const todayAttemptsCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return attempts.filter(a => new Date(a.timestamp).toDateString() === todayStr).length;
  }, [attempts]);

  const bookmarksCount = useMemo(() => {
    return getBookmarks().length;
  }, [currentExam]); // Trigger reload when currentExam changes or component loads

  // Get active topic configurations for the subject
  const currentSubjectTopics = useMemo(() => {
    if (!currentExamConfig || !activeSubjectTab) return [];
    const subjObj = currentExamConfig.subjects.find(s => s.name === activeSubjectTab);
    return subjObj ? subjObj.topics : [];
  }, [currentExamConfig, activeSubjectTab]);

  const topicCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!currentSubjectTopics || currentSubjectTopics.length === 0) return counts;
    
    questionPool.forEach(q => {
      if (q.exam && q.exam !== currentExam) return;
      if (q.topic?.toLowerCase() !== activeSubjectTab?.toLowerCase()) return;
      
      currentSubjectTopics.forEach(topic => {
        if (q.subtopic?.toLowerCase().includes(topic.name.toLowerCase()) || q.text?.toLowerCase().includes(topic.name.toLowerCase())) {
          counts[topic.name] = (counts[topic.name] || 0) + 1;
        }
      });
    });
    return counts;
  }, [questionPool, currentExam, activeSubjectTab, currentSubjectTopics]);

  const totalExamQuestionsCount = useMemo(() => {
    return questionPool.filter(q => !q.exam || q.exam === currentExam).length;
  }, [questionPool, currentExam]);

  const overallAccuracy = useMemo(() => {
    const totalCount = attempts.reduce((acc, a) => acc + a.questionsCount, 0);
    const correctCount = attempts.reduce((acc, a) => acc + a.correctAnswersCount, 0);
    return totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
  }, [attempts]);

  const subjectQuestionsCountMap = useMemo(() => {
    const counts: Record<string, number> = {};
    questionPool.forEach(q => {
      if (q.exam && q.exam !== currentExam) return;
      if (q.topic) {
        const topicLower = q.topic.toLowerCase();
        // Since we want the display name from subjectsList, map via lowercase
        const matchSubj = subjectsList.find(s => s.toLowerCase() === topicLower);
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
  }, [questionPool, subjectsList, currentExam]);

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
    <div className="space-y-4 text-slate-800 dark:text-slate-100 font-sans" id="home-view-container">

      {/* 1. Scholar Welcome & Preparation Goal Dropdown (Unified, Compact & Highly Premium) */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className={`bg-gradient-to-br ${theme === 'dark' ? 'from-[#161A1D] to-[#0B0C0E] border-white/5 shadow-[0_0_20px_rgba(158,255,51,0.05)] hover:border-neon-lime/30' : 'from-[#2F69FF] to-[#1e40af] border-white/20 shadow-lg hover:shadow-[0_12px_24px_rgba(47,105,255,0.25)]'} backdrop-blur-xl border text-white rounded-[20px] p-4 text-left relative overflow-hidden group transition-all duration-300`}
      >
        <div className="absolute inset-0 opacity-15 bg-[radial-gradient(circle_at_bottom_right,_var(--tw-gradient-stops))] from-indigo-500 via-transparent to-transparent pointer-events-none" />
        
        <div className="flex items-center justify-between relative z-10">
          <div className="space-y-0.5">
            <h2 className="text-[13.5px] font-black tracking-tight flex items-center gap-1.5 font-display">
              Hello, {userProfile?.displayName || 'Scholar'} 👋
            </h2>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-indigo-100 font-mono font-black uppercase">Goal:</span>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowPathSelector(true)}
                className="text-[10px] font-extrabold text-amber-300 hover:text-amber-200 underline decoration-dotted underline-offset-2 transition-colors cursor-pointer flex items-center gap-1 leading-none"
              >
                <span>{currentExamConfig?.name || 'Loading goal...'}</span>
                <Icons.ChevronDown className="w-3 h-3 text-amber-300" />
              </motion.button>
            </div>
          </div>
          
          <div className="bg-white/10 px-2.5 py-0.5 rounded-full border border-white/10 flex items-center gap-1 shrink-0">
            <Icons.Sparkles className="w-2.5 h-2.5 text-amber-300 fill-amber-300 shrink-0" />
            <span className="text-[8px] font-black tracking-wider uppercase font-mono">
              {todayAttemptsCount > 0 ? `${todayAttemptsCount} Streak` : 'Active'}
            </span>
          </div>
        </div>

        {/* Dynamic miniature stats grid */}
        <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-white/10 relative z-10 text-center">
          <div>
            <span className="text-[7.5px] text-indigo-100 block font-bold tracking-wider uppercase font-mono">PRACTICED</span>
            <span className="text-[10.5px] font-black font-mono tracking-tight mt-0.5 block">{attempts.length} Qs</span>
          </div>
          <div className="border-l border-white/10">
            <span className="text-[7.5px] text-indigo-100 block font-bold tracking-wider uppercase font-mono">EXAM Qs</span>
            <span className="text-[10.5px] font-black font-mono tracking-tight mt-0.5 block">{totalExamQuestionsCount}</span>
          </div>
          <div className="border-l border-white/10">
            <span className="text-[7.5px] text-indigo-100 block font-bold tracking-wider uppercase font-mono">ACCURACY</span>
            <span className="text-[10.5px] font-black font-mono tracking-tight mt-0.5 block">{overallAccuracy}%</span>
          </div>
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
        className="space-y-3 pt-1"
      >
        <div className="flex items-center justify-between px-0.5">
          <h3 className={`text-[11.5px] font-black uppercase tracking-tight font-display flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
            <Icons.Cpu className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
            <span>Syllabus Explorer</span>
          </h3>
          <span className="text-[8.5px] text-slate-400 dark:text-slate-500 font-extrabold tracking-wider uppercase font-mono">
            {subjectsList.length} Subjects configured
          </span>
        </div>

        {/* Horizontal Category tabs with thematic color coordination */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 select-none scrollbar-none">
          {subjectsList.map((subj) => {
            const isActive = activeSubjectTab === subj;
            const count = subjectQuestionsCountMap[subj] || 0;

            return (
              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                key={subj}
                onClick={() => setActiveSubjectTab(subj)}
                className={`px-3.5 py-1.5 rounded-full text-[10px] font-extrabold shrink-0 flex items-center border transition-all cursor-pointer ${
                  isActive
                    ? theme === 'dark'
                      ? 'border-neon-lime bg-neon-lime/10 text-neon-lime shadow-md dark:shadow-[0_0_10px_rgba(158,255,51,0.15)]'
                      : 'border-[#2F69FF] bg-[#2F69FF]/10 text-[#2F69FF] shadow-md shadow-[#2F69FF]/10'
                    : theme === 'dark'
                      ? 'border-white/5 bg-slate-950/20 text-slate-400 hover:bg-slate-850/40 hover:text-white'
                      : 'border-white/40 bg-white/40 backdrop-blur-md text-[#6C737F] hover:bg-white/65 hover:text-[#1A1D20]'
                }`}
              >
                <span>{subj} ({count})</span>
              </motion.button>
            );
          })}
        </div>

        {/* Topics List under Selected Subject (Highly Minimalist, Clickable glassmorphic cards) */}
        <div className="space-y-2">
          {currentSubjectTopics.length === 0 ? (
            <div className={`p-8 text-center text-slate-400 backdrop-blur-md rounded-2xl border text-[11px] font-semibold ${theme === 'dark' ? 'bg-slate-900/40 border-white/5' : 'bg-white/40 border-white/30'}`}>
              Select a subject above to study chapter modules.
            </div>
          ) : (
            currentSubjectTopics.map((topic, index) => {
              const isExpanded = expandedTopic === topic.name;
              const topicQuestionsCount = topicCountsMap[topic.name] || 15;

              return (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: index * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  key={topic.name}
                  onClick={() => setExpandedTopic(isExpanded ? null : topic.name)}
                  className={`p-3.5 backdrop-blur-md rounded-2xl text-left space-y-2.5 shadow-xs transition-all duration-300 cursor-pointer group ${
                    theme === 'dark'
                      ? 'bg-slate-900/40 border-white/5 hover:border-neon-lime/30 dark:hover:shadow-[0_0_15px_rgba(158,255,51,0.12)]'
                      : 'bg-white/65 border-white/40 hover:border-[#2F69FF]/50 hover:shadow-[0_0_15px_rgba(47,105,255,0.12)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <h4 className={`text-[12px] font-black tracking-tight leading-tight transition-colors ${
                        theme === 'dark' 
                          ? 'text-slate-250 group-hover:text-neon-lime' 
                          : 'text-[#1A1D20] group-hover:text-[#2F69FF]'
                      }`}>
                        {topic.name}
                      </h4>
                      <p className={`text-[9px] font-semibold font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-[#6C737F]'}`}>
                        Contains {topic.subtopics.length} key core subtopics
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className={`text-[8.5px] font-mono font-black px-1.5 py-0.5 rounded-md border ${
                        theme === 'dark'
                          ? 'text-neon-lime bg-neon-lime/10 border-neon-lime/25'
                          : 'text-[#2F69FF] bg-[#2F69FF]/10 border-[#2F69FF]/20'
                      }`}>
                        {topicQuestionsCount} PYQs
                      </span>
                      {isExpanded ? (
                        <Icons.ChevronDown className={`w-3.5 h-3.5 shrink-0 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                      ) : (
                        <Icons.ChevronRight className={`w-3.5 h-3.5 transform group-hover:translate-x-0.5 transition-all duration-200 shrink-0 ${
                          theme === 'dark' ? 'text-slate-400 group-hover:text-neon-lime' : 'text-[#6C737F] group-hover:text-[#2F69FF]'
                        }`} />
                      )}
                    </div>
                  </div>

                  {/* Subtopics interactive tags list */}
                  {!isExpanded && (
                    <div className="flex flex-wrap gap-1">
                      {topic.subtopics.map((sub) => (
                        <span
                          key={sub}
                          className={`text-[8px] font-bold backdrop-blur-xs px-2 py-0.5 rounded border ${
                            theme === 'dark'
                              ? 'text-slate-400 bg-[#1C2024] border-white/5'
                              : 'text-[#6C737F] bg-white/50 border-white/30'
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
                      className={`pt-3 border-t space-y-2 relative z-10 ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'}`}
                      onClick={(e) => e.stopPropagation()} // Prevent double toggle
                    >
                      <span className="text-[9px] text-slate-500 dark:text-slate-450 uppercase tracking-widest font-mono font-black block mb-2">
                        Select Subtopic Unit to Practice:
                      </span>
                      <div className="space-y-1.5">
                        {topic.subtopics.map((sub) => (
                          <motion.div
                            whileHover={{ scale: 1.015 }}
                            whileTap={{ scale: 0.985 }}
                            key={sub}
                            onClick={() => {
                              onSelectSubtopic?.(activeSubjectTab, sub, 'mixed', true, false);
                              onNavigate('quiz');
                            }}
                            className={`p-2.5 border rounded-xl transition-all flex items-center justify-between cursor-pointer group/item ${
                              theme === 'dark'
                                ? 'bg-slate-950/40 hover:bg-neon-lime/5 border-white/5 dark:hover:border-neon-lime/20'
                                : 'bg-white/55 hover:bg-[#2F69FF]/5 border-white/40 hover:border-[#2F69FF]/20'
                            }`}
                          >
                            <span className={`text-[11px] font-bold transition-colors ${
                              theme === 'dark'
                                ? 'text-slate-200 group-hover/item:text-neon-lime'
                                : 'text-[#1A1D20] group-hover/item:text-[#2F69FF]'
                            }`}>
                              {sub}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className={`text-[8px] font-bold opacity-0 group-hover/item:opacity-100 transition-opacity ${
                                theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'
                              }`}>
                                Start Unit
                              </span>
                              <Icons.Play className={`w-3 h-3 transform group-hover/item:scale-110 transition-all ${
                                theme === 'dark'
                                  ? 'text-slate-400 group-hover/item:text-neon-lime'
                                  : 'text-[#6C737F] group-hover/item:text-[#2F69FF]'
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
