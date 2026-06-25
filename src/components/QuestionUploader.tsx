/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Question, ExamConfig, ExamSubject, ExamRule } from '../types';
import { saveCustomQuestions, getExamsConfig, saveExamsConfig, getAllQuestions } from '../lib/storage';
import { uploadQuestionsInChunks } from '../lib/questionSync';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';

interface QuestionUploaderProps {
  onBack: () => void;
  onQuestionsSaved: () => void;
  currentUser: any;
  onLockAdmin?: () => void;
}

export default function QuestionUploader({ onBack, onQuestionsSaved, currentUser, onLockAdmin }: QuestionUploaderProps) {
  // Tabs: 'upload' or 'manage_exams'
  const [activeTab, setActiveTab] = useState<'upload' | 'manage_exams'>('upload');

  // Live upload progress states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadTotal, setUploadTotal] = useState<number>(0);
  const [uploadCurrent, setUploadCurrent] = useState<number>(0);

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
  const [selectedExam, setSelectedExam] = useState<string>('dsssb_tgt_cs');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [selectedSubtopic, setSelectedSubtopic] = useState<string>('');
  const [customSubtopic, setCustomSubtopic] = useState<string>('');
  const [useCustomSubtopic, setUseCustomSubtopic] = useState<boolean>(false);

  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedQuestions, setParsedQuestions] = useState<Question[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);

  // Load first subject when selectedExam changes
  const activeExamConfig = useMemo(() => {
    return examsConfig.find(e => e.id === selectedExam) || examsConfig[0];
  }, [examsConfig, selectedExam]);

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

      const docId = `${examId}_${subject.replace(/\s+/g, '_')}_${subtopicName.replace(/\s+/g, '_')}`;
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
      if (text.match(/^\d+[\.\)]\s+/) || text.toLowerCase().startsWith('q:') || text.toLowerCase().startsWith('question:')) {
        if (currentQText && currentOptions.length >= 2) {
          list.push({
            text: currentQText,
            options: currentOptions,
            correctIndex: 0,
            explanation: 'Extracted from HTML Document',
            difficulty: 'medium'
          });
        }
        currentQText = text.replace(/^\d+[\.\)]\s+/, '').replace(/^q:\s*/i, '').replace(/^question:\s*/i, '');
        currentOptions = [];
      } else if (text.match(/^[a-d][\.\)]\s+/i) || text.match(/^\([a-d]\)\s+/i)) {
        currentOptions.push(text.replace(/^[a-d][\.\)]\s+/i, '').replace(/^\([a-d]\)\s+/i, ''));
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

  // Strict JSON syntax validator and parser
  const validateAndParseJSON = (jsonString: string): Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] => {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }

    const items = Array.isArray(data) ? data : [data];
    if (items.length === 0) {
      throw new Error("The JSON array is empty.");
    }

    const results: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const indexStr = items.length > 1 ? `at index ${i}` : "";
      
      const questionText = item.question || item.text;
      if (!questionText || typeof questionText !== 'string' || questionText.trim() === '') {
        throw new Error(`Validation Error ${indexStr}: Missing or invalid 'question' or 'text' field (must be a non-empty string).`);
      }

      if (!item.options || !Array.isArray(item.options)) {
        throw new Error(`Validation Error ${indexStr}: 'options' must be a JSON array.`);
      }

      if (item.options.length < 2) {
        throw new Error(`Validation Error ${indexStr}: 'options' array must have at least 2 options.`);
      }

      for (let j = 0; j < item.options.length; j++) {
        if (item.options[j] === undefined || item.options[j] === null || String(item.options[j]).trim() === '') {
          throw new Error(`Validation Error ${indexStr}: Option at index ${j} is empty.`);
        }
      }

      const opts = item.options.map(String);

      // Find correctIndex
      let correctIdx = -1;
      if (typeof item.correctIndex === 'number') {
        correctIdx = item.correctIndex;
      } else {
        const ans = item.correct_answer ?? item.correctAnswer;
        if (ans !== undefined && ans !== null) {
          const ansStr = String(ans).trim();
          const num = parseInt(ansStr, 10);
          if (!isNaN(num) && num >= 0 && num < opts.length) {
            correctIdx = num;
          } else if (ansStr.length === 1) {
            const charCode = ansStr.toUpperCase().charCodeAt(0);
            if (charCode >= 65 && charCode <= 68) {
              correctIdx = charCode - 65;
            }
          } else if (ansStr.length >= 2 && ansStr.toUpperCase().match(/^[A-D][\)\.]/)) {
            correctIdx = ansStr.toUpperCase().charCodeAt(0) - 65;
          } else {
            // try matching the text of the options
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

      if (correctIdx < 0 || correctIdx >= opts.length) {
        throw new Error(`Validation Error ${indexStr}: 'correct_answer' or 'correctIndex' is invalid or out of range for the options. We found correctIndex to be ${correctIdx === -1 ? 'unresolved' : correctIdx}, but options length is ${opts.length}.`);
      }

      results.push({
        text: questionText.trim(),
        options: opts,
        correctIndex: correctIdx,
        explanation: item.explanation ? String(item.explanation).trim() : 'No explanation provided.',
        difficulty: (item.difficulty === 'easy' || item.difficulty === 'hard') ? item.difficulty : 'medium'
      });
    }

    return results;
  };

  // Process files
  const processUploadedContent = (fileContent: string, format: 'json' | 'html' | 'txt') => {
    setErrorMsg(null);
    setParsedQuestions([]);
    
    try {
      let results: Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] = [];
      if (format === 'json') {
        results = validateAndParseJSON(fileContent);
      } else if (format === 'html') {
        results = parseHTMLText(fileContent);
      } else {
        results = parseRawText(fileContent);
      }

      if (results.length === 0) {
        throw new Error("No robust questions could be structured from this file. Please verify syntax requirements.");
      }

      const finalSubtopic = useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;
      if (!finalSubtopic) {
        throw new Error("Please select or write a valid Subtopic classification!");
      }

      const completedQuestions: Question[] = results.map((q, idx) => ({
        ...q,
        id: `uploaded-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
        topic: selectedSubject,
        subtopic: finalSubtopic,
        exam: selectedExam,
        part: 'B',
        isCustom: true,
        source: 'User Upload'
      }));

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
          parsed = validateAndParseJSON(content);
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

      const finalSubtopic = useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;
      if (!finalSubtopic) {
        throw new Error("Please select or write a valid Subtopic classification!");
      }

      const completedQuestions: Question[] = allCombinedQuestions.map((q, idx) => ({
        ...q,
        id: `uploaded-${Date.now()}-${idx}-${Math.floor(Math.random() * 10000)}`,
        topic: selectedSubject,
        subtopic: finalSubtopic,
        exam: selectedExam,
        part: 'B',
        isCustom: true,
        source: 'User Upload'
      }));

      setParsedQuestions(completedQuestions);
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process the files. Make sure the structure and JSON parameters are valid.");
    }
  };

  const handleCommitParsedQuestions = async () => {
    if (parsedQuestions.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setUploadTotal(parsedQuestions.length);
    setUploadCurrent(0);
    setErrorMsg(null);
    setSuccessCount(0);

    try {
      // First save to local storage (which caches locally)
      const customStr = localStorage.getItem('cs_mcq_custom_questions');
      const existingCustom: Question[] = customStr ? JSON.parse(customStr) : [];
      const existingIds = new Set(existingCustom.map(q => q.id));
      const uniqueNew = parsedQuestions.filter(q => !existingIds.has(q.id));
      const updatedCustom = [...existingCustom, ...uniqueNew];
      localStorage.setItem('cs_mcq_custom_questions', JSON.stringify(updatedCustom));

      // Now run the chunk uploader with progress callback
      await uploadQuestionsInChunks(parsedQuestions, (uploadedCount) => {
        setUploadCurrent(uploadedCount);
        setUploadProgress(Math.round((uploadedCount / parsedQuestions.length) * 100));
      });

      // After successfully committing to firestore, calculate new count and sync progress
      const finalSubtopic = useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic;
      const allQuestions = getAllQuestions();
      const subtopicQuestions = allQuestions.filter(
        q => q.exam === selectedExam && q.subtopic === finalSubtopic
      );
      const newCount = subtopicQuestions.length;
      setTopicQuestionCount(newCount);

      // Now sync this live to Firebase
      await syncTopicProgressToFirebase(selectedExam, selectedSubject, finalSubtopic, newCount);

      setSuccessCount(parsedQuestions.length);
      setParsedQuestions([]);
      setFileName(null);
      setFileNames([]);
      setSelectedFiles([]);
      onQuestionsSaved();
    } catch (e: any) {
      setErrorMsg("Failed to persist questions: " + (e.message || String(e)));
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

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100 text-left">
      
      {/* Top Banner Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-500/10 rounded-lg text-indigo-500 dark:text-indigo-400">
            <Icons.Settings className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-slate-100">Admin Control Center</h2>
            <span className="text-[10px] text-slate-500 dark:text-slate-400 block mt-0.5 font-mono">Status: Secure Credentials Active</span>
          </div>
        </div>

        {/* Real-time Firebase Sync Status Indicator */}
        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono font-bold transition-all self-start sm:self-auto ${
          firebaseStatus === 'syncing' 
            ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 animate-pulse'
            : firebaseStatus === 'offline'
              ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
              : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${
            firebaseStatus === 'syncing' 
              ? 'bg-amber-500'
              : firebaseStatus === 'offline'
                ? 'bg-rose-550 animate-ping'
                : 'bg-emerald-500 animate-pulse'
          }`} />
          <span>
            {firebaseStatus === 'syncing' 
              ? 'Firebase: Syncing...' 
              : firebaseStatus === 'offline' 
                ? 'Firebase: Offline' 
                : 'Firebase: Synced'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
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

      {/* Tab Selectors */}
      <div className="flex gap-1.5 p-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-white/5 rounded-xl h-11 shrink-0">
        <button
          onClick={() => {
            setActiveTab('upload');
            setSuccessCount(0);
          }}
          title="Upload Questions"
          className={`flex-1 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'upload' ? 'bg-indigo-650 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Icons.Upload className="w-4 h-4 text-emerald-500" />
          <span className="hidden sm:inline">Upload Questions</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('manage_exams');
            setSuccessCount(0);
          }}
          title="Configure Exams & Rules"
          className={`flex-1 rounded-lg font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${activeTab === 'manage_exams' ? 'bg-indigo-650 text-white shadow' : 'text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}
        >
          <Icons.Sliders className="w-4 h-4 text-amber-500" />
          <span className="hidden sm:inline">Configure Exams & Rules</span>
        </button>
      </div>

      {isUploading && (
        <div className="p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center justify-between text-[11px] font-bold text-indigo-700 dark:text-indigo-300">
            <span className="flex items-center gap-2">
              <Icons.Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
              Syncing MCQs with Firebase Live Data...
            </span>
            <span className="font-mono text-xs">{uploadCurrent} / {uploadTotal} ({uploadProgress}%)</span>
          </div>
          <div className="w-full bg-slate-200 dark:bg-white/10 h-2.5 rounded-full overflow-hidden">
            <div 
              className="bg-indigo-600 dark:bg-indigo-400 h-full rounded-full transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed font-mono">
            Adding questions live into subject: <span className="text-slate-800 dark:text-slate-200 font-extrabold">{selectedSubject}</span>, subtopic: <span className="text-slate-800 dark:text-slate-200 font-extrabold">{useCustomSubtopic ? customSubtopic : selectedSubtopic}</span>.
          </p>
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
          <div className="text-[11px]">
            <span className="font-extrabold">Operation Aborted</span>
            <p className="text-slate-600 dark:text-slate-350 text-[10px] mt-0.5 leading-relaxed">{errorMsg}</p>
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
              1. CATEGORIZATION PARAMETERS
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
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
                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono">Assign Subtopic Division</span>
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
                    placeholder="Type new Subtopic classification name..."
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
                  {activeSubtopics.map((sub, idx) => <option key={idx} value={sub}>{sub}</option>)}
                  {activeSubtopics.length === 0 && <option value="General Theory">General Theory (Default)</option>}
                </select>
              )}
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

          {/* Verification modal / actions */}
          {parsedQuestions.length > 0 && (
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/5 pb-2">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Icons.Eye className="w-4 h-4 animate-pulse" />
                  <span className="text-xs font-black tracking-wide uppercase">Loaded verification ({parsedQuestions.length} Qs)</span>
                </div>
                <button
                  onClick={handleCommitParsedQuestions}
                  className="py-1.5 px-4 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer border border-white/10"
                >
                  Confirm & Ingest Storage
                </button>
              </div>

              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {parsedQuestions.map((q, idx) => (
                  <div key={idx} className="bg-white dark:bg-black/25 rounded-xl p-3 text-xs space-y-2 border border-slate-200 dark:border-white/5">
                    <p className="font-bold text-slate-900 dark:text-slate-200">Q{idx + 1}: {q.text}</p>
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

        </div>
      )}

    </div>
  );
}
