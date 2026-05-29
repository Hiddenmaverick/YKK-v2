import { useEffect, useMemo, useState } from 'react';
import type { AnswerReview, Lesson, Question } from './types';

const normalizeAnswer = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

const shuffleQuestions = (questions: Question[]) =>
  [...questions]
    .map((question) => ({ question, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ question }) => question);

const getAcceptedAnswers = (question: Question) =>
  question.type === 'fill-in-the-blank'
    ? Array.isArray(question.answer)
      ? question.answer
      : [question.answer]
    : [question.answer];

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
  const quizComplete = questions.length > 0 && showResults;

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
      setQuestions(shuffleQuestions(questionData));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load questions.');
    } finally {
      setIsLoading(false);
    }
  };

  const checkAnswer = () => {
    if (!currentQuestion || feedback) {
      return;
    }

    const studentAnswer =
      currentQuestion.type === 'multiple-choice' ? selectedChoice : blankAnswer.trim();

    if (!studentAnswer) {
      setError('Please enter or choose an answer.');
      return;
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
    setCurrentQuestionIndex(0);
    resetAnswerState();
    setError('');
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <p className="eyebrow">Version 1</p>
        <h1>English Practice</h1>
        <p className="privacy-note">No login. No personal information.</p>
      </section>

      {error && <p className="message error-message">{error}</p>}
      {isLoading && <p className="message">Loading...</p>}

      {!isLoading && !selectedLesson && (
        <section className="card">
          <h2>Choose a lesson</h2>
          <div className="lesson-grid">
            {lessons.map((lesson) => (
              <button className="lesson-card" key={lesson.id} onClick={() => chooseLesson(lesson)}>
                <span>{lesson.title}</span>
                <small>{lesson.description}</small>
              </button>
            ))}
          </div>
        </section>
      )}

      {!isLoading && selectedLesson && questions.length === 0 && (
        <section className="card lesson-start">
          <h2>{selectedLesson.title}</h2>
          <p>{selectedLesson.description}</p>
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

          {currentQuestion.type === 'multiple-choice' ? (
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
          ) : (
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

          {!feedback ? (
            <button className="primary-button" onClick={checkAnswer}>Check answer</button>
          ) : (
            <div className={`feedback ${feedback}`}>
              <strong>{feedback === 'correct' ? 'Correct!' : 'Incorrect'}</strong>
              <p>{currentQuestion.explanation}</p>
              {currentQuestionIndex < questions.length - 1 ? (
                <button className="primary-button" onClick={goToNextQuestion}>Next question</button>
              ) : (
                <button className="primary-button" onClick={goToNextQuestion}>Show results</button>
              )}
            </div>
          )}
        </section>
      )}

      {!isLoading && quizComplete && (
        <section className="card results-card">
          <h2>Final score</h2>
          <p className="score-text">
            {score} / {questions.length}
          </p>
          <h3>Review</h3>
          <ol className="review-list">
            {reviews.map((review) => (
              <li key={review.question.id} className={review.isCorrect ? 'review-correct' : 'review-incorrect'}>
                <p><strong>{review.question.prompt}</strong></p>
                <p>Your answer: {review.studentAnswer}</p>
                <p>Accepted answer: {getAcceptedAnswers(review.question).join(' / ')}</p>
                <p>{review.question.explanation}</p>
              </li>
            ))}
          </ol>
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
