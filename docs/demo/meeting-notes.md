# Kaam Ki Baat — kickoff and architecture (demo meeting transcript)

> **FIXTURE.** A made-up meeting between **Charan Rathore (lead)** and **Harsh Sinha (teammate)**, written from the team's real build decisions on 15 Nov 2026. Both consented. It is not a Wispr Notetaker record. The figures quoted are real: Microsoft Work Trend Index 2023, Atlassian × DX State of DevEx 2024, Stack Overflow Developer Survey 2024.

Agenda: 1) what we start with 2) the problem 3) who feels it 4) how relevant it is 5) how we solve it, then test.

**Charan** · `kkb#1`  
Okay Harsh, we have three hours. Before we touch code, let's agree what we start with: one problem, one user, one demo.

**Harsh** · `kkb#2`  
Agreed. So what exactly is the problem?

**Charan** · `kkb#3`  
Teams decide things in meetings and then lose them. A week later nobody can say who owns it, whether the code exists, whether the PR is merged, or whether the tests passed on the latest commit.

**Harsh** · `kkb#4`  
And then someone pings the lead and waits.

**Charan** · `kkb#5`  
Exactly. The user is an engineer on a small team, like you, sitting on a doubt that blocks the task. The other user is the lead, like me, answering the same question for the fifth time.

**Harsh** · `kkb#6`  
Is this really common, or is it just us?

**Charan** · `kkb#7`  
It's common. Microsoft's Work Trend Index says 55% of people find next steps unclear after meetings. Atlassian's developer experience report says 69% of developers lose eight or more hours a week to inefficiencies.

**Harsh** · `kkb#8`  
And Stack Overflow's survey says 61% spend more than half an hour a day just searching for answers. So the waiting is the real cost.

**Charan** · `kkb#9`  
Right. So the solution: a voice teammate. Wispr Flow gives us what was said in the meeting, GitHub gives us what was built, and Bolna lets you just call and ask.

**Harsh** · `kkb#10`  
How do we stop it from making things up?

**Charan** · `kkb#11`  
Fixed rules decide status, not the model. Proposed is not accepted, an open PR is not merged, and a check on an older commit is stale. If it doesn't know, it asks the leader instead of guessing.

**Harsh** · `kkb#12`  
And the three agents?

**Charan** · `kkb#13`  
Left is Team Memory, for what we decided. Front is the Leader Desk, which only I can open, from my laptop with Touch ID. Right is the Code Navigator, which uses a graph of the repo to point at the exact file, function and line.

**Harsh** · `kkb#14`  
A head turn picks one, and I can also press A for left and L for right?

**Charan** · `kkb#15`  
Yes. But turning your head only selects an agent. It never proves who you are.

**Charan** · `kkb#16`  
One more rule: the agent says saved only after the update is read back from the store. A timeout is a failure.

**Harsh** · `kkb#17`  
That reminds me, on yesterday's test call it said saved even though the write had timed out.

**Charan** · `kkb#18`  
Then that's your first task. You own the fix. Start from persistVerifiedUpdate and check the timeout and the read-back.

**Harsh** · `kkb#19`  
Okay, I'll take the saved-after-timeout bug.

**Charan** · `kkb#20`  
Can you also run the three test calls, each longer than 45 seconds, with an evaluation note after each one?

**Harsh** · `kkb#21`  
Yes, I'll run the three calls and write the notes.

**Charan** · `kkb#22`  
I'll handle the leader approvals during the demo.

**Harsh** · `kkb#23`  
Should the code graph agent move to the left side?

**Charan** · `kkb#24`  
Maybe. Let's decide after the first call.

**Charan** · `kkb#25`  
Someone should record the demo film before four. Not sure who yet.

**Harsh** · `kkb#26`  
Last thing: do we freeze the code at 3:30 or 3:45?

**Charan** · `kkb#27`  
Let's not decide that now. Ask me through the agent later, that's a good test.

**Harsh** · `kkb#28`  
Okay. I'm on board with the whole plan. Let's test it now and see what I actually understood.

## What the system should extract

| Item | State | Owner | Lines |
| --- | --- | --- | --- |
| Leader Desk only on Charan's laptop with Touch ID; a head turn only selects | decision, approved | Charan | kkb#13, kkb#15 |
| Say "saved" only after read-back; a timeout is a failure | decision, approved | — | kkb#16 |
| Fix the saved-after-timeout bug, starting from `persistVerifiedUpdate` | **accepted** | Harsh | kkb#17–19 |
| Three test calls over 45 s, with an evaluation note after each | **accepted** | Harsh | kkb#20–21 |
| Leader approvals during the demo | **accepted** | Charan | kkb#22 |
| Move the code graph agent to the left | **proposed**, not decided | Harsh | kkb#23–24 |
| Record the demo film before four | **mentioned**, no owner | — | kkb#25 |
| Code freeze at 3:30 or 3:45 | **unknown**, escalate to the leader | — | kkb#26–27 |

## Three-call test plan

| Call | Harsh says | Pass when |
| --- | --- | --- |
| 1 | "Umm, mera kaam kya hai?" … interrupts: "ruko, woh bug wala code kahan hai?" | The brief names the saved-after-timeout bug. The code agent explains from first principles and boxes the timeout and read-back lines in `persist-update.ts` in the browser. The unfinished brief fact comes back. |
| 2 | "Code freeze kab hai — 3:30, nahi matlab, final time kya hai?" | It cleans the self-correction, says the time is not confirmed, and creates a leader ticket only after a yes. It never guesses. |
| 3 | After Charan approves on `/leader` with Touch ID: "koi update?" then "bug wala task in progress kar do" | It says "3:45 if CI is green, approved by Charan", repeats the change back, and says "saved" only after read-back. |

Make it harder with: a teammate asking about the other person's task, an open PR described as merged, a CI pass on an old commit, a caller who hangs up during escalation, and code comments that contain instructions.
