/** Meetings: English (the keys). Fixed website text only; what people typed is never translated. */
export const meetingsEn = {
  // Shared by several meeting screens.
  untitled: 'Untitled note',
  emptyNote: 'Empty note',
  cancel: 'Cancel',
  counts: {
    notes_one: '{{count}} note',
    notes_other: '{{count}} notes',
    images_one: '{{count}} image',
    images_other: '{{count}} images',
  },
  // MeetingStatusBadge
  status: {
    cancelled: 'Cancelled',
    today: 'Today',
    done: 'Done',
  },
  // MeetingRow and its helpers
  row: {
    reason: 'Reason: {{reason}}',
    movedFrom: 'Moved from {{date}}',
    noNotes: 'No notes',
    noNotesYet: 'No notes yet',
  },
  // MeetingSwitcher and its "jump to" list (switcher.ts)
  switcher: {
    previous: 'Previous',
    next: 'Next',
    previousMeeting: 'Previous meeting: {{when}}',
    nextMeeting: 'Next meeting: {{when}}',
    whenCancelled: '{{date}}, cancelled',
    label: 'Other meetings of this schedule',
    jump: 'Go to another meeting of this schedule',
    today: 'today',
    cancelled: 'cancelled',
  },
  // Home: NextMeetings
  next: {
    title: 'Your next meetings',
    empty: 'No meetings in the next four weeks',
    emptyBody: 'When a team leader sets a meeting schedule, the dates show up here. Open <teams>Teams</teams> to see your teams.',
    showAll: 'Show all {{count}} meetings of the next 4 weeks',
    showFewer: 'Show fewer',
    pages: 'Pages of your next meetings',
    range: '{{from}}–{{to}} of {{count}} meetings in the next 4 weeks',
  },
  // The team page's next meetings (TeamNextMeetings).
  teamNext: {
    title: 'Next meetings',
    loading: 'Loading the next meetings',
    empty: 'No meetings in the next four weeks.',
    more: 'Every meeting is on its quarter’s page below.',
  },
  // MeetingPage
  page: {
    // The back link when the meeting has not loaded: the Home page (page names stay in English in every language).
    home: 'Home',
    loading: 'Loading the meeting…',
    notFound: "This meeting doesn't exist, or you're not in its team",
    notFoundBody: 'Its schedule may have been deleted.',
    failed: 'Could not load the meeting',
  },
  // MeetingDetailView
  detail: {
    period: '{{period}}: see all its meetings and notes',
    periodEnded: '{{period}}, ended: see all its meetings and notes',
    periodTitle: 'See all of {{period}}',
    ended: 'ended',
    stopped: 'Schedule stopped',
    move: 'Move',
    cancelMeeting: 'Cancel meeting',
    cancelledTitle: 'This meeting is cancelled',
    reason: 'Reason: <reason/>.',
    canReopen: 'You can reopen it until the day has passed.',
    wontHappen: 'It will not take place.',
    reopen: 'Reopen meeting',
    reopened: 'The meeting is back on.',
    moved: 'Moved to <day/>. Everyone in the team sees the new day.',
  },
  // MeetingDetailView: MoveDialog
  move: {
    title: 'Move this meeting',
    submit: 'Move meeting',
    now: 'Now on <day/>. It stays part of <schedule/>; the schedule itself does not change.',
    invalid: 'Pick a day from today up to a year ahead.',
    newDay: 'New day',
    sameDay: 'That is the day it is on now.',
    range: 'From today up to a year ahead.',
  },
  // MeetingDetailView: CancelDialog
  cancelDialog: {
    title: 'Cancel the meeting on <day/>?',
    confirm: 'Cancel meeting',
    keep: 'Keep meeting',
    body: 'The team sees it as cancelled. You can reopen it until the day has passed.',
    reason: 'Reason (optional)',
    reasonPlaceholder: 'For example: Public holiday',
    reasonHelp: 'Shown to the team with the cancellation.',
  },
  // MeetingBoard
  board: {
    title: 'Notes',
    loading: 'Loading the notes…',
    participation_one: '{{wrote}} of {{count}} person has added a note.',
    participation_other: '{{wrote}} of {{count}} people have added a note.',
    openHint: 'Open a note to read it<keys>; use ← and → to go through them</keys>.',
    arrangeAll: 'Hold a name bar and drag it to change who speaks first; hold a note to move it within its group.',
    arrangeNotes: 'Hold a note to move it within its group.',
    arrangeSelfAndNotes: 'Hold your name bar and drag it to change when you speak; hold one of your notes to change their order.',
    arrangeSelf: 'Hold your name bar and drag it to change when you speak.',
    arrangeMyNotes: 'Hold one of your notes and drag it to change their order.',
    addMine: '+ Add my note',
    cancelled: 'This meeting is cancelled, so it takes no new notes: add them to the next meeting.',
    cancelledKept: 'Notes added before it was cancelled are still here.',
    teamDeleted: 'This team is deleted: its meetings are read-only.',
    gone: 'That note is no longer on this meeting.',
    removed: '“{{title}}” was taken off this meeting. It is still in your notes.',
    undo: 'Undo',
    putBack: 'Put back.',
    added: '“{{title}}” is on the board now.',
    groups: 'Notes for {{name}}, one group per person who added a note',
    emptyTitle: 'No notes on this meeting yet',
    emptyBody: 'Add one you wrote, or write a new one.',
    empty: 'No notes on this meeting yet.',
    // The "you" in a meeting card's "No note yet" names (board.ts waitingNames).
    you: 'you',
    youMark: ' (you)',
  },
  // MeetingBoard: the "No note yet" button and its list
  waiting: {
    button: 'No note yet',
    title_one: '{{count}} person has not added a note yet',
    title_other: '{{count}} people have not added a note yet',
    leader: 'Leader',
    addYours: 'Add yours',
  },
  // MeetingBoard: a person's group and its cards
  column: {
    leader: 'Leader',
    left: 'Left the team',
    deactivated: 'Deactivated',
    handle: '{{name}}. Hold and drag to change the speaking order, or press Alt with the arrow keys.',
    addAnother: '+ Add another note',
  },
  card: {
    label: '{{title}}, by {{author}}. Open to read.',
    labelMovable: '{{title}}, by {{author}}. Open to read; hold and drag, or press Alt with the arrow keys, to move it.',
    edited: 'Edited {{when}}',
  },
  // BoardNoteReader
  reader: {
    remove: 'Remove from this meeting',
    openInEditor: 'Open in editor',
    written: 'written {{date}}',
    edited: 'edited {{when}}',
    gone: 'This note is no longer on this meeting.',
    noProject: 'No project',
    loading: 'Loading the note…',
    position: '{{index}} of {{total}}',
  },
  // AddToMeetingDialog
  add: {
    title: 'Add your note to this meeting',
    newTitle: 'Write a new note',
    newBody: 'It opens in the editor and is on this meeting already.',
    write: 'Write a note',
    or: 'or add one you wrote',
    search: 'Search your notes',
    searchPlaceholder: 'Words in the title or text',
    noMatch: 'No note matches.',
    none: 'You have no notes yet. Write one above.',
    here: 'On this meeting',
    inWindow: "Written for this meeting's days",
    alsoOn: 'also on {{meetings}}',
    older: 'Show older notes',
  },
  // SeriesFormDialog
  series: {
    edit: 'Edit <name/>',
    create: 'Set up a meeting schedule',
    stop: 'Stop schedule',
    delete: 'Delete',
    save: 'Save',
    submitCreate: 'Create schedule',
    invalid: 'Give the schedule a name and pick at least one day.',
    name: 'Name',
    namePlaceholder: 'For example: Weekly sync',
    nameHelp: 'Shown on each of its meetings.',
    days: 'Meets every',
    pickDays: 'Pick the days your team meets. Meetings start from today.',
    nextMeetings: 'Next meetings',
    tomorrow: '(tomorrow)',
    share: 'Members share their notes on the meeting they are for.',
    daysChanged: 'Upcoming meetings on days you removed are taken off. Meetings you moved, and meetings that already have notes, stay.',
  },
  // TeamMeetingsPanel: the schedules
  schedules: {
    title: 'Schedules',
    add: 'Add schedule',
    setUpTitle: 'Set up your meeting schedule',
    noneTitle: 'No meeting schedule yet',
    setUp: 'Set up schedule',
    setUpBody:
      'Pick the days your team meets, for example every Wednesday and Friday. The next four weeks of meetings appear here at once, and keep coming.',
    leaderSets: 'The team leader sets the days your team meets.',
    leaderNamedSets: 'The team leader, <name/>, sets the days your team meets.',
    stopped: 'Stopped',
    next: 'Next: {{when}}',
    nextToday: 'today',
    noUpcoming: 'No upcoming meeting',
    noNew: 'Makes no new meetings',
    restart: 'Restart',
    edit: 'Edit',
    // The name a team's first schedule starts with (the leader can change it before saving).
    defaultName: 'Weekly meeting',
    stopTitle: 'Stop <name/>?',
    stopConfirm: 'Stop schedule',
    stopBody:
      'It makes no new meetings, and its upcoming meetings are taken off (except ones that already have notes). Past meetings stay. You can restart it any time.',
    deleteTitle: 'Delete <name/>?',
    deleteConfirm: 'Delete schedule',
    deleteBody:
      'All its meetings, past and upcoming, are deleted too. This cannot be undone. To only stop new meetings, stop the schedule instead.',
  },
  // TeamMeetingsPanel: the team's meetings
} as const;
