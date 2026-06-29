/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Question, ExamConfig, ExamSubject, ExamRule } from '../types';
import { saveCustomQuestions, getExamsConfig, saveExamsConfig, getAllQuestions, AdminActivity, getAdminActivities, logAdminActivity, getNormalizedSubject } from '../lib/storage';
import { uploadQuestionsInChunks } from '../lib/questionSync';
import { getQuestionsCached, saveQuestionsCached, clearQuestionsCached } from '../lib/indexedDB';
import { doc, setDoc, getDoc, db, dbMonitor } from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';

interface QuestionUploaderProps {
  onBack: () => void;
  onQuestionsSaved: () => void;
  currentUser: any;
  onLockAdmin?: () => void;
}

export default function QuestionUploader({ onBack, onQuestionsSaved, currentUser, onLockAdmin }: QuestionUploaderProps) {
  // Tabs: 'upload' | 'upload_mock' | 'manage_exams' | 'db_management'
  const [activeTab, setActiveTab] = useState<'upload' | 'upload_mock' | 'manage_exams' | 'db_management'>('upload');

  // Live upload progress states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadCurrent, setUploadCurrent] = useState<number>(0);
  const [syncFailed, setSyncFailed] = useState<boolean>(false);

  // Real-time Firebase sync status & topic progress tracking states
  const [firebaseStatus, setFirebaseStatus] = useState<'connected' | 'syncing' | 'offline'>('connected');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [topicQuestionCount, setTopicQuestionCount] = useState<number>(0);

  // Schema configs
  const [examsConfig, setExamsConfig] = useState<ExamConfig[]>([]);
  useEffect(() => {
    setExamsConfig(getExamsConfig());
  }, []);

  // DB Monitor and Quota Recovery states
  const [dbStats, setDbStats] = useState(() => dbMonitor.getStats());
  const [isBypassed, setIsBypassed] = useState(() => dbMonitor.isBypassed());

  useEffect(() => {
    const unsubscribe = dbMonitor.subscribe(() => {
      setDbStats(dbMonitor.getStats());
      setIsBypassed(dbMonitor.isBypassed());
    });
    return () => unsubscribe();
  }, []);

  const [isBackupExporting, setIsBackupExporting] = useState(false);
  const [backupMessage, setBackupMessage] = useState('');
  
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreMessage, setRestoreMessage] = useState('');
  const [restoreType, setRestoreType] = useState<'local' | 'cloud'>('local');
  const [overwriteOnRestore, setOverwriteOnRestore] = useState<boolean>(false);

  const handleBackupExport = async () => {
    try {
      setIsBackupExporting(true);
      setBackupMessage('Retrieving active question records from local IndexedDB cache...');
      const questions = await getQuestionsCached();
      if (questions.length === 0) {
        setBackupMessage('Notice: The IndexedDB cache is currently empty. Run a sync or upload questions first.');
        setIsBackupExporting(false);
        return;
      }

      setBackupMessage(`Compiling ${questions.length} questions into standardized portable archive...`);
      const payload = {
        appletId: "a27adeb9-5185-4392-84a0-bab23bf35886",
        version: "2.1",
        exportedAt: new Date().toISOString(),
        projectId: firebaseConfig.projectId,
        databaseId: firebaseConfig.firestoreDatabaseId,
        questions: questions
      };

      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `dsssb_question_bank_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setBackupMessage(`Export Complete! Standard backup downloaded successfully (${questions.length} questions preserved).`);
      logAdminActivity({
        action: 'edited',
        exam: 'System',
        subject: 'Database Recovery',
        subtopic: 'Export Backup',
        count: questions.length
      });
    } catch (err: any) {
      console.error(err);
      setBackupMessage(`Export Failed: ${err.message || String(err)}`);
    } finally {
      setIsBackupExporting(false);
    }
  };

  const handleBackupRestore = async (file: File) => {
    if (!file) return;
    try {
      setIsRestoring(true);
      setRestoreProgress(0);
      setRestoreMessage('Reading backup file contents...');
      
      const fileText = await file.text();
      let payload: any;
      try {
        payload = JSON.parse(fileText);
      } catch (e) {
        throw new Error('Invalid JSON file. Please provide a valid JSON question backup file.');
      }

      let questionsList: Question[] = [];
      if (Array.isArray(payload)) {
        questionsList = payload;
      } else if (payload && Array.isArray(payload.questions)) {
        questionsList = payload.questions;
      } else {
        throw new Error('Unrecognized backup format. JSON must be a raw array of questions or contain a "questions" field.');
      }

      if (questionsList.length === 0) {
        throw new Error('The uploaded backup contains zero questions.');
      }

      setRestoreMessage(`Parsed ${questionsList.length} questions. Initiating restore process via ${restoreType === 'local' ? 'Local IndexedDB' : 'Cloud Firestore'}...`);

      if (restoreType === 'local') {
        if (overwriteOnRestore) {
          setRestoreMessage('Clearing local IndexedDB question cache...');
          await clearQuestionsCached();
        }
        
        setRestoreProgress(30);
        let existingQuestions = overwriteOnRestore ? [] : await getQuestionsCached();
        
        const mergedMap = new Map<string, Question>();
        existingQuestions.forEach(q => mergedMap.set(q.id, q));
        questionsList.forEach(q => mergedMap.set(q.id, q));
        
        const finalQs = Array.from(mergedMap.values());
        setRestoreMessage(`Saving ${finalQs.length} questions to local IndexedDB storage...`);
        setRestoreProgress(70);
        await saveQuestionsCached(finalQs);
        setRestoreProgress(100);
        setRestoreMessage(`Local Restore Succeeded! ${finalQs.length} questions are now stored and fully ready for offline practice.`);
        logAdminActivity({
          action: 'added',
          exam: 'System',
          subject: 'Database Recovery',
          subtopic: 'Restore Local',
          count: questionsList.length
        });
        onQuestionsSaved();
      } else {
        if (dbMonitor.isBypassed()) {
          throw new Error('Cannot restore to Cloud while simulated Quota Exhausted / Offline mode is active. Please turn it off first.');
        }

        setRestoreMessage(`Starting Cloud sync of ${questionsList.length} questions. Writing in sequential batches of 1000...`);
        
        let uploaded = 0;
        await uploadQuestionsInChunks(
          questionsList,
          (uploadedCount) => {
            uploaded = uploadedCount;
            const progress = Math.min(Math.round((uploaded / questionsList.length) * 100), 100);
            setRestoreProgress(progress);
            setRestoreMessage(`Uploading questions to Cloud Firestore: ${uploaded} / ${questionsList.length} (${progress}%)`);
          }
        );

        let existingQuestions = await getQuestionsCached();
        const mergedMap = new Map<string, Question>();
        existingQuestions.forEach(q => mergedMap.set(q.id, q));
        questionsList.forEach(q => mergedMap.set(q.id, q));
        await saveQuestionsCached(Array.from(mergedMap.values()));

        setRestoreProgress(100);
        setRestoreMessage(`Cloud Restore Succeeded! All ${questionsList.length} questions are uploaded to Firestore and cached on this device.`);
        logAdminActivity({
          action: 'added',
          exam: 'System',
          subject: 'Database Recovery',
          subtopic: 'Restore Cloud',
          count: questionsList.length
        });
        onQuestionsSaved();
      }
    } catch (err: any) {
      console.error(err);
      setRestoreMessage(`Restore Failed: ${err.message || String(err)}`);
    } finally {
      setIsRestoring(false);
    }
  };

  // Update real-time connection and sync status with Firebase
  useEffect(() => {
    const updateOnlineStatus = () => {
      if (!navigator.onLine) {
        setFirebaseStatus('offline');
      } else if (isUploading) {
        setFirebaseStatus('syncing');
      } else {
        setFirebaseStatus('connected');
      }
    };

    updateOnlineStatus();
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
    };
  }, [isUploading]);

  // -------------------------------------------------------------
  // TAB 1: UPLOAD QUESTIONS LOGIC
  // -------------------------------------------------------------
  // Board configuration & selection state
  const [selectedBoard, setSelectedBoard] = useState<'dsssb' | 'rssb' | 'rpsc'>('dsssb');
  // Upload scope: 'exam_specific' | 'board_common'
  const [uploadScope, setUploadScope] = useState<'exam_specific' | 'board_common'>('exam_specific');

  const BOARD_EXAMS = useMemo(() => ({
    dsssb: [
      { id: 'dsssb_tgt_cs', name: 'DSSSB TGT CS' },
      { id: 'dsssb_it', name: 'DSSSB IT' }
    ],
    rssb: [
      { id: 'cet_xii', name: 'CET-XII' },
      { id: 'cet_graduation', name: 'CET-GRADUATION' }
    ],
    rpsc: [
      { id: 'ras_prelims', name: 'RAS PRELIMS' },
      { id: 'ras_mains', name: 'RAS MAINS' },
      { id: 'eo_ro', name: 'EO RO' }
    ]
  }), []);

  const [selectedExam, setSelectedExam] = useState<string>('dsssb_tgt_cs');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('');
  const [customSubtopic, setCustomSubtopic] = useState<string>('');
  const [useCustomSubtopic, setUseCustomSubtopic] = useState<boolean>(false);
  const [mockTitle, setMockTitle] = useState<string>('');

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [parsingProgress, setParsingProgress] = useState<number>(0);

  // Update selectedExam automatically when board or scope changes
  useEffect(() => {
    if (uploadScope === 'board_common') {
      setSelectedExam(`common_${selectedBoard}`);
    } else {
      const exams = BOARD_EXAMS[selectedBoard];
      if (exams && exams.length > 0) {
        setSelectedExam(exams[0].id);
      }
    }
  }, [selectedBoard, uploadScope, BOARD_EXAMS]);

  // Load first subject when selectedExam changes (supports Board Common virtual configs)
  const activeExamConfig = useMemo(() => {
    if (selectedExam.startsWith('common_')) {
      const board = selectedExam.replace('common_', '') as 'dsssb' | 'rssb' | 'rpsc';
      const boardExams = BOARD_EXAMS[board] || [];
      const allSubjects: string[] = [];
      boardExams.forEach(be => {
        const conf = examsConfig.find(e => e.id === be.id);
        if (conf) {
          conf.subjects.forEach(s => {
            if (!allSubjects.includes(s.name)) {
              allSubjects.push(s.name);
            }
          });
        }
      });
      // Fallbacks
      if (allSubjects.length === 0) {
        if (board === 'dsssb') {
          allSubjects.push('Reasoning', 'Quantitative Aptitude', 'Hindi', 'English', 'General Studies (GS)', 'Computer Science');
        } else {
          allSubjects.push('Rajasthan GK', 'Reasoning & Mental Ability', 'General Science', 'Hindi', 'English', 'Quantitative Aptitude & Reasoning');
        }
      }
      return {
        id: selectedExam,
        name: `${board.toUpperCase()} Common Syllabus`,
        subjects: allSubjects.map(name => ({ name, topics: [] })),
        rules: { numQuestions: 100, timeLimitMinutes: 100, negativeMarking: 0, subjectAllotments: {} }
      } as unknown as ExamConfig;
    }
    return examsConfig.find(e => e.id === selectedExam) || examsConfig[0];
  }, [examsConfig, selectedExam, selectedBoard, BOARD_EXAMS]);

  const activeSubjects = useMemo(() => {
    if (!activeExamConfig) return [];
    return activeExamConfig.subjects.map(s => s.name);
  }, [activeExamConfig]);

  useEffect(() => {
    if (activeSubjects.length > 0) {
      setSelectedSubject(activeSubjects[0]);
    }
  }, [selectedExam, examsConfig]);

  const activeTopics = useMemo(() => {
    if (!activeExamConfig || !selectedSubject) return [];
    const subj = activeExamConfig.subjects.find(s => s.name === selectedSubject);
    if (!subj) return [];
    return subj.topics.map(t => t.name);
  }, [activeExamConfig, selectedSubject]);

  useEffect(() => {
    if (activeTopics.length > 0) {
      setSelectedTopic(activeTopics[0]);
    } else {
      setSelectedTopic('');
    }
  }, [selectedSubject, activeTopics]);

  const activeSubtopics = useMemo(() => {
    if (!activeExamConfig || !selectedSubject || !selectedTopic) return [];
    const subj = activeExamConfig.subjects.find(s => s.name === selectedSubject);
    if (!subj) return [];
    const topicObj = subj.topics.find(t => t.name === selectedTopic);
    return topicObj ? topicObj.subtopics : [];
  }, [activeExamConfig, selectedSubject, selectedTopic]);

  useEffect(() => {
    if (activeSubtopics.length > 0) {
      setSelectedSubtopic(activeSubtopics[0]);
    } else {
      setSelectedSubtopic('General Theory');
    }
  }, [selectedTopic, activeSubtopics]);

  const activeSubtopicName = useMemo(() => {
    return useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;
  }, [useCustomSubtopic, customSubtopic, selectedSubtopic]);

  useEffect(() => {
    if (!selectedExam || !activeSubtopicName) return;
    try {
      const allQuestions = getAllQuestions();
      const subtopicQuestions = allQuestions.filter(
        q => q.exam === selectedExam && q.subtopic === activeSubtopicName
      );
      setTopicQuestionCount(subtopicQuestions.length);
    } catch (e) {
      console.error('Failed to compute topic question count:', e);
    }
  }, [selectedExam, activeSubtopicName, examsConfig, successCount, isUploading]);

  const syncTopicProgressToFirebase = async (examId: string, subject: string, subtopicName: string, count: number) => {
    try {
      const user = currentUser;
      if (!user) {
        console.log('Skipping Firebase progress sync: User not authenticated.');
        return;
      }
      if (!subtopicName) return;

      const docId = `${examId}_${subject.split(' ').join('_')}_${subtopicName.split(' ').join('_')}`;
      const progressRef = doc(db, 'topics_progress', docId);

      await setDoc(progressRef, {
        examId,
        subject,
        subtopic: subtopicName,
        questionCount: count,
        targetCount: 50,
        percentage: Math.min(100, Math.round((count / 50) * 100)),
        updatedAt: new Date().toISOString(),
        updatedBy: user.email || user.uid,
      }, { merge: true });

      console.log(`Synced progress state live to Firebase for topic "${subtopicName}": ${count}/50 questions.`);
    } catch (e) {
      console.error('Failed to sync topic progress to Firebase:', e);
    }
  };

  // Run a live sync when selection changes or count changes (if logged in)
  useEffect(() => {
    if (currentUser && selectedExam && selectedSubject && activeSubtopicName && topicQuestionCount > 0) {
      syncTopicProgressToFirebase(selectedExam, selectedSubject, activeSubtopicName, topicQuestionCount);
    }
  }, [selectedExam, selectedSubject, activeSubtopicName, topicQuestionCount, currentUser]);

  // Plain TXT syntax parser
  const parseRawText = (text: string): Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] => {
    const list: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
    const blocks = text.split(/Q:/i).filter(b => b.trim() !== '');
    
    blocks.forEach((block) => {
      try {
        const lines = block.split('\n').map(l => l.trim()).filter(l => l !== '');
        if (lines.length < 3) return;

        const questionText = lines[0];
        const options: string[] = [];
        let correctIndex = 0;
        let explanation = 'No explanation provided.';
        let difficulty: 'easy' | 'medium' | 'hard' = 'medium';

        lines.slice(1).forEach((line) => {
          if (line.match(/^[A-D]\s*:/i) || line.match(/^[A-D]\s*\)/i)) {
            options.push(line.replace(/^[A-D]\s*[:)]/i, '').trim());
          } else if (line.toUpperCase().startsWith('CORRECT:')) {
            const val = line.substring(8).trim().toUpperCase();
            if (val === 'A' || val === '0') correctIndex = 0;
            else if (val === 'B' || val === '1') correctIndex = 1;
            else if (val === 'C' || val === '2') correctIndex = 2;
            else if (val === 'D' || val === '3') correctIndex = 3;
          } else if (line.toUpperCase().startsWith('EXPLANATION:')) {
            explanation = line.substring(12).trim();
          } else if (line.toUpperCase().startsWith('DIFFICULTY:')) {
            const diff = line.substring(11).trim().toLowerCase();
            if (diff === 'easy' || diff === 'medium' || diff === 'hard') {
              difficulty = diff;
            }
          }
        });

        if (options.length >= 2) {
          list.push({
            difficulty,
            text: questionText,
            options,
            correctIndex,
            explanation
          });
        }
      } catch (err) {
        console.error("Failed to parse block:", block, err);
      }
    });

    return list;
  };

  // Plain HTML parsing routine
  const parseHTMLText = (htmlContent: string): Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] => {
    const list: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const listItems = doc.querySelectorAll('li, p, .question-block');
    
    let currentQText = '';
    let currentOptions: string[] = [];

    listItems.forEach((el) => {
      const text = el.textContent?.trim() || '';
      if (text.match(/^\d+[.)]\s+/) || text.toLowerCase().startsWith('q:') || text.toLowerCase().startsWith('question:')) {
        if (currentQText && currentOptions.length >= 2) {
          list.push({
            text: currentQText,
            options: currentOptions,
            correctIndex: 0,
            explanation: 'Extracted from HTML Document',
            difficulty: 'medium'
          });
        }
        currentQText = text.replace(/^\d+[.)]\s+/, '').replace(/^q:\s*/i, '').replace(/^question:\s*/i, '');
        currentOptions = [];
      } else if (text.match(/^[a-d][.)]\s+/i) || text.match(/^\([a-d]\)\s+/i)) {
        currentOptions.push(text.replace(/^[a-d][.)]\s+/i, '').replace(/^\([a-d]\)\s+/i, ''));
      }
    });

    if (currentQText && currentOptions.length >= 2) {
      list.push({
        text: currentQText,
        options: currentOptions,
        correctIn
