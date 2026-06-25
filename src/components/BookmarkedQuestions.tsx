/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Question, BookmarkedQuestion, WrongQuestion } from '../types';
import { getBookmarks, getWrongQuestions } from '../lib/storage';
import * as Icons from 'lucide-react';
import { motion } from 'motion/react';

interface BookmarkedQuestionsProps {
  onBack: () => void;
  questionPool: Question[];
  onBookmarksUpdated: () => void;
  onStartAttemptQuiz: (topicName: string, questions: Question[]) => void;
  currentExam: string;
  theme?: 'light' | 'dark';
}

export default function BookmarkedQuestions({
  onBack,
  questionPool,
  onBookmarksUpdated,
  onStartAttemptQuiz,
  currentExam,
  theme = 'dark'
}: BookmarkedQuestionsProps) {
  const [activeTab, setActiveTab] = useState<'wrong' | 'bookmarks'>('wrong');
  const [bookmarks, setBookmarks] = useState<BookmarkedQuestion[]>([]);
  const [wrongQs, setWrongQs] = useState<WrongQuestion[]>([]);

  // Load both sets of questions
  const loadData = () => {
    setBookmarks(getBookmarks());
    setWrongQs(getWrongQuestions());
  };

  useEffect(() => {
    loadData();
  }, []);

  const questionMap = useMemo(() => {
    const map = new Map<string, Question>();
    for (const q of questionPool) {
      if (q && q.id) {
        map.set(q.id, q);
      }
    }
    return map;
  }, [questionPool]);

  // Filter full question objects based on bookmarks
  const bookmarkedQuestionsList = useMemo(() => {
    return bookmarks
      .map(b => {
        const q = questionMap.get(b.questionId);
        return q ? { ...q, addedAt: b.bookmarkedAt } : null;
      })
      .filter((q): q is Question & { addedAt: string } => q !== null && (!q.exam || q.exam === currentExam));
  }, [bookmarks, questionMap, currentExam]);

  // Filter full question objects based on wrong questions
  const wrongQuestionsList = useMemo(() => {
    return wrongQs
      .map(w => {
        const q = questionMap.get(w.questionId);
        return q ? { ...q, addedAt: w.addedAt } : null;
      })
      .filter((q): q is Question & { addedAt: string } => q !== null && q.exam === currentExam);
  }, [wrongQs, questionMap, currentExam]);

  // Group the current selected list of questions by topic
  const groupedTopics = useMemo(() => {
    const activeList = activeTab === 'bookmarks' ? bookmarkedQuestionsList : wrongQuestionsList;
    const groups: Record<string, (Question & { addedAt: string })[]> = {};
    
    activeList.forEach(q => {
      const topicName = q.topic || 'General Studies';
      if (!groups[topicName]) {
        groups[topicName] = [];
      }
      groups[topicName].push(q);
    });

    return Object.entries(groups).map(([name, list]) => ({
      name,
      count: list.length,
      questions: list
    })).sort((a, b) => b.count - a.count);
  }, [activeTab, bookmarkedQuestionsList, wrongQuestionsList]);

  const getTopicIcon = (topicName: string) => {
    const sub = topicName.toLowerCase();
    if (sub.includes('studies') || sub.includes('gs')) return <Icons.Globe2 className="w-4 h-4" />;
    if (sub.includes('quantitative') || sub.includes('math') || sub.includes('aptitude')) return <Icons.Percent className="w-4 h-4" />;
    if (sub.includes('reasoning')) return <Icons.Compass className="w-4 h-4" />;
    if (sub.includes('hindi')) return <Icons.Languages className="w-4 h-4" />;
    if (sub.includes('english')) return <Icons.BookOpen className="w-4 h-4" />;
    return <Icons.Cpu className="w-4 h-4" />;
  };

  const activeCount = activeTab === 'bookmarks' ? bookmarkedQuestionsList.length : wrongQuestionsList.length;

  return (
    <div className={`flex flex-col h-full overflow-y-auto pb-8 font-sans ${theme === 'dark' ? 'text-slate-100' : 'text-slate-800'}`} id="revision-deck-container">
      {/* Header Segment */}
      <div className={`flex items-center gap-2.5 pb-3 border-b mb-4 shrink-0 animate-fade-in ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`} id="revision-view-header">
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={onBack}
          className={`p-1.5 rounded-lg cursor-pointer transition-colors ${theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-850' : 'text-slate-500 hover:text-slate-950 hover:bg-slate-100'}`}
          id="bookmarks-back-btn"
        >
          <Icons.ArrowLeft className="w-4.5 h-4.5" />
        </motion.button>
        <div className="text-left">
          <h2 className={`text-sm font-black tracking-tight flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`} id="revision-view-title">
            <Icons.BookMarked className={`w-4 h-4 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
            <span>Revision Arena</span>
          </h2>
          <span className={`text-[10px] block mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-550'}`}>Targeted recall & concept master lists</span>
        </div>
      </div>

      {/* Visual Revision Stats & Tip Card with brand colors */}
      <div className={`mb-4 bg-gradient-to-r ${theme === 'dark' ? 'from-neon-lime/10 to-emerald-500/10 border-neon-lime/20' : 'from-[#2F69FF]/10 to-indigo-500/10 border-[#2F69FF]/20'} border rounded-2xl p-3.5 text-left shrink-0 animate-fade-in`}>
        <div className={`flex items-center gap-2 font-bold text-xs uppercase font-mono mb-1.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
          <Icons.Zap className="w-4 h-4 animate-pulse text-amber-500" />
          <span>Revision Insights</span>
        </div>
        <p className={`text-[11px] leading-relaxed font-semibold ${theme === 'dark' ? 'text-slate-200' : 'text-slate-850'}`}>
          Reviewing your weak areas boosts test-day recall by up to <strong>150%</strong>. Master these custom topic lists to perfect your scoring potential.
        </p>
      </div>

      {/* Tabs Controller */}
      <div className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border mb-4 shrink-0 animate-fade-in ${theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200 shadow-2xs'}`} id="revision-tabs">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            setActiveTab('wrong');
          }}
          className={`py-2 text-[10.5px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'wrong'
              ? theme === 'dark'
                ? 'bg-neon-lime text-black font-black shadow-md'
                : 'bg-[#2F69FF] text-white font-black shadow-md'
              : theme === 'dark'
                ? 'text-slate-400 hover:text-white hover:bg-white/5'
                : 'text-slate-500 hover:text-[#1A1D20] hover:bg-slate-50'
          }`}
        >
          <Icons.AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'wrong' ? (theme === 'dark' ? 'text-black' : 'text-white') : 'text-amber-500'}`} />
          <span>Incorrect ({wrongQuestionsList.length})</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            setActiveTab('bookmarks');
          }}
          className={`py-2 text-[10.5px] font-black uppercase tracking-wider rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
            activeTab === 'bookmarks'
              ? theme === 'dark'
                ? 'bg-neon-lime text-black font-black shadow-md'
                : 'bg-[#2F69FF] text-white font-black shadow-md'
              : theme === 'dark'
                ? 'text-slate-400 hover:text-white hover:bg-white/5'
                : 'text-slate-500 hover:text-[#1A1D20] hover:bg-slate-50'
          }`}
        >
          <Icons.Bookmark className={`w-3.5 h-3.5 shrink-0 ${activeTab === 'bookmarks' ? (theme === 'dark' ? 'text-black' : 'text-white') : (theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]')}`} />
          <span>Bookmarks ({bookmarkedQuestionsList.length})</span>
        </motion.button>
      </div>

      {activeCount === 0 ? (
        <div className={`flex flex-col items-center justify-center text-center p-10 border rounded-2xl flex-1 shadow-xs animate-fade-in ${theme === 'dark' ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'}`}>
          <div className={`p-3 rounded-full mb-3 border ${theme === 'dark' ? 'bg-neon-lime/10 text-neon-lime border-neon-lime/20' : 'bg-[#2F69FF]/10 text-[#2F69FF] border-[#2F69FF]/20'}`}>
            {activeTab === 'bookmarks' ? <Icons.Bookmark className="w-8 h-8" /> : <Icons.HelpCircle className="w-8 h-8" />}
          </div>
          <h3 className={`text-sm font-bold ${theme === 'dark' ? 'text-slate-100' : 'text-slate-900'}`}>No items in this deck</h3>
          <p className={`text-[10.5px] max-w-xs mt-1 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-slate-550'}`}>
            {activeTab === 'bookmarks'
              ? "Bookmarked questions during your mock tests or daily practice drills will automatically show up grouped here."
              : "Questions you answer incorrectly while practicing or during mock exams will be automatically cataloged here."}
          </p>
          <button
            onClick={onBack}
            className={`mt-5 py-2 px-4 font-extrabold rounded-lg text-[10px] uppercase shadow transition-all cursor-pointer ${theme === 'dark' ? 'bg-neon-lime text-black hover:opacity-95' : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white'}`}
          >
            Go to Practice
          </button>
        </div>
      ) : (
        <div className="space-y-3 flex-1 animate-fade-in">
          <div className={`flex items-center justify-between pb-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-550'}`}>
            <span className="text-[9px] font-bold font-mono uppercase tracking-wider">
              {activeTab === 'bookmarks' ? 'BOOKMARKED SYLLABUS' : 'INCORRECT TOPICS'} ({groupedTopics.length} TOPICS)
            </span>
            <span className={`text-[9px] font-mono font-bold ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>
              Offline Sync Active
            </span>
          </div>

          <div className="space-y-2.5">
            {groupedTopics.map((topic, tIdx) => {
              return (
                <div 
                  key={tIdx}
                  className={`border rounded-xl overflow-hidden shadow-2xs transition-all ${theme === 'dark' ? 'bg-slate-900 border-white/5 hover:bg-slate-850' : 'bg-white border-slate-200 hover:bg-slate-50'}`}
                >
                  {/* Topic name and count only */}
                  <div className="p-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0 text-left">
                      <div className={`p-1.5 rounded-lg shrink-0 border ${theme === 'dark' ? 'bg-neon-lime/10 border-neon-lime/20 text-neon-lime' : 'bg-[#2F69FF]/10 border-[#2F69FF]/20 text-[#2F69FF]'}`}>
                        {getTopicIcon(topic.name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className={`text-xs font-bold truncate ${theme === 'dark' ? 'text-slate-200' : 'text-slate-900'}`}>{topic.name}</h4>
                        <span className={`text-[9.5px] block truncate mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-slate-550'}`}>
                          {topic.count} {topic.count === 1 ? 'question' : 'questions'} logged
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Attempt Topic Button */}
                      <motion.button
                        whileTap={{ scale: 0.95 }}
                        onClick={() => onStartAttemptQuiz(topic.name, topic.questions)}
                        className={`py-1.5 px-3 rounded-lg text-[9px] uppercase font-black tracking-wider transition-colors cursor-pointer flex items-center gap-1 shadow-xs border ${
                          theme === 'dark'
                            ? 'bg-[#9EFF33]/15 hover:bg-[#9EFF33]/25 text-neon-lime border-neon-lime/20'
                            : 'bg-[#2F69FF]/10 hover:bg-[#2F69FF]/20 text-[#2F69FF] border-[#2F69FF]/20'
                        }`}
                        title="Attempt these questions now"
                      >
                        <Icons.Play className="w-2.5 h-2.5 fill-current" />
                        <span>Practice Drill</span>
                      </motion.button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
