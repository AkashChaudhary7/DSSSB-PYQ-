/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Question } from '../types';

export const DSSSB_DEFAULT_QUESTIONS: Question[] = [
  // PART A - GENERAL STUDIES (GS)
  {
    id: "gs-1",
    topic: "General Studies (GS)",
    subtopic: "Indian Polity & Constitution",
    difficulty: "easy",
    text: "Which Article of the Indian Constitution is referred to as the 'Heart and Soul' of the Constitution by Dr. B.R. Ambedkar?",
    options: [
      "Article 14 - Right to Equality",
      "Article 19 - Right to Freedom",
      "Article 21 - Right to Life",
      "Article 32 - Right to Constitutional Remedies"
    ],
    correctIndex: 3,
    explanation: "Dr. B.R. Ambedkar styled Article 32 (Right to Constitutional Remedies) as the heart and soul of the Constitution as it guarantees judicial review and allows direct petition to courts for Fundamental Rights violations.",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "gs-2",
    topic: "General Studies (GS)",
    subtopic: "History & Geography",
    difficulty: "medium",
    text: "At which of the following sessions did the Indian National Congress declare the 'Purna Swaraj' (Complete Independence) resolution?",
    options: [
      "Lahore Session, 1929",
      "Karachi Session, 1931",
      "Calcutta Session, 1920",
      "Belgaum Session, 1924"
    ],
    correctIndex: 0,
    explanation: "The Purna Swaraj declaration was promulgated at the Lahore Session in December 1929, chaired by Jawaharlal Nehru, leading to the symbolic independence day declaration on January 26, 1930.",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "gs-3",
    topic: "General Studies",
    subtopic: "Indian Polity & Constitution",
    difficulty: "easy",
    text: "The directive principles of state policy (DPSP) in the Indian Constitution are borrowed from which country?",
    options: [
      "Ireland",
      "USA",
      "United Kingdom",
      "USSR"
    ],
    correctIndex: 0,
    explanation: "DPSPs are contained in Part IV of the constitution and are borrowed from the Irish Constitution.",
    source: "DSSSB Past Years",
    exam: "dsssb_it"
  },

  // PART A - QUANTITATIVE APTITUDE
  {
    id: "quant-1",
    topic: "Quantitative Aptitude",
    subtopic: "Percentage & Profit Loss",
    difficulty: "easy",
    text: "By selling an article for ₹810, a merchant incurs a loss of 10%. At what price should he sell it to gain 10%?",
    options: [
      "₹900",
      "₹990",
      "₹1000",
      "₹1050"
    ],
    correctIndex: 1,
    explanation: "1. Selling Price = ₹810, Loss = 10%. Cost Price (CP) * 0.9 = 810 => CP = ₹900.\n2. To make a gain of 10%: Target SP = CP * 1.1 = ₹900 * 1.1 = ₹990.",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "quant-2",
    topic: "Quantitative Aptitude",
    subtopic: "Averages & Algebra",
    difficulty: "medium",
    text: "The average age of 5 board members of an organization is 40 years. If a new member of age 28 joins, what will be the new average age of the board?",
    options: [
      "35 years",
      "38 years",
      "37.5 years",
      "39 years"
    ],
    correctIndex: 1,
    explanation: "1. Sum of ages of 5 members = 5 * 40 = 200 years.\n2. After new member joins: Total Sum = 200 + 28 = 228 years.\n3. Total members = 6. New Average = 228 / 6 = 38 years.",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },

  // PART A - REASONING / REASONING ABILITY
  {
    id: "reason-1",
    topic: "Reasoning",
    subtopic: "Coding & Decoding",
    difficulty: "easy",
    text: "In a certain code, 'DANGER' is written as 'EDOHFS'. How is 'SHIELD' coded in that system?",
    options: [
      "TIJFME",
      "TJFJME",
      "TIGKME",
      "THJFMD"
    ],
    correctIndex: 0,
    explanation: "Each letter is shifted forward by 1 (+1 shift): \nS -> T, H -> I, I -> J, E -> F, L -> M, D -> E. Hence, TIJFME is the code.",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "reason-2",
    topic: "Reasoning Ability",
    subtopic: "Blood Relations",
    difficulty: "medium",
    text: "Pointing to a man, a woman said: 'His mother is the only daughter of my mother.' How is the woman related to the man?",
    options: [
      "Sister",
      "Grandmother",
      "Mother",
      "Aunt"
    ],
    correctIndex: 2,
    explanation: "'The only daughter of my mother' is the woman herself. She states that his mother is herself, meaning she is the mother of the man she is pointing to.",
    source: "DSSSB Past Years",
    exam: "dsssb_it"
  },

  // PART A - HINDI / GENERAL HINDI
  {
    id: "hindi-1",
    topic: "Hindi",
    subtopic: "Sandhi & Samas",
    difficulty: "easy",
    text: "'तपोबल' शब्द में कौन सी संधि प्रयुक्त हुई है?",
    options: [
      "स्वर संधि",
      "व्यंजन संधि",
      "विसर्ग संधि",
      "अयादि संधि"
    ],
    correctIndex: 2,
    explanation: "'तपोबल' का संधि विच्छेद 'तपः + बल' होता है। विसर्ग (ः) का ओ (ो) हो जाने के कारण यहाँ विसर्ग संधि प्रयुक्त हुई है।",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "hindi-2",
    topic: "General Hindi",
    subtopic: "Vyakaran & Sangya",
    difficulty: "medium",
    text: "निम्नलिखित में से 'भाववाचक संज्ञा' शब्द का चयन कीजिये:",
    options: [
      "सुंदर",
      "सुंदरता",
      "वीर",
      "बालक"
    ],
    correctIndex: 1,
    explanation: "'सुंदर' और 'वीर' विशेषण हैं, 'बालक' जातिवाचक संज्ञा है, तथा 'सुंदरता' एक अमूर्त भाव प्रकट करने के कारण भाववाचक संज्ञा है।",
    source: "DSSSB Past Years",
    exam: "dsssb_it"
  },

  // PART A - ENGLISH / GENERAL ENGLISH
  {
    id: "eng-1",
    topic: "English",
    subtopic: "Tense & Voice Rules",
    difficulty: "medium",
    text: "Identify the correct voice conversion for: 'The chef prepared a delicious dinner.'",
    options: [
      "A delicious dinner was prepared by the chef.",
      "A delicious dinner is prepared by the chef.",
      "A delicious dinner has been prepared by the chef.",
      "The delicious dinner is being prepared by the chef."
    ],
    correctIndex: 0,
    explanation: "The original sentence is in Simple Past (prepared). The passive equivalent is formed with was/were + past participle (was prepared), matching: 'A delicious dinner was prepared by the chef.'",
    source: "DSSSB Past Years",
    exam: "dsssb_tgt_cs",
    part: "A"
  },
  {
    id: "eng-2",
    topic: "General English",
    subtopic: "Noun & Pronoun Pronoun Conjugation",
    difficulty: "easy",
    text: "Fill in the blank: 'Neither of the final candidates ______ selected for the position.'",
    options: [
      "were",
      "was",
      "are",
      "have been"
    ],
    correctIndex: 1,
    explanation: "Pronouns like 'neither', 'either', and 'each' are grammatically singular singular subjects and require a singular verb ('was').",
    source: "DSSSB Past Years",
    exam: "dsssb_it"
  }
];
