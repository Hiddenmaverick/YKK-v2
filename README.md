# YKK-v2 English Practice

A clean Version 1 English practice website for Japanese high school students. It uses Vite, React, TypeScript, plain CSS, and static JSON files. There is no backend, database, login, analytics, or collection of student personal information.

## Run locally

Install dependencies:

```bash
npm install
```

Start the local development server:

```bash
npm run dev
```

Build the production site:

```bash
npm run build
```

## GitHub Pages

This project is configured as a GitHub Pages project site for `Hiddenmaverick/YKK-v2`. Vite uses this base path:

```ts
base: '/YKK-v2/'
```

Static lesson data is loaded using `import.meta.env.BASE_URL` so the site works both locally and on GitHub Pages.

## Add a lesson

1. Create a new question file in `public/data/questions/`, for example `lesson-02.json`.
2. Add a lesson entry to `public/data/lessons.json`:

```json
{
  "id": "lesson-02",
  "title": "Lesson 2: Past Tense",
  "description": "Practice simple past tense sentences.",
  "questionFile": "lesson-02.json"
}
```

Each lesson must include:

- `id`
- `title`
- `description`
- `questionFile`

## Add multiple-choice questions

Add an object like this to a lesson question file:

```json
{
  "id": "q1",
  "type": "multiple-choice",
  "prompt": "Choose the correct sentence.",
  "choices": ["She likes music.", "She like music.", "She liking music."],
  "answer": "She likes music.",
  "explanation": "Use 'likes' with he, she, or it in the simple present tense."
}
```

The `answer` must exactly match one of the choices.

## Add fill-in-the-blank questions

Use one accepted answer:

```json
{
  "id": "q2",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: We went to Kyoto _____ train.",
  "answer": "by",
  "explanation": "Use 'by' before a form of transportation."
}
```

Use multiple accepted answers:

```json
{
  "id": "q3",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: I _____ soccer after school.",
  "answer": ["play", "practice"],
  "explanation": "Both answers can make a natural sentence."
}
```

Fill-in-the-blank checking ignores capitalization and extra spaces.

## Content safety

- Do not add student names, student numbers, email addresses, or any other personal information.
- Do not add copyrighted textbook passages, questions, audio, images, or other content unless you have permission.
- Keep practice content original, short, and appropriate for classroom review.
