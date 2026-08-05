import { pgTable, uuid, text, timestamp, integer, jsonb, boolean } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  password: text('password'),
  role: text('role', { enum: ['admin', 'moderator', 'user'] }).default('user'),
  // Language preferences
  mainLanguage: text('main_language').notNull().default('German'),
  translationLanguages: jsonb('translation_languages').default(['English', 'Bangla']),
  // Voice preference for TTS
  preferredVoice: text('preferred_voice').default('de-DE-AmalaNeural'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const words = pgTable('words', {
  id: uuid('id').defaultRandom().primaryKey(),
  mainWord: text('main_word').notNull(),
  translation1: text('translation_1'),
  translation2: text('translation_2'),
  exampleSentence: text('example_sentence'),
  notes: text('notes'),
  section: text('section').notNull(),
  createdBy: uuid('created_by').references(() => users.id),
  important: boolean('important').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const userWords = pgTable('user_words', {
  id: uuid('id').defaultRandom().primaryKey(),
  originalWordId: uuid('original_word_id')
    .notNull()
    .references(() => words.id),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id),
  modifications: jsonb('modifications'),
});

// Learning progress tracking
export const learningProgress = pgTable('learning_progress', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  wordId: uuid('word_id').notNull().references(() => words.id),
  // Mastery level: 0 (new) to 5 (mastered)
  masteryLevel: integer('mastery_level').notNull().default(0),
  // Next review date based on spaced repetition
  nextReviewDate: timestamp('next_review_date').notNull(),
  // Total number of correct/incorrect attempts
  correctAttempts: integer('correct_attempts').notNull().default(0),
  incorrectAttempts: integer('incorrect_attempts').notNull().default(0),
  // Last review date
  lastReviewedAt: timestamp('last_reviewed_at'),
  // Learning direction preferences (dynamically set based on user's languages)
  preferredDirection: text('preferred_direction').notNull().default('main_to_trans1'),
  // important: boolean('important').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Learning sessions
export const learningSessions = pgTable('learning_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id),
  // Session type: "review", "new_words", "mistakes", etc.
  sessionType: text('session_type').notNull(),
  // Learning direction for this session
  direction: text('direction').notNull(),
  // Section filter (if any) - now supports multiple sections
  sections: jsonb('sections').default([]),
  // Session status: "in_progress", "completed", "abandoned"
  status: text('status').notNull().default('in_progress'),
  // Session statistics
  totalWords: integer('total_words').notNull().default(0),
  correctAnswers: integer('correct_answers').notNull().default(0),
  incorrectAnswers: integer('incorrect_answers').notNull().default(0),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Session words (words included in a learning session)
export const sessionWords = pgTable('session_words', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => learningSessions.id),
  wordId: uuid('word_id').notNull().references(() => words.id),
  // Whether the word was answered correctly in this session
  isCorrect: boolean('is_correct'),
  // The user's answer (if any)
  userAnswer: text('user_answer'),
  // When the word was presented
  presentedAt: timestamp('presented_at').notNull().defaultNow(),
  // When the word was answered (if answered)
  answeredAt: timestamp('answered_at'),
  // Order in which the word was presented
  presentationOrder: integer('presentation_order').notNull(),
  // Idempotency key for batch answer sync from the mobile offline queue and
  // the home-screen widget. Null for answers written by the web app.
  clientEventId: text('client_event_id'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Opaque, rotating refresh tokens for the mobile app. Stored as SHA-256
// hashes, grouped into families so that replay of a rotated token can burn
// every descendant at once.
export const mobileRefreshTokens = pgTable('mobile_refresh_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(), // sha256 hex
  familyId: uuid('family_id').notNull(), // rotation chain
  familyStartedAt: timestamp('family_started_at').notNull().defaultNow(),
  deviceId: text('device_id'), // client install uuid
  deviceName: text('device_name'), // for a future "signed-in devices" screen
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at'),
  revokedAt: timestamp('revoked_at'),
  supersededAt: timestamp('superseded_at'), // set on normal rotation
});

// Fixed-window counters for login throttling. See src/lib/rate-limit.ts.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull().default(0),
  windowStart: timestamp('window_start').notNull().defaultNow(),
});

// Relations
export const wordsRelations = relations(words, ({ one }) => ({
  creator: one(users, {
    fields: [words.createdBy],
    references: [users.id],
  }),
}));

export const userWordsRelations = relations(userWords, ({ one }) => ({
  word: one(words, {
    fields: [userWords.originalWordId],
    references: [words.id],
  }),
  user: one(users, {
    fields: [userWords.userId],
    references: [users.id],
  }),
}));

export const learningProgressRelations = relations(learningProgress, ({ one }) => ({
  user: one(users, {
    fields: [learningProgress.userId],
    references: [users.id],
  }),
  word: one(words, {
    fields: [learningProgress.wordId],
    references: [words.id],
  }),
}));

export const learningSessionsRelations = relations(learningSessions, ({ one, many }) => ({
  user: one(users, {
    fields: [learningSessions.userId],
    references: [users.id],
  }),
  sessionWords: many(sessionWords),
}));

export const sessionWordsRelations = relations(sessionWords, ({ one }) => ({
  session: one(learningSessions, {
    fields: [sessionWords.sessionId],
    references: [learningSessions.id],
  }),
  word: one(words, {
    fields: [sessionWords.wordId],
    references: [words.id],
  }),
}));