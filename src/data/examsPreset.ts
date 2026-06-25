import { ExamConfig } from '../types';

export const EXAMS_PRESET: ExamConfig[] = [
  {
    id: 'dsssb_tgt_cs',
    name: 'DSSSB TGT CS',
    targetScore: 130,
    subjects: [
      {
        name: 'General Studies (GS)',
        topics: [
          { name: 'History & Geography', subtopics: ['Ancient History', 'Medieval History', 'Modern History', 'Physical Geography', 'Indian Geography'] },
          { name: 'Indian Polity & Constitution', subtopics: ['Fundamental Rights', 'President & Parliament', 'Judiciary', 'Constitutional Amendments'] },
          { name: 'Economics & Budget', subtopics: ['Five Year Plans', 'Inflation & Banking', 'Fiscal Policy', 'Union Budget'] },
          { name: 'General Science', subtopics: ['Physics Concepts', 'Chemistry in Daily Life', 'Biology & Human Body', 'Environment Science'] },
          { name: 'Current Affairs', subtopics: ['National News', 'International Summits', 'Sports & Awards', 'Appointments & Schemes'] }
        ]
      },
      {
        name: 'Quantitative Aptitude',
        topics: [
          { name: 'Arithmetic & Numbers', subtopics: ['Number Systems', 'LCM & HCF', 'Simplification & Decimals', 'Surds & Indices'] },
          { name: 'Commercial Math', subtopics: ['Percentage', 'Profit & Loss', 'Discount', 'Simple Interest', 'Compound Interest', 'Ratio & Proportion', 'Averages'] },
          { name: 'Mensuration', subtopics: ['2D Area & Perimeter', '3D Volume & Surface Area'] }
        ]
      },
      {
        name: 'Reasoning',
        topics: [
          { name: 'Verbal Reasoning', subtopics: ['Analogy & Classification', 'Series Completion', 'Coding & Decoding', 'Blood Relations', 'Syllogism', 'Direction Sense Test'] },
          { name: 'Non-Verbal Reasoning', subtopics: ['Mirror & Water Images', 'Paper Folding', 'Pattern Completion', 'Embedded Figures'] }
        ]
      },
      {
        name: 'Hindi',
        topics: [
          { name: 'Vyakaran', subtopics: ['Vyakaran & Sangya', 'Sandhi & Samas', 'Muhavare & Lokoktiyan', 'Alankar & Ras', 'Apathit Gadyansh', 'Synonyms & Antonyms (Hindi)'] }
        ]
      },
      {
        name: 'English',
        topics: [
          { name: 'Grammar', subtopics: ['Noun & Pronoun Conjugation', 'Tense & Voice Rules', 'Subject Verb Agreement', 'Direct & Indirect Speech'] },
          { name: 'Vocabulary', subtopics: ['Vocabulary & Antonyms', 'Idioms & Phrases', 'One Word Substitution'] },
          { name: 'Comprehension', subtopics: ['Comprehension Drills', 'Cloze Test'] }
        ]
      },
      {
        name: 'Computer Science',
        topics: [
          { name: 'Operating Systems', subtopics: ['Process Management', 'Memory Management', 'CPU Scheduling', 'Deadlocks', 'File Systems'] },
          { name: 'Computer Networks', subtopics: ['OSI Model', 'TCP/IP Suite', 'Routing Algorithms', 'IP Addressing & Subnetting', 'Network Security'] },
          { name: 'Database Systems', subtopics: ['Relational Model & SQL', 'Normalization', 'Transaction & Concurrency', 'Indexing & Hashing', 'NoSQL Databases'] },
          { name: 'Data Structures & Algos', subtopics: ['Arrays & Linked Lists', 'Stacks & Queues', 'Trees & Graphs', 'Sorting & Searching', 'Dynamic Programming'] },
          { name: 'Digital Logic', subtopics: ['Boolean Algebra', 'Logic Gates', 'Combinational Circuits', 'Sequential Circuits'] },
          { name: 'Web Tech & Programming', subtopics: ['HTML & CSS', 'JavaScript & DOM', 'OOP with C++/Java', 'Python Fundamentals'] }
        ]
      }
    ],
    rules: {
      numQuestions: 200,
      timeLimitMinutes: 120,
      negativeMarking: -0.25,
      subjectAllotments: {
        'General Studies (GS)': 20,
        'Quantitative Aptitude': 20,
        'Reasoning': 20,
        'Hindi': 20,
        'English': 20,
        'Computer Science': 100
      }
    }
  },
  {
    id: 'dsssb_it',
    name: 'DSSSB IT',
    targetScore: 130,
    subjects: [
      {
        name: 'General Studies',
        topics: [
          { name: 'GK & Social Science', subtopics: ['History & Geography', 'Indian Polity & Constitution', 'Economics & Budget', 'General Science', 'Current Affairs'] }
        ]
      },
      {
        name: 'Quantitative Aptitude',
        topics: [
          { name: 'Arithmetic Drills', subtopics: ['Number Systems', 'Percentage & Profit Loss', 'Simple & Compound Interest', 'Ratio & Proportion', 'Time, Speed & Distance', 'Averages & Algebra'] }
        ]
      },
      {
        name: 'Reasoning Ability',
        topics: [
          { name: 'Logical Analysis', subtopics: ['Analogy & Classification', 'Series Completion', 'Coding & Decoding', 'Blood Relations', 'Syllogism', 'Direction Sense Test'] }
        ]
      },
      {
        name: 'General English',
        topics: [
          { name: 'Grammar & Vocab', subtopics: ['Noun & Pronoun Pronoun Conjugation', 'Tense & Voice Rules', 'Vocabulary & Antonyms', 'Idioms & Phrases', 'Comprehension Drills'] }
        ]
      },
      {
        name: 'General Hindi',
        topics: [
          { name: 'Hindi Vyakaran', subtopics: ['Vyakaran & Sangya', 'Sandhi & Samas', 'Muhavare', 'Alankar & Ras', 'Apathit Gadyansh'] }
        ]
      }
    ],
    rules: {
      numQuestions: 200,
      timeLimitMinutes: 120,
      negativeMarking: -0.25,
      subjectAllotments: {
        'General Studies': 40,
        'Quantitative Aptitude': 40,
        'Reasoning Ability': 40,
        'General English': 40,
        'General Hindi': 40
      }
    }
  },
  {
    id: 'cet_xii',
    name: 'CET-XII',
    targetScore: 105,
    subjects: [
      {
        name: 'Rajasthan GK',
        topics: [
          { name: 'Rajasthan History & Art', subtopics: ['Freedom Movement', 'Art & Architecture', 'Fairs & Festivals', 'Customs & Costumes'] },
          { name: 'Rajasthan Geography & Polity', subtopics: ['Rivers & Lakes', 'Forests & Wildlife', 'Agriculture & Mineral Resources', 'Governor & Assembly'] }
        ]
      },
      {
        name: 'General Science',
        topics: [
          { name: 'Everyday Science', subtopics: ['Physical & Chemical Changes', 'Metals & Non-metals', 'Ecology & Biodiversity', 'Biotechnology & Health'] }
        ]
      },
      {
        name: 'Reasoning & Maths',
        topics: [
          { name: 'Mental Ability', subtopics: ['Analogy', 'Coding-Decoding', 'Blood Relations', 'Ratio', 'Percentage', 'Profit & Loss', 'Simple Interest'] }
        ]
      },
      {
        name: 'Hindi',
        topics: [
          { name: 'General Hindi', subtopics: ['Sandhi & Samas', 'Prefix & Suffix', 'Synonyms & Antonyms', 'Sentence Correction'] }
        ]
      },
      {
        name: 'English',
        topics: [
          { name: 'General English', subtopics: ['Tenses & Passive Voice', 'Direct/Indirect Speech', 'Prepositions', 'Synonyms & Antonyms (Eng)'] }
        ]
      },
      {
        name: 'Computer & General GK',
        topics: [
          { name: 'Information Tech', subtopics: ['Characteristics of Computers', 'Operating Systems Intro', 'MS Office (Word, Excel, PowerPoint)'] }
        ]
      }
    ],
    rules: {
      numQuestions: 150,
      timeLimitMinutes: 180,
      negativeMarking: 0,
      subjectAllotments: {
        'Rajasthan GK': 50,
        'General Science': 25,
        'Reasoning & Maths': 25,
        'Hindi': 15,
        'English': 15,
        'Computer & General GK': 20
      }
    }
  },
  {
    id: 'cet_graduation',
    name: 'CET-GRADUATION',
    targetScore: 105,
    subjects: [
      {
        name: 'Rajasthan Economy & Geography',
        topics: [
          { name: 'Natural Resources', subtopics: ['Climate & Vegetation', 'Soil & Irrigation', 'Wildlife Reserves', 'Mines & Minerals'] },
          { name: 'Rajasthan Economic Dev', subtopics: ['Agricultural Schemes', 'Industrial Growth', 'Unemployment & Poverty', 'Socio-Economic Welfare Plans'] }
        ]
      },
      {
        name: 'Indian History & Polity',
        topics: [
          { name: 'Indian National Movement', subtopics: ['Revolt of 1857', 'Social Reforms', 'Gandhian Era', 'Integration of India'] },
          { name: 'Constitutional System', subtopics: ['Preamble & Fundamental Rights', 'Directive Principles', 'Federalism & Local Self-Gov', 'Elections'] }
        ]
      },
      {
        name: 'Science & Technology',
        topics: [
          { name: 'Modern Tech', subtopics: ['Information Communication Tech', 'Space & Satellite Tech', 'Defense & Nuclear Tech', 'Human Body Diseases & Nutrition'] }
        ]
      },
      {
        name: 'Quantitative Aptitude & Reasoning',
        topics: [
          { name: 'Logical Reasoning', subtopics: ['Syllogisms', 'Series Completion', 'Blood Relations', 'Direction Test'] },
          { name: 'Numerical Ability', subtopics: ['Profit & Loss', 'Percentage & Simple Interest', 'Ratio & Average', 'Area of Figures', 'Data Interpretation'] }
        ]
      },
      {
        name: 'Language (Hindi/English)',
        topics: [
          { name: 'Hindi grammar', subtopics: ['Sandhi-Samas', 'Kriya & Karak', 'Muhavare'] },
          { name: 'English Grammar', subtopics: ['Prepositions', 'Tenses', 'Active-Passive', 'Common Errors'] }
        ]
      },
      {
        name: 'Computer Science',
        topics: [
          { name: 'Tech Core', subtopics: ['RAM & ROM', 'Input Output Devices', 'Network & Internet Concepts'] }
        ]
      }
    ],
    rules: {
      numQuestions: 150,
      timeLimitMinutes: 180,
      negativeMarking: 0,
      subjectAllotments: {
        'Rajasthan Economy & Geography': 40,
        'Indian History & Polity': 40,
        'Science & Technology': 20,
        'Quantitative Aptitude & Reasoning': 25,
        'Language (Hindi/English)': 15,
        'Computer Science': 10
      }
    }
  },
  {
    id: 'ras_prelims',
    name: 'RAS PRELIMS',
    targetScore: 100,
    subjects: [
      {
        name: 'History & Culture of Rajasthan',
        topics: [
          { name: 'Ancient & Medieval Art', subtopics: ['Archaeological Sites', 'Forts & Monuments', 'Paintings & Folk Art', 'Literature & Dialects'] },
          { name: 'Modern Dynasty history', subtopics: ['Major Dynasties', 'Peasant & Tribal Movements', 'Political Awakening', 'Integration of Rajasthan'] }
        ]
      },
      {
        name: 'Indian History & Polity',
        topics: [
          { name: 'Indian History', subtopics: ['Vedic Era & Buddhism', 'Mughal Empire', 'Freedom Struggle', 'Post-Independence Consolidation'] },
          { name: 'Indian Constitution', subtopics: ['Preamble & Structure', 'Supreme Court & Judicial Review', 'Coalition Governments', 'National Integration'] }
        ]
      },
      {
        name: 'Geography of World & India',
        topics: [
          { name: 'World Geography', subtopics: ['Broad Physical Features', 'Environmental Issues', 'Wildlife & Biodiversity', 'Industrial Regions'] },
          { name: 'Indian Geography', subtopics: ['Himalayan Rivers', 'Climate & Monsoon', 'Natural Vegetation', 'Population Density'] }
        ]
      },
      {
        name: 'Rajasthan Economy & Geography',
        topics: [
          { name: 'Economy of Rajasthan', subtopics: ['Macro Overview', 'Agricultural Growth', 'Industrial Development', 'Service Sector Progress'] }
        ]
      },
      {
        name: 'Science & Technology',
        topics: [
          { name: 'Scientific Principles', subtopics: ['Electronics & Telecom', 'Nanotech & Biotech', 'Natural Resources Conserv', 'Food & Health Science'] }
        ]
      },
      {
        name: 'Reasoning & Mental Ability',
        topics: [
          { name: 'Mental Ability', subtopics: ['Statements & Arguments', 'Number Series', 'Venn Diagrams', 'Probability & Combinatorics'] }
        ]
      }
    ],
    rules: {
      numQuestions: 150,
      timeLimitMinutes: 180,
      negativeMarking: -0.33,
      subjectAllotments: {
        'History & Culture of Rajasthan': 40,
        'Indian History & Polity': 30,
        'Geography of World & India': 25,
        'Rajasthan Economy & Geography': 20,
        'Science & Technology': 15,
        'Reasoning & Mental Ability': 20
      }
    }
  },
  {
    id: 'ras_mains',
    name: 'RAS MAINS',
    targetScore: 60,
    subjects: [
      {
        name: 'General Studies I',
        topics: [
          { name: 'History, Econ & Sociology', subtopics: ['History of Rajasthan', 'Indian History', 'Indian Economy', 'Sociology & Management'] }
        ]
      },
      {
        name: 'General Studies II',
        topics: [
          { name: 'Ethics, Science & Geo', subtopics: ['Administrative Ethics', 'General Science & Tech', 'Earth Science & Geography'] }
        ]
      },
      {
        name: 'General Studies III',
        topics: [
          { name: 'Polity, Public Admin & Sports', subtopics: ['Indian Political System', 'Public Administration', 'Sports & Yoga', 'Behavior & Law'] }
        ]
      },
      {
        name: 'General Hindi & English',
        topics: [
          { name: 'Languages Paper', subtopics: ['Hindi Grammar & Drafting', 'English Grammar & Comprehension'] }
        ]
      }
    ],
    rules: {
      numQuestions: 80,
      timeLimitMinutes: 180,
      negativeMarking: 0,
      subjectAllotments: {
        'General Studies I': 20,
        'General Studies II': 20,
        'General Studies III': 20,
        'General Hindi & English': 20
      }
    }
  },
  {
    id: 'eo_ro',
    name: 'EO RO',
    targetScore: 85,
    subjects: [
      {
        name: 'Rajasthan History & Geography',
        topics: [
          { name: 'Rajasthan GK Core', subtopics: ['Major Historical Events', 'Art & Festivals', 'Geography & Wildlife', 'Tourism & Heritage'] }
        ]
      },
      {
        name: 'Indian Constitution & Polity',
        topics: [
          { name: 'Indian Constitutional Framework', subtopics: ['Constituent Assembly', 'Directive Principles', 'Local Panchayati Raj', 'State Legislature & High Court'] }
        ]
      },
      {
        name: 'Rajasthan Municipality Act 2009',
        topics: [
          { name: 'Municipal Act Rules', subtopics: ['Constitution of Municipalities', 'Conduct of Business', 'Municipal Property & Revenue', 'Urban Development Schemes'] }
        ]
      }
    ],
    rules: {
      numQuestions: 120,
      timeLimitMinutes: 120,
      negativeMarking: -0.33,
      subjectAllotments: {
        'Rajasthan History & Geography': 40,
        'Indian Constitution & Polity': 40,
        'Rajasthan Municipality Act 2009': 40
      }
    }
  }
];
