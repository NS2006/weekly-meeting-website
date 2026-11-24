/**
 * What the seeded people work on: one theme per kind of project, with the sentences their weekly updates are made of.
 * All of it is invented internal work (no customers, sellers, real people or confidential figures).
 *
 * Placeholders, filled per note: {mate} a teammate's name, {n} 2–9, {nn} 10–60, {pct} 3–25, {day} a weekday,
 * {ticket} the theme's ticket prefix and a number, {metric} the theme's metric as it stands that week.
 */
import type { ImageSpec } from './png.ts';
import type { Random } from './random.ts';

export interface ImageContext {
  /** Week labels ('W41' …) up to the note's week, and the metric's value in each. */
  labels: string[];
  values: number[];
  random: Random;
}

export interface Theme {
  key: string;
  /** The project's name (each person who works on it has their own project). */
  name: string;
  description: string | null;
  ticket: string;
  done: string[];
  next: string[];
  blockers: string[];
  /** Complete one-sentence updates, for short notes. */
  oneLiners: string[];
  metric?: { name: string; unit: string; start: number; end: number };
  images?: { alt: string; spec: (ctx: ImageContext) => ImageSpec }[];
  code?: { language: string; text: string }[];
  quotes?: string[];
  links?: { text: string; href: string }[];
  /** Notes with this project also go to the Platform Guild meeting (its members only). */
  guild?: boolean;
  /** Team roadmaps: a milestone table instead of metrics. */
  milestones?: string[];
}

const trendBars = (title: string, unit: string) => (ctx: ImageContext): ImageSpec => ({
  kind: 'bars',
  title,
  labels: ctx.labels.slice(-6),
  values: ctx.values.slice(-6),
  unit,
  highlightLast: true,
});

const trendLine = (title: string, unit: string, target?: number) => (ctx: ImageContext): ImageSpec => ({
  kind: 'line',
  title,
  labels: ctx.labels.slice(-6),
  values: ctx.values.slice(-6),
  unit,
  ...(target === undefined ? {} : { target }),
});

const last = (values: number[]) => values[values.length - 1] ?? 0;

