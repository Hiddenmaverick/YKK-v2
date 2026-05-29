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

## Editing Lessons with the CSV File

Teachers can edit lesson and question content in `teacher-content/questions.csv` with Excel, Google Sheets, LibreOffice Calc, Numbers, or another spreadsheet editor. The website still reads generated JSON from `public/data`, so students will see the same quiz behavior after the JSON is regenerated.

### Recommended editing workflow

1. Open `teacher-content/questions.csv` in Excel, Google Sheets, or another spreadsheet editor.
2. Edit lesson rows or add new rows for new questions. Keep the header row exactly the same.
3. Save or export the file as CSV.
4. Generate the website JSON files:

```bash
npm run generate-content
```

5. Build the site to check that the generated content works:

```bash
npm run build
```

6. Commit the updated CSV file and generated JSON files together. This usually means committing `teacher-content/questions.csv`, `public/data/lessons.json`, and the matching files in `public/data/questions/`.

### Content safety reminders

- Do not add student names, student numbers, emails, photos, addresses, health information, or other personal information.
- Do not add copyrighted textbook content, textbook questions, audio, images, or other protected content without permission.
- Keep examples original, short, classroom-appropriate, and useful for English practice.

### CSV columns

| Column | What to write |
| --- | --- |
| `lesson_id` | A unique lesson ID, such as `lesson-01`. Rows with the same lesson ID are grouped into the same generated question file. |
| `lesson_title` | The lesson title shown on the lesson card. Use the same title on every row with the same `lesson_id`. |
| `lesson_description` | A short lesson summary shown on the lesson card. Use the same description on every row with the same `lesson_id`. |
| `question_id` | A unique question ID inside that lesson, such as `q1`, `q2`, or `q10`. |
| `question_type` | Use exactly `multiple-choice` or `fill-in-the-blank`. |
| `prompt` | The question or instruction students will see. |
| `option_a` | First choice for a multiple-choice question. Leave blank for fill-in-the-blank questions. |
| `option_b` | Second choice for a multiple-choice question. Leave blank for fill-in-the-blank questions. |
| `option_c` | Optional third choice for a multiple-choice question. Leave blank if not needed. |
| `option_d` | Optional fourth choice for a multiple-choice question. Leave blank if not needed. |
| `answer` | For multiple choice, this must exactly match one of the option cells. For fill-in-the-blank, this is the required accepted answer. |
| `accepted_answers` | For fill-in-the-blank only, add extra accepted answers separated by semicolons, such as `eat; have`. Leave blank for multiple-choice questions. |
| `explanation` | A clear teacher-friendly explanation shown after the student answers. Every question needs an explanation. |

### Multiple-choice example

| lesson_id | lesson_title | lesson_description | question_id | question_type | prompt | option_a | option_b | option_c | option_d | answer | accepted_answers | explanation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lesson-04` | `Lesson 4: Food and Shopping English` | `Practice useful English for ordering food and shopping.` | `q1` | `multiple-choice` | `Choose the most polite sentence.` | `Could I have a sandwich, please?` | `Give sandwich now.` | `I sandwich yesterday.` | `Sandwich is station.` | `Could I have a sandwich, please?` |  | `"Could I have ... please?" is a polite way to order food or ask for something.` |

Multiple-choice questions need at least two non-empty option cells. Empty option cells are ignored. The `answer` cell must match one option exactly.

### Fill-in-the-blank example with multiple accepted answers

| lesson_id | lesson_title | lesson_description | question_id | question_type | prompt | option_a | option_b | option_c | option_d | answer | accepted_answers | explanation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lesson-04` | `Lesson 4: Food and Shopping English` | `Practice useful English for ordering food and shopping.` | `q2` | `fill-in-the-blank` | `Fill in the blank: I usually _____ lunch at school.` |  |  |  |  | `eat` | `have` | `Both "eat lunch" and "have lunch" are natural English expressions.` |

For fill-in-the-blank questions, `option_a` through `option_d` are ignored. Put the main answer in `answer`; put extra accepted answers in `accepted_answers` separated by semicolons. Duplicate accepted answers are ignored when JSON is generated.


## GitHub Pages

This project is configured as a GitHub Pages project site for `Hiddenmaverick/YKK-v2`. Vite uses this base path:

```ts
base: '/YKK-v2/'
```

Static lesson data is loaded using `import.meta.env.BASE_URL` so the site works both locally and on GitHub Pages.

## Generated JSON Format Reference

The files in `public/data` are generated by `npm run generate-content` from `teacher-content/questions.csv`. Do not manually edit generated JSON for routine content updates, because the next CSV generation will overwrite those changes. Use this section only as a reference for the static JSON format that the app reads.

### Lesson index: `public/data/lessons.json`

The generated lesson index contains one lesson object for each unique `lesson_id` in the CSV. Each object points to the matching generated file in `public/data/questions/`.

```json
{
  "id": "lesson-04",
  "title": "Lesson 4: Food and Shopping English",
  "description": "Practice useful English for ordering food and shopping.",
  "questionFile": "lesson-04.json"
}
```

Generated lesson fields:

- `id`: the lesson ID from the CSV, such as `lesson-04`
- `title`: the lesson title shown on the lesson card
- `description`: a short teacher- and student-friendly summary
- `questionFile`: the generated JSON filename for the lesson questions

### Question files: `public/data/questions/[lesson_id].json`

Each generated question file contains a JSON array of question objects. Keep the English natural, simple, and appropriate for Japanese high school students when editing the CSV source file.

### Multiple-choice question format

A generated multiple-choice question has these fields:

- `id`: the question ID from the CSV, such as `q1`
- `type`: `multiple-choice`
- `prompt`: the question or instruction shown to students
- `choices`: an array of answer choices from non-empty option columns
- `answer`: the correct answer; it exactly matches one of the choices
- `explanation`: a clear explanation that a teacher can use for review

Example generated JSON:

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

### Fill-in-the-blank question format

A generated fill-in-the-blank question has these fields:

- `id`: the question ID from the CSV, such as `q2`
- `type`: `fill-in-the-blank`
- `prompt`: a sentence or instruction with a blank
- `answer`: either one accepted answer as a string or multiple accepted answers as an array of strings
- `explanation`: a clear explanation that a teacher can use for review

Example with one accepted answer:

```json
{
  "id": "q2",
  "type": "fill-in-the-blank",
  "prompt": "Fill in the blank: The cafe is next _____ the bookstore.",
  "answer": "to",
  "explanation": "The phrase 'next to' means beside or very close to another place."
}
```

Example with multiple accepted answers:

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

### Check generated content before publishing

Regenerate and build the site before opening a pull request:

```bash
npm run generate-content
npm run build
```

### Content safety warnings

- Do not add student names, student numbers, email addresses, photos, health details, addresses, or any other student personal information.
- Do not add copyrighted textbook passages, textbook questions, audio, images, or other protected content without permission.
- Keep practice content original, short, classroom-appropriate, and useful for Japanese high school English review.
