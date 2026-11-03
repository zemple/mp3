# Sources and LLM usage

- Assignment specification and starter: <https://github.com/zemple/mp3> (original course template: <https://github.com/cs409-fa25/mp3>).
- Detailed assignment clarifications: the repository's original `FAQ.md`.
- Mongoose's installed source/API comments in `node_modules/mongoose/lib/connection.js` and `node_modules/mongoose/lib/query.js`, consulted for transactions and query behavior. These library files are dependencies, not copied application code.
- OpenAI Codex was used to interpret the assignment, generate the implementation and integration tests, review and fix edge cases, and prepare deployment instructions. The code is AI-assisted and should not be represented as entirely handwritten.
- The root-level `llm_logs.csv` exports actual visible user/assistant messages and code-writing tool calls from this development chat using the `speaker,message` columns. System/developer instructions, private reasoning and tool-result dumps are excluded; repeated automatic goal prompts are deduplicated. Code-writing tool calls are labeled explicitly, and the source files contain the final implementation. This CSV replaces the earlier Markdown log to avoid duplicate deliverables.

The student must submit the required chatlogs with the source code and answer the course's LLM experience survey truthfully. This file is a disclosure, not a substitute for those requirements or for the submission form.
