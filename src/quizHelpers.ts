import type { Lesson, Question } from './types';

export type MixedQuizQuestionCount = 25 | 50 | 100 | 'all';

export type LessonQuestionMap = Record<string, readonly Question[]>;

const shuffleArray = <T,>(items: readonly T[], random: () => number) => {
  const shuffledItems = [...items];

  for (let index = shuffledItems.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffledItems[index], shuffledItems[swapIndex]] = [shuffledItems[swapIndex], shuffledItems[index]];
  }

  return shuffledItems;
};

export const buildMixedQuizQuestionPool = (
  lessons: readonly Lesson[],
  questionsByLessonId: LessonQuestionMap,
  subjectId: string,
  selectedLessonIds: readonly string[],
  requestedQuestionCount: MixedQuizQuestionCount,
  random: () => number = Math.random,
) => {
  const selectedLessonIdSet = new Set(selectedLessonIds);
  const selectedSubjectLessonIds = new Set(
    lessons
      .filter((lesson) => lesson.categoryId === subjectId && selectedLessonIdSet.has(lesson.id))
      .map((lesson) => lesson.id),
  );

  const mixedQuestions = Array.from(selectedSubjectLessonIds).flatMap((lessonId) => [
    ...(questionsByLessonId[lessonId] ?? []),
  ]);
  const randomizedQuestions = shuffleArray(mixedQuestions, random);

  return requestedQuestionCount === 'all'
    ? randomizedQuestions
    : randomizedQuestions.slice(0, requestedQuestionCount);
};
