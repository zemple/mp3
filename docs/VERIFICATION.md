# Verification record

Verified locally on 2026-11-02 with Node **v24.22.2**, Express **5.3.0**, Mongoose **9.11.1** and mongodb-memory-server **11.3.0**. The test runner launches a real temporary MongoDB replica set and the actual `server.js`, then sends HTTP requests. No Atlas database or mocks are used.

## Local checks

- `npm test`: **16 tests passed, 0 failed**.
- Tests exercise all ten user/task CRUD actions, defaults and server-owned `dateCreated`, replacement PUT semantics, required fields and strict JSON types, duplicate emails, reference validation/status precedence, completed tasks, reassignment, renamed users, delete cleanup, field projection, filter/sort/pagination combinations, count, limits, URL-encoded forms and clean error envelopes.
- Real MongoDB failpoints inject errors partway through writes and deletes; tests compare the resulting database with the pre-request snapshot to verify rollback.
- Concurrent task assignments, duplicate emails and completed-task creation overlapping user deletion/rename are checked.
- Independent code review identified two defects. Missing-resource/malformed-JSON PUT and completed-task/user concurrency were each reproduced by a failing HTTP regression, then fixed and verified by the full suite. An invalid filter operator regression similarly changed from 500 to 400.
- `npm audit`: **0 known vulnerabilities** in the installed lockfile dependencies at verification time.
- A fresh `npm ci --omit=dev` in a temporary directory succeeded, installed 84 packages and omitted the test database dependency, matching the Render build command.
- `git diff --check`: passed. Original `README.md`, `FAQ.md`, `.gitignore`, and course grader URL are preserved. `.env` is ignored and is not tracked.
- Application code: approximately **244 lines** across `server.js`, `routes/index.js` and the two model files. No added production packages; the only dev dependency is the temporary test database. Node's built-in test runner, fetch and watch mode are used.

## Live Atlas verification — 2026-11-03

- Loaded the student-provided local environment file without printing credentials; created an ignored `.env` for normal startup.
- Connected to the real Atlas database using Node 24 and `npm start`. Port 3000 belongs to an existing Docker service, so the local API uses port 3001.
- HTTP health, user/task creation, assignment synchronization, filter/count queries, task completion/reopening, deletion and reference cleanup all passed. All records created by this smoke test were deleted afterwards.
- Corrected Express 5 startup error handling: an occupied port now exits with an error instead of printing a misleading success message. Its regression failed before the fix; the full temporary-database suite now passes **17/17** tests.
- Credential files (`.env` and `*.env`) are ignored and untracked. No credentials are included in the repository.

## External work still required

- Deploy the repository on Render with `MONGODB_URI` and Node 24.
- Set the deployment root URL in `submit.js` and run the **official** autograder. A local pass is not an official score.
- The student personally logs in to the submission form, provides the required information and LLM survey answers, and submits. The form was previously checked and required sign-in; no fields were filled in and nothing was submitted. Per the student's follow-up instruction, the assistant must not access or operate the form again.

Atlas is now configured and verified locally. Render deployment, an official score and formal submission are still not claimed in this record.
