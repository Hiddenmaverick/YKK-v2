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

## How to Add a New Lesson

Lesson content is stored in static JSON files. The app does not need a database, login system, analytics, or student data collection.

### 1. Edit `public/data/lessons.json`

Add one lesson object to the list in `public/data/lessons.json`. Use a unique `id` and point `questionFile` to the matching file in `public/data/questions/`.

```json
{
  "id": "lesson-04",
  "title": "Lesson 4: Food and Shopping English",
  "description": "Practice useful English for ordering food and shopping.",
  "questionFile": "lesson-04.json"
}
```

Required lesson fields:

- `id`: a unique lesson ID, such as `lesson-04`
- `title`: the lesson title shown on the lesson card
- `description`: a short teacher- and student-friendly summary
- `questionFile`: the JSON filename for the lesson questions

### 2. Create a new question file

Create a new file in `public/data/questions/`, for example `public/data/questions/lesson-04.json`. The file should contain a JSON array of question objects. Keep the English natural, simple, and appropriate for Japanese high school students.

### 3. Add multiple-choice questions

A multiple-choice question requires these fields:

- `id`: a unique question ID inside the file, such as `q1`
- `type`: must be `multiple-choice`
- `prompt`: the question or instruction shown to students
- `choices`: an array of answer choices
- `answer`: the correct answer; it must exactly match one of the choices
- `explanation`: a clear explanation that a teacher can use for review

Example:

```json
{
  "id": "q1",
  "type": "multiple-choice",
  "prompt": "Choose the most natural sentence.",
  "choices": [
    "Could I have a glass of water, please?",
    "Give me water now.",
    "I water want please glass.",
    "Water is yesterday."
  ],
  "answer": "Could I have a glass of water, please?",
  "explanation": "'Could I have ... please?' is a polite pattern for ordering or asking for something."
}
```

### 4. Add fill-in-the-blank questions

A fill-in-the-blank question requires these fields:

- `id`: a unique question ID inside the file, such as `q2`
- `type`: must be `fill-in-the-blank`
- `prompt`: a sentence or instruction with a blank
- `answer`: either one accepted answer as a string or multiple accepted answers as an array of strings
- `explanation`: a clear explanation that a teacher can use for review

Use one accepted answer when only one word or phrase is expected:

```json
{
  "id": "q2",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: The cafe is next _____ the bookstore.",
  "answer": "to",
  "explanation": "The phrase 'next to' means beside or very close to another place."
}
```

Use multiple accepted answers when more than one natural answer should be correct:

```json
{
  "id": "q3",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: I usually _____ lunch at school.",
  "answer": ["eat", "have"],
  "explanation": "Both 'eat lunch' and 'have lunch' are natural English expressions."
}
```

Fill-in-the-blank checking ignores capitalization and extra spaces.

### 5. Check the lesson before publishing

Validate the JSON and build the site before opening a pull request:

```bash
python -m json.tool public/data/lessons.json > /dev/null
python -m json.tool public/data/questions/lesson-04.json > /dev/null
npm run build
```

### Content safety warnings

- Do not add student names, student numbers, email addresses, photos, health details, addresses, or any other student personal information.
- Do not add copyrighted textbook passages, textbook questions, audio, images, or other protected content without permission.
- Keep practice content original, short, classroom-appropriate, and useful for Japanese high school English review.
