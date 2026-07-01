/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface UserAuthProps {
  onAuthChanged: () => void;
  currentUser: any;
  userProfile: any;
}

export default function UserAuth({ onAuthChanged, currentUser, userProfile }: UserAuthProps) {
  const [newNameInput, setNewNameInput] = useState(userProfile?.displayName || currentUser?.displayName || '');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateName = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newNameInput.trim();
    if (!cleanName) return;

    setIsUpdating(true);
    try {
      localStorage.setItem('cs_mcq_local_name', cleanName);
      
      const savedProfile = localStorage.getItem('cs_mcq_local_profile');
      let profile: any = {};
      try {
        profile = savedProfile ? JSON.parse(savedProfile) : {};
      } catch (e) {
        console.warn('Failed to parse local profile:', e);
      }
      profile.displayName = cleanName;
      localStorage.setItem('cs_mcq_local_profile', JSON.stringify(profile));

      setSuccessMsg(`Display name successfully changed to "${cleanName}"!`);
      
      setTimeout(() => {
        setSuccessMsg(null);
        onAuthChanged();
      }, 1200);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
    }
  };

  const localPoints = userProfile?.points || 0;
  const badgesCount = userProfile?.badges?.length || 0;

  return (
    <div className="bg-white/95 dark:bg-[#1A1D21]/95 border border-slate-200 dark:border-white/10 rounded-2xl p-5 backdrop-blur-xl max-w-sm mx-auto shadow-xl" id="auth-panel">
      <div className="text-center mb-5">
        <div className="mx-auto w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-2">
          <Icons.UserCog className="w-6 h-6" />
        </div>
        <span className="text-[9px] uppercase font-bold tracking-widest text-indigo-600 dark:text-neon-lime font-mono mb-1 block">Local Scholar Settings</span>
        <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 font-sans">
          Personalize Study Profile
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-normal">
          Customize your local identity. All bookmarks, mock test histories, custom syllabus questions, and leaderboard points are saved directly to your browser with instant offline persistence.
        </p>
      </div>

      <div className="space-y-4">
        {/* Status/Success feedback */}
        <AnimatePresence mode="wait">
          {successMsg && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="p-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs rounded-xl flex items-start gap-2 leading-relaxed shadow-sm text-left"
            >
              <Icons.CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Change Display Name form */}
        <form onSubmit={handleUpdateName} className="bg-slate-50 dark:bg-[#15181B] border border-slate-200 dark:border-white/5 rounded-xl p-4 text-left">
          <label className="block text-[9px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1.5 font-mono">
            Display Name / Scholar Nickname
          </label>
          <div className="flex gap-1.5">
            <input
              type="text"
              placeholder="eg. Scholar Pro"
              value={newNameInput}
              onChange={(e) => setNewNameInput(e.target.value)}
              disabled={isUpdating}
              maxLength={22}
              className="flex-1 px-3 py-2 bg-white dark:bg-[#202528] border border-slate-200 dark:border-white/10 rounded-lg text-xs text-slate-800 dark:text-white placeholder-slate-450 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            <button
              type="submit"
              disabled={isUpdating || !newNameInput.trim()}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-lg text-xs cursor-pointer disabled:opacity-50 transition-colors shrink-0"
            >
              {isUpdating ? <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save'}
            </button>
          </div>
        </form>

        {/* Quick Stats Summary */}
        <div className="grid grid-cols-2 gap-2 text-left">
          <div className="p-3 bg-slate-50 dark:bg-[#15181B] border border-slate-200 dark:border-white/5 rounded-xl">
            <span className="text-[8px] uppercase tracking-wider font-bold text-slate-450 font-mono block">Study Points</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icons.Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-sans">{localPoints}</span>
            </div>
          </div>
          <div className="p-3 bg-slate-50 dark:bg-[#15181B] border border-slate-200 dark:border-white/5 rounded-xl">
            <span className="text-[8px] uppercase tracking-wider font-bold text-slate-450 font-mono block">Badges Unlocked</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <Icons.Award className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="text-sm font-black text-slate-800 dark:text-slate-100 font-sans">{badgesCount}</span>
            </div>
          </div>
        </div>

        {/* Info Banner */}
        <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/25 border border-indigo-100 dark:border-indigo-500/10 rounded-xl text-left">
          <div className="flex items-center gap-1.5 mb-1 text-indigo-600 dark:text-indigo-400">
            <Icons.Zap className="w-3.5 h-3.5" />
            <h4 className="text-[10px] font-bold uppercase tracking-wider font-sans">High-Speed Sandbox Mode</h4>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-450 leading-normal">
            No emails, no cloud downtime, and zero database permissions issues. Practice sessions, analytics reports, and flashcards boot and save instantly with sub-millisecond response times.
          </p>
        </div>

        {/* Data Management Action Center */}
        <div className="p-3 bg-slate-50 dark:bg-[#15181B] border border-slate-200 dark:border-white/5 rounded-xl text-left">
          <span className="block text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 font-mono">
            Data Backup & Restore
          </span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                try {
                  const backup = {
                    displayName: localStorage.getItem('cs_mcq_local_name') || 'Scholar',
                    points: localStorage.getItem('cs_mcq_points') || '0',
                    badges: localStorage.getItem('cs_mcq_badges') || '[]',
                    attempts: localStorage.getItem('cs_mcq_quiz_attempts') || '[]',
                    bookmarks: localStorage.getItem('cs_mcq_bookmarks') || '[]',
                    wrongQuestions: localStorage.getItem('cs_mcq_wrong_questions') || '[]',
                    customQuestions: localStorage.getItem('cs_mcq_custom_questions') || '[]',
                    activeExam: localStorage.getItem('cs_mcq_active_exam') || 'dsssb_tgt_cs'
                  };
                  
                  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `dsssb_prep_backup_${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  
                  setSuccessMsg('Syllabus study data successfully exported! Keep this file safe.');
                  setTimeout(() => setSuccessMsg(null), 3000);
                } catch (err) {
                  console.error(err);
                }
              }}
              className="px-2.5 py-1.5 border border-slate-200 dark:border-white/10 hover:border-indigo-500 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-350 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-white dark:bg-white/5"
            >
              <Icons.Download className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>

            <label
              className="px-2.5 py-1.5 border border-slate-200 dark:border-white/10 hover:border-emerald-500 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-350 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors flex items-center justify-center gap-1.5 cursor-pointer bg-white dark:bg-white/5 text-center"
            >
              <Icons.Upload className="w-3.5 h-3.5" />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  
                  try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    if (data.displayName !== undefined) {
                      localStorage.setItem('cs_mcq_local_name', data.displayName);
                    }
                    if (data.points !== undefined) {
                      localStorage.setItem('cs_mcq_points', String(data.points));
                    }
                    if (data.badges !== undefined) {
                      localStorage.setItem('cs_mcq_badges', typeof data.badges === 'string' ? data.badges : JSON.stringify(data.badges));
                    }
                    if (data.attempts !== undefined) {
                      localStorage.setItem('cs_mcq_quiz_attempts', typeof data.attempts === 'string' ? data.attempts : JSON.stringify(data.attempts));
                    }
                    if (data.bookmarks !== undefined) {
                      localStorage.setItem('cs_mcq_bookmarks', typeof data.bookmarks === 'string' ? data.bookmarks : JSON.stringify(data.bookmarks));
                    }
                    if (data.wrongQuestions !== undefined) {
                      localStorage.setItem('cs_mcq_wrong_questions', typeof data.wrongQuestions === 'string' ? data.wrongQuestions : JSON.stringify(data.wrongQuestions));
                    }
                    if (data.customQuestions !== undefined) {
                      localStorage.setItem('cs_mcq_custom_questions', typeof data.customQuestions === 'string' ? data.customQuestions : JSON.stringify(data.customQuestions));
                    }
                    if (data.activeExam !== undefined) {
                      localStorage.setItem('cs_mcq_active_exam', data.activeExam);
                    }
                    
                    const nextProfile = {
                      uid: 'offline_guest',
                      email: 'guest@offline.local',
                      displayName: data.displayName || 'Scholar',
                      points: Number(data.points || '0'),
                      badges: typeof data.badges === 'string' ? JSON.parse(data.badges) : (data.badges || []),
                      targetExam: data.activeExam || 'dsssb_tgt_cs',
                      flashcardSessionsCount: 0
                    };
                    localStorage.setItem('cs_mcq_local_profile', JSON.stringify(nextProfile));

                    setSuccessMsg('Study data successfully restored! Reloading dashboard...');
                    
                    setTimeout(() => {
                      setSuccessMsg(null);
                      window.location.reload();
                    }, 1500);
                  } catch (err) {
                    alert('Invalid backup file structure.');
                    console.error(err);
                  }
                }}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
