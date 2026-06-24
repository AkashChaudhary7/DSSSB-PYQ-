/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { QuizAttempt, Question } from '../types';
import { EXAMS_PRESET } from '../data/examsPreset';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface RoadmapViewProps {
  onBack: () => void;
  attempts: QuizAttempt[];
  currentExam: string;
  theme?: 'light' | 'dark';
  onStartQuiz: (
    topic: string,
    subtopic: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed',
    isTimed: boolean,
    isMockExam?: boolean
  ) => void;
  questionPool?: Question[];
}

interface SubtopicProgress {
  subjectName: string;
  topicName: string;
  subtopicName: string;
  attemptsCount: number;
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number;
  status: 'mastered' | 'revision' | 'not_started';
}

export default function RoadmapView({
  onBack,
  attempts,
  currentExam,
  theme = 'dark',
  onStartQuiz,
  questionPool = []
}: RoadmapViewProps) {
  // 1. Get Exam Configuration
  const examConfig = useMemo(() => {
    return EXAMS_PRESET.find(e => e.id === currentExam) || EXAMS_PRESET[0];
  }, [currentExam]);

  // 2. Parse Subject list from current configuration
  const subjects = useMemo(() => {
    return examConfig?.subjects || [];
  }, [examConfig]);

  const [activeSubjectName, setActiveSubjectName] = useState<string>(() => {
    return examConfig?.subjects[0]?.name || '';
  });

  // Ensure activeSubject stays valid if exam changes
  React.useEffect(() => {
    if (examConfig && examConfig.subjects.length > 0) {
      // Prefer computer science or the first available subject
      const csSubject = examConfig.subjects.find(s => s.name.toLowerCase().includes('computer'));
      setActiveSubjectName(csSubject ? csSubject.name : examConfig.subjects[0].name);
    }
  }, [examConfig]);

  // 3. Compute Progress for ALL subtopics in the exam config
  const subtopicsProgress = useMemo(() => {
    const list: SubtopicProgress[] = [];
    if (!examConfig) return list;

    examConfig.subjects.forEach(subject => {
      subject.topics.forEach(topic => {
        topic.subtopics.forEach(subtopic => {
          // Find attempts matching this subject and subtopic
          const matchedAttempts = attempts.filter(att => 
            att.topic.toLowerCase() === subject.name.toLowerCase() &&
            att.subtopic?.toLowerCase() === subtopic.toLowerCase()
          );

          let totalQuestions = 0;
          let totalCorrect = 0;
          matchedAttempts.forEach(att => {
            totalQuestions += att.questionsCount;
            totalCorrect += att.correctAnswersCount;
          });

          const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;
          let status: 'mastered' | 'revision' | 'not_started' = 'not_started';

          if (totalQuestions > 0) {
            status = accuracy >= 75 ? 'mastered' : 'revision';
          }

          list.push({
            subjectName: subject.name,
            topicName: topic.name,
            subtopicName: subtopic,
            attemptsCount: matchedAttempts.length,
            totalQuestions,
            totalCorrect,
            accuracy,
            status
          });
        });
      });
    });

    return list;
  }, [examConfig, attempts]);

  // 4. Recommendation Engine
  const recommendation = useMemo(() => {
    if (subtopicsProgress.length === 0) return null;

    // A. Prioritize Computer Science / technical core subject first if it exists
    const sortedProgress = [...subtopicsProgress].sort((a, b) => {
      const aIsCore = a.subjectName.toLowerCase().includes('computer');
      const bIsCore = b.subjectName.toLowerCase().includes('computer');
      if (aIsCore && !bIsCore) return -1;
      if (!aIsCore && bIsCore) return 1;
      return 0;
    });

    // B. Look for the first unattempted subtopic
    const firstNotStarted = sortedProgress.find(p => p.status === 'not_started');
    if (firstNotStarted) {
      return {
        target: firstNotStarted,
        type: 'foundation',
        title: 'Core Foundation Mission',
        reason: 'This essential unit is currently unattempted. Practicing this section will establish your primary syllabus knowledge base.',
        color: 'from-blue-600 to-indigo-600',
        borderColor: 'border-blue-200'
      };
    }

    // C. Look for subtopic with lowest accuracy (needs revision)
    const revisionNeeded = [...sortedProgress]
      .filter(p => p.status === 'revision')
      .sort((a, b) => a.accuracy - b.accuracy)[0];

    if (revisionNeeded) {
      return {
        target: revisionNeeded,
        type: 'reconquest',
        title: 'Reconquest & Revision Mission',
        reason: `Your accuracy in this area is currently ${revisionNeeded.accuracy}%. Reviewing and tackling fresh mock drills here will help secure complete conceptual understanding.`,
        color: 'from-amber-500 to-orange-600',
        borderColor: 'border-amber-200'
      };
    }

    // D. Everything is mastered! Suggest the lowest scoring item above 75% to achieve perfection
    const lowestMastery = [...sortedProgress]
      .sort((a, b) => a.accuracy - b.accuracy)[0];

    return {
      target: lowestMastery,
      type: 'perfection',
      title: 'Full Mastery Celebration',
      reason: `Amazing achievement! All sections are certified as mastered. We suggest reviewing "${lowestMastery.subtopicName}" (${lowestMastery.accuracy}% accuracy) to maintain your perfect score and sharp retention.`,
      color: 'from-emerald-600 to-teal-600',
      borderColor: 'border-emerald-200'
    };
  }, [subtopicsProgress]);

  // 5. Overall Completion metrics
  const completionMetrics = useMemo(() => {
    const total = subtopicsProgress.length;
    if (total === 0) return { percent: 0, mastered: 0, revision: 0, remaining: 0 };

    const mastered = subtopicsProgress.filter(p => p.status === 'mastered').length;
    const revision = subtopicsProgress.filter(p => p.status === 'revision').length;
    const remaining = total - mastered - revision;
    const percent = Math.round((mastered / total) * 100);

    return {
      percent,
      mastered,
      revision,
      remaining
    };
  }, [subtopicsProgress]);

  // Filter progress items belonging only to the selected subject
  const currentSubjectProgress = useMemo(() => {
    return subtopicsProgress.filter(p => p.subjectName === activeSubjectName);
  }, [subtopicsProgress, activeSubjectName]);

  // Group subtopic progress items by Topic Name
  const groupedTopics = useMemo(() => {
    const groups: Record<string, SubtopicProgress[]> = {};
    currentSubjectProgress.forEach(item => {
      if (!groups[item.topicName]) {
        groups[item.topicName] = [];
      }
      groups[item.topicName].push(item);
    });
    return groups;
  }, [currentSubjectProgress]);

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-8 text-slate-800 dark:text-slate-100 font-sans" id="syllabus-roadmap-container">
      {/* Header section with back navigation */}
      <div className={`flex items-center justify-between pb-3 border-b mb-4 shrink-0 text-left ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-850' : 'text-slate-500 hover:text-[#1A1D20] hover:bg-slate-100'
            }`}
            id="roadmap-back-btn"
          >
            <Icons.ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div>
            <h2 className="text-sm font-black tracking-tight flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
              <Icons.Route className={`w-4 h-4 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
              <span>Syllabus Conquest Roadmap</span>
            </h2>
            <span className={`text-[10px] block mt-0.5 font-semibold ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>Visualize subtopic coverages & achieve unified exam readiness</span>
          </div>
        </div>

        <div className={`flex items-center gap-1 border px-2.5 py-1 rounded-full text-[9px] font-black font-mono tracking-wide uppercase ${
          theme === 'dark'
            ? 'bg-neon-lime/10 border-neon-lime/20 text-neon-lime'
            : 'bg-[#2F69FF]/10 border-[#2F69FF]/20 text-[#2F69FF]'
        }`}>
          <Icons.Award className="w-3.5 h-3.5 text-amber-500" />
          <span>{examConfig?.name}</span>
        </div>
      </div>

      {/* OVERALL PROGRESS SUMMARY HERO PANEL */}
      <div className={`border rounded-2xl p-4.5 shadow-xs mb-4 text-left grid grid-cols-1 md:grid-cols-12 gap-4 items-center backdrop-blur-md ${
        theme === 'dark'
          ? 'bg-[#161A1D]/80 border-white/5 shadow-inner'
          : 'bg-white/65 border-white/40 shadow-sm'
      }`}>
        <div className="md:col-span-5 space-y-2">
          <h3 className={`text-xs font-black uppercase tracking-wider font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-[#6C737F]'}`}>
            Syllabus Coverage Score
          </h3>
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-[#1A1D20]'}`}>
              {completionMetrics.percent}%
            </span>
            <span className={`text-[10.5px] font-bold uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
              Conquered
            </span>
          </div>
          {/* Custom micro horizontal bar progress indicator */}
          <div className={`h-2 w-full rounded-full overflow-hidden border ${theme === 'dark' ? 'bg-slate-950 border-white/5' : 'bg-slate-100 border-slate-200/50'}`}>
            <div 
              className={`h-full transition-all duration-500 bg-gradient-to-r ${
                theme === 'dark' ? 'from-neon-lime to-emerald-500' : 'from-[#2F69FF] to-[#34D399]'
              }`} 
              style={{ width: `${completionMetrics.percent}%` }}
            />
          </div>
          <span className={`text-[10px] block ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>
            {completionMetrics.mastered} of {subtopicsProgress.length} subtopics certified at high accuracy.
          </span>
        </div>

        {/* Counter cards block */}
        <div className="md:col-span-7 grid grid-cols-3 gap-2 text-center h-full">
          {/* Mastered */}
          <div className={`p-2 border rounded-xl flex flex-col justify-center shadow-2xs ${
            theme === 'dark' 
              ? 'bg-emerald-950/25 border-emerald-900/35 text-emerald-400' 
              : 'bg-emerald-50/50 border-emerald-100 text-emerald-850'
          }`}>
            <span className="text-base font-black block leading-tight">
              {completionMetrics.mastered}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wide font-mono mt-0.5">
              Mastered
            </span>
          </div>

          {/* Revision Needed */}
          <div className={`p-2 border rounded-xl flex flex-col justify-center shadow-2xs ${
            theme === 'dark' 
              ? 'bg-amber-950/25 border-amber-900/35 text-amber-400' 
              : 'bg-amber-50/50 border-amber-100 text-amber-850'
          }`}>
            <span className="text-base font-black block leading-tight">
              {completionMetrics.revision}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wide font-mono mt-0.5">
              Needs Study
            </span>
          </div>

          {/* Not Started */}
          <div className={`p-2 border rounded-xl flex flex-col justify-center shadow-2xs ${
            theme === 'dark' 
              ? 'bg-[#1C2024]/40 border-white/5 text-slate-400' 
              : 'bg-slate-50 border-slate-250 text-[#6C737F]'
          }`}>
            <span className="text-base font-black block leading-tight">
              {completionMetrics.remaining}
            </span>
            <span className="text-[8px] font-bold uppercase tracking-wide font-mono mt-0.5">
              Locked/Fresh
            </span>
          </div>
        </div>
      </div>

      {/* CORE SYLLABUS GRID / TREE TRACK */}
      <div className="space-y-4">
        {/* Horizontal Subject Selection Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-none shrink-0" id="roadmap-subject-tabs">
          {subjects.map((sub) => {
            const isActive = sub.name === activeSubjectName;
            return (
              <motion.button
                whileTap={{ scale: 0.95 }}
                key={sub.name}
                onClick={() => setActiveSubjectName(sub.name)}
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all border cursor-pointer ${
                  isActive
                    ? theme === 'dark'
                      ? 'bg-neon-lime text-black border-neon-lime hover:opacity-90 shadow-xs'
                      : 'bg-[#2F69FF] text-white border-[#2F69FF] hover:bg-[#1e40af] shadow-xs'
                    : theme === 'dark'
                      ? 'bg-[#161A1D]/85 text-slate-400 border-white/5 hover:border-white/10 hover:text-white'
                      : 'bg-white/40 backdrop-blur-md text-[#6C737F] border-white/40 hover:bg-white/60 hover:text-[#1A1D20]'
                }`}
              >
                {sub.name}
              </motion.button>
            );
          })}
        </div>

        {/* Visual Topic Chapters Timeline */}
        {Object.keys(groupedTopics).length === 0 ? (
          <div className={`p-8 text-center border rounded-2xl ${
            theme === 'dark' ? 'bg-[#161A1D]/80 border-white/5' : 'bg-white/65 border-white/40 shadow-xs'
          }`}>
            <Icons.FileQuestion className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <p className={`text-xs ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>No syllabus topics configured for this subdivision.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.keys(groupedTopics).map((topicName, tIdx) => {
              const subtopics = groupedTopics[topicName];
              // Calculate topic-level coverage percent
              const masteredCount = subtopics.filter(s => s.status === 'mastered').length;
              const topicCoveragePercent = Math.round((masteredCount / subtopics.length) * 100);

              return (
                <div 
                  key={topicName} 
                  className={`border rounded-2xl p-4 shadow-2xs space-y-3.5 text-left transition-all backdrop-blur-md ${
                    theme === 'dark'
                      ? 'bg-[#161A1D]/80 border-white/5 hover:border-neon-lime/20'
                      : 'bg-white/65 border-white/40 hover:border-[#2F69FF]/20'
                  }`}
                >
                  {/* Topic Section Header */}
                  <div className={`flex items-center justify-between border-b pb-2.5 ${theme === 'dark' ? 'border-white/5' : 'border-slate-100'}`}>
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10.5px] font-black font-mono border ${
                        theme === 'dark'
                          ? 'bg-neon-lime/10 text-neon-lime border-neon-lime/20'
                          : 'bg-[#2F69FF]/10 text-[#2F69FF] border-[#2F69FF]/20'
                      }`}>
                        {tIdx + 1}
                      </span>
                      <div>
                        <h4 className={`text-xs font-black uppercase tracking-tight ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
                          {topicName}
                        </h4>
                        <span className={`text-[9.5px] font-mono block ${theme === 'dark' ? 'text-slate-450' : 'text-[#6C737F]'}`}>
                          Topic Chapter Area
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-[10px] font-bold block ${theme === 'dark' ? 'text-slate-300' : 'text-[#1A1D20]'}`}>
                        {topicCoveragePercent}% Conquered
                      </span>
                      <div className={`w-16 h-1.5 rounded-full overflow-hidden mt-0.5 border ${theme === 'dark' ? 'bg-slate-950 border-white/5' : 'bg-slate-100 border-slate-200/50'}`}>
                        <div 
                          className={`h-full transition-all duration-300 ${theme === 'dark' ? 'bg-neon-lime' : 'bg-[#2F69FF]'}`}
                          style={{ width: `${topicCoveragePercent}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* List of subtopics in this topic */}
                  <div className="space-y-2">
                    {subtopics.map((sub, sIdx) => {
                      let statusIcon = <Icons.Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" />;
                      let statusClass = theme === 'dark' ? 'bg-[#1C2024]/60 border-white/5 text-slate-400' : 'bg-slate-50 border-slate-250 text-[#6C737F]';
                      let statusLabel = 'Not Started';

                      if (sub.status === 'mastered') {
                        statusIcon = <Icons.CheckCircle2 className={`w-3 h-3 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2BD167]'}`} />;
                        statusClass = theme === 'dark' ? 'bg-neon-lime/10 border-neon-lime/20 text-neon-lime' : 'bg-emerald-50/50 border-emerald-100 text-emerald-800';
                        statusLabel = 'Mastered';
                      } else if (sub.status === 'revision') {
                        statusIcon = <Icons.AlertCircle className="w-3 h-3 text-amber-500" />;
                        statusClass = theme === 'dark' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50/50 border-amber-100 text-amber-800';
                        statusLabel = 'Under Review';
                      }

                      return (
                        <div 
                          key={sIdx} 
                          className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 transition-all ${
                            sub.status === 'mastered' 
                              ? theme === 'dark'
                                ? 'bg-slate-950/20 border-white/5'
                                : 'bg-[#2F69FF]/5 border-white/40'
                              : theme === 'dark'
                                ? 'bg-[#1C2024]/30 border-white/5'
                                : 'bg-white/60 border-white/40 shadow-2xs'
                          }`}
                        >
                          <div className="space-y-1.5 min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {statusIcon}
                              <h5 className={`text-[11px] font-bold truncate ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
                                {sub.subtopicName}
                              </h5>
                            </div>
                            
                            <div className={`flex items-center gap-2 text-[9px] font-mono font-medium ${theme === 'dark' ? 'text-slate-450' : 'text-[#6C737F]'}`}>
                              <span className={`px-1.5 py-0.2 rounded border text-[8px] font-bold uppercase tracking-wider ${statusClass}`}>
                                {statusLabel}
                              </span>
                              {sub.attemptsCount > 0 ? (
                                <span>
                                  Accuracy: {sub.accuracy}% ({sub.totalCorrect}/{sub.totalQuestions} Qs)
                                </span>
                              ) : (
                                <span>0 attempts registered</span>
                              )}
                            </div>

                            {/* Subtopic Progress Bar */}
                            <div className="space-y-0.5 max-w-[180px] w-full">
                              <div className={`flex justify-between text-[7.5px] font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-[#6C737F]'}`}>
                                <span>Core Progress</span>
                                <span>{sub.attemptsCount > 0 ? `${sub.accuracy}%` : '0%'}</span>
                              </div>
                              <div className={`w-full h-1.5 rounded-full overflow-hidden border ${theme === 'dark' ? 'bg-slate-950 border-white/5' : 'bg-slate-100 border-slate-200/40'}`}>
                                <div 
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    sub.status === 'mastered' ? theme === 'dark' ? 'bg-neon-lime' : 'bg-[#2BD167]' :
                                    sub.status === 'revision' ? 'bg-amber-500' :
                                    theme === 'dark' ? 'bg-neon-lime/40' : 'bg-[#2F69FF]/50'
                                  }`} 
                                  style={{ width: `${sub.attemptsCount > 0 ? sub.accuracy : 0}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Quick Launch Practice drill button with interactive label */}
                          <div className="flex items-center justify-end shrink-0">
                            <motion.button
                              whileTap={{ scale: 0.94 }}
                              onClick={() => {
                                onStartQuiz(
                                  sub.subjectName,
                                  sub.subtopicName,
                                  'mixed',
                                  true
                                );
                              }}
                              className={`px-3 py-1.5 rounded-lg transition-all border text-[9px] font-black uppercase tracking-wider cursor-pointer flex items-center gap-1 shrink-0 ${
                                sub.status === 'mastered'
                                  ? theme === 'dark'
                                    ? 'bg-[#1C2024] hover:bg-slate-800 text-slate-300 border-white/5'
                                    : 'bg-slate-50 hover:bg-slate-100 text-[#6C737F] border-slate-200'
                                  : sub.status === 'revision'
                                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-50 border-amber-500 hover:border-amber-600 shadow-2xs'
                                  : theme === 'dark'
                                  ? 'bg-neon-lime hover:opacity-95 text-black border-neon-lime shadow-2xs'
                                  : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white border-[#2F69FF] shadow-2xs'
                              }`}
                              title={`Launch direct drill for ${sub.subtopicName}`}
                            >
                              {sub.status === 'mastered' ? (
                                <>
                                  <Icons.RotateCcw className="w-2.5 h-2.5" />
                                  <span>Re-drill</span>
                                </>
                              ) : sub.status === 'revision' ? (
                                <>
                                  <Icons.Play className="w-2.5 h-2.5 fill-slate-50" />
                                  <span>Resume</span>
                                </>
                              ) : (
                                <>
                                  <Icons.Play className="w-2.5 h-2.5 fill-slate-50 animate-pulse" />
                                  <span>Start</span>
                                </>
                              )}
                            </motion.button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
