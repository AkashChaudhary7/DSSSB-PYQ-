/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialized Gemini client
let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(): GoogleGenAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.trim() === "") {
      throw new Error("GEMINI_API_KEY is not configured. Please add your Gemini API key in the 'Secrets' panel in the AI Studio UI to enable real-time question generation.");
    }
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return geminiClient;
}

// Standalone High-Yield Fallback CS MCQ Generator
function generateFallbackQuestions(topic: string, subtopic: string) {
  const t = (topic || "Operating Systems").trim();
  const sub = (subtopic || "General Theory").trim();
  
  let list = [];
  
  if (t === "Operating Systems") {
    list = [
      {
        text: `In Operating Systems development, what is the primary structural role of the CPU scheduler to maximize efficiency for ${sub}?`,
        options: [
          "To allocate CPU core time quantum to active threads or processes safely.",
          "To physically write system memory buffers back onto non-volatile disk blocks.",
          "To encrypt network packet headers prior to DMA transmission.",
          "To dynamically clear standard page tables in hardware sockets."
        ],
        correctIndex: 0,
        difficulty: "easy",
        explanation: `The dispatcher and scheduler's central role is process scheduling and allocating execution resources to active units, which is crucial for coordinating ${sub} safely.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `When evaluating the concurrency safety of ${sub}, which synchronization primitive or lock mechanism is typically modeled to guarantee mutual exclusion?`,
        options: [
          "Mutex locks, Semaphores, or hardware Test-And-Set atomic instructions.",
          "Direct raw signal broadcasting over the Ethernet physical boundary.",
          "Static local allocation of unmapped frame files without protection.",
          "Complete termination of the kernel-mode loop execution."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `Mutual exclusion in system design is standardly implemented via mutexes, counting semaphores, or low-level atomic primitives to protect shared critical section components in ${sub}.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Consider a scenario where systems executing ${sub} suffer excessive context-switching overhead. Which optimization is typically applied to improve throughput?`,
        options: [
          "Increasing the length of the scheduling time slice or quantum.",
          "Decreasing the physical cache block size in processors.",
          "Disabling virtual memory and page tables entirely.",
          "Using a single-thread sequential polling loop."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `Extending the time quantum decreases the frequency of scheduler intervention and context switches, which can decrease dispatcher overhead related to coordinating complex locks in ${sub}.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Suppose a multi-core processor executes concurrent instructions under ${sub}. How do hardware-level memory barriers or cache coherence protocols (like MESI) handle state isolation?`,
        options: [
          "By serializing memory reads/writes to ensure all cores observe consistent state transitions.",
          "By physically switching off secondary execution threads during a write instruction.",
          "By forcing all page faults to route through the primary core.",
          "By disabling interrupt request vectors globally."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Memory barriers (fences) enforce memory ordering constraints, ensuring concurrent processors observe operations in the intended logical order under ${sub}.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Which of the following resource-allocation structures is most effective to systematically prevent a circular wait deadlock condition in a system using ${sub}?`,
        options: [
          "Defining a strict global ordering of resource requests.",
          "Allocating infinite virtual swap space dynamically.",
          "Pre-empting all ready queues indiscriminately.",
          "Forcing synchronous socket binds on high loads."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Predefining a resource hierarchy or ordering mathematically prevents the circular wait condition from materializing under standard deadlock mitigation models.`,
        source: "Local Synthesis (Cloud API Overload)"
      }
    ];
  } else if (t === "Computer Networks") {
    list = [
      {
        text: `At which layer of the standard networking model (OSI or TCP/IP) does the logic for ${sub} primarily execute during active packet flow?`,
        options: [
          "Network or Transport Layer (addressing, packet routing, and logical end-to-end transport).",
          "Physical Layer (raw binary signal modulation over physical medium).",
          "Application Layer (solely rendering user UI components).",
          "Data Link Layer (strictly framing MAC elements)."
        ],
        correctIndex: 0,
        difficulty: "easy",
        explanation: `The core mechanism of addressing, logical transmission, or routing associated with ${sub} belongs to the network and transport protocols.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `When implementing ${sub} under high-throughput conditions, which transmission control paradigm is standardly used to prevent receiver buffering overflow?`,
        options: [
          "Sliding Window flow control (such as congestion window updates).",
          "Direct physical hardware frequency division multiplexing.",
          "Indiscriminate packet duplication over standard switches.",
          "Complete termination of active connections."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `Sliding window protocols allow dynamic window tuning to pace sender rates with receiver capabilities, essential for standard ${sub} flow control.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Consider a network scenario using ${sub} with non-trivial transmission losses. What mechanism ensures reliable, orderly delivery of segments?`,
        options: [
          "Sequence numbering, cyclic redundancy checks, and selective ARQ flags.",
          "Forced visual echo from the endpoint client.",
          "Dynamic allocation of local DNS subdomains.",
          "Using UDP broadcasts with zero acknowledgment."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `ACK flags, sequence indices, checksums, and Retransmission timers ensure reliable and error-free byte delivery for ${sub} channels.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `How does a standard routing or congestion control system handle a state of transmission congestion or loop vulnerability under ${sub}?`,
        options: [
          "By employing Poison Reverse, Split Horizon, or exponential backoff congestion schemes.",
          "By resetting the physical network hub buffers.",
          "By allocating a static proxy resolver.",
          "By mapping all packets to localhost loopbacks."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Split Horizon and Poison Reverse prevent loops in distance vector routing, while additive-increase/multiplicative-decrease handles congestion under active ${sub} limits.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `What is the primary security risk of transferring protocol header payloads or sensitive system data unprotected under ${sub}?`,
        options: [
          "Vulnerability to Man-In-The-Middle (MITM) session hijacking or packet sniffing.",
          "Instant physical degradation of fiber optic physical cables.",
          "Failure of the local compiler to resolve import pathways.",
          "Reduction in the hardware RAM clock speeds."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Unencrypted or unsigned protocol segments are highly susceptible to spoofing, interception, and credential manipulation, requiring SSL/TLS or IPsec layers.`,
        source: "Local Synthesis (Cloud API Overload)"
      }
    ];
  } else if (t === "Database Systems") {
    list = [
      {
        text: `In database schema modeling, how does ${sub} guarantee record uniqueness and relation integrity across tables?`,
        options: [
          "By defining explicit Primary Key structures and Foreign Key integrity constraints.",
          "By copying the entire data block to physical local arrays.",
          "By converting relational schemas to unindexed CSV structures.",
          "By disabling auto-increment mechanisms completely."
        ],
        correctIndex: 0,
        difficulty: "easy",
        explanation: `Primary keys enforce uniqueness constraints within a table, while foreign keys model safe referential relations linked tightly with ${sub} properties.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Under high concurrent write environments, which mechanism is standardly applied to protect transactional ACID properties for ${sub}?`,
        options: [
          "Two-Phase Locking (2PL) or Optimistic Concurrency Control (OCC) protocols.",
          "Compiling query templates directly into static executable processes.",
          "Clearing the server cache systematically on every select block.",
          "Allowing non-serializable raw thread writes without locks."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `Strict 2PL and OCC prevent write-write anomalies and write-read conflicts, preserving serializability during multi-threaded ${sub} updates.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `What is the primary operational objective of applying Normalization (e.g. 1NF to BCNF) in database schemas executing ${sub}?`,
        options: [
          "To reduce data redundancy and eliminate insert, update, and delete anomalies.",
          "To physically compress database files using gzip algorithms.",
          "To bypass SQL parsing engines by using raw filesystem seeks.",
          "To double the storage requirements for faster read-ahead lookups."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `Schema normalization aligns relations with functional dependency standards, avoiding data anomalies and optimizing structural storage for ${sub}.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `How does a relational database query planner optimize filter lookups or joins when handling queries dealing heavily with ${sub}?`,
        options: [
          "By utilizing B+ Trees or Hash Index structures to avoid linear table scans.",
          "By dynamically rewriting SQL statements into nested loops.",
          "By forcing write ahead logs to write directly to non-volatile registers.",
          "By ignoring relational schema constraints during execution."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `A cost-based query optimizer indexes keys using high-fanout B+ trees to achieve logarithmic lookup times, bypassing costly scans for ${sub} structures.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `In database crash recovery models (e.g., ARIES), how does the system ensure durability and transaction rollback for ${sub}?`,
        options: [
          "By writing changes to a Write-Ahead Log (WAL) before updating dirty database pages.",
          "By maintaining duplicates of the database on separate local drives.",
          "By completely reinstalling the database package upon a crash.",
          "By avoiding memory buffers and writing straight to physical blocks."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Under WAL (Write-Ahead Logging) protocols, transaction state modifications are appended to non-volatile log files before actual table pages are flushed, enabling safe replay/undo for ${sub} transactions.`,
        source: "Local Synthesis (Cloud API Overload)"
      }
    ];
  } else {
    // Data Structures & Algos or general
    list = [
      {
        text: `What is the primary consideration when evaluating the worst-case Time Complexity of an algorithm implementing ${sub}?`,
        options: [
          "The asymptotic behavior and rate of growth of execution steps as a function of input size N.",
          "The exact nanoseconds taken by the local system CPU clock speed.",
          "The file size of the source code when compiled to binary format.",
          "The choice of background color on the development IDE."
        ],
        correctIndex: 0,
        difficulty: "easy",
        explanation: `Big-O notation measures the scalability and theoretical ceiling of operation cycles, indicating how ${sub} scales with input bounds.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `When implementing ${sub} under tight memory or search constraints, how does a balanced tree structure (e.g., AVL or Red-Black Tree) compare to a raw linked list?`,
        options: [
          "It guarantees O(log N) lookup, insertion, and deletion times by maintaining height invariants.",
          "It decreases cache locality but forces O(1) random index lookups.",
          "It removes the need to store data nodes or child links in memory.",
          "It runs exclusively on parallel multi-core platforms."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `The height-balanced criteria of Red-Black and AVL trees preserve logarithmic bounds on vital operations, preventing the O(N) degradation of skewed lists during ${sub} execution.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `What technique is standardly applied in Dynamic Programming solutions representing ${sub} to prevent calculating recurring overlapping subproblems?`,
        options: [
          "Memoization or Tabulation of intermediate results inside lookup tables.",
          "Forced recursion without a terminating basecase.",
          "Direct local sorting of inputs using randomized pivots.",
          "Utilizing large arrays that are cleared upon every recursive leap."
        ],
        correctIndex: 0,
        difficulty: "medium",
        explanation: `By caching solutions to identical subproblems (memoization) or computing bottom-up arrays (tabulation), DP reduces exponential search spaces to polynomial time for ${sub} tasks.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `In graph algorithms related to ${sub}, what is the fundamental structural distinction between Breadth-First Search (BFS) and Depth-First Search (DFS) traversal?`,
        options: [
          "BFS computes shortest paths in unweighted graphs using a Queue, while DFS explores branches deep using a Stack/Recursion.",
          "BFS scales quadratically in memory whereas DFS requires zero execution stack frames.",
          "BFS can only locate vertices containing negative weight values.",
          "DFS requires the active network to be structured as a strict binary tree."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `BFS examines neighboring nodes level-by-level (FIFO queue queueing), ensuring shortest path characteristics, whereas DFS dives to leaf structures before back-tracking (LIFO processing) under ${sub} designs.`,
        source: "Local Synthesis (Cloud API Overload)"
      },
      {
        text: `Which of the following describes the behavior of Amortized Analysis when resizing dynamic data structures used in operations representing ${sub}?`,
        options: [
          "An analytical method that averages the worst-case cost of a sequence of operations to show individual costly steps are rare.",
          "A statistical tool to measure CPU execution time under varying temperatures.",
          "The process of deleting half of the array components when memory exceeds a threshold.",
          "A strict security assertion checking array bounds at compile-time."
        ],
        correctIndex: 0,
        difficulty: "hard",
        explanation: `Amortized analysis guarantees that even if a rare operation is costly, the average rate of a sequence of N actions remains low for safe ${sub} dynamic structures.`,
        source: "Local Synthesis (Cloud API Overload)"
      }
    ];
  }

  // Randomize / shuffle choices so it's fresh and high quality
  return list.map((q) => {
    const originalOptions = [...q.options];
    const correctOptionText = originalOptions[q.correctIndex];
    
    // Fisher-Yates shuffle
    const shuffledOptions = [...originalOptions];
    for (let i = shuffledOptions.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = shuffledOptions[i];
      shuffledOptions[i] = shuffledOptions[j];
      shuffledOptions[j] = temp;
    }
    
    const newCorrectIndex = shuffledOptions.indexOf(correctOptionText);
    return {
      text: q.text,
      options: shuffledOptions,
      correctIndex: newCorrectIndex === -1 ? 0 : newCorrectIndex,
      difficulty: q.difficulty,
      explanation: q.explanation,
      source: q.source
    };
  });
}

// REST route to search and generate computer science MCQs based on a subtopic
app.post('/api/generate-questions', async (req, res) => {
  const { topic, subtopic } = req.body;
  if (!subtopic || subtopic.trim() === '') {
    res.status(400).json({ error: 'Subtopic name is required.' });
    return;
  }

  try {
    let ai;
    try {
      ai = getGeminiClient();
    } catch (err: any) {
      console.warn("Gemini client initialization warning: Switching to dynamic local generator fallback.", err.message);
      
      const rawFallback = generateFallbackQuestions(topic, subtopic);
      const questionsWithIds = rawFallback.map((q: any, idx: number) => ({
        ...q,
        id: `gen-local-${Date.now()}-${idx}`,
        topic: topic || "Computer Science",
        subtopic: subtopic,
        isCustom: true
      }));

      res.json({ questions: questionsWithIds, isOfflineFallback: true });
      return;
    }

    const parentTopicStr = topic ? ` (under the parent topic of ${topic})` : '';
    
    const prompt = `Generate exactly 5 different high-quality computer science multiple choice questions (MCQs) for the subtopic "${subtopic}"${parentTopicStr}. 
The questions must vary in depth and cover the following difficulty distribution:
- 2 Easy questions (fundamental concept checking)
- 2 Medium questions (analysis/calculative/implementation)
- 1 Hard question (complex reasoning similar to competitive exams like GATE or advanced technical interviews).

Please base these questions on authoritative reference problems found on sites like Sanfoundry, GeeksforGeeks, or formal textbooks. Give clear, detailed explanations for the correct answers.

Important:
- Return ONLY the JSON object conforming to the response schema.
- options must be an array of exactly 4 strings.
- correctIndex must be an integer between 0 and 3 indicating the correct choice.
- difficulty must be exactly one of "easy", "medium", or "hard".
- source must be listed, e.g. "Sanfoundry", "GeeksforGeeks", or "Academic Reference".`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "You are an elite Computer Science professor and competitive examiner. Generate flawless multiple-choice test questions with exact correct options and fully comprehensive, educational explanations.",
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  text: { 
                    type: Type.STRING, 
                    description: "The complete question statement. Should be technical and precise." 
                  },
                  options: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING },
                    description: "Exactly 4 multiple choice options."
                  },
                  correctIndex: { 
                    type: Type.INTEGER, 
                    description: "0-indexed index of the correct option (0 to 3)." 
                  },
                  difficulty: { 
                    type: Type.STRING, 
                    description: "Must be exactly 'easy', 'medium', or 'hard'." 
                  },
                  explanation: { 
                    type: Type.STRING, 
                    description: "Educational breakdown explaining why the designated index is correct and why other options are wrong." 
                  },
                  source: { 
                    type: Type.STRING, 
                    description: "Origin reference, e.g. Sanfoundry, GeeksforGeeks, Computer Science Exam." 
                  }
                },
                required: ["text", "options", "correctIndex", "difficulty", "explanation", "source"]
              }
            }
          },
          required: ["questions"]
        }
      }
    });

    const responseText = response.text;
    if (!responseText) {
      throw new Error("No response received from the question generation model.");
    }

    const parsedData = JSON.parse(responseText.trim());
    
    // Assign stable IDs to generated questions on arrival
    const questionsWithIds = (parsedData.questions || []).map((q: any, idx: number) => ({
      ...q,
      id: `gen-${Date.now()}-${idx}`,
      topic: topic || "Computer Science",
      subtopic: subtopic,
      isCustom: true
    }));

    res.json({ questions: questionsWithIds });
  } catch (error: any) {
    console.error("Gemini model call failed or quota exhausted: Switching to dynamic local generator fallback:", error);
    
    const rawFallback = generateFallbackQuestions(topic, subtopic);
    const questionsWithIds = rawFallback.map((q: any, idx: number) => ({
      ...q,
      id: `gen-local-${Date.now()}-${idx}`,
      topic: topic || "Computer Science",
      subtopic: subtopic,
      isCustom: true
    }));

    res.json({ questions: questionsWithIds, isOfflineFallback: true });
  }
});

// Setup Vite & Static Assets
async function start() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

start();
