/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Question, ExamConfig } from '../types';
import * as Icons from 'lucide-react';
import { getExamsConfig, getSelectedExams, isQuestionForExam, getNormalizedSubject } from '../lib/storage';

interface TopicSelectorProps {
  currentExam: string;
  onChangeExam: (exam: string) => void;
  onSelectSubtopic: (
    topic: string, 
    subtopic: string, 
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed', 
    isTimed: boolean,
    isMockExam?: boolean
  ) => void;
  questionPool: Question[];
  onViewBookmarks: () => void;
  onViewAnalytics: () => void;
  onViewUploader: () => void;
}

export default function TopicSelector({
  currentExam,
  onChangeExam,
  onSelectSubtopic,
  questionPool,
  onViewBookmarks,
  onViewAnalytics,
  onViewUploader
}: TopicSelectorProps) {
  const [examsConfig, setExamsConfig] = useState<ExamConfig[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [selectedSubtopic, setSelectedSubtopic] = useState<string | null>(null);
  const [activeSubject, setActiveSubject] = useState<string | null>(null);

  // Practice custom parameters
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [isTimed, setIsTimed] = useState<boolean>(true);

  // Load configs
  useEffect(() => {
    setExamsConfig(getExamsConfig());
    setSelectedExams(getSelectedExams());
  }, [currentExam]);

  const activeExamsList = useMemo(() => {
    return examsConfig.filter(e => selectedExams.includes(e.id));
  }, [examsConfig, selectedExams]);

  const currentExamConfig = useMemo(() => {
    return examsConfig.find(e => e.id === currentExam) || activeExamsList[0] || examsConfig[0] || null;
  }, [examsConfig, activeExamsList, currentExam]);

  const getSubtopicQuestionCount = (subjectName: string, subtopicName: string) => {
    return subtopicCountsMap[`${subjectName.toLowerCase()}|${subtopicName.toLowerCase()}`] || 0;
  };

  const topicCountsMap = useMemo(() => {
    const counts: Record<string, number> = {};
    const subCounts: Record<string, number> = {};
    
    questionPool.forEach(q => {
      if (!isQuestionForExam(q, currentExam, currentExamConfig || undefined)) return;
      if (!q.topic) return;
      
      const qNorm = getNormalizedSubject(q.topic);
      // Map back to the exact subject name configured for the current exam (if any)
      const currentSubjects = currentExamConfig?.subjects.map(s => s.name) || [];
      const matchedSubject = currentSubjects.find(s => getNormalizedSubject(s) === qNorm);
      const topicLower = matchedSubject ? matchedSubject.toLowerCase() : qNorm;
      
      counts[topicLower] = (counts[topicLower] || 0) + 1;
      
      if (q.subtopic) {
        const subKey = `${topicLower}|${q.subtopic.toLowerCase()}`;
        subCounts[subKey] = (subCounts[subKey] || 0) + 1;
      }
    });
    return { counts, subCounts };
  }, [questionPool, currentExam, currentExamConfig]);

  const subjectCountsMap = topicCountsMap.counts;
  const subtopicCountsMap = topicCountsMap.subCounts;

  const getSubjectQuestionCount = (subjectName: string) => {
    return subjectCountsMap[subjectName.toLowerCase()] || 0;
  };

  const handleSubtopicClick = (subject: string, sub: string) => {
    setSelectedSubtopic(sub);
    setActiveSubject(subject);
  };

  const beginPractice = () => {
    if (activeSubject && selectedSubtopic) {
      onSelectSubtopic(activeSubject, selectedSubtopic, difficulty, isTimed, false);
    }
  };

  const beginMockSimulation = () => {
    // Launch dynamic mock mapping covering full syllabus blueprints
    onSelectSubtopic("Full Mock Exam", "All Subject Blueprints", "mixed", true, true);
  };

  const renderSubjectIcon = (sub: string) => {
    if (sub.includes('Studies') || sub.includes('GS') || sub.includes('GK') || sub.includes('History') || sub.includes('Economy')) {
      return <Icons.Globe2 className="w-4.5 h-4.5 text-blue-500 dark:text-blue-400" />;
    }
    if (sub.includes('Quantitative') || sub.includes('Math') || sub.includes('Aptitude')) {
      return <Icons.Percent className="w-4.5 h-4.5 text-amber-500 dark:text-amber-400" />;
    }
    if (sub.includes('Reasoning')) {
      return <Icons.Compass className="w-4.5 h-4.5 text-purple-500 dark:text-purple-400" />;
    }
    if (sub.includes('Hindi')) {
      return <Icons.Languages className="w-4.5 h-4.5 text-emerald-500 dark:text-emerald-400" />;
    }
    if (sub.includes('English')) {
      return <Icons.BookOpen className="w-4.5 h-4.5 text-rose-500 dark:text-rose-400" />;
    }
    return <Icons.Cpu className="w-4.5 h-4.5 text-indigo-500 dark:text-indigo-400" />;
  };

  if (!currentExamConfig) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading active exam configurations...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full space-y-3.5 text-slate-800 dark:text-slate-100" id="topic-selector-container">
      
      {/* Sleek Minimal Practice Header Switcher */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-2">
        <div className="text-left">
          <h2 className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight">Practice Arena</h2>
          <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5">Prepare with subject drills and mocks</span>
        </div>

        {/* Dynamic Context Selector based on selected exams config */}
        <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-700 dark:text-slate-300 shrink-0">
          <Icons.Layers className="w-3.5 h-3.5 text-indigo-500 dark:text-indigo-400 shrink-0" />
          <select
            value={currentExam}
            onChange={(e) => onChangeExam(e.target.value)}
            className="bg-transparent text-[10px] font-bold outline-none text-slate-800 dark:text-slate-200 cursor-pointer pr-1 border-none focus:ring-0"
          >
            {activeExamsList.map((exam) => (
              <option key={exam.id} value={exam.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-[10px] font-bold">
                {exam.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Dynamic Mock Test Action Banner using Chosen Exam Config Rules */}
      <div className="p-3.5 bg-emerald-500/10 dark:bg-emerald-500/5 border border-emerald-500/25 rounded-xl flex items-center justify-between gap-3 text-xs text-left">
        <div className="flex items-center gap-3 min-w-0">
          <div className="p-2 bg-emerald-500/20 rounded-lg text-emerald-600 dark:text-emerald-400 shrink-0">
            <Icons.Sparkles className="w-4.5 h-4.5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h4 className="text-[11.5px] font-extrabold text-emerald-700 dark:text-emerald-300 truncate">
              {currentExamConfig.name} Simulation ({currentExamConfig.rules.numQuestions} Qs)
            </h4>
            <span className="text-[9.5px] text-slate-500 dark:text-slate-400 block mt-0.5 truncate font-mono">
              Timed {currentExamConfig.rules.timeLimitMinutes} Mins • {currentExamConfig.rules.negativeMarking !== 0 ? `Negative Marking: ${currentExamConfig.rules.negativeMarking}` : 'No Negative Marks'}
            </span>
          </div>
        </div>
        <button
          onClick={beginMockSimulation}
          className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-black font-extrabold text-[9.5px] rounded-lg tracking-wider uppercase transition-all shadow shrink-0 active:scale-95 cursor-pointer border border-emerald-400"
        >
          Mock Test
        </button>
      </div>

      {/* Curriculum lists accordion */}
      <div className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-wider font-mono text-left">
            Syllabus Curriculum Subjects Map
          </h3>
          <span className="text-[8.5px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-500/15 px-2 py-0.5 rounded">
            Choose a subject to view unit drills
          </span>
        </div>

        <div className="space-y-2.5">
          {currentExamConfig.subjects.map((sub, sIdx) => {
            const isExpanded = expandedSubject === sub.name;
            const totalQs = getSubjectQuestionCount(sub.name);
            const totalSubtopics = sub.topics.flatMap(t => t.subtopics);

            return (
              <div
                key={sIdx}
                className={`border rounded-xl overflow-hidden transition-all duration-200 ${
                  isExpanded 
                    ? 'bg-slate-50 dark:bg-white/[0.04] border-indigo-500/30 dark:border-indigo-500/30 shadow-md shadow-indigo-500/5' 
                    : 'bg-slate-50/50 dark:bg-white/[0.015] border-slate-200 dark:border-white/5 hover:bg-slate-100/70 dark:hover:bg-white/[0.035] hover:border-slate-300 dark:hover:border-white/10'
                }`}
              >
                <button
                  onClick={() => setExpandedSubject(isExpanded ? null : sub.name)}
                  className="w-full flex items-center justify-between p-3.5 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg transition-colors ${isExpanded ? 'text-indigo-500 dark:text-indigo-400 border-indigo-500/20' : 'text-slate-400 dark:text-slate-500'}`}>
                      {renderSubjectIcon(sub.name)}
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">{sub.name}</h4>
                      <span className="text-[9.5px] text-slate-500 dark:text-slate-450 block mt-0.5 font-mono uppercase tracking-tight">
                        {totalSubtopics.length} subdivisions • Allotment: {currentExamConfig.rules.subjectAllotments[sub.name] || 0} Qs
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold font-mono px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded text-indigo-600 dark:text-indigo-300">
                      {totalQs} Qs
                    </span>
                    {isExpanded ? (
                      <Icons.ChevronDown className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                    ) : (
                      <Icons.ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    )}
                  </div>
                </button>

                {/* Collapsible Subtopics List */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-slate-200 dark:border-white/5 bg-slate-100 dark:bg-black/35 space-y-1.5 text-left">
                    <span className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 block pl-1 pt-1 font-mono">
                      Target Core Chapters:
                    </span>
                    
                    {totalSubtopics.length === 0 ? (
                      <p className="text-[10px] text-slate-500 p-2 italic">No chapters configured for this subject yet.</p>
                    ) : (
                      totalSubtopics.map((subtop, stIdx) => {
                        const subCount = getSubtopicQuestionCount(sub.name, subtop);
                        const isSelected = selectedSubtopic === subtop && activeSubject === sub.name;
                        return (
                          <button
                            key={stIdx}
                            onClick={() => handleSubtopicClick(sub.name, subtop)}
                            className={`w-full flex items-center justify-between p-2.5 rounded-lg text-left text-xs font-semibold border transition-all cursor-pointer ${
                              isSelected 
                                ? 'bg-indigo-600/15 border-indigo-500 text-indigo-600 dark:text-indigo-200' 
                                : 'bg-white dark:bg-white/[0.01] border-slate-200 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10 text-slate-600 dark:text-slate-450'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <Icons.Dot className={`w-4 h-4 -mx-1.5 ${isSelected ? 'text-indigo-500' : 'text-slate-400'}`} />
                              <span className="text-[11.5px] truncate max-w-[200px] block">{subtop}</span>
                            </div>
                            <span className="text-[9px] font-mono font-bold text-slate-450 dark:text-slate-400">
                              {subCount} Questions
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Practice setup configurations overlay module */}
      {selectedSubtopic && activeSubject && (
        <div className="p-4 bg-white dark:bg-slate-950 border border-slate-200 dark:border-indigo-500/25 rounded-2xl space-y-4 shadow-2xl relative text-left">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-2">
            <div>
              <span className="text-[9px] font-mono tracking-wider text-indigo-600 dark:text-indigo-400 uppercase font-black">
                PRACTICING UNIT DRILL
              </span>
              <h4 className="text-sm font-black text-slate-800 dark:text-slate-200 mt-0.5">{selectedSubtopic}</h4>
            </div>
            <button
              onClick={() => {
                setSelectedSubtopic(null);
                setActiveSubject(null);
              }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-white p-1"
            >
              <Icons.X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">DRILL DIFFICULTY</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-250 outline-none focus:border-indigo-500 text-xs"
              >
                <option value="mixed">Mixed difficulty Levels</option>
                <option value="easy">Easy Questions only</option>
                <option value="medium">Medium Questions only</option>
                <option value="hard">Hard Questions only</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">SESSION INTERVAL</label>
              <div className="grid grid-cols-2 gap-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 p-0.5 rounded-lg h-9">
                <button
                  type="button"
                  onClick={() => setIsTimed(true)}
                  className={`rounded font-extrabold text-[9.5px] truncate flex items-center justify-center gap-1 cursor-pointer ${isTimed ? 'bg-indigo-600 text-white shadow' : 'text-slate-550 dark:text-slate-400'}`}
                >
                  <Icons.Timer className="w-3 h-3" />
                  Timed
                </button>
                <button
                  type="button"
                  onClick={() => setIsTimed(false)}
                  className={`rounded font-extrabold text-[9.5px] truncate flex items-center justify-center gap-1 cursor-pointer ${!isTimed ? 'bg-indigo-600 text-white shadow' : 'text-slate-550 dark:text-slate-400'}`}
                >
                  <Icons.Clock className="w-3 h-3" />
                  Study
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={beginPractice}
            className="w-full py-3 bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/15 cursor-pointer border border-white/10"
          >
            <span>Begin Topic Drill Session</span>
            <Icons.ArrowRight className="w-4 h-4 text-indigo-200" />
          </button>
        </div>
      )}

    </div>
  );
}
