/**
 * A small, fictional knowledge base used by the RAG Pipeline lab. "Kirana Code School" is an
 * invented organisation; the policies are written for teaching retrieval, not copied from anyone.
 */
export interface LabDocument {
  id: string;
  title: string;
  text: string;
}

export const RAG_LAB_CORPUS: LabDocument[] = [
  {
    id: 'refund-policy',
    title: 'Refund and cancellation policy',
    text: `# Refund and cancellation policy

## Full refunds
Learners can cancel within 14 days of the batch start date and receive a full refund. Refunds are paid back to the original payment method within 7 working days.

## Partial refunds
After 14 days and before the end of week 4, learners receive a 50% refund. No refunds are given after week 4, but learners may defer once to a later batch at no extra cost.

## How to cancel
Email the student office from your registered address with your batch code. Cancellations made through mentors or chat groups are not valid.`,
  },
  {
    id: 'mentor-support',
    title: 'Mentor office hours and support',
    text: `# Mentor office hours

## Live office hours
Mentors hold live office hours every Tuesday and Thursday from 7 pm to 9 pm IST. Join from the batch calendar link; sessions are recorded for learners in other time zones.

## Asynchronous help
Post questions in the course forum with your code and the exact error message. Mentors aim to reply within one working day. Urgent issues about exams go to the student office, not the forum.

## One-to-one sessions
Each learner can book two 30-minute one-to-one sessions per month. Unused sessions do not carry over to the next month.`,
  },
  {
    id: 'lab-setup',
    title: 'Laptop and lab setup',
    text: `# Laptop and lab setup

## Minimum laptop
Any laptop from the last five years with 8 GB of RAM works. A dedicated GPU is not required: heavy model training runs on shared cloud notebooks provided by the school.

## Software
Install Python 3.12 or newer, Git and VS Code before day one. The setup checklist in the welcome email walks through each tool on Windows, macOS and Linux.

## Internet
A stable connection of at least 10 Mbps is recommended for live classes. Recordings are available within 24 hours if a session is missed.`,
  },
];
