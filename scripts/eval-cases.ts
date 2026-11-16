// Labelled code-search questions shared by graph:eval and eval:retrieval.
// Each case: [question, acceptable gold symbols].

export const CASES: [string, string[]][] = [
  ["where do we read back before saying saved", ["persistVerifiedUpdate", "resolveTicket"]],
  ["leader step up verification", ["stepUp", "assertPasskey"]],
  ["which code dedupes bolna callbacks", ["recordExecutionCallback"]],
  ["kahan hai head turn dwell hysteresis", ["step"]],
  ["passkey signature counter cloned key", ["assertPasskey"]],
  ["live utterance consent revoked", ["ingestUtterance", "setConsent"]],
  ["stale CI check older sha", ["reconcileTask"]],
  ["who can open the leader desk", ["zoneAccess", "leaderInbox"]],
  ["where do we check the record was really stored before saying saved", ["persistVerifiedUpdate", "resolveTicket"]],
  ["how does the lead prove it's them with a fingerprint", ["assertPasskey", "registerPasskey", "stepUp"]],
  ["what ignores late or repeated phone call status updates", ["recordExecutionCallback"]],
  ["how is a head turn turned into choosing an agent", ["step", "recordFocus"]],
  ["where do we stop recording when someone withdraws microphone permission", ["ingestUtterance", "setConsent"]],
  ["how do we tell if CI ran on an old commit", ["reconcileTask"]],
  ["who is allowed into the leader's inbox", ["zoneAccess", "leaderInbox"]],
  ["where is the answer about team decisions built", ["askTeamMemory"]],
  ["how are filler words and self corrections cleaned", ["understand", "finalIntent"]],
  ["where is the step by step explanation of code generated", ["explainFirstPrinciples"]],
  ["smooth animation that does not depend on frame rate", ["damp"]],
  ["turn a list of points into a smooth curve", ["catmullRomToBezier", "bsplineToBezier"]],
  ["find the relevant file for a task by keywords", ["codeScout"]],
  ["check the call token and figure out who is calling", ["resolveCaller"]],
  ["create a single use token for a phone call", ["issueCallSession"]],
  ["which agent did the caller pick on their screen", ["latestActivatedZone"]],
  ["read pull request state and check runs from github", ["githubClient"]],
  ["send a question to the leader when the answer is unknown", ["createTicket"]],
  ["append only event log on disk", ["EventStore"]],
  ["decide whether a model may say a task is done", ["evidenceVerifier", "reconcileTask"]],
];

// HELD OUT: written after the search was tuned and never used to tune it.
// Reported separately so the headline isn't graded on its own homework.
export const HELD_OUT: [string, string[]][] = [
  ["where does a teammate raise a doubt for the lead", ["createTicket"]],
  ["take back a question I already sent to the lead", ["resolveTicket", "createTicket"]],
  ["decode the binary format inside a passkey registration", ["decodeCbor", "parseAuthData"]],
  ["convert the public key from the authenticator into a usable key", ["coseToJwk"]],
  ["who decides which helper agent should answer", ["chooseSpecialist"]],
  ["find the function that contains a given line", ["enclosingSymbol"]],
  ["show the leader whether they are online", ["leaderPresence", "setPresence"]],
  ["how long is a curve", ["arcLength"]],
  ["what decisions are currently in force", ["currentDecisions"]],
  ["phone the lead when nobody answers the doubt", ["requestLeaderCall"]],
  ["open a session for a laptop or phone", ["issueDeviceSession"]],
  ["read the camera to estimate where someone is looking", ["webcamYawDeg", "loadWebcamLandmarker"]],
];

// FRESH TEST SET (2026-11-16): written before the retrieval changes in this pass
// and never used to tune them. Plain-language, mostly without identifier words.
export const TEST_2026_11: [string, string[]][] = [
  ["strip phone numbers and secrets before saving a call review", ["redactor"]],
  ["wait for the previous writer with a lock that expires", ["acquireLease"]],
  ["is the code index older than the deployed commit", ["graphFreshness"]],
  ["turn a recorded meeting export into passages we can quote", ["importWisprMeeting", "validateWisprImport"]],
  ["build the quoted excerpt of a file with real line numbers", ["sourceExcerpt", "readSource"]],
  ["note that a fact was cut off mid sentence so it is said again", ["markInterrupted"]],
  ["remember which facts the caller actually acknowledged", ["confirmHeard"]],
  ["issue a one time challenge for the passkey ceremony", ["issueChallenge"]],
  ["store a call evaluation privately without overwriting older runs", ["savePrivateEvaluation"]],
  ["keep the conversation state alive across serverless instances", ["persistConversation", "restoreConversations"]],
  ["choose hosted redis or a local file for events", ["runtimeStore", "redisConfig"]],
  ["check that the uploaded production snapshot is complete", ["validateHostedSnapshot"]],
  ["list the meetings this person is allowed to see", ["meetingCatalog", "visibleMeetingPassages"]],
  ["make sure a wispr link points to the real wispr site", ["safeWisprLink"]],
  ["which input, webcam or airpods, is steering focus right now", ["selectFocusInput", "focusInput", "readFocusInput"]],
  ["when the lead answers, store the new decision version", ["resolveTicket"]],
  ["build the list of functions the voice agent may call", ["buildBolnaTools", "buildSpatialBolnaTools"]],
  ["open a file at the exact line in the caller's browser", ["executeBrowserAction", "navigateCode"]],
  ["which parts of the repository changed, for the story timeline", ["matchAreas", "traceTrail"]],
  ["parse and validate the update the model wants to save", ["parseTaskUpdate"]],
  ["say whether the lead is available to take calls", ["setPresence", "leaderPresence"]],
  ["find the latest microphone consent a session gave", ["latestConsent", "setConsent"]],
];
