import { useEffect, useMemo, useState } from 'react';
import type { AnswerReview, Lesson, LessonProgress, Question } from './types';

const normalizeAnswer = (value: string | boolean) =>
  String(value).trim().toLowerCase().replace(/\s+/g, ' ');

const shuffleArray = <T,>(items: T[]) =>
  [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);

const getStringAnswers = (answer: string | string[]) => (Array.isArray(answer) ? answer : [answer]);

const prepareQuestionForQuiz = (question: Question): Question => {
  if (question.type !== 'multiple-choice') {
    return question;
  }

  const acceptedAnswers = getStringAnswers(question.answer);
  const acceptedAnswerKeys = new Set(acceptedAnswers.map(normalizeAnswer));
  const chosenCorrectAnswer = shuffleArray(acceptedAnswers)[0];
  const incorrectChoices = question.choices.filter((choice) => !acceptedAnswerKeys.has(normalizeAnswer(choice)));

  return {
    ...question,
    choices: shuffleArray([chosenCorrectAnswer, ...shuffleArray(incorrectChoices).slice(0, 3)]),
  };
};

const prepareQuestionsForQuiz = (questions: Question[]) =>
  shuffleArray(questions).map(prepareQuestionForQuiz);

const getAcceptedAnswers = (question: Question): Array<string | boolean> => {
  if (question.type === 'fill-in-the-blank' || question.type === 'multiple-choice') {
    return getStringAnswers(question.answer);
  }

  return [question.answer];
};

const formatAnswer = (answer: string | boolean) => {
  if (typeof answer === 'boolean') {
    return answer ? 'True' : 'False';
  }

  if (normalizeAnswer(answer) === 'true') {
    return 'True';
  }

  if (normalizeAnswer(answer) === 'false') {
    return 'False';
  }

  return answer;
};

const getReviewAnswer = (question: Question) =>
  getAcceptedAnswers(question)
    .map(formatAnswer)
    .join(' / ');

const NICKNAME_STORAGE_KEY = 'ykk-practice-nickname';
const PROGRESS_STORAGE_KEY = 'ykk-practice-progress';

type LessonProgressMap = Record<string, LessonProgress>;

