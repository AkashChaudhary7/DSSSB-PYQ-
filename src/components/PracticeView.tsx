/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Question, ExamConfig } from '../types';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getExamsConfig, getSelectedExams } from '../lib/storage';

interface PracticeViewProps {
  currentExam: string;
  onChangeExam: (exam: string) => void;
  theme?: 'light' | 'dark';
  onSelectSubtopic: (
    topic: string, 
    subtopic: string, 
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed', 
    isTimed: boolean,
    isMockExam?: boolean,
    customCount?: number
  ) => void;
  questionPool: Question[];
}

export default function PracticeView({
  currentExam,
  onChangeExam,
  theme = 'dark',
  onSelectSubtopic,
  questionPool
}: PracticeViewProps) {
  const [examsConfig, setExamsConfig] = useState<ExamConfig[]>([]);
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  
  // Load local configurations
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

  // Subjects configuration dynamically from selected exam config
  const subjectsList = useMemo(() => {
    if (!currentExamConfig) return [];
    return currentExamConfig.subjects.map(s => s.name);
  }, [currentExamConfig]);

  // States
  const [selectedSubject, setSelectedSubject] = useState<string>('all');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('all');
  const [isTimed, setIsTimed] = useState<boolean>(true);
  const [questionCountType, setQuestionCountType] = useState<'all' | '10' | '20' | '50' | '100'>('all');
  const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed');
  const [isMockExamModel, setIsMockExamModel] = useState<boolean>(true);

  // Dynamic Subtopic selection lists parsed from current exam configuration
  const availableSubtopics = useMemo(() => {
    if (selectedSubject === 'all' || !currentExamConfig) return [];
    const matchedSubject = currentExamConfig.subjects.find(s => s.name === selectedSubject);
    if (!matchedSubject) return [];
    return matchedSubject.topics.flatMap(t => t.subtopics);
  }, [selectedSubject, currentExamConfig]);

  // Reset subtopics on subject change
  const handleSubjectChange = (subj: string) => {
    setSelectedSubject(subj);
    setSelectedSubtopic('all');
  };

  // Launch session
  const handleLaunch = () => {
    if (isMockExamModel) {
      // Direct TCS full simulation
      onSelectSubtopic("Full Mock Exam", "All Subject Blueprints", "mixed", true, true);
    } else {
      // Custom practice session!
      const finalSubject = selectedSubject === 'all' ? "Entire Syllabus Selection" : selectedSubject;
      const finalSubtopic = selectedSubtopic === 'all' ? "All Section Units" : selectedSubtopic;
      const countVal = questionCountType === 'all' ? undefined : parseInt(questionCountType, 10);
      onSelectSubtopic(finalSubject, finalSubtopic, difficulty, isTimed, false, countVal);
    }
  };

  if (!currentExamConfig) {
    return (
      <div className="p-6 text-center text-slate-500">
        Loading active exam patterns...
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in text-slate-800 dark:text-slate-100 font-sans">
      
      {/* Selector Header Bar */}
      <div className={`flex items-center justify-between pb-2 border-b ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`}>
        <div className="text-left">
          <h2 className={`text-base font-black tracking-tight flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-150' : 'text-[#1A1D20]'}`}>
            <Icons.Cpu className={`w-4.5 h-4.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
            <span>Practice Configurator</span>
          </h2>
          <span className={`text-[10px] block mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>Customize your practice mock drill sessions</span>
        </div>

        {/* Static active exam goal badge */}
        <div className={`text-[9.5px] font-black uppercase tracking-wider px-2.5 py-1 rounded-xl shrink-0 border ${
          theme === 'dark' 
            ? 'text-neon-lime bg-neon-lime/10 border-neon-lime/20' 
            : 'text-[#2F69FF] bg-[#2F69FF]/10 border-[#2F69FF]/20'
        }`}>
          Target: {currentExamConfig.name}
        </div>
      </div>

      {/* Target Mode Segment selector (Mock Exam Pattern vs Custom Drill) */}
      <div className={`grid grid-cols-2 gap-2 p-1 border rounded-2xl h-11 shrink-0 ${theme === 'dark' ? 'bg-[#161A1D]/85 border-white/10' : 'bg-white/45 border-white/40 backdrop-blur-md'}`}>
        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={() => {
            setIsMockExamModel(true);
            setIsTimed(true);
          }}
          className={`rounded-xl font-bold text-[11px] truncate flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isMockExamModel 
              ? theme === 'dark'
                ? 'bg-neon-lime/15 text-neon-lime border border-neon-lime/30 shadow-md'
                : 'bg-[#2F69FF] text-white shadow-md'
              : `text-slate-650 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent`
          }`}
        >
          <Icons.ShieldAlert className="w-3.5 h-3.5 text-rose-500" />
          <span>Exam Pattern Match</span>
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.96 }}
          type="button"
          onClick={() => setIsMockExamModel(false)}
          className={`rounded-xl font-bold text-[11px] truncate flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            !isMockExamModel 
              ? theme === 'dark'
                ? 'bg-neon-lime/15 text-neon-lime border border-neon-lime/30 shadow-md'
                : 'bg-[#2F69FF] text-white shadow-md'
              : `text-slate-650 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent`
          }`}
        >
          <Icons.Cpu className="w-3.5 h-3.5 text-emerald-500" />
          <span>Custom Mock Drill</span>
        </motion.button>
      </div>

      <AnimatePresence mode="wait">
        {isMockExamModel ? (
          /* View A: TCS Standardized Mock Details card loaded dynamically from Exam Config Rules */
          <motion.div
            key="mock_box"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className={`p-4 backdrop-blur-md rounded-2xl space-y-3.5 text-left animate-fade-in shadow-lg border ${
              theme === 'dark'
                ? 'bg-[#161A1D]/80 border-white/10 shadow-black/20'
                : 'bg-white/65 border-white/40'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <div className={`p-2 border rounded-xl shrink-0 ${
                theme === 'dark' ? 'bg-neon-lime/10 border-neon-lime/20 text-neon-lime' : 'bg-[#2F69FF]/10 border-[#2F69FF]/20 text-[#2F69FF]'
              }`}>
                <Icons.Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h4 className={`text-xs font-black uppercase tracking-wide ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                  TCS Official {currentExamConfig.name} Blueprint
                </h4>
                <p className={`text-[10.5px] mt-1 leading-relaxed ${theme === 'dark' ? 'text-slate-350' : 'text-[#6C737F]'}`}>
                  Triggers negative scoring of <strong>{currentExamConfig.rules.negativeMarking !== 0 ? currentExamConfig.rules.negativeMarking : 'none'}</strong> per wrong response. Tests the full syllabus under an interactive countdown clock.
                </p>
              </div>
            </div>

            <div className={`grid grid-cols-2 gap-2 border-t pt-3 text-[10px] font-mono ${theme === 'dark' ? 'border-white/5 text-slate-400' : 'border-slate-200 text-[#6C737F]'}`}>
              <div className="flex items-center gap-1.5">
                <Icons.Layers className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                <span>Qs Limit: <strong>{currentExamConfig.rules.numQuestions} Questions</strong></span>
              </div>
              <div className="flex items-center gap-1.5">
                <Icons.Timer className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400" />
                <span>Timer: <strong>{currentExamConfig.rules.timeLimitMinutes} Mins</strong></span>
              </div>
            </div>
          </motion.div>
        ) : (
          /* View B: Elaborate Custom Mock Drill Controls */
          <motion.div
            key="drill_controls"
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="space-y-3 text-left animate-fade-in"
          >
            {/* 1. Pick Subject Source */}
            <div className={`border rounded-2xl p-3 shadow-sm space-y-1 ${theme === 'dark' ? 'bg-[#161A1D]/80 border-white/10' : 'bg-white/65 border-white/40 backdrop-blur-md'}`}>
              <label className={`block text-[8.5px] font-mono font-black uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                1. SELECT DRILL SOURCE SUBJECT
              </label>
              <select
                value={selectedSubject}
                onChange={(e) => handleSubjectChange(e.target.value)}
                className={`w-full border rounded-xl p-2.5 outline-none text-xs cursor-pointer font-semibold ${
                  theme === 'dark'
                    ? 'bg-[#0B0C0E]/50 border-white/5 text-slate-200 focus:border-neon-lime'
                    : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#2F69FF]'
                }`}
              >
                <option value="all">Entire Syllabus (All Subjects Mix)</option>
                {subjectsList.map((subj, sidx) => (
                  <option key={sidx} value={subj}>{subj}</option>
                ))}
              </select>
            </div>

            {/* 2. Pick Subtopic chapters dynamically if subject selected */}
            {selectedSubject !== 'all' && availableSubtopics.length > 0 && (
              <div className={`border rounded-2xl p-3 shadow-sm space-y-1 ${theme === 'dark' ? 'bg-[#161A1D]/80 border-white/10' : 'bg-white/65 border-white/40 backdrop-blur-md'}`}>
                <label className={`block text-[8.5px] font-mono font-black uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                  2. FOCUS TOPIC UNIT
                </label>
                <select
                  value={selectedSubtopic}
                  onChange={(e) => setSelectedSubtopic(e.target.value)}
                  className={`w-full border rounded-xl p-2.5 outline-none text-xs cursor-pointer font-semibold ${
                    theme === 'dark'
                      ? 'bg-[#0B0C0E]/50 border-white/5 text-slate-200 focus:border-neon-lime'
                      : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#2F69FF]'
                  }`}
                >
                  <option value="all">All Section Units combined</option>
                  {availableSubtopics.map((sub, sidx) => (
                    <option key={sidx} value={sub}>{sub}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Difficulty + Session Timer config */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className={`border rounded-2xl p-3 shadow-sm space-y-1 ${theme === 'dark' ? 'bg-[#161A1D]/80 border-white/10' : 'bg-white/65 border-white/40 backdrop-blur-md'}`}>
                <label className={`block text-[8.5px] font-mono font-black uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                  DIFFICULTY INDEX
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as any)}
                  className={`w-full border rounded-xl p-2 outline-none text-xs cursor-pointer ${
                    theme === 'dark'
                      ? 'bg-[#0B0C0E]/50 border-white/5 text-slate-200 focus:border-neon-lime'
                      : 'bg-slate-50 border-slate-200 text-slate-800 focus:border-[#2F69FF]'
                  }`}
                >
                  <option value="mixed">Mixed Levels</option>
                  <option value="easy">Easy Only</option>
                  <option value="medium">Medium Only</option>
                  <option value="hard">Hard Only</option>
                </select>
              </div>

              <div className={`border rounded-2xl p-3 shadow-sm space-y-1 ${theme === 'dark' ? 'bg-[#161A1D]/80 border-white/10' : 'bg-white/65 border-white/40 backdrop-blur-md'}`}>
                <label className={`block text-[8.5px] font-mono font-black uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                  CLOCK TIME LIMIT
                </label>
                <div className={`grid grid-cols-2 gap-1 p-0.5 rounded-xl h-9 border ${
                  theme === 'dark' ? 'bg-[#0B0C0E]/50 border-white/5' : 'bg-slate-50 border-slate-200'
                }`}>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setIsTimed(true)}
                    className={`rounded-lg font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      isTimed 
                        ? theme === 'dark'
                          ? 'bg-neon-lime text-black shadow font-black'
                          : 'bg-[#2F69FF] text-white shadow font-black'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent'
                    }`}
                  >
                    <Icons.Timer className="w-3 h-3" />
                    <span>Timed</span>
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    type="button"
                    onClick={() => setIsTimed(false)}
                    className={`rounded-lg font-bold text-[10px] flex items-center justify-center gap-1 cursor-pointer transition-all ${
                      !isTimed 
                        ? theme === 'dark'
                          ? 'bg-neon-lime text-black shadow font-black'
                          : 'bg-[#2F69FF] text-white shadow font-black'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white bg-transparent'
                    }`}
                  >
                    <Icons.Clock className="w-3 h-3" />
                    <span>Study</span>
                  </motion.button>
                </div>
              </div>
            </div>

            {/* 4. Question Size selection buttons */}
            <div className={`border rounded-2xl p-3 shadow-sm space-y-1.5 ${theme === 'dark' ? 'bg-[#161A1D]/80 border-white/10' : 'bg-white/65 border-white/40 backdrop-blur-md'}`}>
              <label className={`block text-[8.5px] font-mono font-black uppercase tracking-wider ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
                QUESTION SIZE LIMIT
              </label>
              <div className="grid grid-cols-5 gap-1.5 font-mono">
                {(['all', '10', '20', '50', '100'] as const).map((cnt) => (
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    key={cnt}
                    type="button"
                    onClick={() => setQuestionCountType(cnt)}
                    className={`h-8 border rounded-lg text-[10.5px] font-bold flex items-center justify-center transition-all cursor-pointer ${
                      questionCountType === cnt 
                        ? theme === 'dark'
                          ? 'bg-neon-lime border-neon-lime text-black shadow-md font-black'
                          : 'bg-[#2F69FF] border-[#2F69FF] text-white shadow-md font-black'
                        : theme === 'dark'
                          ? 'border-white/5 bg-slate-900 text-slate-400 hover:border-white/15 hover:bg-slate-850/50'
                          : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-350 hover:bg-slate-100/50'
                    }`}
                  >
                    {cnt === 'all' ? 'Full' : cnt}
                  </motion.button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main launch active simulator button */}
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleLaunch}
        className={`w-full py-3.5 font-extrabold rounded-2xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer select-none border ${
          theme === 'dark'
            ? 'bg-gradient-to-r from-neon-lime to-[#A1EE35] hover:opacity-95 text-black shadow-lg shadow-[0_0_20px_rgba(158,255,51,0.25)] border-neon-lime/30'
            : 'bg-gradient-to-r from-[#2F69FF] to-[#1e40af] text-white shadow-lg shadow-[0_12px_24px_rgba(47,105,255,0.2)] border-white/20 hover:opacity-95'
        }`}
      >
        <Icons.Sparkles className={`w-4 h-4 shrink-0 ${theme === 'dark' ? 'text-black' : 'text-white'}`} />
        <span>LAUNCH TEST SIMULATOR</span>
        <Icons.ArrowRight className="w-4 h-4" />
      </motion.button>

    </div>
  );
}
