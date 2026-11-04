// Partial shapes of the Moodle web service responses we use.

export interface SiteInfo {
  sitename: string;
  username: string;
  fullname: string;
  userid: number;
  siteurl: string;
  release?: string;
  version?: string;
  functions?: { name: string; version: string }[];
}

export interface MoodleCourse {
  id: number;
  shortname: string;
  fullname: string;
  displayname?: string;
  visible?: number;
  hidden?: boolean;
  startdate?: number;
  enddate?: number;
  lastaccess?: number | null;
  isfavourite?: boolean;
}

export interface MoodleContent {
  type: 'file' | 'url' | 'content' | string;
  filename: string;
  filepath?: string | null;
  filesize?: number;
  fileurl?: string;
  timecreated?: number | null;
  timemodified?: number | null;
  mimetype?: string;
  sortorder?: number;
}

export interface MoodleModule {
  id: number;
  url?: string;
  name: string;
  instance?: number;
  modname: string;
  visible?: number;
  uservisible?: boolean;
  description?: string;
  contents?: MoodleContent[];
  completiondata?: { state: number; timecompleted: number };
  dates?: { label: string; timestamp: number; dataid?: string }[];
}

export interface MoodleSection {
  id: number;
  name: string;
  visible?: number;
  summary?: string;
  section: number;
  uservisible?: boolean;
  modules: MoodleModule[];
}

export interface MoodleAssignment {
  id: number;
  cmid: number;
  course: number;
  name: string;
  intro?: string;
  duedate: number;
  cutoffdate?: number;
  allowsubmissionsfromdate?: number;
  timemodified?: number;
  nosubmissions?: number;
  teamsubmission?: number;
}

export interface AssignmentsResponse {
  courses: { id: number; fullname?: string; assignments: MoodleAssignment[] }[];
  warnings?: unknown[];
}

export interface SubmissionStatusResponse {
  lastattempt?: {
    submission?: { status: string; timemodified?: number } | null;
    teamsubmission?: { status: string; timemodified?: number } | null;
    gradingstatus?: string;
  };
  feedback?: {
    grade?: { grade?: string | null; timemodified?: number } | null;
    gradefordisplay?: string;
    gradeddate?: number;
  };
}

export interface MoodleQuiz {
  id: number;
  coursemodule: number;
  course: number;
  name: string;
  intro?: string;
  timeopen?: number;
  timeclose?: number;
}

export interface QuizzesResponse {
  quizzes: MoodleQuiz[];
}

export interface QuizAttemptsResponse {
  attempts: { id: number; state: string; timefinish?: number }[];
}

export interface ActionEvent {
  id: number;
  name: string;
  activityname?: string;
  modulename?: string;
  instance?: number;
  timestart: number;
  timesort?: number;
  eventtype?: string;
  url?: string;
  course?: { id: number; fullname?: string };
  action?: { name?: string; url?: string; actionable?: boolean };
}

export interface ActionEventsResponse {
  events: ActionEvent[];
}

export interface MoodleForum {
  id: number;
  course: number;
  type: string;
  name: string;
  cmid?: number;
}

export interface ForumDiscussion {
  id: number;
  discussion: number;
  name?: string;
  subject: string;
  message: string;
  userfullname?: string;
  created?: number;
  timemodified?: number;
  modified?: number;
  pinned?: boolean;
}

export interface ForumDiscussionsResponse {
  discussions: ForumDiscussion[];
}

export interface CompletionStatusResponse {
  statuses: { cmid: number; state: number; timecompleted?: number }[];
}

export interface PublicConfig {
  wwwroot?: string;
  sitename?: string;
  typeoflogin?: number; // 1 = in app, 2 = browser, 3 = embedded browser
  launchurl?: string;
  identityproviders?: { name: string; url: string }[];
  release?: string;
}
