# Retrieval evaluation

The retrieval gate measures `retrieveContext`, the path used by `askSaves`, against a fixed local fixture set. It does not call an external model.

Run it with:

```sh
npm test -- --run tests/retrieval-eval.test.ts
```

The fixture set covers representative single-topic questions, a multi-topic question, an unrelated injection-shaped question, and a blank question. The report includes the retrieved ranking for every case, macro precision, macro recall, and empty-context behavior.

The enforced threshold is:

- Precision: `1.0`
- Recall: `1.0`
- Empty expected contexts: every case must return no IDs

A threshold failure throws with the failed metric. The test calls the threshold assertion so a retrieval change cannot silently lower the baseline.
