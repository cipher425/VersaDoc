/**
 * Demo data built THROUGH the real services, so every rule (drafts, commits, deltas,
 * merge requests, reviews, merges, conflicts) actually runs.
 *
 *   npm run seed            -> refuses if data exists
 *   npm run seed -- --reset -> clears the database first
 */
import mongoose from 'mongoose';
import { connectDb, disconnectDb } from '../src/infra/db/mongoose.js';
import { User } from '../src/modules/users/user.model.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { Document } from '../src/modules/documents/document.model.js';
import { Branch } from '../src/modules/versioning/branch.model.js';
import { Commit } from '../src/modules/versioning/commit.model.js';
import { Activity } from '../src/modules/activity/activity.model.js';
import { addCollaborator, createDocument, updateDocument } from '../src/modules/documents/documents.service.js';
import { commitDraft, createBranch, saveDraft } from '../src/modules/versioning/versioning.service.js';
import { addComment, createMergeRequest, mergeMergeRequest, submitReview } from '../src/modules/reviews/reviews.service.js';

const DAY = 86_400_000;

async function makeUser(name, email) {
  const u = await User.create({ name, email, passwordHash: await hashPassword('Demo@1234') });
  return { doc: u, actor: { id: String(u._id), name: u.name } };
}

const fresh = (id) => Document.findById(id);
const branchByName = (doc, name) => Branch.findOne({ document: doc._id, name });

async function commitAs(docId, branchName, user, content, message) {
  const doc = await fresh(docId);
  const branch = await branchByName(doc, branchName);
  await saveDraft(doc, branch._id, user, { content, baseCommit: branch.head });
  return commitDraft(doc, branch._id, user, { message });
}

const REPORT_V1 = `# Smart Campus Parking System

**Team:** Aarav Shah, Priya Nair, Rahul Verma
**Guide:** Prof. S. Kulkarni

## Abstract
Finding a parking spot on campus wastes time every morning. We propose a system that shows free spots in real time.

## 1. Introduction
Our campus has 1,200 vehicles but only 900 parking spots.
Students and staff spend an average of 12 minutes searching for parking during peak hours.

## 2. Problem Statement
There is no way to know which parking lots have free spots before driving to them.

## 3. Methodology
Ultrasonic sensors detect whether a spot is occupied.
Each sensor sends its status to a gateway every 10 seconds.
The gateway forwards updates to a cloud server over MQTT.
A mobile app shows a live map of free spots.

## 4. Results
To be added.

## 5. Conclusion
To be added.

## References
1. Placeholder
`;

