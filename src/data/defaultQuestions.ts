/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Question, TopicConfig } from '../types';

export const TOPICS: TopicConfig[] = [
  {
    name: "Operating Systems",
    icon: "Cpu",
    subtopics: [
      "Process Management",
      "Memory Management",
      "CPU Scheduling",
      "Deadlocks",
      "File Systems"
    ]
  },
  {
    name: "Computer Networks",
    icon: "Network",
    subtopics: [
      "OSI Model",
      "TCP/IP Suite",
      "Routing Algorithms",
      "IP Addressing & Subnetting",
      "Network Security"
    ]
  },
  {
    name: "Database Systems",
    icon: "Database",
    subtopics: [
      "Relational Model & SQL",
      "Normalization",
      "Transaction & Concurrency",
      "Indexing & Hashing",
      "NoSQL Databases"
    ]
  },
  {
    name: "Data Structures & Algos",
    icon: "Binary",
    subtopics: [
      "Arrays & Linked Lists",
      "Stacks & Queues",
      "Trees & Graphs",
      "Sorting & Searching",
      "Dynamic Programming"
    ]
  }
];

export const DEFAULT_QUESTIONS: Question[] = [
  // --- OPERATING SYSTEMS ---
  {
    id: "os-pm-1",
    topic: "Operating Systems",
    subtopic: "Process Management",
    difficulty: "easy",
    text: "What is a process control block (PCB)?",
    options: [
      "A block of memory that holds process executable instructions.",
      "A data structure that stores information about a specific process.",
      "A hardware controller that prevents deadlocks.",
      "The set of registers containing execution states."
    ],
    correctIndex: 1,
    explanation: "A Process Control Block (PCB) is a data structure used by the operating system to store all the information about a process (e.g., process state, program counter, CPU registers, CPU scheduling info, etc.).",
    source: "GeeksforGeeks"
  },
  {
    id: "os-pm-2",
    topic: "Operating Systems",
    subtopic: "Process Management",
    difficulty: "medium",
    text: "Which of the following transitions is invalid in a process life cycle?",
    options: [
      "Running -> Ready",
      "Blocked -> Running",
      "Running -> Blocked",
      "Ready -> Running"
    ],
    correctIndex: 1,
    explanation: "A process cannot transition directly from the Blocked state to the Running state. It must first go to the Ready state and wait for the CPU scheduler to schedule it.",
    source: "Sanfoundry"
  },
  {
    id: "os-pm-3",
    topic: "Operating Systems",
    subtopic: "Process Management",
    difficulty: "hard",
    text: "In the context of Inter-Process Communication, which of the following is true regarding 'bounded buffer' message passing using critical sections?",
    options: [
      "Producer can write anytime; consumer blocks only when buffer is full.",
      "Consumer can read anytime; producer blocks only when buffer is empty.",
      "Producer blocks when the buffer is full, and Consumer blocks when the buffer is empty.",
      "No synchronization is needed if buffer size is prime."
    ],
    correctIndex: 2,
    explanation: "In the bounded buffer problem, the producer must wait (block) if the buffer is full, and the consumer must wait (block) if the buffer is empty, to prevent overflow or underflow conditions.",
    source: "Gate Overflow"
  },
  // Memory Management
  {
    id: "os-mm-1",
    topic: "Operating Systems",
    subtopic: "Memory Management",
    difficulty: "easy",
    text: "What does virtual memory allow?",
    options: [
      "Execution of processes that are larger than the physical main memory.",
      "Increasing the speed of RAM access dramatically.",
      "Storing files without requiring a hard drive or SSD.",
      "Running operating systems without boot loaders."
    ],
    correctIndex: 0,
    explanation: "Virtual memory maps logical addresses to physical addresses, enabling process execution even when the entire job does not reside in physical memory at once.",
    source: "Sanfoundry"
  },
  {
    id: "os-mm-2",
    topic: "Operating Systems",
    subtopic: "Memory Management",
    difficulty: "medium",
    text: "What is thrashing in an operating system?",
    options: [
      "A physical hardware diagnostic utility for cleaning up disk storage.",
      "A condition where the CPU spends more time swapping pages in and out than executing instructions.",
      "A scheduling technique to allocate blocks of continuous processes.",
      "The automatic compression of logs when memory runs thin."
    ],
    correctIndex: 1,
    explanation: "Thrashing occurs when the operating system spends a high percentage of its time page-swapping rather than executing instructions, typically caused by a lack of sufficient physical pages.",
    source: "GeeksforGeeks"
  },
  {
    id: "os-mm-3",
    topic: "Operating Systems",
    subtopic: "Memory Management",
    difficulty: "hard",
    text: "Consider a demand-paging system using the Optimal Page Replacement Algorithm. A process registers reference string '1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5' with 3 page frames. How many total page faults occur?",
    options: [
      "7 page faults",
      "8 page faults",
      "9 page faults",
      "10 page faults"
    ],
    correctIndex: 0,
    explanation: "By simulating the Optimal replacement algorithm (replacing the page that will not be used for the longest period of time): \n1. [1] (Fault)\n2. [1, 2] (Fault)\n3. [1, 2, 3] (Fault)\n4. 4 arrives: replaces 3, giving [1, 2, 4] (Fault)\n5. 1 arrives: hit\n6. 2 arrives: hit\n7. 5 arrives: replaces 4, giving [1, 2, 5] (Fault)\n8. 1, 2: hits\n9. 3 arrives: replaces 1 or 2 (optimal looks forward and replaces 1 or 2 depending on future, but 3 replaces 5 since 5 is used last or not at all before normal exhaustion). Detailed tracing yields exactly 7 faults.",
    source: "Gate Overflow"
  },
  // CPU Scheduling
  {
    id: "os-cs-1",
    topic: "Operating Systems",
    subtopic: "CPU Scheduling",
    difficulty: "easy",
    text: "Which scheduling algorithm is non-preemptive by design?",
    options: [
      "Round Robin (RR)",
      "First Come, First Served (FCFS)",
      "Shortest Remaining Time First (SRTF)",
      "Priority Scheduling (Preemptive version)"
    ],
    correctIndex: 1,
    explanation: "First Come First Served (FCFS) allocates CPU core to processes in chronological arrival order. Once allocated, a process retains control until completion or generic block.",
    source: "Sanfoundry"
  },
  {
    id: "os-cs-2",
    topic: "Operating Systems",
    subtopic: "CPU Scheduling",
    difficulty: "medium",
    text: "Which of the following is a primary disadvantage of the Shortest Job First (SJF) scheduling algorithm?",
    options: [
      "Poor interactive response times.",
      "Starvation of long-running processes.",
      "Maximum average waiting time across-the-board.",
      "Inability to work with multi-core processors."
    ],
    correctIndex: 1,
    explanation: "Shortest Job First scheduling leads to the starvation of longer-running processes if there is a steady stream of shorter-duration processes arriving continuously.",
    source: "GeeksforGeeks"
  },
  // Deadlocks
  {
    id: "os-dl-1",
    topic: "Operating Systems",
    subtopic: "Deadlocks",
    difficulty: "easy",
    text: "Which of the following is NOT one of Coffman's four necessary conditions for deadlocks?",
    options: [
      "Mutual Exclusion",
      "Hold and Wait",
      "No Preemption",
      "Preemptive Priority Scheduling"
    ],
    correctIndex: 3,
    explanation: "The four necessary conditions for dynamic deadlock defined by Coffman are Mutual Exclusion, Hold & Wait, No Preemption, and Circular Wait.",
    source: "Sanfoundry"
  },
  {
    id: "os-dl-2",
    topic: "Operating Systems",
    subtopic: "Deadlocks",
    difficulty: "medium",
    text: "What safety algorithm is used by operating systems to actively avoid deadlock scenarios?",
    options: [
      "Dijkstra's Banker's Algorithm",
      "Round Robin Cycle Breaker",
      "Kruskal's Deadlock Spanning Tree",
      "Peterson's Mutex Mechanism"
    ],
    correctIndex: 0,
    explanation: "The Banker's Algorithm is a resource allocation and deadlock avoidance algorithm that simulates resource allocation to check for safe states prior to granting resource requests.",
    source: "GeeksforGeeks"
  },

  // --- COMPUTER NETWORKS ---
  {
    id: "cn-osi-1",
    topic: "Computer Networks",
    subtopic: "OSI Model",
    difficulty: "easy",
    text: "Which layer of the OSI model is responsible for routing packets across different network segments?",
    options: [
      "Data Link Layer",
      "Transport Layer",
      "Network Layer",
      "Physical Layer"
    ],
    correctIndex: 2,
    explanation: "The Network Layer is responsible for logical host addressing, packet routing, and forwarding data packets through network networks.",
    source: "Sanfoundry"
  },
  {
    id: "cn-osi-2",
    topic: "Computer Networks",
    subtopic: "OSI Model",
    difficulty: "medium",
    text: "Which OSI layers correspond directly to the 'Application' layer of the TCP/IP model?",
    options: [
      "Application, Presentation, and Session",
      "Application, Session, and Transport",
      "Application only",
      "Application and Presentation only"
    ],
    correctIndex: 0,
    explanation: "The TCP/IP model combines the functionalities of the Application, Presentation, and Session layers of the traditional OSI model into its own single Application layer.",
    source: "GeeksforGeeks"
  },
  {
    id: "cn-tcp-1",
    topic: "Computer Networks",
    subtopic: "TCP/IP Suite",
    difficulty: "easy",
    text: "TCP is a ______ protcol, whereas UDP is a ______ protocol.",
    options: [
      "connectionless, connection-oriented",
      "connection-oriented, connectionless",
      "stateless, stateful",
      "simplex, half-duplex"
    ],
    correctIndex: 1,
    explanation: "TCP uses a three-way handshake to establish a connection (connection-oriented), while UDP simply fires packets without handshaking (connectionless).",
    source: "Sanfoundry"
  },
  {
    id: "cn-tcp-2",
    topic: "Computer Networks",
    subtopic: "TCP/IP Suite",
    difficulty: "medium",
    text: "In TCP congestion control, what happens during the 'Slow Start' phase when an ACK packet is successfully received?",
    options: [
      "The Congestion Window is incremented by 1 Maximum Segment Size (MSS) every Round Trip Time (RTT).",
      "The Congestion Window size is doubled every Round Trip Time (RTT).",
      "The Congestion Window is halved immediately.",
      "The transmission drops to a linear crawl."
    ],
    correctIndex: 1,
    explanation: "During the Slow Start phase of TCP Congestion Control, the Congestion Window (cwnd) increases exponentially, effectively doubling every Round-Trip Time (RTT) as an ACK is received for each segment.",
    source: "GeeksforGeeks"
  },
  {
    id: "cn-ip-1",
    topic: "Computer Networks",
    subtopic: "IP Addressing & Subnetting",
    difficulty: "medium",
    text: "An organization has been assigned the Class C network block 192.168.10.0/24. They need to divide it into 4 subnets. What is the custom subnet mask and how many usable hosts are there per subnet?",
    options: [
      "255.255.255.192, 62 usable hosts",
      "255.255.255.128, 126 usable hosts",
      "255.255.255.240, 14 usable hosts",
      "255.255.255.224, 30 usable hosts"
    ],
    correctIndex: 0,
    explanation: "To create 4 subnets, we need to borrow 2 bits from the host portion (2^2 = 4). Subnet mask becomes /26, or 255.255.255.192. Each subnet has 8 - 2 = 6 bits left for host IDs. 2^6 - 2 = 62 usable hosts per subnet.",
    source: "Sanfoundry"
  },

  // --- DATABASE SYSTEMS ---
  {
    id: "db-norm-1",
    topic: "Database Systems",
    subtopic: "Normalization",
    difficulty: "easy",
    text: "Which Normal Form (NF) requires attributes to be atomic (no repeating groups in columns)?",
    options: [
      "First Normal Form (1NF)",
      "Second Normal Form (2NF)",
      "Third Normal Form (3NF)",
      "Boyce-Codd Normal Form (BCNF)"
    ],
    correctIndex: 0,
    explanation: "First Normal Form (1NF) mandates that information in a table must be subdivided so that each column contains only atomic (indivisible) values, and no repeating groups exist.",
    source: "GeeksforGeeks"
  },
  {
    id: "db-norm-2",
    topic: "Database Systems",
    subtopic: "Normalization",
    difficulty: "medium",
    text: "A relation R(A, B, C, D) has functional dependencies {A -> B, B -> C, C -> D, D -> A}. What is the highest normal form of this relation?",
    options: [
      "1NF",
      "2NF",
      "3NF",
      "BCNF"
    ],
    correctIndex: 3,
    explanation: "The candidate keys of relation R are {A}, {B}, {C}, and {D} since they all determine each other. Therefore, all attributes (A, B, C, D) are prime attributes. Since every determinant is a candidate key, the relation is in Boyce-Codd Normal Form (BCNF).",
    source: "Gate Overflow"
  },
  {
    id: "db-tx-1",
    topic: "Database Systems",
    subtopic: "Transaction & Concurrency",
    difficulty: "medium",
    text: "What property of the ACID paradigm guarantees that concurrent transactions yield the exact same state as if run sequentially?",
    options: [
      "Atomicity",
      "Consistency",
      "Isolation",
      "Durability"
    ],
    correctIndex: 2,
    explanation: "Isolation ensures that concurrent execution of transactions leaves the database in the identical state that would have been obtained if transactions were executed one by one.",
    source: "Sanfoundry"
  },
  {
    id: "db-tx-2",
    topic: "Database Systems",
    subtopic: "Transaction & Concurrency",
    difficulty: "hard",
    text: "In concurrency control, which of the following is true regarding strict 2-Phase Locking (Strict 2PL)?",
    options: [
      "It allows transaction to release shared locks early but exclusive locks at the end.",
      "It avoids cascading rollbacks by holding all exclusive locks until transaction commit/abort.",
      "It eliminates deadlocks altogether.",
      "It permits transaction to acquire new locks even after releasing some locks."
    ],
    correctIndex: 1,
    explanation: "Strict 2-Phase Locking (Strict 2PL) avoids cascading rollbacks because it holds all exclusive (write) locks taken by a transaction until that transaction commits or aborts.",
    source: "GeeksforGeeks"
  },

  // --- DATA STRUCTURES & ALGOS ---
  {
    id: "dsa-ts-1",
    topic: "Data Structures & Algos",
    subtopic: "Trees & Graphs",
    difficulty: "easy",
    text: "What is the worst-case time complexity of searching for an element in a binary search tree (BST)?",
    options: [
      "O(1)",
      "O(log N)",
      "O(N)",
      "O(N log N)"
    ],
    correctIndex: 2,
    explanation: "In the worst case (skewed tree resembling a linear linked list), we must visit every node, resulting in O(N) time complexity.",
    source: "Sanfoundry"
  },
  {
    id: "dsa-ts-2",
    topic: "Data Structures & Algos",
    subtopic: "Sorting & Searching",
    difficulty: "medium",
    text: "Which sorting algorithm maintains a stable sorting order and operates with O(N log N) time complexity in both average and worst cases?",
    options: [
      "Quick Sort",
      "Merge Sort",
      "Heap Sort",
      "Selection Sort"
    ],
    correctIndex: 1,
    explanation: "Merge Sort guarantees stable sorting (equal key order is preserved) and runs in O(N log N) in all cases (best, average, worst). Heap Sort is O(N log N) but unstable, and Quick Sort is O(N^2) in the worst case.",
    source: "GeeksforGeeks"
  },
  {
    id: "dsa-ts-3",
    topic: "Data Structures & Algos",
    subtopic: "Dynamic Programming",
    difficulty: "hard",
    text: "Which of the following problems does NOT exhibit optimal substructure property required for dynamic programming?",
    options: [
      "Shortest Path in a weighted graph",
      "Longest Path in a weighted graph",
      "0/1 Knapsack Problem",
      "Longest Common Subsequence"
    ],
    correctIndex: 1,
    explanation: "The Longest Path problem does not exhibit optimal substructure because subpaths can share vertices, violating the Independence criteria of subproblems in Dynamic Programming.",
    source: "Introduction to Algorithms (CLRS)"
  }
];
