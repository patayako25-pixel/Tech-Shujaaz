ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);
ALTER TABLE users ADD COLUMN IF NOT EXISTS credentials TEXT;

CREATE TABLE IF NOT EXISTS therapist_slots (
  id SERIAL PRIMARY KEY,
  therapist_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  session_type VARCHAR(10) NOT NULL DEFAULT 'virtual',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  slot_id INTEGER NOT NULL UNIQUE REFERENCES therapist_slots(id) ON DELETE CASCADE,
  user_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  therapist_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'confirmed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slots_therapist ON therapist_slots(therapist_username, start_time);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings(user_username);
CREATE INDEX IF NOT EXISTS idx_bookings_therapist ON bookings(therapist_username);

CREATE TABLE IF NOT EXISTS posts (
  id SERIAL PRIMARY KEY,
  author_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  title VARCHAR(150) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS post_comments (
  id SERIAL PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_username VARCHAR(50) NOT NULL REFERENCES users(username) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_comments_post ON post_comments(post_id, created_at ASC);