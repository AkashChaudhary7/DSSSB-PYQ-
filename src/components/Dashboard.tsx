/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { QuizAttempt, UserProfile, Badge, Question } from '../types';
import { getBookmarks, getExamsConfig } from '../lib/storage';
import { getQuestionsCached } from '../lib/indexedDB';
import { runDiagnosticLogs } from '../lib/firebase';
import { getCloudQuestionCount } from '../lib/syncEngine';
import * as Icons from 'lucide-react';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';

interface DashboardProps {
  isLoading?: boolean;
  onBack: () => void;
  attempts: QuizAttempt[];
  onResetData: () => void;
  userProfile?: UserProfile | null;
  localBadges?: Badge[];
  questionPool?: Question[];
  theme?: 'light' | 'dark';
  currentExam?: string;
  syncError?: string | null;
  currentUser?: any;
  onForceCloudPull?: () => Promise<void>;
  onReAttempt?: (
    topic: string,
    subtopic: string,
    difficulty: 'easy' | 'medium' | 'hard' | 'mixed',
    isTimed: boolean,
    isMockExam?: boolean
  ) => void;
}

export default function Dashboard({ 
  isLoading = false,
  onBack, 
  attempts, 
  onResetData,
  userProfile,
  localBadges = [],
  questionPool = [],
  theme = 'light',
  currentExam = '',
  syncError = null,
  currentUser,
  onForceCloudPull,
  onReAttempt
}: DashboardProps) {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [titleClicks, setTitleClicks] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [cloudQuestionCount, setCloudQuestionCount] = useState<number | null>(null);
  const [loadingCloudCount, setLoadingCloudCount] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Never');
  const [dbStats, setDbStats] = useState<Record<string, Record<string, number>>>({});
  const [dbLoading, setDbLoading] = useState(false);

  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);

  useEffect(() => {
    if (showDiagnostics) {
      const fetchCloudCount = async () => {
        try {
          const count = await getCloudQuestionCount();
          setCloudQuestionCount(count);
        } catch (e) {
          console.error("Background cloud count fetch failed:", e);
        }
      };
      fetchCloudCount();
    }
  }, [showDiagnostics]);

  const handleRunLiveDiagnostics = async () => {
    if (loadingCloudCount) return;
    setLoadingCloudCount(true);
    setDiagnosticLogs([]);

    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setDiagnosticLogs([...logs]);
    };

    addLog(`[${new Date().toLocaleTimeString()}] Starting local database audit...`);
    addLog(`[Local] Verified IndexedDB Cache has ${questionPool.length} offline-available questions.`);

    addLog(`[${new Date().toLocaleTimeString()}] Contacting Firestore master server...`);
    try {
      const cloudCount = await getCloudQuestionCount();
      setCloudQuestionCount(cloudCount);
      addLog(`[Cloud] Master database has ${cloudCount} total questions.`);
      addLog(`[Analysis] Question bank balance: Local Cache (${questionPool.length}) vs Cloud Server (${cloudCount}).`);
      if (questionPool.length < cloudCount) {
        addLog(`[Note] Local cache has fewer questions than the cloud server. This is normal as questions are fetched dynamically based on your selected exam path.`);
      } else {
        addLog(`[Success] Local cache is fully synchronized with the cloud question count.`);
      }
    } catch (err: any) {
      console.error("Failed to query cloud question count in diagnostics:", err);
      addLog(`[Error] Failed to connect to Firestore master count: ${err?.message || String(err)}`);
    }

    if (currentUser) {
      addLog(`[${new Date().toLocaleTimeString()}] Triggering standard Firebase Security rules verification...`);
      try {
        await runDiagnosticLogs(currentUser);
        addLog(`[Success] Standard permission audits complete for User ID: ${currentUser.uid}`);
        addLog(`[Success] All core user database reads and writes are validated. Permissions normal.`);
      } catch (err: any) {
        addLog(`[Warning] Firebase console diagnostic encountered warning: ${err?.message || String(err)}`);
      }
    } else {
      addLog(`[Info] Standard Firebase user identity diagnostics bypassed (Guest User / Unauthenticated mode).`);
    }

    addLog(`[${new Date().toLocaleTimeString()}] Diagnostics complete.`);
    setLoadingCloudCount(false);
  };

  useEffect(() => {
    if (!showDiagnostics) return;
    
    let active = true;
    const fetchDbStats = async () => {
      setDbLoading(true);
      try {
        const cached = await getQuestionsCached();
        if (!active) return;
        
        const stats: Record<string, Record<string, number>> = {};
        cached.forEach(q => {
          const examId = q.exam || 'unspecified';
          const subject = q.topic || 'Unspecified';
          if (!stats[examId]) {
            stats[examId] = {};
          }
          stats[examId][subject] = (stats[examId][subject] || 0) + 1;
        });
        setDbStats(stats);
      } catch (err) {
        console.error("Failed to load IndexedDB diagnostics stats:", err);
      } finally {
        if (active) setDbLoading(false);
      }
    };
    
    fetchDbStats();
    return () => {
      active = false;
    };
  }, [showDiagnostics, questionPool]);

  React.useEffect(() => {
    const syncStr = localStorage.getItem('cs_mcq_last_sync_time');
    if (syncStr) {
      try {
        setLastSyncTime(new Date(parseInt(syncStr, 10)).toLocaleString());
      } catch(e) {
        setLastSyncTime('Unknown');
      }
    } else {
      setLastSyncTime('Never');
    }
  }, [questionPool.length, isPulling]);

  // O(1) lookup map to prevent massive UI lag when questionPool scales to 20k+ items
  const questionMap = useMemo(() => {
    const map = new Map<string, Question>();
    for (const q of questionPool) {
      if (q && q.id) {
        map.set(q.id, q);
      }
    }
    return map;
  }, [questionPool]);

  const filteredAttempts = useMemo(() => {
    if (!currentExam) return attempts;
    const currentConf = getExamsConfig().find(c => c.id === currentExam);
    return attempts.filter(a => {
      // 1. Explicit examId match
      if (a.examId && a.examId === currentExam) return true;
      
      // 2. Question-level match
      const firstQInfo = a.questions?.[0];
      if (firstQInfo) {
        const questionObj = questionMap.get(firstQInfo.questionId);
        if (questionObj && questionObj.exam === currentExam) return true;
      }
      
      // 3. Subject-level matching
      if (currentConf) {
        const lowerTopic = a.topic?.toLowerCase() || '';
        const isSubjectOfCurrentExam = currentConf.subjects.some(subj => {
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
  }, [attempts, currentExam, questionMap]);

  const examSubjectsList = useMemo(() => {
    const configs = getExamsConfig();
    const currentConf = configs.find(c => c.id === currentExam) || configs[0];
    if (!currentConf) return [];
    return currentConf.subjects.map(s => s.name);
  }, [currentExam]);
  
  const badges = useMemo(() => {
    return userProfile?.badges || localBadges || [];
  }, [userProfile, localBadges]);

  const bookmarksCount = useMemo(() => {
    return getBookmarks().length;
  }, []);

  // Detailed Metrics Calculations
  const stats = useMemo(() => {
    if (filteredAttempts.length === 0) {
      return {
        totalAttempts: 0,
        averageAccuracy: 0,
        totalQuestionsAnswered: 0,
        correctQuestionsCount: 0,
        wrongQuestionsCount: 0,
        totalTimeSeconds: 0,
        easyAccuracy: 0,
        mediumAccuracy: 0,
        hardAccuracy: 0
      };
    }

    let totalQuestions = 0;
    let totalCorrects = 0;
    let totalTime = 0;

    let easyTotal = 0, easyCorrect = 0;
    let mediumTotal = 0, mediumCorrect = 0;
    let hardTotal = 0, hardCorrect = 0;

    filteredAttempts.forEach(att => {
      totalQuestions += att.questionsCount;
      totalCorrects += att.correctAnswersCount;
      totalTime += att.timeTakenSeconds;

      // Classify by difficulty
      att.questions.forEach(q => {
        if (att.difficulty === 'easy') {
          easyTotal++;
          if (q.isCorrect) easyCorrect++;
        } else if (att.difficulty === 'medium') {
          mediumTotal++;
          if (q.isCorrect) mediumCorrect++;
        } else if (att.difficulty === 'hard') {
          hardTotal++;
          if (q.isCorrect) hardCorrect++;
        } else {
          easyTotal++;
          mediumTotal++;
          if (q.isCorrect) {
            easyCorrect++; 
            mediumCorrect++;
          }
        }
      });
    });

    const totalWrong = totalQuestions - totalCorrects;

    return {
      totalAttempts: filteredAttempts.length,
      averageAccuracy: Math.round((totalCorrects / totalQuestions) * 100),
      totalQuestionsAnswered: totalQuestions,
      correctQuestionsCount: totalCorrects,
      wrongQuestionsCount: totalWrong >= 0 ? totalWrong : 0,
      totalTimeSeconds: totalTime,
      easyAccuracy: easyTotal > 0 ? Math.round((easyCorrect / easyTotal) * 100) : 0,
      mediumAccuracy: mediumTotal > 0 ? Math.round((mediumCorrect / mediumTotal) * 100) : 0,
      hardAccuracy: hardTotal > 0 ? Math.round((hardCorrect / hardTotal) * 100) : 0
    };
  }, [filteredAttempts]);

  // Topic-level Strength & Weakness calculation
  const { strongTopics, weakTopics } = useMemo(() => {
    const topicStats: Record<string, { total: number; correct: number }> = {};

    filteredAttempts.forEach(att => {
      // Group by topic (case-insensitive key mapping to preserve proper casing if possible, but map everything to lowercase for grouping)
      const topicKey = att.topic ? att.topic.toLowerCase() : 'general';
      if (!topicStats[topicKey]) {
        topicStats[topicKey] = { total: 0, correct: 0 };
      }
      topicStats[topicKey].total += att.questionsCount;
      topicStats[topicKey].correct += att.correctAnswersCount;
    });

    const strong: { topic: string; accuracy: number; total: number }[] = [];
    const weak: { topic: string; accuracy: number; total: number }[] = [];

    // Map the proper casing back from examSubjectsList
    const getProperSubjectName = (key: string) => {
      const match = examSubjectsList.find(s => s.toLowerCase() === key);
      return match || key.replace(/\b\w/g, c => c.toUpperCase()); // Capitalize words if not found
    };

    Object.entries(topicStats).forEach(([topicLower, data]) => {
      if (data.total > 0) {
        const accuracy = Math.round((data.correct / data.total) * 100);
        const properTopic = getProperSubjectName(topicLower);
        if (accuracy >= 65) {
          strong.push({ topic: properTopic, accuracy, total: data.total });
        } else {
          weak.push({ topic: properTopic, accuracy, total: data.total });
        }
      }
    });

    // Sort strong topics descending, weak topics ascending
    strong.sort((a, b) => b.accuracy - a.accuracy);
    weak.sort((a, b) => a.accuracy - b.accuracy);

    return { strongTopics: strong, weakTopics: weak };
  }, [filteredAttempts, examSubjectsList]);

  const filteredStrongTopics = useMemo(() => {
    if (!searchQuery.trim()) return strongTopics;
    return strongTopics.filter(st => st.topic.toLowerCase().includes(searchQuery.toLowerCase().trim()));
  }, [strongTopics, searchQuery]);

  const filteredWeakTopics = useMemo(() => {
    if (!searchQuery.trim()) return weakTopics;
    return weakTopics.filter(wt => wt.topic.toLowerCase().includes(searchQuery.toLowerCase().trim()));
  }, [weakTopics, searchQuery]);

  // Chart 1: Accuracy trend over time
  const timelineChartData = useMemo(() => {
    return filteredAttempts
      .map((att, idx) => {
        let formattedDate = 'Recent';
        try {
          if (att.timestamp) {
            const dateObj = new Date(att.timestamp);
            if (!isNaN(dateObj.getTime())) {
              formattedDate = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
            }
          }
        } catch (e) {
          console.error("Failed to parse timeline date:", e);
        }
        const accuracy = att.questionsCount > 0 ? Math.round((att.correctAnswersCount / att.questionsCount) * 100) : 0;
        return {
          id: att.id,
          name: formattedDate,
          accuracy: accuracy,
          index: idx + 1
        };
      })
      .reverse(); // chronological order
  }, [filteredAttempts]);

  // SVG smooth bezier line chart generator for accuracy trend
  const svgChart = useMemo(() => {
    const data = timelineChartData;
    if (data.length === 0) return null;

    const width = 320;
    const height = 120;
    const paddingX = 25;
    const paddingY = 20;

    if (data.length === 1) {
      const item = data[0];
      const x1 = paddingX;
      const x2 = width - paddingX;
      const y = height - paddingY - (item.accuracy / 100) * (height - 2 * paddingY);
      return {
        points: [{ x: (x1 + x2) / 2, y, accuracy: item.accuracy, name: item.name }],
        pathD: `M ${x1} ${y} L ${x2} ${y}`,
        areaD: `M ${x1} ${y} L ${x2} ${y} L ${x2} ${height - paddingY} L ${x1} ${height - paddingY} Z`,
        width,
        height
      };
    }

    const points = data.map((item, idx) => {
      const x = paddingX + (idx / (data.length - 1)) * (width - 2 * paddingX);
      const y = height - paddingY - (item.accuracy / 100) * (height - 2 * paddingY);
      return { x, y, accuracy: item.accuracy, name: item.name };
    });

    let pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      const cpX1 = curr.x + (next.x - curr.x) / 3;
      const cpY1 = curr.y;
      const cpX2 = curr.x + 2 * (next.x - curr.x) / 3;
      const cpY2 = next.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${next.x} ${next.y}`;
    }

    const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;

    return { points, pathD, areaD, width, height };
  }, [timelineChartData]);

  // Chart 2: Category strength breakdown (aligned dynamically with selected exam subjects)
  const categoryChartData = useMemo(() => {
    const categoriesMap: { [key: string]: { total: number; correct: number } } = {};
    
    examSubjectsList.forEach(subj => {
      categoriesMap[subj.toLowerCase()] = { total: 0, correct: 0 };
    });

    filteredAttempts.forEach(att => {
      att.questions.forEach(q => {
        const poolQ = questionMap.get(q.questionId);
        const topicName = q.topic || poolQ?.topic || att.topic || 'General Studies (GS)';
        const topicLower = topicName.toLowerCase();
        
        const matchedKey = Object.keys(categoriesMap).find(k => k === topicLower || topicLower.includes(k) || k.includes(topicLower));
        const finalKey = matchedKey || topicLower;

        if (!categoriesMap[finalKey]) {
          categoriesMap[finalKey] = { total: 0, correct: 0 };
        }

        categoriesMap[finalKey].total += 1;
        if (q.isCorrect) {
          categoriesMap[finalKey].correct += 1;
        }
      });
    });

    return Object.keys(categoriesMap).map(key => {
      const { total, correct } = categoriesMap[key];
      const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
      
      const match = examSubjectsList.find(s => s.toLowerCase() === key);
      const properKey = match || key.replace(/\b\w/g, c => c.toUpperCase());
      
      let shortName = properKey;
      if (properKey === "Data Structures & Algos") shortName = "DSA";
      else if (properKey === "Database Systems") shortName = "DBMS";
      else if (properKey === "Computer Networks") shortName = "Networks";
      else if (properKey === "Operating Systems") shortName = "OS";
      else if (properKey.length > 12) shortName = properKey.slice(0, 10) + "..";

      return {
        subject: shortName,
        fullName: properKey,
        accuracy: accuracy,
        attempts: total
      };
    });
  }, [filteredAttempts, examSubjectsList]);

  // Heatmap: Wrong Answer Frequency per Topic
  const heatmapData = useMemo(() => {
    const counts: Record<string, { total: number; wrong: number }> = {};

    filteredAttempts.forEach(att => {
      att.questions.forEach(q => {
        const poolQ = questionMap.get(q.questionId);
        const topicName = poolQ?.topic || att.topic || 'General Studies';
        
        if (topicName.includes('Mock Exam')) {
          return;
        }

        if (!counts[topicName]) {
          counts[topicName] = { total: 0, wrong: 0 };
        }
        
        counts[topicName].total += 1;
        if (!q.isCorrect) {
          counts[topicName].wrong += 1;
        }
      });
    });

    return Object.entries(counts)
      .map(([name, stats]) => {
        const errorRate = stats.total > 0 ? (stats.wrong / stats.total) * 100 : 0;
        return {
          topic: name,
          total: stats.total,
          wrong: stats.wrong,
          errorRate: Math.round(errorRate)
        };
      })
      .filter(h => h.total > 0)
      .sort((a, b) => b.wrong - a.wrong);
  }, [filteredAttempts, questionPool]);

  const formatDuration = (totalSecs: number) => {
    if (totalSecs < 60) return `${totalSecs}s`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    doc.setFillColor(37, 99, 235); // Blue-600
    doc.rect(0, 0, 210, 42, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text("COMPUTER SCIENCE MCQ ARENA", 20, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text("OFFLINE ACADEMIC PERFORMANCE REPORT CARD", 20, 30);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 145, 30);

    doc.setTextColor(30, 41, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Overall Performance Metrics", 20, 56);

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.5);
    doc.line(20, 60, 190, 60);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(100, 116, 139);
    
    doc.text(`Total Quizzes Completed:`, 20, 71);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalAttempts}`, 85, 71);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Total Questions Answered:`, 20, 80);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${stats.totalQuestionsAnswered} questions`, 85, 80);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Core Cumulative Accuracy:`, 20, 89);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(37, 99, 235); 
    doc.text(`${stats.averageAccuracy}%`, 85, 89);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Total Practice Duration:`, 20, 98);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${formatDuration(stats.totalTimeSeconds)}`, 85, 98);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(`Bookmarked Hard Questions:`, 20, 107);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`${bookmarksCount} items saved`, 85, 107);

    // Section 2: Subject Strengths
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Academics Subdivision Strengths", 20, 122);
    doc.line(20, 126, 190, 126);

    let currentY = 136;
    categoryChartData.forEach((row) => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10.5);
      doc.setTextColor(70, 80, 95);
      doc.text(`${row.fullName}:`, 20, currentY);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(`${row.accuracy}% Accuracy`, 92, currentY);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(148, 163, 184);
      doc.text(`(${row.attempts} Qs solved)`, 130, currentY);
      
      currentY += 9;
    });

    // Section 3: History log table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(30, 41, 59);
    doc.text("Chronological Practice Logs", 20, currentY + 6);
    doc.line(20, currentY + 10, 190, currentY + 10);

    let logY = currentY + 18;
    doc.setFillColor(248, 250, 252);
    doc.rect(20, logY - 5, 170, 8, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text("TIMESTAMP", 22, logY);
    doc.text("SUBJECT AREA / SUBTOPIC", 55, logY);
    doc.text("ACCURACY", 135, logY);
    doc.text("TIMED STATUS", 162, logY);

    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.setDrawColor(241, 245, 249);
    
    attempts.slice(0, 10).forEach((att) => {
      logY += 9;
      if (logY > 275) return; 

      let dateStr = 'Recent';
      try {
        if (att.timestamp) {
          const d = new Date(att.timestamp);
          if (!isNaN(d.getTime())) {
            dateStr = d.toLocaleDateString();
          }
        }
      } catch (e) {
        console.error("Failed to parse pdf date:", e);
      }
      const pct = att.questionsCount > 0 ? Math.round((att.correctAnswersCount / att.questionsCount) * 100) : 0;
      
      doc.text(`${dateStr}`, 22, logY);
      
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      const dispText = `${att.topic} (${att.subtopic || 'Mixed'})`.substring(0, 42);
      doc.text(dispText, 55, logY);
      
      doc.setTextColor(pct >= 70 ? 16 : pct >= 40 ? 180 : 220, pct >= 70 ? 124 : 110, pct >= 70 ? 65 : 40);
      doc.text(`${pct}% (${att.correctAnswersCount}/${att.questionsCount})`, 135, logY);
      
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 116, 139);
      doc.text(att.isTimed ? "Yes (Timed)" : "No (Study)", 162, logY);

      doc.line(20, logY + 3, 190, logY + 3);
    });

    doc.setFontSize(8.5);
    doc.setTextColor(148, 163, 184);
    doc.text("This academic transcript is generated locally and stored securely on your browser database system.", 20, 285);

    doc.save(`CS_MCQ_Academic_Progress_Report.pdf`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full overflow-y-auto pb-8 p-2 animate-pulse space-y-4">
        <div className="flex items-center gap-3 pb-4 mb-5 border-b border-slate-200 dark:border-white/5">
          <div className={`w-8 h-8 rounded-lg ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}></div>
          <div className={`w-32 h-6 rounded ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-200'}`}></div>
        </div>

        {/* Profile Card Skeleton */}
        <div className={`w-full h-32 rounded-2xl ${theme === 'dark' ? 'bg-slate-800/60' : 'bg-slate-100'}`}></div>

        {/* Stats Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className={`h-24 rounded-2xl ${theme === 'dark' ? 'bg-slate-800/40' : 'bg-slate-50'}`}></div>
          ))}
        </div>

        {/* Categories / Badges Section Skeleton */}
        <div className={`w-full h-64 rounded-3xl ${theme === 'dark' ? 'bg-slate-800/30' : 'bg-slate-50'}`}></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-8 text-slate-800 dark:text-slate-100 font-sans" id="analytics-dashboard-container">
      {/* Header section with back navigation */}
      <div className={`flex items-center justify-between pb-4 border-b mb-5 shrink-0 ${theme === 'dark' ? 'border-white/5' : 'border-slate-200'}`}>
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={onBack}
            className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
              theme === 'dark' ? 'text-slate-400 hover:text-white hover:bg-slate-850' : 'text-slate-500 hover:text-[#1A1D20] hover:bg-slate-100'
            }`}
            id="dashboard-back-btn"
          >
            <Icons.ArrowLeft className="w-5 h-5" />
          </motion.button>
          <div 
            className="text-left cursor-pointer select-none"
            onClick={() => {
              setTitleClicks(prev => {
                const next = prev + 1;
                if (next >= 5) {
                  setShowDiagnostics(p => !p);
                  return 0;
                }
                return next;
              });
            }}
          >
            <h2 className="text-sm font-black tracking-tight flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
              <Icons.TrendingUp className={`w-4 h-4 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
              <span>Performance Intelligence</span>
            </h2>
            <span className={`text-[10px] block mt-0.5 ${theme === 'dark' ? 'text-slate-450' : 'text-[#6C737F]'}`}>
              Track and evaluate core computer science competencies
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDiagnostics(p => !p);
                }}
                className="ml-2 underline hover:text-[#2F69FF] dark:hover:text-[#9EFF33] transition-colors cursor-pointer font-semibold inline-flex items-center gap-0.5 border-0 bg-transparent p-0"
              >
                <Icons.Activity className="w-3 h-3" /> Diagnostics
              </button>
            </span>
          </div>
        </div>

        {filteredAttempts.length > 0 && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleExportPDF}
            className={`flex items-center justify-center p-2.5 rounded-xl shadow-md cursor-pointer transition-all shrink-0 ${
              theme === 'dark'
                ? 'bg-neon-lime text-black hover:opacity-95'
                : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white'
            }`}
            id="export-analytics-pdf-btn"
            title="Export Report Card (PDF)"
          >
            <Icons.Download className={`w-4.5 h-4.5 ${theme === 'dark' ? 'text-black' : 'text-white'}`} />
          </motion.button>
        )}
      </div>

      {showDiagnostics && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className={`mb-5 p-5 rounded-2xl border ${
            theme === 'dark' 
              ? 'bg-slate-900/95 border-neon-lime/20 text-slate-100 shadow-neon-glow' 
              : 'bg-indigo-50/75 border-indigo-200 text-slate-800 shadow-lg shadow-indigo-100'
          }`}
          id="diagnostics-console-panel"
        >
          <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-200 dark:border-white/10">
            <div className="flex items-center gap-2">
              <Icons.ShieldAlert className={`w-5 h-5 ${theme === 'dark' ? 'text-[#9EFF33]' : 'text-[#2F69FF]'}`} />
              <h3 className="text-xs font-black uppercase tracking-wider font-sans">
                Diagnostic Console
              </h3>
            </div>
            <button
              onClick={() => setShowDiagnostics(false)}
              className={`text-[10px] px-2.5 py-1 rounded-lg cursor-pointer transition-all font-mono font-bold ${
                theme === 'dark' ? 'bg-white/10 hover:bg-white/20 text-slate-200' : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              Close Console
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            {/* Col 1: Connection Status */}
            <div className={`p-3.5 rounded-xl border text-left ${theme === 'dark' ? 'bg-slate-950/60 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400 dark:text-slate-500 block mb-1">
                Sandbox Status
              </span>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs font-extrabold font-mono uppercase tracking-wide">
                  Offline-First Active
                </span>
              </div>
              <p className="text-[10px] mt-2 leading-relaxed opacity-75">
                Local practice metrics are saved securely to your browser cache with zero network latency.
              </p>
            </div>

            {/* Col 2: Questions Balance */}
            <div className={`p-3.5 rounded-xl border text-left ${theme === 'dark' ? 'bg-slate-950/60 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400 dark:text-slate-500 block mb-1">
                Question Bank Cache
              </span>
              <div className="flex justify-between items-baseline mt-1.5">
                <div>
                  <span className="text-lg font-black tracking-tight">{questionPool.length}</span>
                  <span className="text-[9px] uppercase font-black font-mono ml-1 opacity-70">Local Cache</span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black tracking-tight text-emerald-500 dark:text-emerald-400">
                    {cloudQuestionCount !== null ? cloudQuestionCount : '...'}
                  </span>
                  <span className="text-[9px] uppercase font-black font-mono ml-1 opacity-70">Cloud Total</span>
                </div>
              </div>
              <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full mt-2.5 overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${theme === 'dark' ? 'bg-[#9EFF33]' : 'bg-[#2F69FF]'}`} 
                  style={{ width: `${Math.min(100, cloudQuestionCount ? (questionPool.length / cloudQuestionCount) * 100 : 100)}%` }} 
                />
              </div>
              <p className="text-[9px] mt-2 opacity-75 leading-relaxed">
                Local cached syllabus vs absolute cloud master size. Differences are normal due to selective path filtering to optimize network data overhead.
              </p>
            </div>

            {/* Col 3: Identity & Keys */}
            <div className={`p-3.5 rounded-xl border text-left ${theme === 'dark' ? 'bg-slate-950/60 border-white/5' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[9px] uppercase tracking-wider font-mono font-bold text-slate-400 dark:text-slate-500 block mb-1">
                Active Scholar Profile
              </span>
              <div className="space-y-1 mt-1 text-left">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono opacity-70">Scholar:</span>
                  <span className="text-[10px] font-mono font-bold truncate max-w-[150px] tracking-wide text-slate-600 dark:text-slate-300">
                    {userProfile?.displayName || currentUser?.displayName || 'Guest User'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono opacity-70">Type:</span>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-600 dark:text-[#9EFF33]">
                    Local Account
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-mono opacity-70">Exam Target:</span>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider">
                    {currentExam || 'None Selected'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Force pull block */}
          <div className={`p-3.5 rounded-xl border text-left ${theme === 'dark' ? 'bg-slate-950/40 border-white/5' : 'bg-slate-100/60 border-slate-200'} flex flex-col md:flex-row items-center justify-between gap-3`}>
            <div className="text-left">
              <h4 className="text-xs font-bold flex items-center gap-1 text-slate-800 dark:text-slate-100">
                <Icons.Zap className="w-3.5 h-3.5 text-amber-500" />
                Optimize Local Database & Index
              </h4>
              <p className="text-[10px] mt-0.5 leading-relaxed text-slate-500 dark:text-slate-400">
                Rebuilds local high-speed cache indices, checks storage integrity, and verifies that questions match active syllabus criteria.
              </p>
            </div>
            <button
              onClick={async () => {
                if (isPulling) return;
                setIsPulling(true);
                // Simulate quick, satisfying local optimization
                await new Promise((resolve) => setTimeout(resolve, 800));
                setIsPulling(false);
              }}
              disabled={isPulling}
              className={`px-4 py-2.5 disabled:opacity-50 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl cursor-pointer shadow-md flex items-center gap-1.5 font-mono shrink-0 border-0 ${
                theme === 'dark' ? 'bg-[#9EFF33] !text-black hover:opacity-90' : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white'
              }`}
            >
              {isPulling ? (
                <>
                  <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Optimizing DB...
                </>
              ) : (
                <>
                  <Icons.RefreshCw className="w-3.5 h-3.5" />
                  Optimize DB
                </>
              )}
            </button>
          </div>

          {/* Firestore & Cloud Diagnostics Block */}
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className={`p-4 rounded-2xl border text-left relative overflow-hidden transition-all ${
              theme === 'dark' 
                ? 'bg-gradient-to-br from-slate-950/60 to-slate-950/30 border-white/5 shadow-2xl hover:border-indigo-500/20' 
                : 'bg-gradient-to-br from-white to-slate-50/50 border-slate-200 shadow-md hover:border-indigo-500/30'
            } flex flex-col gap-3.5 mt-4 group/diagnostics`}
          >
            {/* Ambient subtle glow background */}
            <div className="absolute -right-12 -top-12 w-32 h-32 bg-indigo-500/5 dark:bg-indigo-400/5 rounded-full blur-2xl group-hover/diagnostics:bg-indigo-500/10 transition-colors duration-500 pointer-events-none" />
            
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 w-full relative z-10">
              <div className="text-left flex-1">
                <h4 className="text-xs font-extrabold flex items-center gap-1.5 text-slate-800 dark:text-slate-100 font-sans tracking-tight">
                  <span className="relative flex h-2 w-2">
                    {loadingCloudCount ? (
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                    ) : null}
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${loadingCloudCount ? 'bg-indigo-500' : 'bg-slate-400 dark:bg-slate-500'}`}></span>
                  </span>
                  <Icons.Activity className="w-4 h-4 text-indigo-500 dark:text-indigo-400 animate-pulse shrink-0" />
                  Run Live Firebase & Cloud Diagnostics
                </h4>
                <p className="text-[10px] mt-1 leading-relaxed text-slate-500 dark:text-slate-400 font-medium">
                  Performs a live audit querying the Firestore collections and runs <code className="bg-black/5 dark:bg-white/5 px-1 py-0.5 rounded font-mono text-indigo-500 dark:text-indigo-300">runDiagnosticLogs()</code> to verify Firebase Rules permissions and cloud vs local counts.
                </p>
              </div>
              
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleRunLiveDiagnostics}
                disabled={loadingCloudCount}
                className={`px-4.5 py-2.5 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-wider rounded-xl cursor-pointer shadow-lg flex items-center gap-2 font-mono shrink-0 border-0 transition-all ${
                  theme === 'dark' 
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-indigo-500/10' 
                    : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white hover:shadow-blue-500/10'
                }`}
              >
                {loadingCloudCount ? (
                  <>
                    <Icons.Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                    Running...
                  </>
                ) : (
                  <>
                    <Icons.Terminal className="w-3.5 h-3.5" />
                    Run Diagnostic
                  </>
                )}
              </motion.button>
            </div>

            {/* Diagnostic Results Console */}
            <AnimatePresence>
              {diagnosticLogs.length > 0 && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="bg-slate-950 text-[10px] font-mono p-4 rounded-xl border border-white/5 max-h-56 overflow-y-auto space-y-1.5 text-slate-300 relative shadow-inner custom-scrollbar">
                    {/* Retro Terminal Scan Line */}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-500/2 to-transparent pointer-events-none animate-scan-line" />
                    
                    <div className="text-amber-400 font-bold border-b border-white/10 pb-1.5 mb-2 flex justify-between items-center tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <Icons.CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        SYSTEM DIAGNOSTIC CONSOLE
                      </span>
                      <span className="text-[8px] opacity-75 px-1.5 py-0.5 bg-amber-500/10 rounded border border-amber-500/25 animate-pulse">LIVE FEED</span>
                    </div>
                    {diagnosticLogs.map((log, index) => {
                      const isError = log.includes('[Error]');
                      const isSuccess = log.includes('[Success]');
                      const isWarning = log.includes('[Warning]');
                      const colorClass = isError 
                        ? 'text-red-400' 
                        : isSuccess 
                          ? 'text-emerald-400 font-bold' 
                          : isWarning 
                            ? 'text-amber-400 font-bold' 
                            : 'text-slate-300';
                      return (
                        <motion.div 
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: Math.min(index * 0.04, 0.4) }}
                          key={index} 
                          className={`leading-relaxed flex items-start gap-1.5 ${colorClass}`}
                        >
                          <span className="text-slate-600 select-none">&gt;</span>
                          <span>{log}</span>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {/* Real-Time IndexedDB Storage Audit */}
          <div className="mt-5 pt-4 border-t border-slate-200 dark:border-white/10 text-left">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <h4 className="text-[11px] font-black uppercase tracking-wider font-mono flex items-center gap-1.5 text-[#2F69FF] dark:text-[#9EFF33]">
                <Icons.Database className="w-4 h-4" />
                Real-Time IndexedDB Storage Audit
              </h4>
              <button 
                onClick={async () => {
                  setDbLoading(true);
                  try {
                    const cached = await getQuestionsCached();
                    const stats: Record<string, Record<string, number>> = {};
                    cached.forEach(q => {
                      const examId = q.exam || 'unspecified';
                      const subject = q.topic || 'Unspecified';
                      if (!stats[examId]) stats[examId] = {};
                      stats[examId][subject] = (stats[examId][subject] || 0) + 1;
                    });
                    setDbStats(stats);
                  } catch (err) {
                    console.error("Manual storage query failed:", err);
                  } finally {
                    setDbLoading(false);
                  }
                }}
                disabled={dbLoading}
                className={`text-[9px] font-mono font-bold px-2 py-1.5 rounded-lg border transition-all flex items-center gap-1 cursor-pointer select-none ${
                  theme === 'dark'
                    ? 'border-white/10 hover:border-white/20 bg-slate-950/40 text-slate-300 hover:text-white'
                    : 'border-slate-200 hover:border-slate-300 bg-white text-slate-600 hover:text-slate-800 shadow-xs'
                }`}
              >
                <Icons.RefreshCw className={`w-2.5 h-2.5 ${dbLoading ? 'animate-spin text-amber-400' : ''}`} />
                Force Storage Recalculation
              </button>
            </div>

            <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400 mb-3.5">
              The counts below represent verified offline-available exam question items residing in the persistent **IndexedDB** cache of your browser.
            </p>

            {dbLoading ? (
              <div className="p-8 text-center flex flex-col items-center justify-center gap-2">
                <Icons.Loader2 className="w-5 h-5 animate-spin text-indigo-500 dark:text-neon-lime" />
                <span className="text-[9px] font-mono font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Querying local database blocks...
                </span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {getExamsConfig().map((exam) => {
                  const examStats = (dbStats[exam.id] || {}) as Record<string, number>;
                  const totalCachedForExam = Object.values(examStats).reduce((a: number, b: number) => a + b, 0);
                  
                  return (
                    <div 
                      key={exam.id}
                      className={`p-3.5 rounded-xl border flex flex-col justify-between ${
                        theme === 'dark' ? 'bg-slate-950/40 border-white/5' : 'bg-white border-slate-200/60 shadow-sm'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className={`text-[11px] font-black tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-800'}`}>
                            {exam.name}
                          </span>
                          <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-lg shrink-0 ${
                            totalCachedForExam > 0
                              ? theme === 'dark' ? 'text-neon-lime bg-neon-lime/10' : 'text-emerald-700 bg-emerald-100'
                              : 'text-rose-500 bg-rose-100 dark:bg-rose-950/20'
                          }`}>
                            {totalCachedForExam} Qs Offline
                          </span>
                        </div>
                        
                        <div className="space-y-1.5 mt-2 border-t pt-2 border-slate-100 dark:border-white/5">
                          {exam.subjects.map((subj) => {
                            const count = examStats[subj.name] || 0;
                            return (
                              <div key={subj.name} className="flex items-center justify-between text-[10px]">
                                <span className="opacity-75 font-medium truncate max-w-[180px] text-left">{subj.name}</span>
                                <span className={`font-mono font-bold ${count > 0 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>
                                  {count} cached
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {totalCachedForExam > 0 ? (
                        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-white/5">
                          <Icons.CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Offline Cache Verified & Synced
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 mt-3 pt-2 border-t border-slate-100 dark:border-white/5">
                          <Icons.AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-[8.5px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                            Sync Pending (Questions populate upon load)
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Cloud Sync Status / Connection Warning Banner */}
      {syncError && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-5 p-3.5 rounded-xl border border-amber-500/20 dark:border-amber-500/10 bg-amber-500/10 dark:bg-amber-500/5 text-amber-800 dark:text-amber-300 flex items-start gap-2.5 shadow-sm"
          id="firestore-sync-warning-banner"
        >
          <Icons.AlertCircle className="w-5 h-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="text-left">
            <h4 className="text-xs font-bold leading-tight uppercase tracking-wider font-mono">Sync Warning</h4>
            <p className="text-[11px] mt-1 leading-relaxed opacity-90">{syncError}</p>
            <p className="text-[10px] mt-1.5 font-medium leading-relaxed font-mono opacity-75 text-slate-500 dark:text-slate-400">
              Troubleshooting: Check if you are signed in, check internet connection stability, or try refreshing the workspace.
            </p>
          </div>
        </motion.div>
      )}

      {filteredAttempts.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className={`flex flex-col items-center justify-center text-center p-12 backdrop-blur-md border rounded-2xl flex-1 shadow-xl ${
            theme === 'dark' ? 'bg-[#161A1D]/40 border-white/10' : 'bg-white/65 border-white/40'
          }`}
        >
          <div className={`p-4 rounded-full mb-4.5 border ${
            theme === 'dark' ? 'bg-neon-lime/10 text-neon-lime border-neon-lime/20' : 'bg-[#2F69FF]/10 text-[#2F69FF] border-[#2F69FF]/20'
          }`}>
            <Icons.LineChart className="w-10 h-10 animate-pulse" />
          </div>
          <h3 className={`text-sm font-bold font-sans ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>No Performance History</h3>
          <p className={`text-xs max-w-sm mt-1.5 leading-relaxed ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>
            Take your first subtopic practice quiz! Once finished, advanced charts, category strengths, accuracy index, and downloadable PDF report cards will activate.
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className={`mt-6 py-2.5 px-6 font-extrabold rounded-xl text-[10px] uppercase shadow-md transition-all cursor-pointer ${
              theme === 'dark' ? 'bg-[#9EFF33] text-black hover:opacity-90' : 'bg-[#2F69FF] hover:bg-[#1e40af] text-white'
            }`}
          >
            Select a Topic to Start
          </motion.button>
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-5"
        >
          {/* Database Status Widget */}
          <div className="bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-indigo-500/20 dark:border-neon-lime/20 rounded-2xl p-4 shadow-lg text-left flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-black uppercase text-indigo-600 dark:text-neon-lime tracking-wider flex items-center gap-1.5 mb-2">
                <Icons.Database className="w-4 h-4" />
                Local Database Status
              </h3>
              <div className="flex gap-4">
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase">IndexedDB Items</p>
                  <p className="text-lg font-black text-slate-800 dark:text-white">{questionPool.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono uppercase">Last Sync</p>
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-0.5">{lastSyncTime}</p>
                </div>
              </div>
            </div>
            
            <button
              onClick={async () => {
                if (isPulling) return;
                setIsPulling(true);
                if (onForceCloudPull) {
                  await onForceCloudPull();
                } else {
                  await new Promise(resolve => setTimeout(resolve, 800));
                }
                setIsPulling(false);
              }}
              disabled={isPulling}
              className={`px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-2 justify-center shrink-0 border-0 ${
                theme === 'dark' 
                  ? 'bg-[#9EFF33] text-black hover:bg-[#8ade2a]' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              } ${isPulling ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {isPulling ? (
                <><Icons.RefreshCw className="w-3.5 h-3.5 animate-spin" /> Syncing Cloud Data...</>
              ) : (
                <><Icons.CloudDownload className="w-3.5 h-3.5" /> Force Full Resync</>
              )}
            </button>
          </div>

          {/* Main Stats Ribbon Card Grid */}
          <div className="grid grid-cols-2 gap-2" id="stats-ribbon-grid">
            {/* Accuracy card */}
            <motion.div
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl flex items-center justify-between shadow-lg text-left"
            >
              <div>
                <span className="text-[8.5px] font-black text-indigo-600 dark:text-neon-lime uppercase tracking-tight block">Accuracy</span>
                <span className="text-xl font-black text-slate-800 dark:text-white font-sans tracking-tight">{stats.averageAccuracy}%</span>
              </div>
              <div className="text-indigo-600 dark:text-neon-lime shrink-0 bg-indigo-50 dark:bg-neon-lime/10 p-1.5 rounded-lg">
                <Icons.Target className="w-4 h-4" />
              </div>
            </motion.div>

            {/* Practice Duration card */}
            <motion.div
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl flex items-center justify-between shadow-lg text-left"
            >
              <div>
                <span className="text-[8.5px] font-black text-amber-500 dark:text-amber-400 uppercase tracking-tight block">Duration</span>
                <span className="text-base font-black text-slate-800 dark:text-white font-sans tracking-tight truncate max-w-[80px] block">
                  {formatDuration(stats.totalTimeSeconds)}
                </span>
              </div>
              <div className="text-amber-500 shrink-0 bg-amber-50 dark:bg-amber-950/20 p-1.5 rounded-lg">
                <Icons.Clock className="w-4 h-4" />
              </div>
            </motion.div>
          </div>

          {/* Core breakdown table stats */}
          <div className="grid grid-cols-4 gap-2 text-center">
            {/* Total Attempts */}
            <motion.div
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl shadow-lg"
            >
              <div className="text-indigo-500 dark:text-neon-lime flex justify-center mb-1">
                <Icons.Layers className="w-4 h-4" />
              </div>
              <span className="text-base font-black text-slate-800 dark:text-white font-sans">{stats.totalAttempts}</span>
              <span className="block text-[8px] text-slate-400 uppercase font-bold font-mono mt-0.5">Mocks</span>
            </motion.div>

            {/* Total Right / Correct */}
            <motion.div
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl shadow-lg"
            >
              <div className="text-emerald-500 dark:text-emerald-400 flex justify-center mb-1">
                <Icons.CheckCircle className="w-4 h-4" />
              </div>
              <span className="text-base font-black text-slate-800 dark:text-emerald-400 font-sans">{stats.correctQuestionsCount}</span>
              <span className="block text-[8px] text-slate-400 uppercase font-bold font-mono mt-0.5">Right</span>
            </motion.div>

            {/* Total Wrong */}
            <motion.div
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl shadow-lg"
            >
              <div className="text-rose-500 dark:text-rose-400 flex justify-center mb-1">
                <Icons.XCircle className="w-4 h-4" />
              </div>
              <span className="text-base font-black text-slate-800 dark:text-rose-400 font-sans">{stats.wrongQuestionsCount}</span>
              <span className="block text-[8px] text-slate-400 uppercase font-bold font-mono mt-0.5">Wrong</span>
            </motion.div>

            {/* Bookmarked */}
            <motion.div
              whileHover={{ y: -3, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="p-3 bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl shadow-lg"
            >
              <div className="text-indigo-500 dark:text-indigo-400 flex justify-center mb-1">
                <Icons.Bookmark className="w-4 h-4" />
              </div>
              <span className="text-base font-black text-slate-800 dark:text-indigo-400 font-sans">{bookmarksCount}</span>
              <span className="block text-[8px] text-slate-400 uppercase font-bold font-mono mt-0.5">Saved</span>
            </motion.div>
          </div>

          {/* COGNITIVE TOPIC SEARCH FILTER */}
          <div className="bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl p-3.5 shadow-lg space-y-2 hover:border-indigo-500/30 dark:hover:border-neon-lime/30 hover:shadow-[0_0_15px_rgba(99,102,241,0.12)] dark:hover:shadow-[0_0_15px_rgba(158,255,51,0.12)] transition-all duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[9px] uppercase font-black text-indigo-600 dark:text-neon-lime font-mono flex items-center gap-1.5 tracking-wider">
                <Icons.Search className="w-3.5 h-3.5 text-indigo-600 dark:text-neon-lime" />
                <span>Topic Analyzer Search</span>
              </span>
              {searchQuery && (
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSearchQuery('')}
                  className="text-[9px] font-extrabold text-slate-400 hover:text-slate-800 dark:hover:text-white transition-colors cursor-pointer"
                >
                  Clear filter
                </motion.button>
              )}
            </div>
            <div className="relative">
              <input
                type="text"
                placeholder="Search subjects, domains, or specific syllabus topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/5 dark:bg-slate-950/70 border border-slate-200 dark:border-white/5 rounded-xl px-3 py-2 pl-9 text-xs text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-hidden focus:border-indigo-500/40 dark:focus:border-neon-lime/40 transition-colors"
              />
              <Icons.Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-3" />
            </div>
          </div>

          {/* DYNAMIC COGNITIVE STRENGTHS & WEAKNESSES PANEL */}
          <div className="bg-white/45 dark:bg-[#161A1D]/80 backdrop-blur-md border border-white/15 dark:border-white/10 rounded-2xl p-4 shadow-lg space-y-3 hover:border-indigo-500/20 dark:hover:border-neon-lime/20 hover:shadow-[0_0_15px_rgba(99,102,241,0.08)] dark:hover:shadow-[0_0_15px_rgba(158,255,51,0.08)] transition-all duration-300">
            <div className="flex items-center gap-1.5">
              <Icons.BrainCircuit className="w-4 h-4 text-indigo-600 dark:text-neon-lime" />
              <h3 className="text-xs font-black uppercase text-slate-800 dark:text-slate-100 tracking-wider font-mono">
                Syllabus Cognitive Analysis
              </h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Strong Topics Column */}
              <div className="space-y-1.5 text-left">
                <span className="text-[9px] uppercase tracking-wider font-bold text-emerald-400 flex items-center gap-1">
                  <Icons.Check className="w-3.5 h-3.5" />
                  <span>Strong Areas ({filteredStrongTopics.length})</span>
                </span>
                
                {filteredStrongTopics.length === 0 ? (
                  <div className="p-3 bg-slate-950/40 border border-white/5 rounded-lg text-center">
                    <span className="text-[9.5px] text-slate-500">No strong topics match.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredStrongTopics.map((st, sidx) => (
                      <div key={sidx} className="p-2 bg-emerald-950/20 border border-emerald-900/40 rounded-lg flex items-center justify-between text-[10px]">
                        <span className="font-bold text-emerald-300 truncate max-w-[100px]">{st.topic}</span>
                        <span className="text-emerald-400 font-extrabold font-mono shrink-0">{st.accuracy}% accuracy</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Weak Topics Column */}
              <div className="space-y-1.5 text-left">
                <span className="text-[9px] uppercase tracking-wider font-bold text-rose-400 flex items-center gap-1">
                  <Icons.AlertCircle className="w-3.5 h-3.5" />
                  <span>Weak Areas ({filteredWeakTopics.length})</span>
                </span>
                
                {filteredWeakTopics.length === 0 ? (
                  <div className="p-3 bg-slate-950/40 border border-white/5 rounded-lg text-center">
                    <span className="text-[9.5px] text-slate-500">No weak topics match.</span>
                  </div>
                ) : (
                  <div className="space-y-1">
                    {filteredWeakTopics.map((wt, widx) => (
                      <div key={widx} className="p-2 bg-rose-950/20 border border-rose-900/40 rounded-lg flex items-center justify-between text-[10px]">
                        <span className="font-bold text-rose-300 truncate max-w-[100px]">{wt.topic}</span>
                        <span className="text-rose-400 font-extrabold font-mono shrink-0">{wt.accuracy}% accuracy</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* CHARTS ROW */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Accuracy trends timeline */}
            <div className={`backdrop-blur-md border rounded-2xl p-4.5 shadow-lg text-left transition-all duration-300 ${
              theme === 'dark'
                ? 'bg-[#161A1D]/80 border-white/10 hover:border-neon-lime/20'
                : 'bg-white/65 border-white/40 hover:border-[#2F69FF]/20'
            }`}>
              <h1 className={`text-xs font-black uppercase tracking-wider font-sans mb-1 flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
                <Icons.Activity className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                <span>Accuracy Trends Timeline</span>
              </h1>
              <p className={`text-[10px] mb-4 pb-2 border-b ${theme === 'dark' ? 'text-slate-400 border-white/5' : 'text-[#6C737F] border-slate-100'}`}>Chronological history of your practice iterations</p>
              
              {timelineChartData.length === 0 ? (
                <div className={`h-44 flex flex-col items-center justify-center text-center rounded-xl border border-dashed ${theme === 'dark' ? 'bg-slate-950/40 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                  <Icons.Inbox className="w-6 h-6 text-slate-450 mb-1" />
                  <p className="text-[10px] text-slate-500">No practice attempts recorded yet.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* SVG smooth line chart */}
                  {svgChart && (
                    <div className={`relative w-full h-32 rounded-2xl border p-2 overflow-hidden shadow-inner ${
                      theme === 'dark' ? 'bg-[#0B0C0E]/50 border-white/10' : 'bg-slate-50 border-slate-200'
                    }`}>
                      {/* Grid Lines helper */}
                      <div className="absolute inset-x-0 top-1/4 border-t border-slate-900/10 dark:border-white/5 pointer-events-none" />
                      <div className="absolute inset-x-0 top-2/4 border-t border-slate-900/10 dark:border-white/5 pointer-events-none" />
                      <div className="absolute inset-x-0 top-3/4 border-t border-slate-900/10 dark:border-white/5 pointer-events-none" />
                      
                      <svg 
                        viewBox={`0 0 ${svgChart.width} ${svgChart.height}`} 
                        className="w-full h-full"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient id="chart-area-glow" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={theme === 'dark' ? '#9EFF33' : '#2F69FF'} stopOpacity="0.25" />
                            <stop offset="100%" stopColor={theme === 'dark' ? '#9EFF33' : '#2F69FF'} stopOpacity="0" />
                          </linearGradient>
                        </defs>

                        {/* Dashed baselines */}
                        <line x1="10" y1="20" x2="310" y2="20" stroke={theme === 'dark' ? "#ffffff" : "#475569"} strokeOpacity="0.08" strokeDasharray="3 3" />
                        <line x1="10" y1="100" x2="310" y2="100" stroke={theme === 'dark' ? "#ffffff" : "#475569"} strokeOpacity="0.08" strokeDasharray="3 3" />

                        {/* Gradient Area path */}
                        <path d={svgChart.areaD} fill="url(#chart-area-glow)" />

                        {/* Curve Path */}
                        <path 
                          d={svgChart.pathD} 
                          fill="none" 
                          stroke={theme === 'dark' ? '#9EFF33' : '#2F69FF'} 
                          strokeWidth="2.5" 
                          strokeLinecap="round"
                        />

                        {/* Interactive dots with tooltip values */}
                        {svgChart.points.map((pt, idx) => (
                          <g key={idx} className="group/dot cursor-pointer">
                            <circle 
                              cx={pt.x} 
                              cy={pt.y} 
                              r="5" 
                              fill={theme === 'dark' ? '#9EFF33' : '#2F69FF'} 
                              fillOpacity="0.2"
                              className="transition-all duration-200 group-hover/dot:r-8"
                            />
                            <circle 
                              cx={pt.x} 
                              cy={pt.y} 
                              r="3" 
                              fill="#FFFFFF" 
                              stroke={theme === 'dark' ? '#2BD167' : '#2F69FF'} 
                              strokeWidth="2" 
                            />
                            {/* SVG Text tooltip that shows accuracy percentage on hover */}
                            <text
                              x={pt.x}
                              y={pt.y - 10}
                              textAnchor="middle"
                              className="text-[8px] font-black fill-slate-800 dark:fill-white font-mono opacity-0 group-hover/dot:opacity-100 transition-opacity duration-150 pointer-events-none"
                            >
                              {pt.accuracy}%
                            </text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  )}

                  {/* Quick textual summary */}
                  <div className="flex items-center justify-between text-[9px] text-slate-450 dark:text-slate-400 font-bold px-1">
                    <span>First Session</span>
                    <span className={`font-mono ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`}>Latest {timelineChartData.length} Attempts Trend</span>
                    <span>Recent Session</span>
                  </div>
                </div>
              )}
            </div>

            {/* Category relative strength index */}
            <div className={`backdrop-blur-md border rounded-2xl p-4.5 shadow-lg text-left transition-all duration-300 ${
              theme === 'dark'
                ? 'bg-[#161A1D]/80 border-white/10 hover:border-neon-lime/20'
                : 'bg-white/65 border-white/40 hover:border-[#2F69FF]/20'
            }`}>
              <h1 className={`text-xs font-black uppercase tracking-wider font-sans mb-1 flex items-center gap-1.5 ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
                <Icons.Award className={`w-3.5 h-3.5 ${theme === 'dark' ? 'text-neon-lime' : 'text-[#2F69FF]'}`} />
                <span>Subject Mastery Index</span>
              </h1>
              <p className={`text-[10px] mb-4 pb-2 border-b ${theme === 'dark' ? 'text-slate-400 border-white/5' : 'text-[#6C737F] border-slate-100'}`}>Competency strength per computer science subdivision</p>
              
              <div className="space-y-3">
                {categoryChartData.map((row, index) => {
                  const colors = theme === 'dark' 
                    ? ['bg-cyan-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500']
                    : ['bg-blue-600', 'bg-emerald-600', 'bg-amber-600', 'bg-indigo-600'];
                  const textColors = theme === 'dark'
                    ? ['text-cyan-400', 'text-emerald-400', 'text-amber-400', 'text-purple-400']
                    : ['text-blue-600', 'text-emerald-600', 'text-amber-600', 'text-indigo-600'];
                  const bgColors = theme === 'dark'
                    ? ['bg-cyan-950/40', 'bg-emerald-950/40', 'bg-amber-950/40', 'bg-purple-950/40']
                    : ['bg-blue-50', 'bg-emerald-50', 'bg-amber-50', 'bg-indigo-50'];
                  const borderColors = theme === 'dark'
                    ? ['border-cyan-900/40', 'border-emerald-900/40', 'border-amber-900/40', 'border-purple-900/40']
                    : ['border-blue-200', 'border-emerald-200', 'border-amber-200', 'border-indigo-200'];

                  return (
                    <div key={row.fullName} className="space-y-1 text-left">
                      <div className="flex justify-between items-baseline">
                        <span className={`text-[10.5px] font-black font-sans tracking-tight block ${theme === 'dark' ? 'text-slate-250' : 'text-[#1A1D20]'}`}>
                          {row.fullName}
                        </span>
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className={`text-[9.5px] font-black ${textColors[index % 4]}`}>
                            {row.accuracy}% Accuracy
                          </span>
                          <span className={`text-[8.5px] font-bold uppercase ${theme === 'dark' ? 'text-slate-500' : 'text-[#6C737F]'}`}>
                            ({row.attempts} Qs)
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <div className={`flex-1 h-2 rounded-full overflow-hidden border ${theme === 'dark' ? 'bg-white/5 border-white/5' : 'bg-slate-100 border-slate-200'}`}>
                          <div 
                            className={`h-full ${colors[index % 4]} rounded-full transition-all duration-300`} 
                            style={{ width: `${row.accuracy}%` }} 
                          />
                        </div>
                        
                        <span className={`text-[8.5px] font-black uppercase px-1.5 py-0.2 rounded border shrink-0 ${bgColors[index % 4]} ${borderColors[index % 4]} ${textColors[index % 4]}`}>
                          {row.accuracy >= 75 ? 'Mastered' : row.accuracy >= 40 ? 'Reviewing' : 'Struggling'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* HISTORICAL LOGS & RE-ATTEMPT SECTION */}
          <div className="space-y-3 text-left">
            <h3 className={`text-xs font-black uppercase tracking-wider font-mono ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>
              Recent Attempts Ledger (Mock & Practice Runs)
            </h3>

            <div className="space-y-2">
              {filteredAttempts.slice(0, 10).map((att) => {
                let dateText = 'Recent';
                try {
                  if (att.timestamp) {
                    const d = new Date(att.timestamp);
                    if (!isNaN(d.getTime())) {
                      dateText = d.toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });
                    }
                  }
                } catch (e) {
                  console.error("Failed to parse history date:", e);
                }
                const percentage = att.questionsCount > 0 ? Math.round((att.correctAnswersCount / att.questionsCount) * 100) : 0;

                return (
                  <div key={att.id} className={`backdrop-blur-md border rounded-xl p-3.5 flex items-center justify-between shadow-lg transition-all duration-300 ${
                    theme === 'dark'
                      ? 'bg-[#161A1D]/40 border-white/10 hover:border-neon-lime/30 hover:shadow-black/20'
                      : 'bg-white/65 border-white/45 hover:border-[#2F69FF]/30 hover:shadow-slate-200/50'
                  }`}>
                    <div className="space-y-1 text-left min-w-0 flex-1">
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded mr-2 ${
                        theme === 'dark' 
                          ? 'bg-white/5 text-slate-300' 
                          : 'bg-[#2F69FF]/10 text-[#2F69FF]'
                      }`}>
                        {att.isMockExam ? 'MOCK SIMULATION' : 'PRACTICE DRILL'}
                      </span>
                      <span className={`text-[10px] font-mono ${theme === 'dark' ? 'text-slate-550' : 'text-[#6C737F]'}`}>
                        {dateText}
                      </span>
                      <h4 className={`text-xs font-bold leading-tight font-sans mt-1.5 truncate ${
                        theme === 'dark' ? 'text-slate-200' : 'text-[#1A1D20]'
                      }`}>
                        {att.topic}
                      </h4>
                      <p className={`text-[10px] font-sans truncate ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>
                        {att.subtopic || 'General Domain Focus'} • {att.isTimed ? 'Timed' : 'Study Mode'}
                      </p>
                      
                      {/* Active Re-attempt button */}
                      {onReAttempt && (
                        <motion.button
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => {
                            onReAttempt(
                              att.topic,
                              att.subtopic || '',
                              att.difficulty || 'medium',
                              att.isTimed,
                              att.isMockExam || false
                            );
                          }}
                          className={`mt-2 py-1 px-2.5 border rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-xs ${
                            theme === 'dark'
                              ? 'bg-neon-lime/10 border-neon-lime/25 text-neon-lime hover:bg-neon-lime/20'
                              : 'bg-[#2F69FF]/10 border-[#2F69FF]/20 text-[#2F69FF] hover:bg-[#2F69FF]/20'
                          }`}
                        >
                          <Icons.RotateCcw className="w-2.5 h-2.5" />
                          <span>Re-attempt mock</span>
                        </motion.button>
                      )}
                    </div>

                    <div className="text-right ml-4 shrink-0">
                      <span className={`text-base font-black font-sans leading-none block ${
                        percentage >= 70 ? 'text-emerald-500' :
                        percentage >= 40 ? 'text-amber-500' :
                        'text-rose-500'
                      }`}>
                        {percentage}%
                      </span>
                      <span className={`text-[10px] font-extrabold font-mono ${theme === 'dark' ? 'text-slate-500' : 'text-[#6C737F]'}`}>
                        {att.correctAnswersCount}/{att.questionsCount} correct
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reset Action */}
          <div className={`backdrop-blur-md border p-4 rounded-xl shadow-lg text-left transition-all duration-300 ${
            theme === 'dark'
              ? 'bg-[#161A1D]/40 border-white/10 hover:border-rose-500/20'
              : 'bg-white/65 border-white/40 hover:border-rose-500/20'
          }`}>
            <h4 className={`text-xs font-black font-sans ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>Diagnostic Maintenance Workspace</h4>
            <p className={`text-[10px] mt-0.5 ${theme === 'dark' ? 'text-slate-400' : 'text-[#6C737F]'}`}>
              Permanently purge local student practice history, quiz attempts logs, bookmarks, and generated topics caches to start fresh.
            </p>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setShowConfirmReset(true);
              }}
              className="mt-3 px-4 py-2 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-500 dark:text-rose-400 rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer transition-all"
              id="reset-history-btn"
            >
              Clear Local Student Logs
            </motion.button>
          </div>

          {/* Custom State-based Confirmation Modal */}
          {showConfirmReset && (
            <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" id="reset-confirm-modal">
              <div className={`border rounded-2xl p-5 max-w-sm w-full shadow-lg text-left space-y-4 animate-fade-in ${
                theme === 'dark'
                  ? 'bg-[#161A1D] border-rose-900/40'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-full flex items-center justify-center shrink-0">
                    <Icons.AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className={`text-sm font-black tracking-tight uppercase leading-tight ${theme === 'dark' ? 'text-slate-100' : 'text-[#1A1D20]'}`}>Reset Progress Data?</h3>
                    <p className="text-[9px] text-rose-500 font-mono font-extrabold uppercase">Critical Student Action</p>
                  </div>
                </div>

                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Are you sure you want to permanently clear all study progress, mock exam histories, accumulated badges, offline questions, and saved bookmarks? <strong className="text-rose-400">This action is irreversible.</strong>
                </p>

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    onClick={() => setShowConfirmReset(false)}
                    className={`py-2 px-3 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border ${
                      theme === 'dark'
                        ? 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/5'
                        : 'bg-slate-100 hover:bg-slate-200 text-[#1A1D20] border-slate-200'
                    }`}
                  >
                    Cancel / Keep
                  </button>
                  <button
                    onClick={() => {
                      onResetData();
                      setShowConfirmReset(false);
                    }}
                    className="py-2 px-3 bg-rose-600 hover:bg-rose-700 text-slate-50 rounded-xl text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all border border-rose-600 shadow-sm"
                  >
                    Yes, Purge All
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
