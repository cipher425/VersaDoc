/** Starter content for new documents. */
export const TEMPLATES = {
  blank: { label: 'Blank document', content: '# Untitled\n\nStart writing here.\n' },
  report: {
    label: 'Project report',
    content: `# Project Report

## Abstract
A short summary of the problem, the approach and the results.

## 1. Introduction
Describe the background and why this project matters.

## 2. Problem Statement
What exactly are we solving?

## 3. Methodology
Explain the approach, tools and design decisions.

## 4. Results
Present the results with evidence.

## 5. Conclusion and Future Work
What did we learn, and what comes next?

## References
1.
`,
  },
  research: {
    label: 'Research paper',
    content: `# Title of the Paper

**Authors:**

## Abstract

## Keywords

## 1. Introduction

## 2. Related Work

## 3. Proposed Method

## 4. Experiments

## 5. Discussion

## 6. Conclusion

## References
`,
  },
  sop: {
    label: 'Standard operating procedure',
    content: `# SOP: <Process name>

**Owner:**
**Last reviewed:**

## Purpose

## Scope

## Responsibilities

## Procedure
1.
2.
3.

## Escalation
`,
  },
  meeting: {
    label: 'Meeting notes',
    content: `# Meeting Notes

**Date:**
**Attendees:**

## Agenda
-

## Discussion
-

## Decisions
-

## Action items
- [ ] Owner - task - due date
`,
  },
};
