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

## External work still required

- Configure a MongoDB Atlas database user, network access and connection string.
- Deploy the repository on Render with `MONGODB_URI` and Node 24.
- Set the deployment root URL in `submit.js` and run the **official** autograder. A local pass is not an official score.
- The student personally logs in to the submission form, provides the required information and LLM survey answers, and submits. The form was previously checked and required sign-in; no fields were filled in and nothing was submitted. Per the student's follow-up instruction, the assistant must not access or operate the form again.

The student confirmed these accounts/services are not set up yet and requested completed code plus minimal setup instructions first. No deployment, official score or formal submission is claimed in this record.
