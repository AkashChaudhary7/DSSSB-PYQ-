/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Question } from '../types';
import { saveCustomQuestions } from '../lib/storage';
import * as Icons from 'lucide-react';
import { TOPICS } from '../data/defaultQuestions';

interface QuestionGeneratorProps {
  onBack: () => void;
  onQuestionsSaved: () => void;
  preFilledSubtopic?: string;
  onStartQuizImmediately?: (topic: string, subtopic: string, questions: Question[]) => void;
}

export default function QuestionGenerator({
  onBack,
  onQuestionsSaved,
  preFilledSubtopic = "",
  onStartQuizImmediately
}: QuestionGeneratorProps) {
  const [subtopicQuery, setSubtopicQuery] = useState<string>(preFilledSubtopic);
  const [parentTopic, setParentTopic] = useState<string>("Operating Systems");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [configHint, setConfigHint] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);
  const [isOfflineFallback, setIsOfflineFallback] = useState<boolean>(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subtopicQuery.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);
    setConfigHint(false);
    setGeneratedQuestions([]);
    setIsSaved(false);
    setIsOfflineFallback(false);

    try {
      const response = await fetch('/api/generate-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: parentTopic,
          subtopic: subtopicQuery.trim()
        })
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.isConfigRequired) {
          setConfigHint(true);
        }
        throw new Error(data.error || "Failed to search and generate questions.");
      }

      if (!data.questions || data.questions.length === 0) {
        throw new Error("No computer science questions could be extracted for this topic. Try a more standard textbook subtopic name!");
      }

      setGeneratedQuestions(data.questions);
      if (data.isOfflineFallback) {
        setIsOfflineFallback(true);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || "An unexpected network error occurred.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToOfflinePool = () => {
    if (generatedQuestions.length === 0) return;
    
    saveCustomQuestions(generatedQuestions);
    setIsSaved(true);
    onQuestionsSaved(); // notify parent to update question counts
  };

  const handleTriggerInstantQuiz = () => {
    if (generatedQuestions.length === 0 || !onStartQuizImmediately) return;
    // ensure saved first
    saveCustomQuestions(generatedQuestions);
    onStartQuizImmediately(parentTopic, subtopicQuery.trim(), generatedQuestions);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-8">
      {/* Back button */}
      <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-5">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
          id="generator-back-btn"
        >
          <Icons.ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-base font-bold text-slate-800 font-sans">Active Question Ingestion</h2>
          <p className="text-xs text-slate-400">Search academic networks & synthesize dynamic subtopics</p>
        </div>
      </div>

      {/* Generation Form */}
      <div className="bg-slate-50 border border-slate-200/50 rounded-2xl p-5 mb-6">
        <form onSubmit={handleGenerate} className="space-y-4">
          {/* Subtopic input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">
              Academic Subtopic Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={subtopicQuery}
                onChange={(e) => setSubtopicQuery(e.target.value)}
                placeholder="e.g. Peterson's Critical Section Solution, IP Subnetting, ACID Isolation Levels"
                className="w-full text-xs font-medium bg-white border border-slate-200 rounded-xl py-3 px-4 pr-10 text-slate-800 placeholder-slate-400 shadow-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                disabled={isLoading}
                id="generator-query-input"
              />
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-indigo-500">
                <Icons.Sparkles className="w-4 h-4" />
              </div>
            </div>
            <p className="text-[10px] text-slate-400">
              Input any subtopic. The backend will query Google Search to fetch or generate 5 corresponding high-quality practice questions.
            </p>
          </div>

          {/* Subject alignment */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest font-mono">
              Align with Academic Subject
            </label>
            <div className="grid grid-cols-2 gap-2">
              {TOPICS.map((topic) => {
                const isSelected = parentTopic === topic.name;
                return (
                  <button
                    key={topic.name}
                    type="button"
                    onClick={() => setParentTopic(topic.name)}
                    disabled={isLoading}
                    className={`p-2.5 rounded-lg border text-left text-xs font-semibold cursor-pointer transition-all ${
                      isSelected 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                    id={`generator-subject-btn-${topic.name.split(' ').join('-').toLowerCase()}`}
                  >
                    {topic.name}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || !subtopicQuery.trim()}
            className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-450 text-white font-bold rounded-xl text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all pt-4"
            id="generator-submit-btn"
          >
            {isLoading ? (
              <>
                <Icons.Loader2 className="w-4 h-4 animate-spin" />
                <span>Crawling & Organizing Questions...</span>
              </>
            ) : (
              <>
                <Icons.Search className="w-4 h-4" />
                <span>Search Google & Structure MCQs</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Keys configuration help */}
      {configHint && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl mb-6 space-y-2">
          <div className="flex items-start gap-2.5">
            <Icons.Key className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-xs font-bold text-amber-800">API Key Missing</h4>
              <p className="text-xs text-amber-700 leading-relaxed mt-0.5">
                The Gemini AI client is server-side and requires a secure API key. 
                Configure your <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">GEMINI_API_KEY</code> key inside the <strong>Secrets</strong> panel (Settings icon) at the top-right of your AI Studio interface.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error Output block */}
      {errorMsg && !configHint && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-medium mb-6 leading-relaxed flex items-start gap-2">
          <Icons.AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Extracted Questions Pre-visualizer list */}
      {generatedQuestions.length > 0 && (
        <div className="space-y-4">
          {isOfflineFallback && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 p-3.5 rounded-xl text-amber-800 text-xs">
              <Icons.Info className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Localized Synthesis Active</span>
                <p className="text-amber-700 leading-normal text-[10.5px]">
                  The cloud API network quota is currently saturated. We have successfully synthesized high-yield academic questions locally for <strong>"{subtopicQuery}"</strong> so you can study without interruption!
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between bg-emerald-50 border border-emerald-150 p-4 rounded-xl">
            <div className="flex items-center gap-2 text-emerald-850">
              <Icons.CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <div>
                <h4 className="text-xs font-bold font-sans">Crawled 5 Custom MCQs</h4>
                <p className="text-[10px] text-emerald-700">Successfully mapped to topic standards</p>
              </div>
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={handleSaveToOfflinePool}
                disabled={isSaved}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${
                  isSaved 
                    ? 'bg-emerald-600 text-white cursor-not-allowed' 
                    : 'bg-white text-emerald-700 border border-emerald-250 hover:bg-emerald-50/50'
                }`}
                id="generator-save-btn"
              >
                {isSaved ? "Saved" : "Save Offline"}
              </button>

              {onStartQuizImmediately && (
                <button
                  onClick={handleTriggerInstantQuiz}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1 shadow-sm"
                  id="generator-start-quiz-btn"
                >
                  <Icons.Play className="w-3.5 h-3.5 text-indigo-150" />
                  <span>Start Practice</span>
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wider font-mono">
              Preview Mapped Items
            </h3>
            
            {generatedQuestions.map((q, qIdx) => (
              <div key={qIdx} className="bg-white border border-slate-100 rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono uppercase bg-slate-100 text-slate-550 px-2 py-0.5 rounded">
                    Q{qIdx + 1} • {q.difficulty}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Ref: {q.source}
                  </span>
                </div>
                <h4 className="text-xs font-bold leading-normal text-slate-800">{q.text}</h4>
                <div className="grid grid-cols-2 gap-2 text-[10.5px] text-slate-500">
                  {q.options.map((opt, oIdx) => (
                    <div 
                      key={oIdx} 
                      className={`p-2 rounded border border-slate-50 ${oIdx === q.correctIndex ? 'bg-emerald-50/50 border-emerald-200/55 text-emerald-800 font-semibold' : ''}`}
                    >
                      {['A', 'B', 'C', 'D'][oIdx]}. {opt}
                    </div>
                  ))}
                </div>
                <div className="text-[10px] bg-slate-50 rounded p-2.5 flex gap-1.5">
                  <span className="font-bold text-slate-650 shrink-0 uppercase font-mono">Feedback:</span>
                  <span className="text-slate-500 leading-normal">{q.explanation}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
