import { notesEn } from './notes.en';
import { projectsEn } from './projects.en';
import { teamsEn } from './teams.en';
import { usersEn } from './users.en';
import { meetingsEn } from './meetings.en';
import { periodsEn } from './periods.en';
import { uiEn } from './ui.en';

/**
 * English: the default, and the language of every download. Its shape is the list of keys: id.ts must have exactly
 * the same ones (the type check refuses a missing or extra key). `{{name}}` is filled in; `<tag/>` is replaced
 * by a component (react-i18next's Trans). A key ending in `_one` / `_other` is chosen by `count`.
 */
export const en = {
  language: {
    label: 'Language',
    en: 'English',
    id: 'Bahasa Indonesia',
  },
  common: {
    tryAgain: 'Try again',
  },
  brand: {
    tagline: 'Weekly updates, shared with your team',
  },
  nav: {
    main: 'Main',
    brand: 'Weekly Meeting Notes home',
    home: 'Home',
    notes: 'Notes',
    projects: 'Projects',
    teams: 'Teams',
    users: 'Users',
    waiting: ' waiting for access',
  },
  account: {
    button: 'Account: {{name}}',
    buttonAdmin: 'Account: {{name}}, admin view',
    admin: 'Admin',
    menu: 'Account',
    workingAs: 'Working as {{role}}',
    changeRole: 'Change role',
    signOut: 'Sign out',
    signingOut: 'Signing out…',
  },
  roles: {
    user: 'User',
    admin: 'Admin',
    userDescription: 'Write notes and join your teams’ meetings',
    adminDescription: 'Activate people and manage admins',
    title: 'Change role',
    lead: 'Pick how you want to use Weekly Meeting Notes right now. You can switch back any time.',
    group: 'Roles',
    current: 'Current',
    cancel: 'Cancel',
    switch: 'Switch role',
    switchTo: 'Switch to {{role}}',
  },
  auth: {
    title: 'Sign in',
    lead: 'Use your company email. New accounts wait for a website admin to activate them.',
    email: 'Company email',
    emailPlaceholder: 'firstname.lastname@company.com',
    name: 'Full name',
    namePlaceholder: 'Your name as colleagues know it',
    submit: 'Sign in',
    or: 'or',
    quick: 'Quick sign-in with a test account',
    testAccounts: 'Test accounts',
    signIn: 'Sign in',
    signingIn: 'Signing in…',
    mockTitle: 'Mock sign-in, not Apps Gateway',
    mockBody: 'No password is checked, so this page is not access control. Apps Gateway replaces it before anyone else uses the website.',
    footer: 'Internal tool · weekly meeting notes',
  },
  waiting: {
    title: 'Waiting for activation',
    body: 'Your account <email/> is created. A website admin needs to activate it before you can use Weekly Meeting Notes.',
    recheck: 'This page checks again every 30 seconds. Ask your team leader to tell an admin.',
    checkNow: 'Check now',
    signOut: 'Sign out',
  },
  home: {
    leadUser: 'Write your update in Notes, then share it on your team’s meeting so everyone can read it before you meet.',
    leadAdmin: 'Admin view: activate the people who signed in, and choose who else is an admin, in Users.',
  },
  waitingUsers: {
    title: 'Waiting for access',
    none: 'No one is waiting',
    noneBody: 'New people show up here as soon as they sign in. They can use the website once you activate them.',
    count_one: '{{count}} person signed in and is waiting for you to activate them.',
    count_other: '{{count}} people signed in and are waiting for you to activate them.',
    signedIn: 'Signed in {{when}}',
    more: 'And {{count}} more.',
    review: 'Review and activate',
  },
  dates: {
    morning: 'Good morning',
    midday: 'Good afternoon',
    afternoon: 'Good afternoon',
    evening: 'Good evening',
    today: 'Today',
    tomorrow: 'Tomorrow',
    yesterday: 'Yesterday',
    inDays: 'In {{count}} days',
    daysAgo: '{{count}} days ago',
    agoToday: 'today',
    agoYesterday: 'yesterday',
    agoDays: '{{count}} days ago',
    agoOn: 'on {{date}}',
    noDays: 'No days',
    everyDay: 'Every day',
    everyWeekday: 'Every weekday',
    every: 'Every {{days}}',
  },
  errors: {
    network_error: "Can't reach the server. Check that the backend is running, then try again.",
    unauthenticated: 'Your session has ended. Sign in again.',
    account_inactive: 'Your account is not active yet.',
    role_not_held: "You don't have that role.",
    admin_only: 'Only admins can do this. Switch to the Admin role, or ask an admin.',
    user_role_only: 'Switch to the User role to use teams.',
    cannot_change_self: 'You cannot change your own account. Ask another admin.',
    admin_from_config: 'This admin comes from the server settings (ADMIN_EMAILS) and cannot be changed here.',
    not_found: "Not found. It may have been removed, or you're not part of it.",
    not_team_leader: 'Only the team leader can do this.',
    leader_cannot_leave: 'The leader cannot leave. Make someone else the leader first, or delete the team.',
    already_member: 'This person is already in the team.',
    not_a_member: 'This person is no longer in the team. Refresh the page.',
    user_not_active: "This person's account is not active, so they can't be added or made leader.",
    team_archived: 'This team is deleted. Restore it first.',
    team_expired: 'This team was deleted more than 30 days ago and can no longer be restored.',
    confirmation_mismatch: "The name you typed doesn't match the team name.",
    meeting_in_past: "This meeting's day has passed, so it can no longer be cancelled, reopened or moved.",
    meeting_date_taken: 'This schedule already has a meeting on that day. Pick another date.',
    meeting_cancelled: 'This meeting is cancelled, so it takes no notes. Add the note to the next meeting instead.',
    board_changed: 'Someone changed this board while you were arranging it. It is up to date now: try again.',
    series_has_notes: 'Some of its meetings already hold notes, so it cannot be deleted. Stop it instead.',
    too_many_series: 'A team can have at most 10 schedules. Stop or delete one first.',
    project_name_taken: 'You already have a project with this name. Pick another one.',
    project_archived: 'This project is archived. Restore it first to change it.',
    version_conflict: 'This note was changed in another tab or window.',
    invalid_image: 'Only PNG, JPEG, GIF and WebP images can be added.',
    too_large: 'Too large: an image can be at most 5 MB, and a note at most 1 MB of text.',
    too_many_images: 'A note can hold at most 100 images.',
    validation_failed: 'Enter a valid email address and your name.',
    internal_error: 'Something went wrong on the server. Try again.',
    fallback: 'Something went wrong. Try again.',
  },
  // Each area's words, in its own file (<area>.en.ts / <area>.id.ts).
  notes: notesEn,
  projects: projectsEn,
  teams: teamsEn,
  users: usersEn,
  meetings: meetingsEn,
  periods: periodsEn,
  ui: uiEn,
} as const;

/** The same keys with any text: what every other language provides. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Messages = Widen<typeof en>;
