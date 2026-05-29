export interface Lesson {
  id: string;
  title: string;
  description: string;
  questionFile: string;
}

export type AttemptMode = 'practice' | 'quiz';

export interface LessonProgress {
  lastScore: number;
  lastTotal: number;
  lastPercentage: number;
  bestScore: number;
  bestTotal?: number;
  bestPercentage: number;
  completedCount: number;
  lastCompletedAt: string;
  lastMode?: AttemptMode;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: 'multiple-choice';
  prompt: string;
  choices: string[];
  answer: string | string[];
  explanation: string;
}

export interface FillBlankQuestion {
  id: string;
  type: 'fill-in-the-blank';
  prompt: string;
  answer: string | string[];
  explanation: string;
}

export interface TrueFalseQuestion {
  id: string;
  type: 'true-false';
  prompt: string;
  answer: boolean | 'true' | 'false';
  explanation: string;
}

export type Question = MultipleChoiceQuestion | FillBlankQuestion | TrueFalseQuestion;

export interface AnswerReview {
  question: Question;
  studentAnswer: string;
  isCorrect: boolean;
}
