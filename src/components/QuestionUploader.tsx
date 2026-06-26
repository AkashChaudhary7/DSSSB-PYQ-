/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { Question, ExamConfig, ExamSubject, ExamRule } from '../types';
import { saveCustomQuestions, getExamsConfig, saveExamsConfig, getAllQuestions, AdminActivity, getAdminActivities, logAdminActivity } from '../lib/storage';
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
  // Tabs: 'upload' | 'upload_mock' | 'manage_exams'
  const [activeTab, setActiveTab] = useState<'upload' | 'upload_mock' | 'manage_exams'>('upload');

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
  const [mockTitle, setMockTitle] = useState<string>('');

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

  const validateAndParseJSON = (jsonString: string): Omit<Question, 'id' | 'topic' | 'subtopic' | 'exam' | 'part'>[] => {
    let data: any;
    try {
      data = JSON.parse(jsonString);
    } catch (err: any) {
      throw new Error(`Invalid JSON syntax: ${err.message}`);
    }

    let items: any[] = [];
    if (data && typeof data === 'object') {
      if (Array.isArray(data.sections)) {
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

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const indexStr = items.length > 1 ? `at index ${i}` : "";
      
      // 1. Resolve question text
      let questionText = item.question || item.text || item.q || item.question_text || item.title || item.desc || "";
      if (typeof questionText !== 'string' || questionText.trim() === '') {
        // Find the first string property on item that is non-empty
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
        // Find the first array property
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
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process the files. Make sure the structure and JSON parameters are valid.");
    }
  };

  const handleCommitParsedQuestions = async () => {
    if (parsedQuestions.length === 0) return;
    setIsUploading(true);
    setUploadProgress(0);
    setSyncFailed(false);
    
    // Commit ALL questions at once - uploadQuestionsInChunks will chunk them into bundles of 200
    const batchToUpload = [...parsedQuestions];

    setUploadTotal(batchToUpload.length);
    setUploadCurrent(0);
    setErrorMsg(null);
    setSuccessCount(0);

    try {
      // First save to local storage (which caches locally)
      const customStr = localStorage.getItem('cs_mcq_custom_questions');
      const existingCustom: Question[] = customStr ? JSON.parse(customStr) : [];
      const existingIds = new Set(existingCustom.map(q => q.id));
      const uniqueNew = batchToUpload.filter(q => !existingIds.has(q.id));
      const updatedCustom = [...existingCustom, ...uniqueNew];
      localStorage.setItem('cs_mcq_custom_questions', JSON.stringify(updatedCustom));

      // Now run the chunk uploader with progress callback
      await uploadQuestionsInChunks(batchToUpload, (uploadedCount) => {
        setUploadCurrent(uploadedCount);
        setUploadProgress(Math.round((uploadedCount / batchToUpload.length) * 100));
      });

      // After successfully committing to firestore, calculate new count and sync progress
      const finalSubtopic = activeTab === 'upload_mock' ? mockTitle.trim() : (useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic);
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
        count: batchToUpload.length
      });

      // Now sync this live to Firebase
      await syncTopicProgressToFirebase(selectedExam, targetSubject, finalSubtopic, newCount);

      setSuccessCount(batchToUpload.length);
      setParsedQuestions([]);

      setFileName(null);
      setFileNames([]);
      setSelectedFiles([]);
      
      onQuestionsSaved();
    } catch (e: any) {
      setErrorMsg("Failed to persist questions to cloud. Local save complete: " + (e.message || String(e)));
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

    try {
      await uploadQuestionsInChunks(remainingQuestions, (uploadedCount) => {
        const newCurrent = uploadCurrent + uploadedCount;
        setUploadCurrent(newCurrent);
        setUploadProgress(Math.round((newCurrent / uploadTotal) * 100));
      });

      const finalSubtopic = activeTab === 'upload_mock' ? mockTitle.trim() : (useCustomSubtopic ? customSubtopic.trim() : selectedSubtopic);
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
            <span>DB ID: <span className="text-indigo-400 font-bold">ai-studio-a27adeb9-5185-4392-84a0-bab23bf35886</span></span>
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
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4 space-y-3.5 shadow-md">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-white/5 pb-2.5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                    <Icons.Eye className="w-4 h-4 animate-pulse shrink-0" />
                    <span className="text-xs font-black tracking-wide uppercase">Loaded verification ({parsedQuestions.length} Qs pending)</span>
                  </div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                    Target database: <span className="font-bold text-amber-500">ai-studio-a27adeb9-5185-4392-84a0-bab23bf35886</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={handleCommitParsedQuestions}
                    disabled={isUploading}
                    className="py-1.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer border border-white/10"
                  >
                    {parsedQuestions.length > 200 ? 'Sync Next 200 Questions' : `Sync Final ${parsedQuestions.length} Questions`}
                  </button>
                  {parsedQuestions.length > 200 && (
                    <span className="text-[9px] text-amber-400 font-mono">
                      {parsedQuestions.length - 200} questions will be left to sync manually
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {parsedQuestions.map((q, idx) => (
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
                    Target database: <span className="font-bold text-amber-500">ai-studio-a27adeb9-5185-4392-84a0-bab23bf35886</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <button
                    onClick={handleCommitParsedQuestions}
                    disabled={isUploading}
                    className="py-1.5 px-4 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-800 disabled:opacity-50 text-slate-950 font-black rounded-lg text-[10px] tracking-wider uppercase transition-all shadow-md cursor-pointer border border-white/10"
                  >
                    {parsedQuestions.length > 200 ? 'Sync Next 200 Questions' : `Sync Final ${parsedQuestions.length} Questions`}
                  </button>
                  {parsedQuestions.length > 200 && (
                    <span className="text-[9px] text-amber-400 font-mono">
                      {parsedQuestions.length - 200} questions will be left to sync manually
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-3 max-h-[180px] overflow-y-auto pr-1">
                {parsedQuestions.map((q, idx) => (
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

        </div>
      )}

    </div>
  );
}