export const THEMES: Record<string, Theme> = {
  checkout: {
    key: 'checkout',
    name: 'Checkout revamp',
    description: 'One-page checkout, saved cards and address autocomplete.',
    ticket: 'CHK',
    done: [
      'Shipped saved cards to staging behind the `saved_cards` flag.',
      'Finished the address autocomplete for the shipping step ({ticket}).',
      'Paired with {mate} on the payment method list; it now remembers the last choice.',
      'Fixed the double-submit bug on the Pay button.',
      'The one-page variant is {pct}% ahead on completion after a full week of the A/B test.',
      'Cleaned up the old multi-step checkout routes.',
      'Added error states for expired vouchers on the summary step.',
      'Load-tested the order summary API at {n}x normal traffic; p95 stayed under 300 ms.',
      'Moved the shipping fee calculation to the backend so the total always matches.',
      'Reviewed the button labels with the content team; the copy is final.',
      'Checkout completion is at {metric} this week.',
    ],
    next: [
      'Roll the one-page checkout out to {pct}% of users.',
      'Remove the old step-by-step flow once the rollout is at 100%.',
      'Add analytics events for each field on the address form.',
      'Write the runbook for turning the flag off.',
      'Handle the cart changing while the payment is in progress.',
    ],
    blockers: [
      'Waiting for the payment gateway sandbox to come back up.',
      'The design for the voucher error state is not final yet.',
      'The QA environment was down for most of {day}.',
    ],
    oneLiners: [
      'Checkout A/B test still running; no surprises so far.',
      'Saved cards are live for internal users.',
      'Small one: fixed the focus order on the address form.',
    ],
    metric: { name: 'Checkout completion', unit: '%', start: 61, end: 68.4 },
    images: [
      { alt: 'Checkout completion by week', spec: trendBars('CHECKOUT COMPLETION BY WEEK', '%') },
      {
        alt: 'New shipping step of the one-page checkout',
        spec: () => ({ kind: 'form', title: 'CHECKOUT - STEP 2', fields: ['ADDRESS', 'CITY', 'POSTAL CODE', 'NOTE FOR COURIER'], button: 'PAY NOW', step: 'STEP 2 OF 3' }),
      },
    ],
    code: [{ language: 'json', text: '{\n  "flag": "one_page_checkout",\n  "rollout": 25,\n  "exclude": ["b2b"]\n}' }],
    quotes: ["From the usability test: \"I didn't notice I was already paying, it was that quick.\""],
    links: [{ text: 'checkout rollout plan', href: 'https://docs.example.com/checkout/rollout-plan' }],
  },

  payments: {
    key: 'payments',
    name: 'Payment retry service',
    description: 'Retries failed payments safely and adds a refunds API.',
    ticket: 'PAY',
    done: [
      'Added idempotency keys to the charge endpoint.',
      'The retry queue now backs off exponentially (1, 4 and 16 minutes).',
      'Wrote contract tests against the gateway sandbox.',
      'The refunds API is in code review ({ticket}).',
      'Fixed the retry bug that charged twice when the gateway timed out.',
      'The retry dashboard is up: {metric} of failed payments now recover.',
      'Moved the gateway secrets to the vault; nothing is left in config files.',
      'Partial refunds work end to end on staging.',
      'The reconciliation job compares our records with the gateway report every night.',
      'Reviewed {mate}\'s pull request for the refund webhooks.',
    ],
    next: [
      'Ship the refunds API to production.',
      'Alert when the oldest item in the retry queue is older than 30 minutes.',
      'Document the retry rules for the support team.',
      'Add a dead-letter queue for payments that never succeed.',
    ],
    blockers: [
      'The gateway sandbox rate-limits us during load tests.',
      'Need a decision from finance on rounding for partial refunds.',
    ],
    oneLiners: ['Refunds API merged; deploying tomorrow.', 'Quiet week on retries: no incidents.'],
    metric: { name: 'Recovered payments', unit: '%', start: 18, end: 34 },
    images: [{ alt: 'Share of failed payments that recover after a retry', spec: trendLine('RECOVERED PAYMENTS (%)', '%', 30) }],
    code: [
      {
        language: 'sql',
        text: "SELECT status, count(*)\n  FROM payment_retries\n WHERE created_at > now() - interval '7 days'\n GROUP BY status;",
      },
    ],
    links: [{ text: 'retry rules', href: 'https://docs.example.com/payments/retry-rules' }],
  },

  seller: {
    key: 'seller',
    name: 'Seller onboarding portal',
    description: 'Self-service sign-up for new sellers, from registration to approval.',
    ticket: 'SEL',
    done: [
      'Built step 3 of the sign-up wizard (store details).',
      'Document upload now checks the file type and size before sending.',
      'The approval queue for the ops team shows the oldest applications first.',
      'Added autosave to the wizard so nobody loses their progress.',
      'Fixed the validation message for store names with emoji.',
      'Ran a usability test with {n} colleagues; the wizard took {n} minutes on average.',
      'Email templates for approved and rejected applications are done.',
      'Wired the portal to the new permission model.',
      'Wizard completion is at {metric}.',
    ],
    next: [
      'Add a progress indicator to the wizard.',
      'Let ops ask for a missing document without rejecting the application.',
      'Translate the wizard copy.',
    ],
    blockers: ['Legal review of the terms page is still pending.', 'Waiting for the storage bucket for documents.'],
    oneLiners: ['Wizard step 4 is done; only the summary page is left.'],
    metric: { name: 'Wizard completion', unit: '%', start: 42, end: 57 },
    images: [
      {
        alt: 'Sign-up funnel of the seller wizard',
        spec: (ctx) => {
          const end = last(ctx.values) / 100;
          return {
            kind: 'funnel',
            title: 'SIGN-UP FUNNEL',
            steps: [
              { label: 'START', value: 1000 },
              { label: 'STORE', value: Math.round(1000 * (end + (1 - end) * 0.55)) },
              { label: 'DOCUMENTS', value: Math.round(1000 * (end + (1 - end) * 0.2)) },
              { label: 'SUBMIT', value: Math.round(1000 * end) },
            ],
          };
        },
      },
      {
        alt: 'Step 3 of the sign-up wizard',
        spec: () => ({ kind: 'form', title: 'SELLER SIGN-UP', fields: ['STORE NAME', 'CATEGORY', 'WAREHOUSE CITY'], button: 'NEXT', step: 'STEP 3 OF 5' }),
      },
    ],
  },

  search: {
    key: 'search',
    name: 'Search relevance',
    description: 'Better ranking and fewer searches with no results.',
    ticket: 'SRCH',
    done: [
      'Added {n} new synonym groups from last month\'s zero-result queries.',
      'Offline evaluation: NDCG@10 went from 0.61 to 0.64 with the new ranking features.',
      'Shipped typo tolerance for queries longer than four characters.',
      'Zero-result searches are down to {metric}.',
      'Built a small tool to compare two rankings side by side.',
      'Tuned the boost for items in stock.',
      'The query log pipeline now drops bot traffic.',
      'Went through {nn} sample queries with {mate}; most bad results come from category mismatches.',
    ],
    next: ['Start the A/B test for the new ranking.', 'Add brand names to the synonym list.', 'Look into queries slower than 800 ms.'],
    blockers: ['An index rebuild takes three hours, which slows experiments down.'],
    oneLiners: ['Synonym update deployed; zero-result searches keep going down.'],
    metric: { name: 'Zero-result searches', unit: '%', start: 9.5, end: 6.1 },
    images: [{ alt: 'Share of searches with no results, by week', spec: trendLine('ZERO-RESULT SEARCHES (%)', '%', 6.5) }],
    code: [{ language: 'json', text: '{\n  "synonyms": [\n    ["hp", "handphone", "smartphone"],\n    ["tv", "television"]\n  ]\n}' }],
  },

  promo: {
    key: 'promo',
    name: 'Promo engine',
    description: 'Voucher rules, stacking and campaign budgets.',
    ticket: 'PRM',
    done: [
      'Voucher stacking rules are configurable per campaign now.',
      'The budget cap stops a campaign within one minute of reaching its limit.',
      'Fixed the time zone bug that started campaigns an hour early.',
      'The campaign scheduler screen is ready for review.',
      'Added a dry-run mode that tests rules against last week\'s orders.',
      'Load-tested the rule checker: p95 is {metric} at {n}k checks per second.',
      'Wrote the migration of old vouchers to the new rule format.',
    ],
    next: [
      'Run the dry-run on the year-end campaign rules.',
      'Add an audit log for rule changes.',
      'Show the remaining budget on the campaign page.',
    ],
    blockers: ['Need sample campaigns from marketing to test with.', 'The new rule format needs a sign-off from finance.'],
    oneLiners: ['Scheduler screen merged.'],
    metric: { name: 'Rule check p95', unit: ' ms', start: 48, end: 21 },
    images: [
      {
        alt: 'Promo engine health this week',
        spec: (ctx) => ({
          kind: 'tiles',
          title: 'PROMO ENGINE',
          tiles: [
            { label: 'RULE CHECK P95', value: `${Math.round(last(ctx.values))} MS`, color: 'blue' },
            { label: 'CAMPAIGNS LIVE', value: String(ctx.random.int(6, 14)), color: 'green' },
            { label: 'BUDGET ALERTS', value: String(ctx.random.int(0, 3)), color: 'amber' },
          ],
        }),
      },
    ],
    code: [{ language: 'json', text: '{\n  "campaign": "year-end",\n  "stackable": false,\n  "budgetCap": 50000000\n}' }],
  },

  warehouse: {
    key: 'warehouse',
    name: 'Warehouse slotting',
    description: 'Shorter pick paths by placing fast movers close to packing.',
    ticket: 'WHS',
    done: [
      'The slotting model suggests new places for the top {n}00 items.',
      'Pilot in zone B: the average pick path is down to {metric}.',
      'The scanner app shows the new slot when an item is moved.',
      'Fixed the sync delay between the scanner app and the stock service.',
      'Ran the weekly re-slotting job on staging with last month\'s orders.',
      'Walked the floor with the shift lead to check the suggestions.',
    ],
    next: [
      'Extend the pilot to zone C.',
      'Add a report of moves per shift.',
      'Limit moves to {nn} per night so the team is not overloaded.',
    ],
    blockers: ['The scanner devices need an OS update before the new app version.', 'The zone C layout data is out of date.'],
    oneLiners: ['Zone B pilot running smoothly, nothing new to report.'],
    metric: { name: 'Average pick path', unit: ' m', start: 182, end: 141 },
    images: [
      { alt: 'Average pick path per week in the zone B pilot', spec: trendBars('AVG PICK PATH ZONE B (M)', ' M') },
      {
        alt: 'Slotting pilot board',
        spec: () => ({
          kind: 'board',
          title: 'SLOTTING PILOT',
          columns: [
            { name: 'TO DO', cards: ['ZONE C LAYOUT', 'MOVES REPORT'] },
            { name: 'DOING', cards: ['SCANNER OS UPDATE', 'NIGHTLY MOVE LIMIT'] },
            { name: 'DONE', cards: ['ZONE B PILOT', 'NEW SLOT ON SCAN', 'SYNC DELAY FIX'] },
          ],
        }),
      },
    ],
  },

  mobile: {
    key: 'mobile',
    name: 'Mobile app performance',
    description: 'Faster start-up and fewer crashes.',
    ticket: 'MOB',
    done: [
      'Cold start is down to {metric} on mid-range Android phones.',
      'Lazy-loaded the home feed images.',
      'Crash-free sessions reached 99.{n}% this week.',
      'Removed two unused SDKs; the app is {n} MB smaller.',
      'Added performance traces to the product page.',
      'Fixed the memory leak in the image carousel.',
      'Set up a weekly performance report from the traces.',
    ],
    next: [
      'Profile the search screen.',
      'Move font loading off the main thread.',
      'Agree on a cold start budget with the product team.',
    ],
    blockers: ['The release train is frozen until {day}.'],
    oneLiners: ['Release went out; crash-free rate holding steady.'],
    metric: { name: 'Cold start', unit: ' s', start: 3.4, end: 2.1 },
    images: [
      {
        alt: 'App health numbers this week',
        spec: (ctx) => ({
          kind: 'tiles',
          title: 'APP HEALTH',
          tiles: [
            { label: 'CRASH-FREE', value: `99.${ctx.random.int(2, 7)}%`, color: 'green' },
            { label: 'COLD START', value: `${(Math.round(last(ctx.values) * 10) / 10).toFixed(1)} S`, color: 'blue' },
            { label: 'APP SIZE', value: `${ctx.random.int(38, 46)} MB`, color: 'amber' },
          ],
        }),
      },
      { alt: 'Cold start time by week', spec: trendLine('COLD START (S)', ' S', 2.5) },
    ],
  },

  pipeline: {
    key: 'pipeline',
    name: 'Data pipeline migration',
    description: 'Moving the nightly batch jobs to the new scheduler.',
    ticket: 'DATA',
    done: [
      'Migrated {n} more jobs to the new scheduler ({metric} so far).',
      'Backfilled 90 days of order events for the finance reports.',
      'Added data quality checks for empty and duplicate keys.',
      'The nightly run finishes {pct}% faster than on the old cluster.',
      'Fixed the retry policy for jobs that time out.',
      'Wrote the runbook for re-running a failed day.',
      'Turned off {n} old cron jobs after a week of parallel runs.',
    ],
    next: [
      'Migrate the inventory snapshot job.',
      'Alert on late data, not only on failed jobs.',
      'Decommission the old cluster.',
    ],
    blockers: ['The old cluster\'s credentials expire on {day}; the migration has to be done before then.'],
    oneLiners: ['Parallel runs matched for the whole week.'],
    metric: { name: 'Jobs migrated', unit: '', start: 12, end: 47 },
    images: [{ alt: 'Jobs on the new scheduler, by week', spec: trendBars('JOBS ON THE NEW SCHEDULER', '') }],
    code: [{ language: 'bash', text: 'scheduler run orders_daily --backfill --days 90\nscheduler status orders_daily' }],
  },

  chatbot: {
    key: 'chatbot',
    name: 'Customer support chatbot',
    description: 'Answers common questions and hands over to an agent when needed.',
    ticket: 'BOT',
    done: [
      'Added {n} new intents (order status, change address, cancel order).',
      'Handover to a live agent now keeps the conversation history.',
      'Intent accuracy on the test set is up to {metric}.',
      'Rewrote the FAQ answers to be shorter.',
      'Fixed the loop where the bot asked the same question twice.',
      'Went through {nn} anonymised test conversations with the support team.',
    ],
    next: [
      'Add the refund status intent.',
      'Measure how often people ask for an agent.',
      'Prepare the pilot for 10% of chats.',
    ],
    blockers: ['Waiting for the support team\'s list of top questions.'],
    oneLiners: ['Chatbot pilot prep on track.'],
    metric: { name: 'Intent accuracy', unit: '%', start: 71, end: 86 },
    images: [
      {
        alt: 'What happens to chats in the test',
        spec: () => ({
          kind: 'funnel',
          title: 'CHAT OUTCOMES (TEST)',
          steps: [
            { label: 'STARTED', value: 500 },
            { label: 'ANSWERED', value: 410 },
            { label: 'RESOLVED', value: 330 },
            { label: 'TO AGENT', value: 90 },
          ],
        }),
      },
      { alt: 'Intent accuracy by week', spec: trendBars('INTENT ACCURACY (%)', '%') },
    ],
    quotes: ['From the support team: "The handover summary saves us a lot of scrolling."'],
  },

  tokens: {
    key: 'tokens',
    name: 'Design tokens',
    description: 'Shared colors, spacing and type for web and app.',
    ticket: 'DS',
    done: [
      'Published version 0.{n} of the token package.',
      'Mapped the old color names to the new tokens.',
      'Audited {nn} components for hard-coded colors; {metric} use tokens now.',
      'The dark mode tokens are in review.',
      'Synced the tokens between the design file and the code.',
    ],
    next: ['Write the migration guide for teams.', 'Add spacing tokens to the mobile app.', 'Remove the deprecated colors.'],
    blockers: ['Need a decision on the gray scale before 1.0.'],
    oneLiners: ['Token package 0.x released; two more teams moved over.'],
    metric: { name: 'Components on tokens', unit: '', start: 8, end: 31 },
    images: [
      {
        alt: 'Token adoption so far',
        spec: (ctx) => ({
          kind: 'tiles',
          title: 'TOKEN ADOPTION',
          tiles: [
            { label: 'WEB', value: `${ctx.random.int(60, 80)}%`, color: 'green' },
            { label: 'APP', value: `${ctx.random.int(30, 50)}%`, color: 'amber' },
            { label: 'COMPONENTS', value: String(Math.round(last(ctx.values))), color: 'blue' },
          ],
        }),
      },
    ],
    links: [{ text: 'token migration guide (draft)', href: 'https://docs.example.com/design/tokens' }],
    guild: true,
  },

  observability: {
    key: 'observability',
    name: 'Observability',
    description: 'Dashboards, alerts and SLOs for the main services.',
    ticket: 'OBS',
    done: [
      'Cut alert noise by {pct}%: merged duplicates and removed alerts nobody acts on.',
      'Defined SLOs for checkout and search.',
      'New dashboard for error budgets.',
      'Added tracing to the order service.',
      'Ran the on-call review of last month\'s incidents.',
      'We are down to {metric} alerts a week.',
    ],
    next: ['Page only on SLO burn rate.', 'Roll tracing out to payments.', 'Write the alert ownership guide.'],
    blockers: ['Log storage is close to its limit.'],
    oneLiners: ['Alert volume keeps dropping; no pages this week.'],
    metric: { name: 'Alerts per week', unit: '', start: 140, end: 52 },
    images: [{ alt: 'Alerts per week', spec: trendBars('ALERTS PER WEEK', '') }],
    code: [{ language: 'yaml', text: 'slo:\n  service: checkout\n  objective: 99.9\n  window: 28d' }],
    guild: true,
  },

  admin: {
    key: 'admin',
    name: 'Internal admin tool',
    description: 'Roles, permissions and an audit log for the ops tools.',
    ticket: 'ADM',
    done: [
      'The role editor is done; admins can copy a role.',
      'Every change is written to the audit log now.',
      'Added search to the audit log.',
      'Fixed the permission check on the export button.',
      'Removed {n} unused permissions.',
    ],
    next: ['Add a review screen before role changes are saved.', 'Export the audit log as CSV.'],
    blockers: ['The security review is booked for {day}.'],
    oneLiners: ['Audit log search is live.'],
  },

  coupons: {
    key: 'coupons',
    name: 'Legacy coupon cleanup',
    description: 'Remove the old coupon service after the move to the promo engine.',
    ticket: 'CPN',
    done: [
      'Moved the last {n} coupon types to the promo engine.',
      'Turned off writes to the old coupon tables.',
      'Deleted the old admin screens.',
      'Archived the old service\'s dashboards.',
    ],
    next: ['Drop the old tables after the retention period.', 'Close the remaining tickets.'],
    blockers: [],
    oneLiners: ['The old coupon service is read-only now.'],
  },

  loyalty: {
    key: 'loyalty',
    name: 'Loyalty points',
    description: 'Earning and spending points, and the expiry job.',
    ticket: 'LOY',
    done: [
      'The earn rules for the first pilot are configured.',
      'The points expiry job runs nightly on staging; it takes {metric} now.',
      'Added the points history screen.',
      'Fixed rounding for orders with vouchers.',
    ],
    next: ['Run the expiry job on a large synthetic data set.', 'Notify people before their points expire.'],
    blockers: ['The notification service has no template slot for us yet.'],
    oneLiners: ['Points history screen is in review.'],
    metric: { name: 'Expiry job runtime', unit: ' min', start: 38, end: 12 },
  },

  shipping: {
    key: 'shipping',
    name: 'Shipping rate calculator',
    description: 'One place to calculate courier rates by zone and weight.',
    ticket: 'SHP',
    done: [
      'Rates for {n} couriers are loaded.',
      'The zone lookup uses the postal code table now.',
      'Added a cache; a rate call takes {metric} at p95.',
      'Compared {n}00 sample orders with the old rates: all match.',
      'Handled the volumetric weight rule.',
    ],
    next: ['Add same-day delivery rates.', 'Let ops upload a new rate table.'],
    blockers: ['One courier changed their rate file format again.'],
    oneLiners: ['Rate cache running fine; no mismatches.'],
    metric: { name: 'Rate call p95', unit: ' ms', start: 420, end: 35 },
    images: [{ alt: 'Rate call time (p95) by week', spec: trendLine('RATE CALL P95 (MS)', ' MS', 100) }],
  },

  a11y: {
    key: 'a11y',
    name: 'Accessibility audit',
    description: 'Check the main flows for keyboard use, contrast and screen readers.',
    ticket: 'A11Y',
    done: [
      'Checked the checkout flow with the keyboard only.',
      'Listed {n} contrast issues on the product page.',
      'Tested the sign-up form with a screen reader.',
      'Added focus outlines to the shared buttons.',
    ],
    next: ['Share the findings in design review.', 'Fix the missing labels on icon buttons.'],
    blockers: [],
    oneLiners: ['Audit started; first findings next week.'],
    images: [
      {
        alt: 'Accessibility findings board',
        spec: () => ({
          kind: 'board',
          title: 'A11Y FINDINGS',
          columns: [
            { name: 'TO DO', cards: ['ICON BUTTON LABELS', 'CONTRAST ON PRICE', 'FOCUS TRAP IN MODAL'] },
            { name: 'DOING', cards: ['FORM ERRORS READ OUT'] },
            { name: 'DONE', cards: ['FOCUS OUTLINES', 'SKIP LINK'] },
          ],
        }),
      },
    ],
  },

  hackathon: {
    key: 'hackathon',
    name: 'Smart reorder reminder',
    description: 'Hackathon prototype: remind shoppers to reorder what they buy often.',
    ticket: 'HCK',
    done: [
      'Built the reminder prototype with {mate}.',
      'Trained a simple model on purchase intervals (synthetic data only).',
      'Prepared the demo for the jury.',
      'Collected feedback from {n} colleagues on the demo.',
      'Wrote up what it would take to build it for real.',
    ],
    next: ['Present the write-up to the product team.', 'Clean up the demo code.'],
    blockers: [],
    oneLiners: ['Demo ready for the check-in.'],
    images: [
      {
        alt: 'Hackathon board',
        spec: () => ({
          kind: 'board',
          title: 'HACKATHON BOARD',
          columns: [
            { name: 'IDEAS', cards: ['BUNDLE SUGGESTION', 'PRICE DROP PING'] },
            { name: 'BUILDING', cards: ['REMINDER SCREEN', 'INTERVAL MODEL'] },
            { name: 'DEMO', cards: ['SLIDES', 'DEMO SCRIPT'] },
          ],
        }),
      },
    ],
  },

  roadmapA: {
    key: 'roadmapA',
    name: 'Squad A roadmap',
    description: 'What Squad A ships this quarter.',
    ticket: 'SQA',
    done: [
      'Agreed the Q1 themes with the product lead.',
      'Updated the roadmap after the checkout test results.',
      'Moved the voucher work to the next sprint.',
      'Checked capacity for December: {n} people are out for a week each.',
      'Sprint review went well; {n} of {nn} tickets done.',
    ],
    next: ['Share the Q1 draft with the squad.', 'Book the Q1 planning session.'],
    blockers: ['Two roadmap items depend on the platform team\'s timeline.'],
    oneLiners: ['Roadmap unchanged this week.'],
    milestones: ['One-page checkout at 100%', 'Refunds API live', 'Seller wizard pilot', 'Promo dry-run for year-end'],
  },

  roadmapB: {
    key: 'roadmapB',
    name: 'Search squad roadmap',
    description: null,
    ticket: 'SQB',
    done: [
      'Agreed the ranking A/B test plan with the product lead.',
      'Re-planned the sprint after the index rebuild issue.',
      'Checked capacity for December.',
      'Prepared the demo agenda.',
    ],
    next: ['Draft the Q1 search goals.', 'Plan the chatbot pilot with support.'],
    blockers: [],
    oneLiners: ['Roadmap on track.'],
    milestones: ['Ranking A/B test', 'Chatbot pilot (10%)', 'Slotting zone C', 'Pipeline cut-over'],
  },

  experiments: {
    key: 'experiments',
    name: 'Q1 experiments backlog',
    description: 'Ideas to try next quarter.',
    ticket: 'EXP',
    done: [],
    next: [],
    blockers: [],
    oneLiners: [],
  },
};

/** Lines that belong to no project: they stay in the note only. */
export const GENERAL_LINES = [
  'On leave on {day}.',
  'Half day on {day}.',
  'Mostly code reviews this week.',
  'On call this week, so less feature work.',
  'Reminder: the code freeze starts on {day}.',
  'Thanks {mate} for covering my on-call shift.',
  'Two interview panels this week.',
  'At the vendor workshop on {day} morning.',
  'Onboarding buddy for a new joiner this week.',
  'My laptop was in for repair on {day}, so I did reviews instead.',
  'Will be at the town hall on {day} afternoon.',
];

/** Agenda items for the team leaders' notes. */
export const AGENDA_ITEMS = [
  'Demo: {topic}',
  'Rollout status',
  'Risks and help needed',
  'Q1 planning: first draft',
  'On-call handover',
  'Feedback from the last retro',
];
