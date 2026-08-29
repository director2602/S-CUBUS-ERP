import { describe, it, expect } from "vitest";
import {
  gradeResponse,
  computeQuestionStats,
  computeChapterStats,
  computeStudentQuestionSummary,
  type ResponseRow,
} from "../questionAnalysis";
import type { MarkingScheme } from "../calculation";

const scheme: MarkingScheme = {
  correctMarks: 4,
  wrongMarks: -1,
  unattemptedMarks: 0,
  negativeMarking: true,
  decimalPrecision: 2,
};

describe("gradeResponse", () => {
  it("marks a correct response with full marks", () => {
    const r = gradeResponse("B", "B", scheme);
    expect(r.isCorrect).toBe(true);
    expect(r.marksAwarded).toBe(4);
  });

  it("marks a wrong response with the negative penalty", () => {
    const r = gradeResponse("A", "B", scheme);
    expect(r.isCorrect).toBe(false);
    expect(r.marksAwarded).toBe(-1);
  });

  it("marks a blank/unattempted response with zero, not wrong", () => {
    const r = gradeResponse(null, "B", scheme);
    expect(r.isCorrect).toBeNull();
    expect(r.marksAwarded).toBe(0);
  });

  it("does not penalize a wrong answer when negative marking is disabled", () => {
    const noNeg = { ...scheme, negativeMarking: false };
    const r = gradeResponse("A", "B", noNeg);
    expect(r.isCorrect).toBe(false);
    expect(r.marksAwarded).toBe(0);
  });

  it("is case-insensitive when comparing options", () => {
    const r = gradeResponse("b", "B", scheme);
    expect(r.isCorrect).toBe(true);
  });
});

describe("computeQuestionStats", () => {
  const responses: ResponseRow[] = [
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: true },
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: true },
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: false },
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: null },
    { questionNumber: "Q2", chapter: "Optics", topic: "Reflection", isCorrect: false },
    { questionNumber: "Q2", chapter: "Optics", topic: "Reflection", isCorrect: false },
  ];

  it("computes correct/wrong/unattempted counts per question", () => {
    const stats = computeQuestionStats(responses, 4);
    const q1 = stats.find((s) => s.questionNumber === "Q1")!;
    expect(q1.correctCount).toBe(2);
    expect(q1.wrongCount).toBe(1);
    expect(q1.unattemptedCount).toBe(1);
  });

  it("computes accuracy as % of ATTEMPTED, not all students", () => {
    const stats = computeQuestionStats(responses, 4);
    const q1 = stats.find((s) => s.questionNumber === "Q1")!;
    // 2 correct out of 3 attempts (excluding the unattempted one) = 66.7%
    expect(q1.accuracy).toBe(66.7);
  });

  it("computes attempt rate as % of total students", () => {
    const stats = computeQuestionStats(responses, 4);
    const q1 = stats.find((s) => s.questionNumber === "Q1")!;
    // 3 attempts out of 4 total students = 75%
    expect(q1.attemptRate).toBe(75);
  });

  it("flags a question with zero accuracy correctly when everyone gets it wrong", () => {
    const stats = computeQuestionStats(responses, 4);
    const q2 = stats.find((s) => s.questionNumber === "Q2")!;
    expect(q2.accuracy).toBe(0);
    expect(q2.wrongCount).toBe(2);
  });

  it("sorts questions numerically, not lexicographically", () => {
    const rows: ResponseRow[] = [
      { questionNumber: "Q10", chapter: null, topic: null, isCorrect: true },
      { questionNumber: "Q2", chapter: null, topic: null, isCorrect: true },
      { questionNumber: "Q1", chapter: null, topic: null, isCorrect: true },
    ];
    const stats = computeQuestionStats(rows, 3);
    expect(stats.map((s) => s.questionNumber)).toEqual(["Q1", "Q2", "Q10"]);
  });
});

describe("computeChapterStats", () => {
  const responses: ResponseRow[] = [
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: true },
    { questionNumber: "Q1", chapter: "Mechanics", topic: "Kinematics", isCorrect: false },
    { questionNumber: "Q2", chapter: "Mechanics", topic: "Dynamics", isCorrect: true },
    { questionNumber: "Q3", chapter: "Optics", topic: "Reflection", isCorrect: false },
  ];

  it("rolls up accuracy per chapter across multiple questions", () => {
    const stats = computeChapterStats(responses);
    const mechanics = stats.find((s) => s.chapter === "Mechanics")!;
    // 2 correct, 1 wrong across the Mechanics chapter -> 66.7%
    expect(mechanics.correctCount).toBe(2);
    expect(mechanics.wrongCount).toBe(1);
    expect(mechanics.accuracy).toBe(66.7);
    expect(mechanics.questionCount).toBe(2);
  });

  it("ignores responses with no chapter tagged, rather than crashing", () => {
    const untagged: ResponseRow[] = [{ questionNumber: "Q9", chapter: null, topic: null, isCorrect: true }];
    const stats = computeChapterStats(untagged);
    expect(stats).toEqual([]);
  });

  it("sorts chapters by accuracy descending", () => {
    const stats = computeChapterStats(responses);
    expect(stats[0].chapter).toBe("Mechanics"); // 66.7% > Optics' 0%
  });
});

describe("computeStudentQuestionSummary", () => {
  it("computes one student's own correct/wrong/unattempted breakdown", () => {
    const responses = [
      { isCorrect: true, marksAwarded: 4 },
      { isCorrect: true, marksAwarded: 4 },
      { isCorrect: false, marksAwarded: -1 },
      { isCorrect: null, marksAwarded: 0 },
    ];
    const summary = computeStudentQuestionSummary(responses);
    expect(summary.correctCount).toBe(2);
    expect(summary.wrongCount).toBe(1);
    expect(summary.unattemptedCount).toBe(1);
    expect(summary.totalQuestions).toBe(4);
    // 2 correct / 3 attempted = 66.7%
    expect(summary.accuracy).toBe(66.7);
    expect(summary.marksLostToNegative).toBe(1);
  });

  it("returns zero accuracy rather than NaN for an all-unattempted paper", () => {
    const responses = [
      { isCorrect: null, marksAwarded: 0 },
      { isCorrect: null, marksAwarded: 0 },
    ];
    const summary = computeStudentQuestionSummary(responses);
    expect(summary.accuracy).toBe(0);
    expect(summary.attemptRate).toBe(0);
  });
});
