export interface Lesson {
  id: string;
  title: string;
  description: string;
  questionFile: string;
}

export interface MultipleChoiceQuestion {
  id: string;
  type: 'multiple-choice';
  prompt: string;
  choices: string[];
  answer: string;
  explanation: string;
}

export interface FillBlankQuestion {
  id: string;
  type: 'fill-in-the-blank';
  prompt: string;
  answer: string | string[];
  explanation: string;
}

export type Question = MultipleChoiceQuestion | FillBlankQuestion;

export interface AnswerReview {
  question: Question;
  studentAnswer: string;
  isCorrect: boolean;
}
