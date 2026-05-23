import type { GradingSettings } from "@/lib/school-settings"

export type CurriculumPreset = {
  code: string
  name: string
  examBodyCode: "WAEC" | "CAMBRIDGE" | "IB" | "NECO" | "NONE"
  aiPromptHint: string
  gradingScale: GradingSettings
}

const NIGERIAN_CA: GradingSettings["caComponents"] = ["CA1", "CA2", "Mid-Term", "Assignment"]

export const CURRICULUM_PRESETS: CurriculumPreset[] = [
  {
    code: "WAEC",
    name: "WAEC (NERDC)",
    examBodyCode: "WAEC",
    aiPromptHint:
      "Aligned with the NERDC curriculum. Match the style of WAEC / NECO papers, including the trap-style distractors common in WAEC objective questions.",
    gradingScale: {
      scale: [
        { grade: "A1", minScore: 75, maxScore: 100, points: 4.0, remark: "Excellent" },
        { grade: "B2", minScore: 70, maxScore: 74, points: 3.5, remark: "Very good" },
        { grade: "B3", minScore: 65, maxScore: 69, points: 3.0, remark: "Good" },
        { grade: "C4", minScore: 60, maxScore: 64, points: 2.5, remark: "Credit" },
        { grade: "C5", minScore: 55, maxScore: 59, points: 2.0, remark: "Credit" },
        { grade: "C6", minScore: 50, maxScore: 54, points: 1.5, remark: "Credit" },
        { grade: "D7", minScore: 45, maxScore: 49, points: 1.0, remark: "Pass" },
        { grade: "E8", minScore: 40, maxScore: 44, points: 0.5, remark: "Pass" },
        { grade: "F9", minScore: 0, maxScore: 39, points: 0.0, remark: "Fail" },
      ],
      caWeight: 40,
      examWeight: 60,
      caComponents: NIGERIAN_CA,
      positionRanking: true,
    },
  },
  {
    code: "IGCSE",
    name: "Cambridge IGCSE",
    examBodyCode: "CAMBRIDGE",
    aiPromptHint:
      "Aligned with the Cambridge IGCSE syllabus. Use British English spelling. Mark schemes should resemble Cambridge mark schemes: discrete marking points, not WAEC-style trap distractors.",
    gradingScale: {
      scale: [
        { grade: "A*", minScore: 90, maxScore: 100, points: 8, remark: "Exceptional" },
        { grade: "A", minScore: 80, maxScore: 89, points: 7, remark: "Excellent" },
        { grade: "B", minScore: 70, maxScore: 79, points: 6, remark: "Very good" },
        { grade: "C", minScore: 60, maxScore: 69, points: 5, remark: "Good" },
        { grade: "D", minScore: 50, maxScore: 59, points: 4, remark: "Satisfactory" },
        { grade: "E", minScore: 40, maxScore: 49, points: 3, remark: "Pass" },
        { grade: "F", minScore: 30, maxScore: 39, points: 2, remark: "Borderline" },
        { grade: "G", minScore: 20, maxScore: 29, points: 1, remark: "Minimum" },
        { grade: "U", minScore: 0, maxScore: 19, points: 0, remark: "Ungraded" },
      ],
      caWeight: 30,
      examWeight: 70,
      caComponents: ["Coursework 1", "Coursework 2", "Practical"],
      positionRanking: false,
    },
  },
  {
    code: "CHECKPOINT",
    name: "Cambridge Checkpoint (Lower Secondary)",
    examBodyCode: "CAMBRIDGE",
    aiPromptHint:
      "Aligned with the Cambridge Lower Secondary (Checkpoint) syllabus. Use British English. Questions should match Checkpoint paper conventions — clear command words (state, describe, explain, calculate) and Cambridge-style mark allocation in brackets.",
    gradingScale: {
      scale: [
        { grade: "6.0", minScore: 90, maxScore: 100, points: 6, remark: "Exceeding" },
        { grade: "5.0", minScore: 80, maxScore: 89, points: 5, remark: "Securing" },
        { grade: "4.0", minScore: 65, maxScore: 79, points: 4, remark: "Developing" },
        { grade: "3.0", minScore: 50, maxScore: 64, points: 3, remark: "Working towards" },
        { grade: "2.0", minScore: 30, maxScore: 49, points: 2, remark: "Below expected" },
        { grade: "1.0", minScore: 0, maxScore: 29, points: 1, remark: "Well below" },
      ],
      caWeight: 40,
      examWeight: 60,
      caComponents: ["Unit 1", "Unit 2", "Mid-Term", "Assignment"],
      positionRanking: false,
    },
  },
  {
    code: "ALEVEL",
    name: "Cambridge A-Level",
    examBodyCode: "CAMBRIDGE",
    aiPromptHint:
      "Aligned with the Cambridge A-Level syllabus. Use British English. Questions should reflect AS / A2 exam style with structured multi-part questions, command words, and explicit marks-per-part allocation.",
    gradingScale: {
      scale: [
        { grade: "A*", minScore: 90, maxScore: 100, points: 6, remark: "Outstanding" },
        { grade: "A", minScore: 80, maxScore: 89, points: 5, remark: "Excellent" },
        { grade: "B", minScore: 70, maxScore: 79, points: 4, remark: "Very good" },
        { grade: "C", minScore: 60, maxScore: 69, points: 3, remark: "Good" },
        { grade: "D", minScore: 50, maxScore: 59, points: 2, remark: "Satisfactory" },
        { grade: "E", minScore: 40, maxScore: 49, points: 1, remark: "Pass" },
        { grade: "U", minScore: 0, maxScore: 39, points: 0, remark: "Ungraded" },
      ],
      caWeight: 20,
      examWeight: 80,
      caComponents: ["Practical", "Coursework"],
      positionRanking: false,
    },
  },
  {
    code: "NECO",
    name: "NECO (Nigerian)",
    examBodyCode: "NECO",
    aiPromptHint:
      "Aligned with the NERDC curriculum, NECO exam style. NECO questions are similar to WAEC but typically with fewer trap distractors and slightly more straightforward phrasing.",
    gradingScale: {
      scale: [
        { grade: "A", minScore: 80, maxScore: 100, points: 4.0, remark: "Excellent" },
        { grade: "B", minScore: 70, maxScore: 79, points: 3.5, remark: "Very good" },
        { grade: "C", minScore: 60, maxScore: 69, points: 3.0, remark: "Good" },
        { grade: "D", minScore: 50, maxScore: 59, points: 2.5, remark: "Credit" },
        { grade: "E", minScore: 40, maxScore: 49, points: 1.0, remark: "Pass" },
        { grade: "F", minScore: 0, maxScore: 39, points: 0.0, remark: "Fail" },
      ],
      caWeight: 40,
      examWeight: 60,
      caComponents: NIGERIAN_CA,
      positionRanking: true,
    },
  },
]

export function findPreset(code: string): CurriculumPreset | undefined {
  return CURRICULUM_PRESETS.find((p) => p.code === code)
}

export const EXAM_BODY_CODES = ["WAEC", "CAMBRIDGE", "IB", "NECO", "NONE"] as const
export type ExamBodyCode = (typeof EXAM_BODY_CODES)[number]
