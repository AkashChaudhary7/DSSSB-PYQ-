/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Question, ExamConfig, ExamSubject, ExamRule } from '../types';
import { saveCustomQuestions, getExamsConfig, saveExamsConfig, getAllQuestions, AdminActivity, getAdminActivities, logAdminActivity, getNormalizedSubject } from '../lib/storage';
import { uploadQuestionsInChunks, saveExamsConfigToFirestore } from '../lib/questionSync';
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
    const load = () => {
      setExamsConfig(getExamsConfig());
    };
    load();
    window.addEventListener('exams-config-updated', load);
    return () => window.removeEventListener('exams-config-updated', load);
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
        correctIndex: 0,
        explanation: 'Extracted from HTML Document',
        difficulty: 'medium'
      });
    }

    return list;
  };

  const validateAndParseJSONAsync = async (
    jsonString: string,
    onProgress: (percent: number) => void
  ): Promise<Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[]> => {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }

    let items: any[] = [];
    if (data && typeof data === 'object') {
      const keys = Object.keys(data);
      const isGroupedBySubject = keys.length > 0 && keys.every(k => Array.isArray(data[k]));

      if (isGroupedBySubject) {
        for (const subjName of keys) {
          const list = data[subjName];
          for (const q of list) {
            if (q && typeof q === 'object') {
              items.push({
                ...q,
                parsedSubject: subjName
              });
            }
          }
        }
      } else if (Array.isArray(data.sections)) {
        for (const section of data.sections) {
          if (section && Array.isArray(section.questions)) {
            for (const q of section.questions) {
              items.push({
                ...q,
                part: section.name || q.part
              });
            }
          }
        }
      } else if (Array.isArray(data.questions)) {
        items = data.questions;
      } else if (Array.isArray(data)) {
        items = data;
      } else if (data.data && Array.isArray(data.data)) {
        items = data.data;
      } else {
        // Find the first property of the object that contains an array
        const arrayKey = Object.keys(data).find(key => Array.isArray(data[key]));
        if (arrayKey) {
          items = data[arrayKey];
        } else {
          items = [data];
        }
      }
    } else {
      throw new Error("Invalid JSON structure: Root must be an object or array.");
    }

    if (items.length === 0) {
      throw new Error("The JSON contains no questions.");
    }

    const results: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
    const totalItems = items.length;

    for (let i = 0; i < totalItems; i++) {
      // Yield to the main thread every 500 items to avoid freezing/lagging
      if (i > 0 && i % 500 === 0) {
        onProgress(Math.round((i / totalItems) * 100));
        await new Promise(resolve => setTimeout(resolve, 0));
      }

      const item = items[i];
      
      // 1. Resolve question text
      let questionText = item.question || item.text || item.q || item.question_text || item.title || item.desc || "";
      if (typeof questionText !== 'string' || questionText.trim() === '') {
        const stringKeys = Object.keys(item).filter(k => typeof item[k] === 'string' && item[k].trim().length > 0);
        if (stringKeys.length > 0) {
          const bestKey = stringKeys.find(k => k.toLowerCase().includes('quest') || k.toLowerCase().includes('text')) || stringKeys[0];
          questionText = item[bestKey];
        } else {
          questionText = `Question ${i + 1}`;
        }
      }

      // 2. Resolve options array
      let rawOptions = item.options || item.choices || item.answers || item.opts || item.options_list;
      if (!rawOptions || !Array.isArray(rawOptions)) {
        const arrayKeys = Object.keys(item).filter(k => Array.isArray(item[k]));
        if (arrayKeys.length > 0) {
          rawOptions = item[arrayKeys[0]];
        } else {
          rawOptions = ["Option A", "Option B", "Option C", "Option D"];
        }
      }

      // If less than 2 options, populate defaults to avoid throwing
      if (rawOptions.length < 2) {
        rawOptions = [...rawOptions, "Default Option B"];
      }

      // 3. Map and clean options
      const opts = rawOptions.map((opt: any, j: number) => {
        if (opt === undefined || opt === null) {
          return `Option ${j + 1}`;
        }
        if (typeof opt === 'object') {
          const val = opt.value ?? opt.text ?? opt.option ?? opt.choice ?? opt.answer ?? opt.val;
          if (val !== undefined && val !== null) {
            return String(val).trim();
          }
          return String(JSON.stringify(opt)).trim();
        }
        return String(opt).trim();
      });

      // 4. Resolve correctIndex
      let correctIdx = -1;

      // 4.1. Check if options objects define correctness
      for (let j = 0; j < rawOptions.length; j++) {
        const opt = rawOptions[j];
        if (opt && typeof opt === 'object') {
          const isCorr = opt.correct ?? opt.isCorrect ?? opt.is_correct ?? opt.correct_answer ?? opt.is_true;
          if (isCorr === true || isCorr === 1 || String(isCorr).toLowerCase() === 'true' || String(isCorr) === '1') {
            correctIdx = j;
            break;
          }
        }
      }

      // 4.2. Check standard correctIndex keys on item
      if (correctIdx === -1) {
        const itemCorrectIndex = item.correctIndex ?? item.correct_index ?? item.correctIdx ?? item.answer_index ?? item.answerIndex;
        if (typeof itemCorrectIndex === 'number' && itemCorrectIndex >= 0 && itemCorrectIndex < opts.length) {
          correctIdx = itemCorrectIndex;
        } else if (itemCorrectIndex !== undefined && itemCorrectIndex !== null) {
          const num = parseInt(String(itemCorrectIndex).trim(), 10);
          if (!isNaN(num) && num >= 0 && num < opts.length) {
            correctIdx = num;
          }
        }
      }

      // 4.3. Check answer key string/character
      if (correctIdx === -1) {
        const ans = item.correct_answer ?? item.correctAnswer ?? item.answer ?? item.correct_option ?? item.correctOption ?? item.key;
        if (ans !== undefined && ans !== null) {
          const ansStr = String(ans).trim();
          const num = parseInt(ansStr, 10);
          if (!isNaN(num) && num >= 0 && num < opts.length) {
            correctIdx = num;
          } else if (ansStr.length === 1) {
            const charCode = ansStr.toUpperCase().charCodeAt(0);
            if (charCode >= 65 && charCode <= 68) { // A-D
              correctIdx = charCode - 65;
            } else if (charCode >= 49 && charCode <= 52) { // 1-4
              correctIdx = charCode - 49;
            }
          } else if (ansStr.length >= 2 && ansStr.toUpperCase().match(/^[A-E][\)\.\s]/)) {
            correctIdx = ansStr.toUpperCase().charCodeAt(0) - 65;
          } else {
            // Match opt text
            const matchIdx = opts.findIndex(opt => {
              const optNorm = opt.trim().toLowerCase();
              const ansNorm = ansStr.toLowerCase();
              return optNorm === ansNorm || optNorm.startsWith(ansNorm) || ansNorm.startsWith(optNorm);
            });
            if (matchIdx >= 0) {
              correctIdx = matchIdx;
            }
          }
        }
      }

      // 4.4. Safe fallback
      if (correctIdx < 0 || correctIdx >= opts.length) {
        correctIdx = 0;
      }

      results.push({
        text: questionText.trim(),
        options: opts,
        correctIndex: correctIdx,
        explanation: item.explanation ? String(item.explanation).trim() : 'No explanation provided.',
        difficulty: (item.difficulty === 'easy' || item.difficulty === 'hard') ? item.difficulty : 'medium',
        parsedSubject: item.parsedSubject
      } as any);
    }

    onProgress(100);
    return results;
  };

  // Process files
  const processUploadedContent = async (fileContent: string, format: 'json' | 'html' | 'txt') => {
    setErrorMsg(null);
    setParsedQuestions([]);
    
    try {
      let results: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
      if (format === 'json') {
        results = await validateAndParseJSONAsync(fileContent, () => {});
      } else if (format === 'html') {
        results = parseHTMLText(fileContent);
      } else {
        results = parseRawText(fileContent);
      }

      if (results.length === 0) {
        throw new Error("No robust questions could be structured from this file. Please verify syntax requirements.");
      }

      const finalSubtopic = useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;

      const completedQuestions: Question[] = results.map((q: any, idx) => {
        let resolvedTopic = selectedSubject;
        let resolvedSubtopic = useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;

        // If the question had an intelligently parsed subject from the file key:
        if (q.parsedSubject) {
          const normalizedInputSubject = getNormalizedSubject(q.parsedSubject);
          
          // Let's map it intelligently based on our target exam or board common scope
          if (selectedExam.startsWith('common_')) {
            // It is board common! Map to the standard display name for that subject
            if (normalizedInputSubject === 'reasoning') resolvedTopic = 'Reasoning';
            else if (normalizedInputSubject === 'quant') resolvedTopic = 'Quantitative Aptitude';
            else if (normalizedInputSubject === 'hindi') resolvedTopic = 'Hindi';
            else if (normalizedInputSubject === 'english') resolvedTopic = 'English';
            else if (normalizedInputSubject === 'computer_science') resolvedTopic = 'Computer Science';
            else if (normalizedInputSubject === 'gs') resolvedTopic = 'General Studies (GS)';
            else resolvedTopic = q.parsedSubject;
          } else {
            // It is an exam-specific upload! Map to the closest subject of the selected exam
            if (activeExamConfig) {
              const matchedSubj = activeExamConfig.subjects.find(s => 
                getNormalizedSubject(s.name) === normalizedInputSubject
              );
              if (matchedSubj) {
                resolvedTopic = matchedSubj.name;
              } else {
                resolvedTopic = q.parsedSubject;
              }
            } else {
              resolvedTopic = q.parsedSubject;
            }
          }

          // Apart from subject, if a subtopic is explicitly defined in the file, use it.
          // Otherwise, if the user typed a custom subtopic, use it.
          // Otherwise, empty string so it falls directly under the subject.
          const fileSubtopic = q.subtopic || q.sub_topic || q.section_unit || q.unit || '';
          if (fileSubtopic) {
            resolvedSubtopic = fileSubtopic.trim();
          } else if (useCustomSubtopic && customSubtopic.trim()) {
            resolvedSubtopic = customSubtopic.trim();
          } else {
            resolvedSubtopic = ''; // fallback directly to subject level
          }
        } else {
          // No parsedSubject in JSON. Just use the dropdown values selected by user
          if (q.subtopic || q.sub_topic) {
            resolvedSubtopic = (q.subtopic || q.sub_topic).trim();
          }
        }

        return {
          text: q.text,
          options: q.options,
          correctIndex: q.correctIndex,
          explanation: q.explanation,
          difficulty: q.difficulty || 'medium',
          id: `uploaded-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
          topic: resolvedTopic,
          subtopic: resolvedSubtopic,
          exam: selectedExam,
          part: 'B',
          isCustom: true,
          source: 'User Upload'
        };
      });

      setParsedQuestions(completedQuestions);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process format. Make sure the structure is correct.");
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    }
  };

  const readFileAsText = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => resolve(event.target?.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsText(file);
    });
  };

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    
    // Limit to 20 files max in one row
    const limitedFiles = files.slice(0, 20);
    setSelectedFiles(limitedFiles);
    setFileNames(limitedFiles.map(f => f.name));
    setFileName(limitedFiles.map(f => f.name).join(', '));
    setErrorMsg(null);
    setParsedQuestions([]);
    setIsParsing(true);
    setParsingProgress(0);
    
    let allCombinedQuestions: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
    
    try {
      for (const file of limitedFiles) {
        const content = await readFileAsText(file);
        const lowerName = file.name.toLowerCase();
        let format: 'json' | 'html' | 'txt' = 'txt';
        if (lowerName.endsWith('.json')) format = 'json';
        else if (lowerName.endsWith('.html') || lowerName.endsWith('.htm')) format = 'html';
        
        let parsed: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
        if (format === 'json') {
          parsed = await validateAndParseJSONAsync(content, (prog) => {
            setParsingProgress(prog);
          });
        } else if (format === 'html') {
          parsed = parseHTMLText(content);
        } else {
          parsed = parseRawText(content);
        }
        
        if (parsed.length === 0) {
          throw new Error(`[${file.name}] No robust questions could be structured from this file.`);
        }
        
        allCombinedQuestions = [...allCombinedQuestions, ...parsed];
      }

      if (activeTab === 'upload_mock') {
        const finalMockTitle = mockTitle.trim();
        if (!finalMockTitle) {
          throw new Error("Please enter a valid Mock Title (e.g., PYQ 2021)!");
        }
        if (!activeExamConfig) {
          throw new Error("No exam configuration available.");
        }
        
        let qIndex = 0;
        const completedQuestions: Question[] = [];
        
        // Loop through subjects and assign according to their allotments
        for (const subj of activeExamConfig.subjects) {
          const allotment = activeExamConfig.rules.subjectAllotments[subj.name] || 0;
          for (let i = 0; i < allotment && qIndex < allCombinedQuestions.length; i++) {
            if (qIndex > 0 && qIndex % 1000 === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
            completedQuestions.push({
              ...allCombinedQuestions[qIndex],
              id: `uploaded-${Date.now()}-${qIndex}-${Math.floor(Math.random() * 10000)}`,
              topic: subj.name,
              subtopic: finalMockTitle,
              exam: selectedExam,
              part: 'B',
              isCustom: true,
              source: 'Mock Upload'
            });
            qIndex++;
          }
        }
        
        // If there are leftover questions, assign them to the last subject or just generally
        while (qIndex < allCombinedQuestions.length) {
            if (qIndex > 0 && qIndex % 1000 === 0) {
              await new Promise(r => setTimeout(r, 0));
            }
            completedQuestions.push({
               ...allCombinedQuestions[qIndex],
               id: `uploaded-${Date.now()}-${qIndex}-${Math.floor(Math.random() * 10000)}`,
               topic: activeExamConfig.subjects[activeExamConfig.subjects.length - 1]?.name || 'General',
               subtopic: finalMockTitle,
               exam: selectedExam,
               part: 'B',
               isCustom: true,
               source: 'Mock Upload'
             });
             qIndex++;
        }
        
        setParsedQuestions(completedQuestions);
      } else {
        const finalSubtopic = (useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic) || "";

        const completedQuestions: Question[] = [];
        for (let idx = 0; idx < allCombinedQuestions.length; idx++) {
          if (idx > 0 && idx % 1000 === 0) {
            await new Promise(r => setTimeout(r, 0));
          }
          completedQuestions.push({
            ...allCombinedQuestions[idx],
            id: `uploaded-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
            topic: selectedSubject,
            subtopic: finalSubtopic,
            exam: selectedExam,
            part: 'B',
            isCustom: true,
            source: 'User Upload'
          });
        }

        setParsedQuestions(completedQuestions);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process the files. Make sure the structure and JSON parameters are valid.");
    } finally {
      setIsParsing(false);
    }
  };

  const handleCommitParsedQuestions = async () => {
    if (parsedQuestions.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setSyncFailed(false);
    
    const batchToUpload = [...parsedQuestions];
    const totalQuestions = batchToUpload.length;

    setUploadTotal(totalQuestions);
    setUploadCurrent(0);
    setErrorMsg(null);
    setSuccessCount(0);

    try {
      const chunkSize = 1000;
      let completedSoFar = 0;

      for (let i = 0; i < totalQuestions; i += chunkSize) {
        const chunk = batchToUpload.slice(i, i + chunkSize);

        // First save to local storage (safely trimmed to last 1000 items to prevent QuotaExceededError)
        try {
          const customStr = localStorage.getItem('cs_mcq_custom_questions');
          const existingCustom: Question[] = customStr ? JSON.parse(customStr) : [];
          const existingIds = new Set(existingCustom.map(q => q.id));
          const uniqueNew = chunk.filter(q => !existingIds.has(q.id));
          const updatedCustom = [...existingCustom, ...uniqueNew];
          const trimmedCustom = updatedCustom.slice(-1000);
          localStorage.setItem('cs_mcq_custom_questions', JSON.stringify(trimmedCustom));
        } catch (storageError) {
          console.warn('[Storage] LocalStorage quota exceeded in chunk commit. Fully caching in IndexedDB & Firestore instead.', storageError);
        }

        // Sync this specific chunk of 1000 questions to Firestore
        const startIdx = i;
        await uploadQuestionsInChunks(chunk, (uploadedCountInChunk) => {
          const totalUploadedNow = startIdx + uploadedCountInChunk;
          setUploadCurrent(totalUploadedNow);
          setUploadProgress(Math.round((totalUploadedNow / totalQuestions) * 100));
        });

        completedSoFar += chunk.length;
        setUploadCurrent(completedSoFar);
        setUploadProgress(Math.round((completedSoFar / totalQuestions) * 100));

        // Yield control to main thread (allowing DOM paint and GC reclamation)
        await new Promise(r => setTimeout(r, 60));
      }

      // After successfully committing all chunks to firestore, calculate new count and sync progress
      const finalSubtopic = activeTab === 'upload_mock' ? (mockTitle.trim() || 'General Mock') : ((useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic) || '');
      const targetSubject = activeTab === 'upload_mock' ? 'Mock Upload' : selectedSubject;
      
      const allQuestions = getAllQuestions();
      const subtopicQuestions = allQuestions.filter(
        q => q.exam === selectedExam && q.subtopic === finalSubtopic
      );
      const newCount = subtopicQuestions.length;
      setTopicQuestionCount(newCount);

      // Log the admin activity
      logAdminActivity({
        action: 'added',
        exam: selectedExam,
        subject: targetSubject,
        subtopic: finalSubtopic,
        count: totalQuestions
      });

      // Now sync this live to Firebase
      await syncTopicProgressToFirebase(selectedExam, targetSubject, finalSubtopic, newCount);

      setSuccessCount(totalQuestions);
      setParsedQuestions([]);

      setFileName(null);
      setFileNames([]);
      setSelectedFiles([]);
      
      onQuestionsSaved();
    } catch (e: any) {
      setErrorMsg("Failed to persist questions to cloud: " + (e.message || String(e)));
      setSyncFailed(true);
    } finally {
      setIsUploading(false);
    }
  };

  const handleResumeSync = async () => {
    if (parsedQuestions.length === 0 || uploadCurrent >= uploadTotal) return;
    setIsUploading(true);
    setSyncFailed(false);
    setErrorMsg(null);

    const remainingQuestions = parsedQuestions.slice(uploadCurrent);
    const totalRemaining = remainingQuestions.length;
    const chunkSize = 1000;
    const baseOffset = uploadCurrent;

    try {
      let completedSoFar = 0;

      for (let i = 0; i < totalRemaining; i += chunkSize) {
        const chunk = remainingQuestions.slice(i, i + chunkSize);

        const startIdx = i;
        await uploadQuestionsInChunks(chunk, (uploadedCountInChunk) => {
          const totalUploadedNow = baseOffset + startIdx + uploadedCountInChunk;
          setUploadCurrent(totalUploadedNow);
          setUploadProgress(Math.round((totalUploadedNow / uploadTotal) * 100));
        });

        completedSoFar += chunk.length;
        const finalCurrent = baseOffset + completedSoFar;
        setUploadCurrent(finalCurrent);
        setUploadProgress(Math.round((finalCurrent / uploadTotal) * 100));

        // Yield control to main thread (allowing DOM paint and GC reclamation)
        await new Promise(r => setTimeout(r, 60));
      }

      const finalSubtopic = activeTab === 'upload_mock' ? (mockTitle.trim() || 'General Mock') : ((useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic) || '');
      const targetSubject = activeTab === 'upload_mock' ? 'Mock Upload' : selectedSubject;
      
      const allQuestions = getAllQuestions();
      const subtopicQuestions = allQuestions.filter(
        q => q.exam === selectedExam && q.subtopic === finalSubtopic
      );
      const newCount = subtopicQuestions.length;
      setTopicQuestionCount(newCount);

      logAdminActivity({
        action: 'added',
        exam: selectedExam,
        subject: targetSubject,
        subtopic: finalSubtopic,
        count: uploadTotal
      });

      await syncTopicProgressToFirebase(selectedExam, targetSubject, finalSubtopic, newCount);

      setSuccessCount(uploadTotal);
      setParsedQuestions([]);

      setFileName(null);
      setFileNames([]);
      setSelectedFiles([]);
      
      onQuestionsSaved();
    } catch (e: any) {
      setErrorMsg("Failed to resume sync: " + (e.message || String(e)));
      setSyncFailed(true);
    } finally {
      setIsUploading(false);
    }
  };

  // -------------------------------------------------------------
  // TAB 2: CONFIGURE EXAMS LOGIC (DYNAMIC ADMIN SCHEMA EDITOR)
  // -------------------------------------------------------------
  const [editingExamId, setEditingExamId] = useState<string>('dsssb_tgt_cs');
  const [editFormNumQuestions, setEditFormNumQuestions] = useState<number>(100);
  const [editFormTime, setEditFormTime] = useState<number>(120);
  const [editFormNegative, setEditFormNegative] = useState<number>(-0.25);
  const [editFormTargetScore, setEditFormTargetScore] = useState<number>(70);
  const [editFormTargetDate, setEditFormTargetDate] = useState<string>('');
  const [subjectAllotments, setSubjectAllotments] = useState<Record<string, number>>({});
  
  // Managing unit tree
  const [newSubjectName, setNewSubjectName] = useState<string>('');
  const [newTopicName, setNewTopicName] = useState<string>('');
  const [newSubtopicCSV, setNewSubtopicCSV] = useState<string>('');
  const [targetSubjectForTopic, setTargetSubjectForTopic] = useState<string>('');

  const targetExamConfig = useMemo(() => {
    return examsConfig.find(e => e.id === editingExamId) || null;
  }, [examsConfig, editingExamId]);

  // Load rules when editingExamId changes
  useEffect(() => {
    if (targetExamConfig) {
      setEditFormNumQuestions(targetExamConfig.rules.numQuestions);
      setEditFormTime(targetExamConfig.rules.timeLimitMinutes);
      setEditFormNegative(targetExamConfig.rules.negativeMarking);
      setEditFormTargetScore(targetExamConfig.targetScore || 70);
      setEditFormTargetDate(targetExamConfig.targetDate || '');
      setSubjectAllotments({ ...targetExamConfig.rules.subjectAllotments });
      if (targetExamConfig.subjects.length > 0) {
        setTargetSubjectForTopic(targetExamConfig.subjects[0].name);
      }
    }
  }, [editingExamId, examsConfig]);

  const handleUpdateExamRules = () => {
    if (!targetExamConfig) return;
    
    const updated: ExamConfig[] = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        return {
          ...ex,
          targetScore: editFormTargetScore,
          targetDate: editFormTargetDate,
          rules: {
            numQuestions: editFormNumQuestions,
            timeLimitMinutes: editFormTime,
            negativeMarking: editFormNegative,
            subjectAllotments: { ...subjectAllotments }
          }
        };
      }
      return ex;
    });

    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setSuccessCount(1);
    setErrorMsg(null);
  };

  const handleAddSubject = () => {
    if (!newSubjectName.trim() || !targetExamConfig) return;

    const newSubj: ExamSubject = {
      name: newSubjectName.trim(),
      topics: []
    };

    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        // Prevent duplicate subject name
        if (ex.subjects.some(s => s.name.toLowerCase() === newSubjectName.trim().toLowerCase())) {
          return ex;
        }
        const updatedSubjects = [...ex.subjects, newSubj];
        const updatedAllotments = { ...ex.rules.subjectAllotments, [newSubjectName.trim()]: 10 };
        return {
          ...ex,
          subjects: updatedSubjects,
          rules: {
            ...ex.rules,
            subjectAllotments: updatedAllotments
          }
        };
      }
      return ex;
    });

    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setNewSubjectName('');
    setSuccessCount(1);
  };

  const handleAddTopic = () => {
    if (!newTopicName.trim() || !targetExamConfig || !targetSubjectForTopic) return;

    const subtopicsList = newSubtopicCSV
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '');

    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(sub => {
          if (sub.name === targetSubjectForTopic) {
            // check if topic already exists
            const topicExists = sub.topics.find(t => t.name.toLowerCase() === newTopicName.trim().toLowerCase());
            if (topicExists) {
              return {
                ...sub,
                topics: sub.topics.map(t => {
                  if (t.name.toLowerCase() === newTopicName.trim().toLowerCase()) {
                    return {
                      ...t,
                      subtopics: Array.from(new Set([...t.subtopics, ...subtopicsList]))
                    };
                  }
                  return t;
                })
              };
            } else {
              return {
                ...sub,
                topics: [
                  ...sub.topics,
                  {
                    name: newTopicName.trim(),
                    subtopics: subtopicsList.length > 0 ? subtopicsList : ['General Core']
                  }
                ]
              };
            }
          }
          return sub;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });

    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setNewTopicName('');
    setNewSubtopicCSV('');
    setSuccessCount(1);
  };

  const handleAllotmentChange = (subjName: string, val: number) => {
    setSubjectAllotments(prev => ({
      ...prev,
      [subjName]: val
    }));
  };

  // Subject, Topic, and Subtopic CRUD operations
  const [editingSubjectName, setEditingSubjectName] = useState<string | null>(null);
  const [newSubjectRenameVal, setNewSubjectRenameVal] = useState<string>('');
  const [editingTopicPath, setEditingTopicPath] = useState<{ subjectName: string; topicName: string } | null>(null);
  const [newTopicRenameVal, setNewTopicRenameVal] = useState<string>('');
  const [editingSubtopicPath, setEditingSubtopicPath] = useState<{ subjectName: string; topicName: string; subtopicName: string } | null>(null);
  const [newSubtopicRenameVal, setNewSubtopicRenameVal] = useState<string>('');
  const [newSubtopicInputVal, setNewSubtopicInputVal] = useState<Record<string, string>>({});

  const handleDeleteSubject = (subjName: string) => {
    if (!targetExamConfig) return;
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.filter(s => s.name !== subjName);
        const updatedAllotments = { ...ex.rules.subjectAllotments };
        delete updatedAllotments[subjName];
        return {
          ...ex,
          subjects: updatedSubjects,
          rules: {
            ...ex.rules,
            subjectAllotments: updatedAllotments
          }
        };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setSuccessCount(prev => prev + 1);
  };

  const handleEditSubject = (oldName: string) => {
    if (!newSubjectRenameVal.trim() || !targetExamConfig) return;
    const newName = newSubjectRenameVal.trim();
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === oldName) {
            return { ...s, name: newName };
          }
          return s;
        });
        const updatedAllotments = { ...ex.rules.subjectAllotments };
        if (updatedAllotments[oldName] !== undefined) {
          updatedAllotments[newName] = updatedAllotments[oldName];
          delete updatedAllotments[oldName];
        }
        return {
          ...ex,
          subjects: updatedSubjects,
          rules: {
            ...ex.rules,
            subjectAllotments: updatedAllotments
          }
        };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setEditingSubjectName(null);
    setNewSubjectRenameVal('');
    setSuccessCount(prev => prev + 1);
  };

  const handleDeleteTopic = (subjName: string, topicName: string) => {
    if (!targetExamConfig) return;
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === subjName) {
            return {
              ...s,
              topics: s.topics.filter(t => t.name !== topicName)
            };
          }
          return s;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setSuccessCount(prev => prev + 1);
  };

  const handleEditTopic = (subjName: string, oldTopicName: string) => {
    if (!newTopicRenameVal.trim() || !targetExamConfig) return;
    const newName = newTopicRenameVal.trim();
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === subjName) {
            return {
              ...s,
              topics: s.topics.map(t => {
                if (t.name === oldTopicName) {
                  return { ...t, name: newName };
                }
                return t;
              })
            };
          }
          return s;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setEditingTopicPath(null);
    setNewTopicRenameVal('');
    setSuccessCount(prev => prev + 1);
  };

  const handleDeleteSubtopic = (subjName: string, topicName: string, subName: string) => {
    if (!targetExamConfig) return;
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === subjName) {
            return {
              ...s,
              topics: s.topics.map(t => {
                if (t.name === topicName) {
                  return {
                    ...t,
                    subtopics: t.subtopics.filter(sub => sub !== subName)
                  };
                }
                return t;
              })
            };
          }
          return s;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setSuccessCount(prev => prev + 1);
  };

  const handleEditSubtopic = (subjName: string, topicName: string, oldSubName: string) => {
    if (!newSubtopicRenameVal.trim() || !targetExamConfig) return;
    const newName = newSubtopicRenameVal.trim();
    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === subjName) {
            return {
              ...s,
              topics: s.topics.map(t => {
                if (t.name === topicName) {
                  return {
                    ...t,
                    subtopics: t.subtopics.map(sub => sub === oldSubName ? newName : sub)
                  };
                }
                return t;
              })
            };
          }
          return s;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setEditingSubtopicPath(null);
    setNewSubtopicRenameVal('');
    setSuccessCount(prev => prev + 1);
  };

  const handleAddSubtopicInline = (subjName: string, topicName: string) => {
    const key = `${subjName}-${topicName}`;
    const val = newSubtopicInputVal[key]?.trim();
    if (!val || !targetExamConfig) return;

    const updated = examsConfig.map(ex => {
      if (ex.id === editingExamId) {
        const updatedSubjects = ex.subjects.map(s => {
          if (s.name === subjName) {
            return {
              ...s,
              topics: s.topics.map(t => {
                if (t.name === topicName) {
                  if (t.subtopics.includes(val)) return t;
                  return {
                    ...t,
                    subtopics: [...t.subtopics, val]
                  };
                }
                return t;
              })
            };
          }
          return s;
        });
        return { ...ex, subjects: updatedSubjects };
      }
      return ex;
    });
    saveExamsConfig(updated);
    setExamsConfig(updated);
    saveExamsConfigToFirestore(updated);
    setNewSubtopicInputVal(prev => ({ ...prev, [key]: '' }));
    setSuccessCount(prev => prev + 1);
  };

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100 text-left">
      
      {/* Top Banner Control Header */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between border-b border-slate-200 dark:border-white/5 pb-3">
        <div className="flex items-center justify-between w-full sm:w-auto gap-2">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-500 dark:text-indigo-400 shrink-0">
              <Icons.Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-[13px] sm:text-sm font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">Admin Control</h2>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 font-mono">Status: Secure Credentials Active</span>
            </div>
          </div>

          <div className="flex sm:hidden items-center gap-1.5 shrink-0">
            {onLockAdmin && (
              <button
                onClick={onLockAdmin}
                title="Lock Admin Control Center"
                className="p-1.5 text-amber-600 dark:text-amber-300 hover:text-white bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center shrink-0"
              >
                <Icons.Lock className="w-3.5 h-3.5" />
              </button>
            )}
            <button 
              onClick={onBack}
              title="Go Back"
              className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center shrink-0"
            >
              <Icons.ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          {/* Real-time Firebase Sync Status Indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold transition-all shrink-0 ${
            firebaseStatus === 'syncing' 
              ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
              : firebaseStatus === 'offline'
                ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              firebaseStatus === 'syncing' 
                ? 'bg-amber-500'
                : firebaseStatus === 'offline'
                  ? 'bg-rose-550 animate-ping'
                  : 'bg-emerald-500 animate-pulse'
            }`} />
            <span className="whitespace-nowrap">
              {firebaseStatus === 'syncing' 
                ? 'Firebase: Syncing...' 
                : firebaseStatus === 'offline' 
                  ? 'Firebase: Offline' 
                  : 'Firebase: Synced'}
            </span>
          </div>
          
          <div className="hidden sm:flex items-center gap-2 shrink-0">
            {onLockAdmin && (
              <button
                onClick={onLockAdmin}
                title="Lock Admin Control Center"
                className="p-2 text-amber-600 dark:text-amber-300 hover:text-white bg-amber-500/10 border border-amber-500/20 rounded-lg hover:bg-amber-500 hover:text-slate-950 transition-all cursor-pointer flex items-center justify-center shrink-0"
              >
                <Icons.Lock className="w-4 h-4" />
              </button>
            )}
            <button 
              onClick={onBack}
              title="Go Back"
              className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg hover:bg-slate-200 dark:hover:bg-white/10 transition-colors cursor-pointer flex items-center justify-center shrink-0"
            >
              <Icons.ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary Stats & Activity Panel */}
      <div className="bg-white/60 dark:bg-slate-900/40 border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex flex-col w-full">
        <div className="flex items-center gap-1.5 mb-2 px-1">
          <Icons.Activity className="w-3.5 h-3.5 text-emerald-500" />
          <h3 className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Recent Upload Activity</h3>
        </div>
        <div className="flex-1 overflow-y-auto max-h-[80px] space-y-1.5 hide-scrollbar">
          {getAdminActivities().length === 0 ? (
            <div className="h-full flex items-center justify-center text-[10px] text-slate-400 font-mono py-4">No recent activity</div>
          ) : (
            getAdminActivities().slice(0, 5).map(act => (
              <div key={act.id} className="flex items-center justify-between text-[10px] p-1.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-100 dark:border-white/5">
                <div className="flex items-center gap-2 truncate">
                  <span className="px-1.5 py-0.5 rounded text-[8px] uppercase font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">Added</span>
                  <span className="text-slate-600 dark:text-slate-300 font-medium truncate">{act.count} Qs to {act.subtopic}</span>
                </div>
                <span className="text-slate-400 font-mono shrink-0 ml-2">
                  {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Tab Selectors */}
      <div className="flex gap-2 p-1.5 bg-slate-100/80 dark:bg-[#161A1D]/80 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-xl overflow-x-auto hide-scrollbar justify-center">
        <button
          onClick={() => {
            setActiveTab('upload');
            setSuccessCount(0);
          }}
          title="Subject Upload"
          className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer font-bold text-xs ${activeTab === 'upload' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          <Icons.Upload className={`w-4 h-4 ${activeTab === 'upload' ? 'text-indigo-200' : 'text-emerald-500'}`} />
          <span>Subject Upload</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('upload_mock');
            setSuccessCount(0);
          }}
          title="Upload Full Mock"
          className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer font-bold text-xs ${activeTab === 'upload_mock' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          <Icons.FileArchive className={`w-4 h-4 ${activeTab === 'upload_mock' ? 'text-indigo-200' : 'text-rose-500'}`} />
          <span>Mock Upload</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('manage_exams');
            setSuccessCount(0);
          }}
          title="Configure Exams & Rules"
          className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer font-bold text-xs ${activeTab === 'manage_exams' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          <Icons.Sliders className={`w-4 h-4 ${activeTab === 'manage_exams' ? 'text-indigo-200' : 'text-amber-500'}`} />
          <span>Exams & Rules</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('db_management');
            setSuccessCount(0);
          }}
          title="DB Status & Quota Recovery Hub"
          className={`px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer font-bold text-xs relative ${activeTab === 'db_management' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200'}`}
        >
          <Icons.Database className={`w-4 h-4 ${activeTab === 'db_management' ? 'text-indigo-200' : 'text-indigo-500'}`} />
          <span>DB & Quotas</span>
          {isBypassed && (
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full animate-pulse border border-white dark:border-[#121212]" />
          )}
        </button>
      </div>

      {isUploading && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-3 text-xs shadow-inner">
          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            <span className="flex items-center gap-2">
              <Icons.Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              Batch Upload Active (Max 200 per sync)
            </span>
            <span className="font-mono text-xs">{uploadCurrent} / {uploadTotal} ({uploadProgress}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-white/10 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 dark:text-slate-400">
            <span>DB ID: <span className="text-indigo-400 font-bold">{firebaseConfig.firestoreDatabaseId === '(default)' ? firebaseConfig.projectId : firebaseConfig.firestoreDatabaseId}</span></span>
            <span>Batch Progress</span>
          </div>
        </div>
      )}

      {successCount > 0 && !isUploading && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl flex items-start gap-2.5 text-emerald-700 dark:text-emerald-300">
          <Icons.CheckCircle className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
          <div className="text-[11px]">
            <span className="font-extrabold">Operation Successful! {successCount} MCQs Added Live</span>
            <p className="text-slate-600 dark:text-slate-350 text-[10px] mt-0.5 leading-relaxed">
              Questions have been parsed, categorized under <span className="font-bold">{selectedSubject}</span>, and fully synchronized in live Firebase data! All student dashboards are updated.
            </p>
          </div>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/25 rounded-xl flex items-start gap-2.5 text-rose-700 dark:text-rose-300">
          <Icons.AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
          <div className="text-[11px] w-full">
            <span className="font-extrabold">Operation Aborted</span>
            <p className="text-slate-600 dark:text-slate-350 text-[10px] mt-0.5 leading-relaxed mb-2">{errorMsg}</p>
            {syncFailed && (
              <div className="flex items-center justify-between border-t border-rose-500/20 pt-2 mt-2">
                <span className="font-mono text-[10px]">Remaining: {uploadTotal - uploadCurrent} / {uploadTotal} questions to sync</span>
                <button 
                  onClick={handleResumeSync}
                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded shadow-sm flex items-center gap-1.5 transition-colors"
                >
                  <Icons.Play className="w-3 h-3" /> Resume Sync
                </button>
              </div>
            )}
          </div>
        </div>
      )}


      {/* TAB A: UPLOAD QUESTIONS */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          
          {/* Target Attributes Selector Block */}
          <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-extrabold tracking-wider uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5 leading-none font-mono">
              <Icons.Tag className="w-3.5 h-3.5 text-indigo-500" />
              1. BOARD & CATEGORIZATION PARAMETERS
            </h3>

            {/* Step 1: Select Board & Scope */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pb-3 border-b border-slate-200 dark:border-white/5">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Select Board</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedBoard('dsssb')}
                    className={`flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all ${selectedBoard === 'dsssb' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Delhi (DSSSB)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBoard('rssb')}
                    className={`flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all ${selectedBoard === 'rssb' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Raj (RSSB)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedBoard('rpsc')}
                    className={`flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all ${selectedBoard === 'rpsc' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Raj (RPSC)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Upload Target Scope</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadScope('exam_specific')}
                    className={`flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all ${uploadScope === 'exam_specific' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Exam Specific
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadScope('board_common')}
                    className={`flex-1 py-2 px-3 rounded-lg border font-bold text-xs transition-all ${uploadScope === 'board_common' ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                  >
                    Common Syllabus
                  </button>
                </div>
              </div>
            </div>

            {/* Step 2: Subject, Topic, Subtopic Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">
                  {uploadScope === 'board_common' ? 'Target Board Bank' : 'Target Exam'}
                </label>
                {uploadScope === 'board_common' ? (
                  <div className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-300 font-bold font-mono">
                    {selectedBoard.toUpperCase()} (Common Syllabus)
                  </div>
                ) : (
                  <select 
                    value={selectedExam}
                    onChange={(e) => setSelectedExam(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {(BOARD_EXAMS[selectedBoard] || []).map(ex => (
                      <option key={ex.id} value={ex.id}>{ex.name}</option>
                    ))}
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Subject Classification</label>
                <select
                  value={selectedSubject}
                  onChange={(e) => setSelectedSubject(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-250 outline-none focus:border-indigo-500"
                >
                  {activeSubjects.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Topic Classification</label>
                <select
                  value={selectedTopic}
                  onChange={(e) => setSelectedTopic(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-250 outline-none focus:border-indigo-500"
                >
                  {activeTopics.map(top => <option key={top} value={top}>{top}</option>)}
                  {activeTopics.length === 0 && <option value="">No Topics Configured</option>}
                </select>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-white/5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono">Assign Subtopic Division (Optional)</span>
                <button 
                  type="button"
                  onClick={() => setUseCustomSubtopic(!useCustomSubtopic)}
                  className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 flex items-center gap-1 transition-colors"
                >
                  {useCustomSubtopic ? <Icons.ToggleLeft className="w-5 h-5 text-indigo-500" /> : <Icons.ToggleRight className="w-5 h-5 text-slate-550" />}
                  {useCustomSubtopic ? 'Select From List' : 'Type Custom Subtopic'}
                </button>
              </div>

              {useCustomSubtopic ? (
                <div className="relative">
                  <Icons.Plus className="absolute left-2.5 top-2.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="text"
                    placeholder="Type custom subtopic or leave blank for Subject-level..."
                    value={customSubtopic}
                    onChange={(e) => setCustomSubtopic(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg pl-9 pr-3 py-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-xs"
                  />
                </div>
              ) : (
                <select
                  value={selectedSubtopic}
                  onChange={(e) => setSelectedSubtopic(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="">-- No Subtopic (Associate directly with Subject) --</option>
                  {activeSubtopics.map((sub, idx) => <option key={idx} value={sub}>{sub}</option>)}
                  {activeSubtopics.length === 0 && <option value="General Theory">General Theory (Default)</option>}
                </select>
              )}
            </div>

            <div className="mt-3.5 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-3 flex items-start gap-2.5">
              <Icons.Sparkles className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-350">
                <span className="font-extrabold text-indigo-600 dark:text-indigo-400">System Intelligence Enabled:</span>
                {" "}If you upload a grouped JSON file where the keys are subject names (e.g. <code className="px-1 py-0.5 bg-indigo-500/10 rounded font-mono text-indigo-500 text-[9px]">"General intelligence and Reasoning Ability"</code>), the system will intelligently auto-map each section's questions to the correct normalized subject (Reasoning, Math, Hindi, etc.) and assign any inline subtopics, completely overriding manual dropdown choices!
              </div>
            </div>
          </div>

          {/* Drag and drop zone */}
          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-550 font-mono tracking-wider">
              2. SOURCE LOADING CHANNEL
            </h3>

            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${dragActive ? 'border-indigo-500 bg-indigo-500/10' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.01] hover:bg-slate-100'}`}
              onClick={() => document.getElementById('file-uploader-field')?.click()}
            >
              <input 
                type="file" 
                id="file-uploader-field" 
                className="hidden" 
                accept=".json,.html,.htm,.txt"
                multiple
                onChange={handleFileInput}
              />
              <Icons.UploadCloud className="w-7 h-7 text-indigo-500 dark:text-indigo-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-350 text-center">
                {fileNames.length > 0 
                  ? `${fileNames.length} file${fileNames.length > 1 ? 's' : ''} selected: ${fileNames.slice(0, 3).join(', ')}${fileNames.length > 3 ? '...' : ''}` 
                  : "Drag & drop files or click to upload (Up to 20 files)"}
              </span>
              <p className="text-[9.5px] text-slate-500 leading-normal max-w-xs font-mono text-center">
                Supports multiple JSON files, processed HTML structures, or sequential plain TXT. (Max 20 files in one row)
              </p>
            </div>
          </div>

          {/* Parsing progress spinner / bar */}
          {isParsing && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-3 shadow-md animate-pulse">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Icons.RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span className="text-xs font-black tracking-wide uppercase">Reading and parsing questions...</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>Progress</span>
                  <span className="font-bold">{parsingProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${parsingProgress}%` }}></div>
                </div>
                <p className="text-[9.5px] text-slate-500 font-mono">Please don't close this tab while we split and extract thousands of questions smoothly.</p>
              </div>
            </div>
          )}

          {/* Verification modal / actions */}
          {parsedQuestions.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3.5 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <Icons.Eye className="w-4 h-4 animate-pulse shrink-0" />
                    <span className="text-xs font-black tracking-wide uppercase">Loaded verification ({parsedQuestions.length} Qs pending)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Target database: <span className="font-bold text-amber-500">{firebaseConfig.firestoreDatabaseId === '(default)' ? firebaseConfig.projectId : firebaseConfig.firestoreDatabaseId}</span>
                  </div>
                  {parsedQuestions.length > 20 && (
                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold font-mono">
                      * Showing first 20 of {parsedQuestions.length} parsed questions for preview safety.
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={handleCommitParsedQuestions}
                    disabled={isUploading}
                    className="py-1.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer border border-white/10"
                  >
                    {parsedQuestions.length > 1000 ? 'Sync Next 1000 Questions' : `Sync Final ${parsedQuestions.length} Questions`}
                  </button>
                  {parsedQuestions.length > 1000 && (
                    <span className="text-[9px] text-amber-400 font-mono">
                      {parsedQuestions.length - 1000} questions will be left to sync manually
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {parsedQuestions.slice(0, 20).map((q, idx) => (
                  <div key={idx} className="bg-white dark:bg-black/25 rounded-xl p-3 text-xs space-y-2 border border-slate-200 dark:border-white/5">
                    <p className="font-bold text-slate-900 dark:text-slate-200">Q{idx + 1} ({q.topic}): {q.text}</p>
                    <div className="grid grid-cols-2 gap-1.5 pl-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className={`p-1.5 rounded text-[10px] truncate border ${oIdx === q.correctIndex ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-semibold' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 text-slate-500'}`}>
                          {String.fromCharCode(65 + oIdx)}: {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}


      {/* TAB A2: UPLOAD MOCK (PYQ) */}
      {activeTab === 'upload_mock' && (
        <div className="space-y-4">
          <div className="bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-extrabold tracking-wider uppercase text-slate-500 dark:text-slate-400 flex items-center gap-1.5 leading-none font-mono">
              <Icons.Tag className="w-3.5 h-3.5 text-indigo-500" />
              1. MOCK / PYQ CLASSIFICATION
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Target Exam</label>
                <select 
                  value={selectedExam}
                  onChange={(e) => setSelectedExam(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                >
                  {examsConfig.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-[9.5px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">Mock Title (e.g. PYQ 2021)</label>
                <input 
                  type="text"
                  placeholder="PYQ 2021 Shift 1"
                  value={mockTitle}
                  onChange={(e) => setMockTitle(e.target.value)}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500"
                />
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-normal font-mono mt-2">
              Note: Uploading a full mock will automatically distribute questions to subjects ({activeExamConfig?.subjects.map(s => s.name).join(', ')}) based on the exam's blueprint rules.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-black uppercase text-slate-550 font-mono tracking-wider">
              2. SOURCE LOADING CHANNEL
            </h3>

            <div 
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-5 text-center transition-all flex flex-col items-center justify-center gap-2 cursor-pointer ${dragActive ? 'border-rose-500 bg-rose-500/10' : 'border-slate-300 dark:border-white/10 bg-slate-50 dark:bg-white/[0.01] hover:bg-slate-100'}`}
              onClick={() => document.getElementById('file-uploader-field')?.click()}
            >
              <input 
                type="file" 
                id="file-uploader-field" 
                className="hidden" 
                accept=".json,.html,.htm,.txt"
                multiple
                onChange={handleFileInput}
              />
              <Icons.FileArchive className="w-7 h-7 text-rose-500 dark:text-rose-400 animate-pulse" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-350 text-center">
                {fileNames.length > 0 
                  ? `${fileNames.length} file${fileNames.length > 1 ? 's' : ''} selected: ${fileNames.slice(0, 3).join(', ')}${fileNames.length > 3 ? '...' : ''}` 
                  : "Drag & drop files or click to upload full mock"}
              </span>
              <p className="text-[9.5px] text-slate-500 leading-normal max-w-xs font-mono text-center">
                Upload a JSON or TXT file containing {activeExamConfig?.rules.numQuestions || 100} questions in sequence.
              </p>
            </div>
          </div>

          {/* Parsing progress spinner / bar */}
          {isParsing && (
            <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 space-y-3 shadow-md animate-pulse">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Icons.RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span className="text-xs font-black tracking-wide uppercase">Reading and parsing questions...</span>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  <span>Progress</span>
                  <span className="font-bold">{parsingProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${parsingProgress}%` }}></div>
                </div>
                <p className="text-[9.5px] text-slate-500 font-mono">Please don't close this tab while we split and extract thousands of questions smoothly.</p>
              </div>
            </div>
          )}

          {/* Verification modal / actions */}
          {parsedQuestions.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3.5 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <Icons.Eye className="w-4 h-4 animate-pulse shrink-0" />
                    <span className="text-xs font-black tracking-wide uppercase">Loaded verification ({parsedQuestions.length} Qs pending)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Target database: <span className="font-bold text-amber-500">{firebaseConfig.firestoreDatabaseId === '(default)' ? firebaseConfig.projectId : firebaseConfig.firestoreDatabaseId}</span>
                  </div>
                  {parsedQuestions.length > 20 && (
                    <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold font-mono">
                      * Showing first 20 of {parsedQuestions.length} parsed questions for preview safety.
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={handleCommitParsedQuestions}
                    disabled={isUploading}
                    className="py-1.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer border border-white/10"
                  >
                    {parsedQuestions.length > 1000 ? 'Sync Next 1000 Questions' : `Sync Final ${parsedQuestions.length} Questions`}
                  </button>
                  {parsedQuestions.length > 1000 && (
                    <span className="text-[9px] text-amber-400 font-mono">
                      {parsedQuestions.length - 1000} questions will be left to sync manually
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {parsedQuestions.slice(0, 20).map((q, idx) => (
                  <div key={idx} className="bg-white dark:bg-black/25 rounded-xl p-3 text-xs space-y-2 border border-slate-200 dark:border-white/5">
                    <p className="font-bold text-slate-900 dark:text-slate-200">Q{idx + 1} ({q.topic}): {q.text}</p>
                    <div className="grid grid-cols-2 gap-1.5 pl-2">
                      {q.options.map((opt, oIdx) => (
                        <div key={oIdx} className={`p-1.5 rounded text-[10px] truncate border ${oIdx === q.correctIndex ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-300 font-semibold' : 'bg-slate-50 dark:bg-white/[0.02] border-slate-200 dark:border-white/5 text-slate-500'}`}>
                          {String.fromCharCode(65 + oIdx)}: {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      )}

      {/* TAB B: CONFIGURE EXAMS & RULES */}
      {activeTab === 'manage_exams' && (
        <div className="space-y-4">
          
          {/* Pick Exam context */}
          <div className="p-4 bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 rounded-2xl space-y-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5 uppercase font-mono">1. Select Target Exam Context</label>
              <select
                value={editingExamId}
                onChange={(e) => setEditingExamId(e.target.value)}
                className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2.5 text-slate-800 dark:text-slate-250 outline-none focus:border-indigo-500 font-bold"
              >
                {examsConfig.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
              </select>
            </div>

            {targetExamConfig && (
              <div className="p-3 bg-indigo-500/5 rounded-xl space-y-2 text-[10.5px] border border-indigo-500/10 leading-normal text-slate-600 dark:text-slate-350">
                <p>⚡ Editing <strong>{targetExamConfig.name}</strong> properties. This updates rules for mock tests, time allocation, scoring rules, and syllabus curriculum subjects mapping.</p>
              </div>
            )}
          </div>

          {/* Edit Rules Block */}
          <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
              <Icons.ShieldAlert className="w-4 h-4 text-amber-500" />
              2. EXAM SIMULATION RULES
            </h3>

            <div className="grid grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1 uppercase font-bold">Total Qs</label>
                <input 
                  type="number"
                  value={editFormNumQuestions}
                  onChange={(e) => setEditFormNumQuestions(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1 uppercase font-bold">Time (Mins)</label>
                <input 
                  type="number"
                  value={editFormTime}
                  onChange={(e) => setEditFormTime(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1 uppercase font-bold">Target Score</label>
                <input 
                  type="number"
                  value={editFormTargetScore}
                  onChange={(e) => setEditFormTargetScore(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>

              <div>
                <label className="block text-[9px] font-mono text-slate-400 mb-1 uppercase font-bold">Negative Mark</label>
                <input 
                  type="number"
                  step="0.01"
                  value={editFormNegative}
                  onChange={(e) => setEditFormNegative(Number(e.target.value))}
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 text-center font-bold"
                />
              </div>
            </div>

            {/* Target Exam Date Input */}
            <div className="p-3 bg-white dark:bg-black/10 border border-slate-200/50 dark:border-white/5 rounded-xl space-y-1">
              <label className="block text-[9px] font-mono text-indigo-600 dark:text-indigo-400 uppercase font-black tracking-wider">Target Exam Date (For Days Left Countdown)</label>
              <input 
                type="date"
                value={editFormTargetDate}
                onChange={(e) => setEditFormTargetDate(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 font-bold cursor-pointer"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-medium">Updates the "Days Left" countdown dynamic widget on the student's primary dashboard instantly.</p>
            </div>

            {/* Subject allotments section */}
            {targetExamConfig && (
              <div className="pt-3 border-t border-slate-200 dark:border-white/5 space-y-2">
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-450 uppercase font-mono block mb-1">Subject Question Allotment</span>
                
                <div className="grid grid-cols-2 gap-2 max-h-[140px] overflow-y-auto pr-1">
                  {targetExamConfig.subjects.map((sub, sIdx) => {
                    const val = subjectAllotments[sub.name] || 0;
                    return (
                      <div key={sIdx} className="flex items-center justify-between p-2 bg-white dark:bg-black/20 rounded-lg border border-slate-200 dark:border-white/5">
                        <span className="text-[10.5px] font-bold truncate max-w-[110px] text-slate-700 dark:text-slate-300">{sub.name}</span>
                        <input
                          type="number"
                          value={val}
                          onChange={(e) => handleAllotmentChange(sub.name, Number(e.target.value))}
                          className="w-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-1 text-slate-800 dark:text-slate-200 text-center font-bold text-[10.5px]"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              onClick={handleUpdateExamRules}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase shadow active:scale-95 transition-all cursor-pointer"
            >
              Update Rules & Allotments
            </button>
          </div>

          {/* Edit Syllabus Hierarchy (Subjects & topics) */}
          <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-4 space-y-3.5">
            <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
              <Icons.FolderOpen className="w-4 h-4 text-indigo-500" />
              3. CURRICULUM SYLLABUS WRITER
            </h3>

            {/* Sub-form A: Add New Subject */}
            <div className="p-3 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl space-y-2">
              <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase font-mono block">Add New Main Subject</span>
              <div className="flex gap-2">
                <input 
                  type="text"
                  placeholder="Subject name... (e.g., General Studies)"
                  value={newSubjectName}
                  onChange={(e) => setNewSubjectName(e.target.value)}
                  className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-250"
                />
                <button
                  onClick={handleAddSubject}
                  className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs cursor-pointer shrink-0"
                >
                  Add Subject
                </button>
              </div>
            </div>

            {/* Sub-form B: Add topic with subtopics CSV */}
            {targetExamConfig && targetExamConfig.subjects.length > 0 && (
              <div className="p-3 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl space-y-2.5">
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase font-mono block">Create Core Chapters under Subject</span>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <label className="block text-[9px] text-slate-400 mb-1 uppercase font-bold">Target Subject</label>
                    <select
                      value={targetSubjectForTopic}
                      onChange={(e) => setTargetSubjectForTopic(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-1.5 text-slate-800 dark:text-slate-250 outline-none"
                    >
                      {targetExamConfig.subjects.map((s, idx) => <option key={idx} value={s.name}>{s.name}</option>)}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] text-slate-400 mb-1 uppercase font-bold">Chapter Topic Name</label>
                    <input 
                      type="text"
                      placeholder="e.g. Memory Management"
                      value={newTopicName}
                      onChange={(e) => setNewTopicName(e.target.value)}
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-1.5 text-slate-800 dark:text-slate-250 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[9px] text-slate-400 mb-1 uppercase font-bold">Sub-Unit Divisions (comma separated list)</label>
                  <input 
                    type="text"
                    placeholder="e.g. Volatile RAM, Virtual Storage, Cache blue, Page Faults"
                    value={newSubtopicCSV}
                    onChange={(e) => setNewSubtopicCSV(e.target.value)}
                    className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-2 text-slate-800 dark:text-slate-250 text-xs outline-none focus:border-indigo-500"
                  />
                </div>

                <button
                  onClick={handleAddTopic}
                  className="w-full py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs cursor-pointer"
                >
                  Deploy Chapter Topics
                </button>
              </div>
            )}

          </div>

          {/* Section 4: INTERACTIVE CURRICULUM TREE & DIRECT SYLLABUS EDITOR */}
          {targetExamConfig && targetExamConfig.subjects.length > 0 && (
            <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-4 space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5">
                <Icons.Layers className="w-4 h-4 text-emerald-500" />
                4. INTERACTIVE CURRICULUM TREE & DIRECT SYLLABUS EDITOR
              </h3>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-normal font-medium -mt-1">
                Manage your syllabus directly! Double-click or use the action buttons to edit, rename, delete, or append subjects, chapters, and sub-units. Changes are instantly pushed to Firestore.
              </p>

              <div className="space-y-4">
                {targetExamConfig.subjects.map((subj) => {
                  const isEditingSubject = editingSubjectName === subj.name;
                  
                  return (
                    <div 
                      key={subj.name} 
                      className="p-4 bg-white dark:bg-black/20 border border-slate-200 dark:border-white/5 rounded-xl space-y-3"
                    >
                      {/* Subject Row */}
                      <div className="flex items-center justify-between border-b border-slate-100 dark:border-white/5 pb-2.5">
                        {isEditingSubject ? (
                          <div className="flex items-center gap-1.5 flex-1 max-w-xs sm:max-w-md">
                            <input
                              type="text"
                              value={newSubjectRenameVal}
                              onChange={(e) => setNewSubjectRenameVal(e.target.value)}
                              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-white/10 rounded px-2 py-1 text-xs outline-none focus:border-indigo-500 font-bold text-slate-800 dark:text-slate-100"
                              placeholder="Rename subject..."
                              autoFocus
                            />
                            <button
                              onClick={() => handleEditSubject(subj.name)}
                              className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[10px] uppercase tracking-wider cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => {
                                setEditingSubjectName(null);
                                setNewSubjectRenameVal('');
                              }}
                              className="px-2 py-1 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[10px] cursor-pointer text-slate-850 dark:text-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Icons.BookOpen className="w-4 h-4 text-indigo-500" />
                            <span className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-tight">
                              {subj.name}
                            </span>
                            <span className="text-[8px] font-mono text-slate-400 dark:text-slate-500 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-white/5 font-bold">
                              {subj.topics.length} Chapters
                            </span>
                          </div>
                        )}

                        {!isEditingSubject && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setEditingSubjectName(subj.name);
                                setNewSubjectRenameVal(subj.name);
                              }}
                              title="Rename Subject"
                              className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-450 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                            >
                              <Icons.Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete subject "${subj.name}"? This will delete all its chapters, subtopics, and references!`)) {
                                  handleDeleteSubject(subj.name);
                                }
                              }}
                              title="Delete Subject"
                              className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                            >
                              <Icons.Trash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Chapters / Topics */}
                      {subj.topics.length === 0 ? (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 italic py-1">No chapters defined. Deploy chapters above.</p>
                      ) : (
                        <div className="pl-2.5 border-l-2 border-slate-100 dark:border-white/5 space-y-4">
                          {subj.topics.map((topic) => {
                            const isEditingTopic = editingTopicPath?.subjectName === subj.name && editingTopicPath?.topicName === topic.name;
                            const inlineSubtopicKey = `${subj.name}-${topic.name}`;
                            const subtopicInputValue = newSubtopicInputVal[inlineSubtopicKey] || '';

                            return (
                              <div key={topic.name} className="space-y-2">
                                {/* Topic Header */}
                                <div className="flex items-center justify-between group">
                                  {isEditingTopic ? (
                                    <div className="flex items-center gap-1.5 flex-1 max-w-xs sm:max-w-md">
                                      <input
                                        type="text"
                                        value={newTopicRenameVal}
                                        onChange={(e) => setNewTopicRenameVal(e.target.value)}
                                        className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-250 dark:border-white/10 rounded px-2 py-0.5 text-[11px] outline-none focus:border-indigo-500 font-bold text-slate-850 dark:text-slate-100"
                                        placeholder="Rename chapter..."
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleEditTopic(subj.name, topic.name)}
                                        className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded text-[9px] uppercase tracking-wider cursor-pointer"
                                      >
                                        Save
                                      </button>
                                      <button
                                        onClick={() => {
                                          setEditingTopicPath(null);
                                          setNewTopicRenameVal('');
                                        }}
                                        className="px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 rounded text-[9px] cursor-pointer text-slate-850 dark:text-slate-300"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-1.5">
                                      <Icons.FolderOpen className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                                      <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                                        {topic.name}
                                      </span>
                                    </div>
                                  )}

                                  {!isEditingTopic && (
                                    <div className="flex items-center gap-0.5 opacity-40 group-hover:opacity-100 transition-opacity">
                                      <button
                                        onClick={() => {
                                          setEditingTopicPath({ subjectName: subj.name, topicName: topic.name });
                                          setNewTopicRenameVal(topic.name);
                                        }}
                                        title="Rename Chapter"
                                        className="p-1 rounded hover:bg-slate-100 dark:hover:bg-white/5 text-slate-500 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                                      >
                                        <Icons.Edit className="w-3 h-3" />
                                      </button>
                                      <button
                                        onClick={() => {
                                          if (confirm(`Are you sure you want to delete chapter "${topic.name}"?`)) {
                                            handleDeleteTopic(subj.name, topic.name);
                                          }
                                        }}
                                        title="Delete Chapter"
                                        className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-500/10 text-rose-500 cursor-pointer"
                                      >
                                        <Icons.Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {/* Subtopics Grid/Pills */}
                                <div className="pl-5 flex flex-wrap items-center gap-1.5">
                                  {topic.subtopics.map((subtopic) => {
                                    const isEditingSub = editingSubtopicPath?.subjectName === subj.name && 
                                      editingSubtopicPath?.topicName === topic.name && 
                                      editingSubtopicPath?.subtopicName === subtopic;
                                    
                                    if (isEditingSub) {
                                      return (
                                        <div key={subtopic} className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 border border-indigo-500/30 rounded px-1.5 py-0.5 text-[10px]">
                                          <input
                                            type="text"
                                            value={newSubtopicRenameVal}
                                            onChange={(e) => setNewSubtopicRenameVal(e.target.value)}
                                            className="bg-transparent text-[10px] outline-none font-bold w-24 text-slate-850 dark:text-slate-100"
                                            autoFocus
                                          />
                                          <button
                                            onClick={() => handleEditSubtopic(subj.name, topic.name, subtopic)}
                                            className="text-[10px] text-emerald-500 font-bold hover:text-emerald-400 cursor-pointer"
                                          >
                                            ✓
                                          </button>
                                          <button
                                            onClick={() => {
                                              setEditingSubtopicPath(null);
                                              setNewSubtopicRenameVal('');
                                            }}
                                            className="text-[10px] text-slate-450 font-bold hover:text-slate-300 cursor-pointer"
                                          >
                                            ✕
                                          </button>
                                        </div>
                                      );
                                    }

                                    return (
                                      <div 
                                        key={subtopic}
                                        className="group/sub inline-flex items-center gap-1 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-full px-2.5 py-0.5 text-[10px] text-slate-650 dark:text-slate-350 hover:border-slate-300 dark:hover:border-white/10 transition-colors"
                                      >
                                        <span 
                                          onDoubleClick={() => {
                                            setEditingSubtopicPath({ subjectName: subj.name, topicName: topic.name, subtopicName: subtopic });
                                            setNewSubtopicRenameVal(subtopic);
                                          }}
                                          title="Double-click to Rename" 
                                          className="cursor-pointer select-none font-medium"
                                        >
                                          {subtopic}
                                        </span>
                                        <button
                                          onClick={() => handleDeleteSubtopic(subj.name, topic.name, subtopic)}
                                          className="w-3.5 h-3.5 rounded-full flex items-center justify-center bg-transparent group-hover/sub:bg-rose-500/10 text-slate-400 group-hover/sub:text-rose-500 cursor-pointer transition-colors text-[8px]"
                                          title="Remove Sub-Unit"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    );
                                  })}

                                  {/* Add Single Subtopic Inline Input */}
                                  <div className="inline-flex items-center gap-1.5 bg-indigo-500/[0.02] border border-indigo-500/10 rounded-full px-2 py-0.5 text-[10px]">
                                    <input
                                      type="text"
                                      value={subtopicInputValue}
                                      onChange={(e) => setNewSubtopicInputVal(prev => ({ ...prev, [inlineSubtopicKey]: e.target.value }))}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          handleAddSubtopicInline(subj.name, topic.name);
                                        }
                                      }}
                                      placeholder="+ Add sub-unit..."
                                      className="bg-transparent border-none outline-none text-[10px] w-20 text-slate-600 dark:text-slate-300 placeholder-slate-400 dark:placeholder-slate-500 font-bold"
                                    />
                                    {subtopicInputValue.trim() !== '' && (
                                      <button
                                        onClick={() => handleAddSubtopicInline(subj.name, topic.name)}
                                        className="text-[10px] text-indigo-500 hover:text-indigo-400 font-black cursor-pointer"
                                      >
                                        +
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      )}

      {activeTab === 'db_management' && (
        <div className="space-y-6 animate-fade-in text-slate-800 dark:text-slate-200">
          {/* Header Description */}
          <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-5 space-y-2">
            <h2 className="text-sm font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wider font-mono flex items-center gap-2">
              <Icons.ShieldAlert className="w-5 h-5 text-indigo-500" />
              Firestore Quota & Recovery Hub
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-350 leading-relaxed">
              Monitor cloud database operations in real-time, configure smart safeguards for Firestore quota limits, and download or restore complete system backups directly from this recovery console.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Live Operations Stats */}
            <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-200 dark:border-white/5 pb-2">
                <Icons.Activity className="w-4 h-4 text-emerald-500" />
                Live Session Operations
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-black/20 border border-slate-150 dark:border-white/5 p-4 rounded-xl text-center space-y-1 shadow-sm">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Document Reads</span>
                  <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                    {dbStats.reads.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">Quota limit: 50,000/day</div>
                </div>

                <div className="bg-white dark:bg-black/20 border border-slate-150 dark:border-white/5 p-4 rounded-xl text-center space-y-1 shadow-sm">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Document Writes</span>
                  <div className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono">
                    {dbStats.writes.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono">Quota limit: 20,000/day</div>
                </div>
              </div>

              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-500/5 rounded-xl flex items-start gap-2.5 text-[11px] text-indigo-800 dark:text-indigo-250 border border-indigo-100/50 dark:border-indigo-500/10">
                <Icons.Info className="w-4 h-4 shrink-0 text-indigo-500 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">Optimization Engaged</p>
                  <p className="text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
                    Questions are packed in compressed bundle documents (up to 1000 items each) to keep operations low and avoid daily Google Cloud Firestore free-tier quota exhaustions.
                  </p>
                </div>
              </div>

              <button
                onClick={() => dbMonitor.reset()}
                className="w-full py-2 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-700 dark:text-slate-200 font-bold rounded-lg text-xs tracking-wide transition-all cursor-pointer"
              >
                Reset Session Counters
              </button>
            </div>

            {/* Smart Quota Exhaust Safeguard */}
            <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-5 space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-200 dark:border-white/5 pb-2">
                <Icons.ZapOff className="w-4 h-4 text-rose-500" />
                Offline Safeguard & Bypass
              </h3>

              <div className="flex items-center justify-between p-3.5 bg-white dark:bg-black/25 border border-slate-200 dark:border-white/5 rounded-xl">
                <div className="space-y-1 pr-4">
                  <span className="text-[11px] font-black text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    Mute / Bypass Cloud Sync
                    {isBypassed && <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[8px] font-black uppercase rounded animate-pulse">Offline</span>}
                  </span>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    Turn this on when Firestore daily quotas are exhausted. Suspends outgoing API calls and forces the client to operate strictly locally in offline IndexedDB mode.
                  </p>
                </div>
                <div className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={isBypassed}
                    onChange={(e) => {
                      dbMonitor.setBypass(e.target.checked);
                      logAdminActivity({
                        action: 'edited',
                        exam: 'System',
                        subject: 'Database Safeguard',
                        subtopic: e.target.checked ? 'Enable Bypass' : 'Disable Bypass',
                        count: 1
                      });
                    }}
                    className="sr-only peer"
                    id="offline-safeguard-toggle"
                  />
                  <div className="w-10 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-800 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-rose-500"></div>
                </div>
              </div>

              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-350 rounded-xl flex gap-2.5 text-[10px] leading-relaxed">
                <Icons.AlertTriangle className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <p>
                  <strong>Admin Notice:</strong> In bypass mode, test practice, bookmarks, and wrong answers are saved safely on this device via LocalStorage/IndexedDB. You can restore cloud sync anytime when your quota resets.
                </p>
              </div>
            </div>
          </div>

          {/* Backup & Restore Panel */}
          <div className="bg-slate-50 dark:bg-white/[0.015] border border-slate-200 dark:border-white/5 rounded-2xl p-5 space-y-5">
            <h3 className="text-xs font-black uppercase text-slate-550 dark:text-slate-400 tracking-wider font-mono flex items-center gap-1.5 border-b border-slate-200 dark:border-white/5 pb-2">
              <Icons.FolderSync className="w-4 h-4 text-indigo-500" />
              Backup & Disaster Restore Tool
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Export Backup Card */}
              <div className="bg-white dark:bg-black/25 border border-slate-200 dark:border-white/5 rounded-xl p-4.5 space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Icons.DownloadCloud className="w-4 h-4 text-indigo-500" />
                    1. Generate System Backup
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    Compiles the entire set of local and cloud-synced questions cached in your device's IndexedDB into a single JSON file. Extremely safe to store as a local security backup.
                  </p>
                </div>

                <div className="space-y-2 pt-3">
                  {backupMessage && (
                    <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 bg-indigo-500/5 p-2 rounded-lg border border-indigo-500/10">
                      {backupMessage}
                    </p>
                  )}
                  <button
                    onClick={handleBackupExport}
                    disabled={isBackupExporting}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs uppercase tracking-wide shadow flex items-center justify-center gap-2 transition-all cursor-pointer"
                  >
                    {isBackupExporting ? (
                      <>
                        <Icons.Loader2 className="w-4 h-4 animate-spin" />
                        Generating Backup...
                      </>
                    ) : (
                      <>
                        <Icons.Download className="w-4 h-4" />
                        Download JSON Backup
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Import & Restore Card */}
              <div className="bg-white dark:bg-black/25 border border-slate-200 dark:border-white/5 rounded-xl p-4.5 space-y-4 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                    <Icons.UploadCloud className="w-4 h-4 text-amber-500" />
                    2. Import & Restore Backup
                  </h4>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-normal">
                    Restore the question database from a previously downloaded JSON file. You can choose whether to restore locally, or write the data directly back onto the cloud servers!
                  </p>
                </div>

                <div className="space-y-3.5 pt-1">
                  {/* Target Selector */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div>
                      <label className="block text-slate-400 mb-1 font-bold uppercase">Restore Destination</label>
                      <select
                        value={restoreType}
                        onChange={(e) => setRestoreType(e.target.value as 'local' | 'cloud')}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-1.5 text-slate-800 dark:text-slate-200 outline-none"
                      >
                        <option value="local">Local IndexedDB Only (No Quota Cost)</option>
                        <option value="cloud">Cloud Firestore (Restore server bank)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-400 mb-1 font-bold uppercase">Conflict Handling</label>
                      <select
                        value={overwriteOnRestore ? 'overwrite' : 'append'}
                        onChange={(e) => setOverwriteOnRestore(e.target.value === 'overwrite')}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded p-1.5 text-slate-800 dark:text-slate-200 outline-none"
                      >
                        <option value="append">Merge & Append (Keep Existing)</option>
                        <option value="overwrite">Overwrite / Erase & Replace</option>
                      </select>
                    </div>
                  </div>

                  {/* Drag-and-drop / select File */}
                  <div className="relative border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition-all">
                    <input
                      type="file"
                      accept=".json"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleBackupRestore(file);
                      }}
                      disabled={isRestoring}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    <div className="space-y-1">
                      <Icons.FileJson className="w-8 h-8 text-slate-400 dark:text-slate-500 mx-auto" />
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-350 block">
                        {isRestoring ? 'Restoring in progress...' : 'Select JSON Backup File'}
                      </span>
                      <span className="text-[9px] text-slate-400 block">Drag & drop or browse device</span>
                    </div>
                  </div>

                  {restoreMessage && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-mono text-amber-600 dark:text-amber-400 bg-amber-500/5 p-2 rounded-lg border border-amber-500/10 whitespace-pre-wrap">
                        {restoreMessage}
                      </p>
                      {isRestoring && (
                        <div className="w-full bg-slate-200 dark:bg-white/10 h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-amber-500 h-full rounded-full transition-all duration-300"
                            style={{ width: `${restoreProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