const isStorageAvailable = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const testKey = 'ykk-practice-storage-test';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const readStorageValue = (key: string) => {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStorageValue = (key: string, value: string) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const removeStorageValue = (key: string) => {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
};

const isLessonProgress = (value: unknown): value is LessonProgress => {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const progress = value as Record<string, unknown>;

  return (
    typeof progress.lastScore === 'number' &&
    typeof progress.lastTotal === 'number' &&
    typeof progress.lastPercentage === 'number' &&
    typeof progress.bestScore === 'number' &&
    typeof progress.bestPercentage === 'number' &&
    typeof progress.completedCount === 'number' &&
    typeof progress.lastCompletedAt === 'string'
  );
};

const readProgress = (): LessonProgressMap => {
  const storedProgress = readStorageValue(PROGRESS_STORAGE_KEY);

  if (!storedProgress) {
    return {};
  }

  try {
    const parsedProgress: unknown = JSON.parse(storedProgress);

    if (!parsedProgress || typeof parsedProgress !== 'object' || Array.isArray(parsedProgress)) {
      return {};
    }

    return Object.entries(parsedProgress).reduce<LessonProgressMap>((validProgress, [lessonId, progress]) => {
      if (isLessonProgress(progress)) {
        validProgress[lessonId] = progress;
      }

      return validProgress;
    }, {});
  } catch {
    return {};
  }
};

const saveProgress = (progress: LessonProgressMap) =>
  writeStorageValue(PROGRESS_STORAGE_KEY, JSON.stringify(progress));

const formatShortDateTime = (dateTime: string) => {
  const date = new Date(dateTime);

  if (Number.isNaN(date.getTime())) {
    return dateTime;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
};

const getResultMessage = (percentage: number, nickname: string) => {
  if (percentage >= 90) {
    return nickname ? `Excellent work, ${nickname}.` : 'Excellent work.';
  }

  if (percentage >= 70) {
    return nickname
      ? `Good job, ${nickname}. Review the missed questions below.`
      : 'Good job. Review the missed questions below.';
  }

  if (percentage >= 50) {
    return nickname
      ? `Keep practicing, ${nickname}. Focus on the review below.`
      : 'Keep practicing. Focus on the review below.';
  }

  return nickname
    ? `Try again, ${nickname}, after reviewing the explanations.`
    : 'Try again after reviewing the explanations.';
};

function App() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState('');
  const [blankAnswer, setBlankAnswer] = useState('');
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null);
  const [reviews, setReviews] = useState<AnswerReview[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showResults, setShowResults] = useState(false);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState(() => readStorageValue(NICKNAME_STORAGE_KEY) ?? '');
  const [lessonProgress, setLessonProgress] = useState<LessonProgressMap>(() => readProgress());
  const [progressSaved, setProgressSaved] = useState(false);

  useEffect(() => {
    const trimmedNickname = nickname.trim();

    if (trimmedNickname) {
      writeStorageValue(NICKNAME_STORAGE_KEY, trimmedNickname);
      return;
    }

    removeStorageValue(NICKNAME_STORAGE_KEY);
  }, [nickname]);

  useEffect(() => {
    const loadLessons = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/lessons.json`);

        if (!response.ok) {
          throw new Error('Could not load the lesson list.');
        }

        const lessonData = (await response.json()) as Lesson[];
        setLessons(lessonData);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load lessons.');
      } finally {
        setIsLoading(false);
      }
    };

    loadLessons();
  }, []);

  const currentQuestion = questions[currentQuestionIndex];
  const score = useMemo(() => reviews.filter((review) => review.isCorrect).length, [reviews]);
  const incorrectCount = reviews.length - score;
  const percentage = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
  const missedReviews = useMemo(() => reviews.filter((review) => !review.isCorrect), [reviews]);
  const quizComplete = questions.length > 0 && showResults;

  useEffect(() => {
    if (!quizComplete || !selectedLesson || progressSaved) {
      return;
    }

    const previousProgress = lessonProgress[selectedLesson.id];
    const nextProgress: LessonProgress = {
      lastScore: score,
      lastTotal: questions.length,
      lastPercentage: percentage,
      bestScore: Math.max(previousProgress?.bestScore ?? 0, score),
      bestPercentage: Math.max(previousProgress?.bestPercentage ?? 0, percentage),
      completedCount: (previousProgress?.completedCount ?? 0) + 1,
      lastCompletedAt: new Date().toISOString(),
    };
    const nextProgressMap = {
      ...lessonProgress,
      [selectedLesson.id]: nextProgress,
    };

    if (saveProgress(nextProgressMap)) {
      setLessonProgress(nextProgressMap);
      setProgressSaved(true);
    }
  }, [lessonProgress, percentage, progressSaved, questions.length, quizComplete, score, selectedLesson]);

  const resetAnswerState = () => {
    setSelectedChoice('');
    setBlankAnswer('');
    setFeedback(null);
  };

  const chooseLesson = (lesson: Lesson) => {
    setSelectedLesson(lesson);
    setQuestions([]);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const startQuiz = async () => {
    if (!selectedLesson) {
      return;
    }

    setIsLoading(true);
    setError('');
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentQuestionIndex(0);
    resetAnswerState();

    try {
      const response = await fetch(
        `${import.meta.env.BASE_URL}data/questions/${selectedLesson.questionFile}`,
      );

      if (!response.ok) {
        throw new Error('Could not load the questions for this lesson.');
      }

      const questionData = (await response.json()) as Question[];
      setQuestions(prepareQuestionsForQuiz(questionData));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkAnswer = (answerOverride?: string) => {
    if (!currentQuestion || feedback) {
      return;
    }

    const studentAnswer =
      answerOverride ??
      (currentQuestion.type === 'multiple-choice' ? selectedChoice : blankAnswer.trim());

    if (!studentAnswer) {
      setError('Please enter or choose an answer.');
      return;
    }

    if (currentQuestion.type === 'true-false') {
      setSelectedChoice(studentAnswer);
    }

    const acceptedAnswers = getAcceptedAnswers(currentQuestion).map(normalizeAnswer);
    const isCorrect = acceptedAnswers.includes(normalizeAnswer(studentAnswer));

    setError('');
    setFeedback(isCorrect ? 'correct' : 'incorrect');
    setReviews((previousReviews) => [
      ...previousReviews,
      {
        question: currentQuestion,
        studentAnswer,
        isCorrect,
      },
    ]);
  };

  const goToNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex((index) => index + 1);
      resetAnswerState();
      return;
    }

    setShowResults(true);
  };

  const retryLesson = () => {
    startQuiz();
  };

  const chooseAnotherLesson = () => {
    setSelectedLesson(null);
    setQuestions([]);
    setReviews([]);
    setShowResults(false);
    setProgressSaved(false);
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  const clearNickname = () => {
    setNickname('');
    removeStorageValue(NICKNAME_STORAGE_KEY);
  };

  const clearProgress = () => {
    if (!window.confirm('Clear saved quiz progress on this device?')) {
      return;
    }

    removeStorageValue(PROGRESS_STORAGE_KEY);
    setLessonProgress({});
    setProgressSaved(false);
  };

  const hasSavedProgress = Object.keys(lessonProgress).length > 0;
  const trimmedNickname = nickname.trim();

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Version 1</p>
        <h1>English Practice</h1>
        <div className="nickname-panel">
          <label className="nickname-label">
            Optional nickname
            <input
              aria-describedby="privacy-helper"
              maxLength={24}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Example: Ren"
              type="text"
              value={nickname}
            />
          </label>
          {trimmedNickname && (
            <button className="text-button" onClick={clearNickname} type="button">
              Clear saved nickname
            </button>
          )}
        </div>
        <p className="privacy-note" id="privacy-helper">
          Progress is saved only on this device. Do not use your real full name or student number.
        </p>
      </section>

      {error && <p className="message error-message">{error}</p>}
      {isLoading && <p className="message">Loading...</p>}

      {!isLoading && !selectedLesson && (
        <section className="card">
          <div className="section-heading-row">
            <h2>Choose a lesson</h2>
            {hasSavedProgress && (
              <button className="text-button" onClick={clearProgress} type="button">
                Clear saved progress
              </button>
            )}
          </div>
          <div className="lesson-grid">
            {lessons.map((lesson) => {
              const progress = lessonProgress[lesson.id];

              return (
                <button className="lesson-card" key={lesson.id} onClick={() => chooseLesson(lesson)}>
                  <span>{lesson.title}</span>
                  <small>{lesson.description}</small>
                  {progress && (
                    <div className="lesson-progress">
                      <p>Last score: {progress.lastScore} / {progress.lastTotal}</p>
                      <p>Best score: {progress.bestScore} / {progress.lastTotal}</p>
                      <p>Completed: {progress.completedCount} times</p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {!isLoading && selectedLesson && questions.length === 0 && (
        <section className="card lesson-start">
          <h2>{selectedLesson.title}</h2>
          <p>{selectedLesson.description}</p>
          {lessonProgress[selectedLesson.id] && (
            <div className="saved-progress-summary">
              <p><strong>Last score:</strong> {lessonProgress[selectedLesson.id].lastScore} / {lessonProgress[selectedLesson.id].lastTotal}</p>
              <p><strong>Last percentage:</strong> {lessonProgress[selectedLesson.id].lastPercentage}%</p>
              <p><strong>Best score:</strong> {lessonProgress[selectedLesson.id].bestScore} / {lessonProgress[selectedLesson.id].lastTotal}</p>
              <p><strong>Best percentage:</strong> {lessonProgress[selectedLesson.id].bestPercentage}%</p>
              <p><strong>Completed:</strong> {lessonProgress[selectedLesson.id].completedCount} times</p>
              <p><strong>Last completed:</strong> {formatShortDateTime(lessonProgress[selectedLesson.id].lastCompletedAt)}</p>
            </div>
          )}
          <div className="button-row">
            <button className="primary-button" onClick={startQuiz}>Start quiz</button>
            <button className="secondary-button" onClick={chooseAnotherLesson}>Choose another lesson</button>
          </div>
        </section>
      )}

      {!isLoading && selectedLesson && currentQuestion && !quizComplete && (
        <section className="card quiz-card">
          <p className="progress-text">
            Question {currentQuestionIndex + 1} of {questions.length}
          </p>
          <h2>{currentQuestion.prompt}</h2>

          {currentQuestion.type === 'multiple-choice' && (
            <div className="choice-list">
              {currentQuestion.choices.map((choice) => (
                <label className="choice-option" key={choice}>
                  <input
                    checked={selectedChoice === choice}
                    disabled={feedback !== null}
                    name="answer"
                    onChange={() => setSelectedChoice(choice)}
                    type="radio"
                    value={choice}
                  />
                  <span>{choice}</span>
                </label>
              ))}
            </div>
          )}

          {currentQuestion.type === 'fill-in-the-blank' && (
            <label className="blank-label">
              Your answer
              <input
                disabled={feedback !== null}
                onChange={(event) => setBlankAnswer(event.target.value)}
                placeholder="Type your answer"
                type="text"
                value={blankAnswer}
              />
            </label>
          )}

          {currentQuestion.type === 'true-false' && (
            <div className="button-row" role="group" aria-label="True or false answer choices">
              <button
                className="secondary-button"
                disabled={feedback !== null}
                onClick={() => checkAnswer('True')}
              >
                True
              </button>
              <button
                className="secondary-button"
                disabled={feedback !== null}
                onClick={() => checkAnswer('False')}
              >
                False
              </button>
            </div>
          )}

          {!feedback && currentQuestion.type !== 'true-false' ? (
            <button className="primary-button" onClick={() => checkAnswer()}>Check answer</button>
          ) : feedback ? (
            <div className={`feedback ${feedback}`}>
              <strong>{feedback === 'correct' ? 'Correct!' : 'Incorrect'}</strong>
              <p>{currentQuestion.explanation}</p>
              {currentQuestionIndex < questions.length - 1 ? (
                <button className="primary-button" onClick={goToNextQuestion}>Next question</button>
              ) : (
                <button className="primary-button" onClick={goToNextQuestion}>Show results</button>
              )}
            </div>
          ) : null}
        </section>
      )}

      {!isLoading && quizComplete && (
        <section className="card results-card">
          <h2>Final results</h2>
          <div className="results-summary">
            <p className="score-text">Score: {score} / {questions.length}</p>
            <p><strong>Percentage:</strong> {percentage}%</p>
            <p><strong>Correct:</strong> {score}</p>
            <p><strong>Incorrect:</strong> {incorrectCount}</p>
            <p className="result-message">{getResultMessage(percentage, trimmedNickname)}</p>
            <p className="local-save-message">
              {progressSaved
                ? 'Progress saved locally on this device.'
                : 'Progress will be saved locally on this device when storage is available.'}
            </p>
          </div>

          <h3>Questions to Review</h3>
          {missedReviews.length === 0 ? (
            <p className="message success-message">No missed questions. Great work.</p>
          ) : (
            <ol className="review-list">
              {missedReviews.map((review) => (
                <li key={review.question.id} className="review-incorrect">
                  <p><strong>{review.question.prompt}</strong></p>
                  <p><strong>Your answer:</strong> {formatAnswer(review.studentAnswer)}</p>
                  <p><strong>Correct answer:</strong> {getReviewAnswer(review.question)}</p>
                  <p><strong>Explanation:</strong> {review.question.explanation}</p>
                </li>
              ))}
            </ol>
          )}
          <div className="button-row">
            <button className="primary-button" onClick={retryLesson}>Retry</button>
            <button className="secondary-button" onClick={chooseAnotherLesson}>Choose another lesson</button>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
