# MP3 implementation and verification

Goal: implement every requirement in the original README with a small Express / Mongoose API.

Design: keep the starter's two models and one API router. Use MongoDB transactions for writes so validation failures, database errors and concurrent updates cannot leave half-updated user/task references. No frontend, authentication, extra service layers or production dependencies.

1. Write HTTP integration tests against a disposable real MongoDB replica set (not mocked models); confirm the starter fails them.
2. Implement both schemas, CRUD, Mongoose query parameters, strict request validation, replacement PUT semantics and transactional reference synchronization. Run the full test suite on Node 24.
3. Add minimal Render configuration and setup/submission instructions; preserve the original assignment and grader URL. Record referenced sources and LLM use. Verify secrets remain ignored.
4. Review against README and FAQ; verify the deployed Atlas/Render API and official grader when account configuration is available. Submit the form only with truthful, complete details.

Review focus: invalid input and error precedence; PUT defaults and immutable creation dates; completed-task assignment; failed writes and concurrent changes; query combinations and default limits.

Progress:
- Template inspected; no existing implementation or local `.env`. Host Node is 22, so use a temporary Node 24 runtime for verification.
- External setup pending: MongoDB Atlas connection and Render service are not configured in this checkout.
- The student confirmed neither external service is configured; requested finished code and minimal setup instructions first. Do not claim deployment, official-grader score or formal submission is complete.
- Implementation uses 2 models, 1 router and the existing server. The initial HTTP creation test failed against the starter (404 instead of 201); CRUD/query/reference suite then passed.
- Independent review reproduced completed-task/user write skew and malformed-JSON URL-id precedence. Both regression tests failed before fixes and passed afterwards. Assignment uses an internal Mongoose user-version increment to enforce a real transaction write conflict.
- Review also found unsupported typed filter operators returning 500; a failing HTTP regression was added and query casting now reports 400. Count ignores pagination and returns the total matching count, as described in README.
- Final local checks: 16/16 HTTP integration tests passed on Node 24; dependency audit found 0 vulnerabilities; clean production install succeeded without test dependencies. SETUP.md, SOURCES.md, CHATLOG.md and VERIFICATION.md prepared.
