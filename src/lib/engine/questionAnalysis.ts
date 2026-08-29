/**
 * S-CUBUS ERP — Question-Level Analysis Engine
 *
 * Pure functions for grading student responses against an answer key and
 * rolling results up to question-level and chapter/topic-level statistics.
 * Depends only on the exam's marking scheme (spec: never invent a new
 * grading methodology — reuse the same correct/wrong/unattempted marks
 * already configured on the examination).
 */

import type { MarkingScheme } from "./calculation";

export interface GradedResponse {
  isCorrect: boolean | null; // null = unattempted
  marksAwarded: number;
}

/** Grades a single response against the correct option using the exam's marking scheme. */
export function gradeResponse(
  selectedOption: string | null,
  correctOption: string,
  scheme: MarkingScheme
): GradedResponse {
  if (!selectedOption || selectedOption.trim() === "") {
    return { isCorrect: null, marksAwarded: scheme.unattemptedMarks };
  }
  const isCorrect = selectedOption.trim().toUpperCase() === correctOption.trim().toUpperCase();
  const marksAwarded = isCorrect ? scheme.correctMarks : scheme.negativeMarking ? scheme.wrongMarks : 0;
  return { isCorrect, marksAwarded };
}

export interface QuestionStat {
  questionNumber: string;
  chapter: string | null;
  topic: string | null;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  totalAttempts: number;
  accuracy: number; // % of ATTEMPTED that were correct
  attemptRate: number; // % of students who attempted this question
}

export interface ResponseRow {
  questionNumber: string;
  chapter: string | null;
  topic: string | null;
  isCorrect: boolean | null;
}

/** Aggregates cohort-wide stats for every question (spec: question-level analysis). */
export function computeQuestionStats(responses: ResponseRow[], totalStudents: number): QuestionStat[] {
  const byQuestion = new Map<string, ResponseRow[]>();
  for (const r of responses) {
    const list = byQuestion.get(r.questionNumber) ?? [];
    list.push(r);
    byQuestion.set(r.questionNumber, list);
  }

  const stats: QuestionStat[] = [];
  for (const [questionNumber, rows] of byQuestion) {
    const correctCount = rows.filter((r) => r.isCorrect === true).length;
    const wrongCount = rows.filter((r) => r.isCorrect === false).length;
    const unattemptedCount = rows.filter((r) => r.isCorrect === null).length;
    const totalAttempts = correctCount + wrongCount;
    stats.push({
      questionNumber,
      chapter: rows[0]?.chapter ?? null,
      topic: rows[0]?.topic ?? null,
      correctCount,
      wrongCount,
      unattemptedCount,
      totalAttempts,
      accuracy: totalAttempts > 0 ? roundTo((correctCount / totalAttempts) * 100, 1) : 0,
      attemptRate: totalStudents > 0 ? roundTo((totalAttempts / totalStudents) * 100, 1) : 0,
    });
  }
  return stats.sort((a, b) => a.questionNumber.localeCompare(b.questionNumber, undefined, { numeric: true }));
}

export interface ChapterStat {
  chapter: string;
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  totalAttempts: number;
  accuracy: number;
  questionCount: number;
}

/** Rolls question stats up to chapter level (spec §23: Chapter/Topic Combined Analysis). */
export function computeChapterStats(responses: ResponseRow[]): ChapterStat[] {
  const withChapter = responses.filter((r) => r.chapter);
  const byChapter = new Map<string, ResponseRow[]>();
  for (const r of withChapter) {
    const list = byChapter.get(r.chapter!) ?? [];
    list.push(r);
    byChapter.set(r.chapter!, list);
  }

  const stats: ChapterStat[] = [];
  for (const [chapter, rows] of byChapter) {
    const correctCount = rows.filter((r) => r.isCorrect === true).length;
    const wrongCount = rows.filter((r) => r.isCorrect === false).length;
    const unattemptedCount = rows.filter((r) => r.isCorrect === null).length;
    const totalAttempts = correctCount + wrongCount;
    stats.push({
      chapter,
      correctCount,
      wrongCount,
      unattemptedCount,
      totalAttempts,
      accuracy: totalAttempts > 0 ? roundTo((correctCount / totalAttempts) * 100, 1) : 0,
      questionCount: new Set(rows.map((r) => r.questionNumber)).size,
    });
  }
  return stats.sort((a, b) => b.accuracy - a.accuracy);
}

export interface StudentQuestionSummary {
  correctCount: number;
  wrongCount: number;
  unattemptedCount: number;
  totalQuestions: number;
  accuracy: number; // % of attempted that were correct
  attemptRate: number; // % of all questions attempted
  marksLostToNegative: number;
}

/** One student's own correct/wrong/unattempted breakdown (spec §21, Student 360). */
export function computeStudentQuestionSummary(
  responses: { isCorrect: boolean | null; marksAwarded: number }[]
): StudentQuestionSummary {
  const correctCount = responses.filter((r) => r.isCorrect === true).length;
  const wrongCount = responses.filter((r) => r.isCorrect === false).length;
  const unattemptedCount = responses.filter((r) => r.isCorrect === null).length;
  const totalQuestions = responses.length;
  const totalAttempts = correctCount + wrongCount;
  const marksLostToNegative = responses
    .filter((r) => r.isCorrect === false)
    .reduce((acc, r) => acc + Math.abs(Math.min(r.marksAwarded, 0)), 0);

  return {
    correctCount,
    wrongCount,
    unattemptedCount,
    totalQuestions,
    accuracy: totalAttempts > 0 ? roundTo((correctCount / totalAttempts) * 100, 1) : 0,
    attemptRate: totalQuestions > 0 ? roundTo((totalAttempts / totalQuestions) * 100, 1) : 0,
    marksLostToNegative: roundTo(marksLostToNegative, 2),
  };
}

function roundTo(value: number, precision: number): number {
  const factor = Math.pow(10, precision);
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
