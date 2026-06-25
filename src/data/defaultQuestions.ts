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

export const DEFAULT_QUESTIONS: Question[] = [];