async function main() {
  await connectDb();
  if (process.argv.includes('--reset')) {
    const collections = await mongoose.connection.db.listCollections().toArray();
    for (const { name } of collections) if (!name.startsWith('system.')) await mongoose.connection.db.dropCollection(name);
    await Promise.all(mongoose.modelNames().map((n) => mongoose.model(n).syncIndexes()));
    console.log('Database cleared');
  } else if (await User.exists({})) {
    console.log('Data already exists. Run "npm run seed -- --reset" to wipe and re-seed.');
    return;
  }

  console.log('Creating users...');
  const aarav = await makeUser('Aarav Shah', 'demo@versadoc.dev');
  const priya = await makeUser('Priya Nair', 'priya@versadoc.dev');
  const rahul = await makeUser('Rahul Verma', 'rahul@versadoc.dev');
  const meera = await makeUser('Meera Iyer', 'meera@versadoc.dev');

  /* ---------------- Document 1: project report with real collaboration ---------------- */
  console.log('Creating "Smart Campus Parking System" report...');
  const report = await createDocument(aarav.actor, {
    title: 'Smart Campus Parking System - Final Year Report',
    description: 'Our final year project report. Main is protected: every change goes through a merge request.',
    visibility: 'private',
    content: REPORT_V1,
  });
  await addCollaborator(await fresh(report._id), aarav.actor, { email: 'priya@versadoc.dev', role: 'editor' });
  await addCollaborator(await fresh(report._id), aarav.actor, { email: 'rahul@versadoc.dev', role: 'reviewer' });
  await addCollaborator(await fresh(report._id), aarav.actor, { email: 'meera@versadoc.dev', role: 'viewer' });

  let text = REPORT_V1;
  text = text.replace('Finding a parking spot on campus wastes time every morning.', 'Finding a parking spot on campus wastes valuable time every morning, especially before 9 AM.');
  await commitAs(report._id, 'main', aarav.actor, text, 'Improve abstract wording');

  text = text.replace(
    'There is no way to know which parking lots have free spots before driving to them.',
    'There is no way to know which parking lots have free spots before driving to them.\nThis causes congestion near the main gate and wastes fuel.\nSecurity staff also have no data to plan parking allocation.'
  );
  await commitAs(report._id, 'main', aarav.actor, text, 'Expand problem statement');

  // Branch 1 (Priya): results section -> merged through a reviewed merge request.
  await createBranch(await fresh(report._id), priya.actor, { name: 'results-section', from: 'main' });
  let results = text.replace(
    '## 4. Results\nTo be added.',
    '## 4. Results\nWe deployed 40 sensors in Lot B for two weeks.\nDetection accuracy was 97.5% compared with manual counts.\nAverage search time dropped from 12 minutes to 4 minutes.\n\n| Metric | Before | After |\n|---|---|---|\n| Avg. search time | 12 min | 4 min |\n| Gate congestion | High | Low |'
  );
  await commitAs(report._id, 'results-section', priya.actor, results, 'Add pilot results from Lot B');
  results = results.replace('## 5. Conclusion\nTo be added.', '## 5. Conclusion\nThe pilot shows real-time parking data saves time and reduces congestion.\nNext we plan to cover all five parking lots.');
  await commitAs(report._id, 'results-section', priya.actor, results, 'Write conclusion');

  let doc = await fresh(report._id);
  const mr1 = await createMergeRequest(doc, priya.actor, {
    title: 'Add results and conclusion',
    description: 'Adds pilot results from Lot B (2 weeks, 40 sensors) and a first conclusion.',
    sourceBranchId: (await branchByName(doc, 'results-section'))._id,
    targetBranchId: doc.defaultBranch,
    reviewers: [rahul.actor.id, aarav.actor.id],
  });
  await addComment(doc, mr1.number, rahul.actor, {
    body: 'Can we mention how the manual count was done? Examiners will ask.',
    anchor: { side: 'new', line: 30, lineText: 'Detection accuracy was 97.5% compared with manual counts.' },
  });
  await addComment(doc, mr1.number, priya.actor, { body: 'Good point, I will add it in the methodology later.' });
  await submitReview(doc, mr1.number, rahul.actor, { state: 'APPROVED', body: 'Looks good to me.' });
  await mergeMergeRequest(await fresh(report._id), mr1.number, aarav.actor, { deleteSourceBranch: true });

  // Branch 2 (Aarav): add references - open MR waiting for review.
  await createBranch(await fresh(report._id), aarav.actor, { name: 'references', from: 'main' });
  let main = (await (await import('../src/modules/versioning/storage.service.js')).getContent((await branchByName(await fresh(report._id), 'main')).head));
  const refs = main.replace(
    '## References\n1. Placeholder',
    '## References\n1. Idris, M. et al. "Car park system: A review of smart parking system." Int. Journal of Computer Applications, 2009.\n2. MQTT Version 5.0, OASIS Standard, 2019.\n3. HC-SR04 Ultrasonic Sensor Datasheet.'
  );
  await commitAs(report._id, 'references', aarav.actor, refs, 'Add references');
  doc = await fresh(report._id);
  await createMergeRequest(doc, aarav.actor, {
    title: 'Add references section',
    description: 'Fills in the references we cited during the review meeting.',
    sourceBranchId: (await branchByName(doc, 'references'))._id,
    targetBranchId: doc.defaultBranch,
    reviewers: [rahul.actor.id],
  });

  // Branch 3 (Priya): rewrites the abstract while main ALSO changes it -> a real merge conflict.
  await createBranch(await fresh(report._id), priya.actor, { name: 'rewrite-abstract', from: 'main' });
  const priyaAbstract = main.replace(
    'Finding a parking spot on campus wastes valuable time every morning, especially before 9 AM. We propose a system that shows free spots in real time.',
    'Students lose up to 12 minutes a day searching for parking. We present an IoT-based system that detects free spots with ultrasonic sensors and shows them live in a mobile app.'
  );
  await commitAs(report._id, 'rewrite-abstract', priya.actor, priyaAbstract, 'Rewrite abstract with concrete numbers');
  const aaravAbstract = main.replace(
    'Finding a parking spot on campus wastes valuable time every morning, especially before 9 AM. We propose a system that shows free spots in real time.',
    'Finding parking on campus wastes time every morning. Our system uses sensors and a mobile app to show free parking spots in real time, reducing search time by 66%.'
  );
  await commitAs(report._id, 'main', aarav.actor, aaravAbstract, 'Mention 66% improvement in abstract');
  doc = await fresh(report._id);
  const mr3 = await createMergeRequest(doc, priya.actor, {
    title: 'Rewrite abstract',
    description: 'A more specific abstract with numbers from the pilot.',
    sourceBranchId: (await branchByName(doc, 'rewrite-abstract'))._id,
    targetBranchId: doc.defaultBranch,
    reviewers: [aarav.actor.id],
  });
  await addComment(doc, mr3.number, aarav.actor, { body: 'I also changed the abstract on main - this will conflict. Let us combine both versions.' });

  await updateDocument(await fresh(report._id), { settings: { requiredApprovals: 1 } });

  /* ---------------- Document 2: SOP owned by Priya ---------------- */
  console.log('Creating "Lab Onboarding SOP"...');
  const sop = await createDocument(priya.actor, { title: 'Research Lab Onboarding SOP', description: 'How new members get set up in the IoT lab.', template: 'sop' });
  await addCollaborator(await fresh(sop._id), priya.actor, { email: 'demo@versadoc.dev', role: 'editor' });
  await updateDocument(await fresh(sop._id), { settings: { protectDefaultBranch: false } });
  let sopText = `# SOP: Onboarding a new lab member

**Owner:** Priya Nair
**Last reviewed:** this semester

## Purpose
Make sure every new member can work safely and productively in the lab within the first week.

## Procedure
1. Get lab access card from the department office.
2. Complete the electrical safety briefing.
3. Get a GitHub organisation invite from the lab coordinator.
4. Set up the development board kit (see inventory sheet).

## Escalation
Contact the lab coordinator for any access issue.
`;
  await commitAs(sop._id, 'main', priya.actor, sopText, 'First complete draft of onboarding SOP');
  sopText = sopText.replace('4. Set up the development board kit (see inventory sheet).', '4. Set up the development board kit (see inventory sheet).\n5. Book a 30-minute walkthrough with a senior member.');
  await commitAs(sop._id, 'main', aarav.actor, sopText, 'Add walkthrough step');

  /* ---------------- Document 3: public guide ---------------- */
  console.log('Creating public "Open Source Contribution Guide"...');
  const guide = await createDocument(aarav.actor, {
    title: 'Open Source Contribution Guide for Beginners',
    description: 'A public, versioned guide anyone can read.',
    visibility: 'public',
    content: `# Open Source Contribution Guide

## 1. Pick a project
Start with tools you already use. Look for issues labelled "good first issue".

## 2. Read the contribution guidelines
Every project has its own rules for code style, commits and reviews.

## 3. Make a small change first
Fix a typo or improve documentation to learn the workflow.

## 4. Open a pull request
Explain what you changed and why. Link the issue you are fixing.
`,
  });
  await commitAs(guide._id, 'main', aarav.actor, (await (await import('../src/modules/versioning/storage.service.js')).getContent((await branchByName(await fresh(guide._id), 'main')).head)) + '\n## 5. Respond to reviews\nReviews are not criticism of you. Ask questions, make the requested changes and push again.\n', 'Add section on handling reviews');

  /* ---------------- Document 4: meeting notes ---------------- */
  const notes = await createDocument(aarav.actor, { title: 'Weekly Project Meeting Notes', template: 'meeting' });
  await addCollaborator(await fresh(notes._id), aarav.actor, { email: 'meera@versadoc.dev', role: 'viewer' });

  // Spread history over the last few weeks so charts look realistic (native driver: createdAt is immutable in Mongoose).
  const commits = await Commit.find({}).sort({ generation: 1, _id: 1 }).select('_id').lean();
  const start = Date.now() - 24 * DAY;
  for (const [i, c] of commits.entries()) {
    await Commit.collection.updateOne({ _id: c._id }, { $set: { createdAt: new Date(start + (i / commits.length) * 23 * DAY) } });
  }
  const acts = await Activity.find({}).sort({ _id: 1 }).select('_id').lean();
  for (const [i, a] of acts.entries()) {
    await Activity.collection.updateOne({ _id: a._id }, { $set: { createdAt: new Date(start + (i / acts.length) * 23 * DAY) } });
  }

  console.log('\nSeed complete. Every account uses the password Demo@1234:');
  console.log('  demo@versadoc.dev   (Aarav - owner of the report)');
  console.log('  priya@versadoc.dev  (Priya - editor)');
  console.log('  rahul@versadoc.dev  (Rahul - reviewer)');
  console.log('  meera@versadoc.dev  (Meera - viewer)');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
