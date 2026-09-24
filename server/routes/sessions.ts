import { Router, Request, Response } from 'express';
import pool from '../db';
import { AuthedRequest, requireRole } from '../auth-helpers';

const router = Router();

router.get('/therapists', async (_req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT username, display_name, bio, avatar_url FROM users
     WHERE role = 'therapist' AND verified = true AND status = 'active'
     ORDER BY display_name NULLS LAST, username`
  );
  res.json({ success: true, therapists: result.rows });
});

router.get('/therapists/:username/slots', async (req: Request, res: Response) => {
  const result = await pool.query(
    `SELECT id, start_time, end_time, session_type FROM therapist_slots
     WHERE therapist_username = $1 AND status = 'open' AND start_time > now()
     ORDER BY start_time ASC`,
    [req.params.username]
  );
  res.json({ success: true, slots: result.rows });
});

router.get('/my-slots', requireRole('therapist'), async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const result = await pool.query(
    `SELECT ts.id, ts.start_time, ts.end_time, ts.session_type, ts.status, b.user_username AS booked_by
     FROM therapist_slots ts
     LEFT JOIN bookings b ON b.slot_id = ts.id AND b.status = 'confirmed'
     WHERE ts.therapist_username = $1 AND ts.start_time > now() - interval '1 day'
     ORDER BY ts.start_time ASC`,
    [currentUser.username]
  );
  res.json({ success: true, slots: result.rows });
});

router.post('/slots', requireRole('therapist'), async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  if (!currentUser.verified) {
    res.status(403).json({ success: false, message: 'Your profile must be verified before you can add availability.' });
    return;
  }
  const { startTime, endTime, sessionType } = req.body as {
    startTime?: string;
    endTime?: string;
    sessionType?: string;
  };
  if (!startTime || !endTime) {
    res.status(400).json({ success: false, message: 'Start and end time are required.' });
    return;
  }
  if (sessionType !== 'physical' && sessionType !== 'virtual') {
    res.status(400).json({ success: false, message: 'Session type must be physical or virtual.' });
    return;
  }
  if (new Date(endTime) <= new Date(startTime)) {
    res.status(400).json({ success: false, message: 'End time must be after start time.' });
    return;
  }
  if (new Date(startTime) <= new Date()) {
    res.status(400).json({ success: false, message: 'Start time must be in the future.' });
    return;
  }
  const result = await pool.query(
    `INSERT INTO therapist_slots (therapist_username, start_time, end_time, session_type)
     VALUES ($1, $2, $3, $4) RETURNING id, start_time, end_time, session_type, status`,
    [currentUser.username, startTime, endTime, sessionType]
  );
  res.json({ success: true, message: 'Slot added.', slot: result.rows[0] });
});

router.delete('/slots/:id', requireRole('therapist'), async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const result = await pool.query(
    `DELETE FROM therapist_slots
     WHERE id = $1 AND therapist_username = $2 AND status = 'open'
     RETURNING id`,
    [req.params.id, currentUser.username]
  );
  if (result.rows.length === 0) {
    res.status(400).json({ success: false, message: 'Slot cannot be removed.' });
    return;
  }
  res.json({ success: true, message: 'Slot removed.' });
});

router.post('/bookings', requireRole('user'), async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const { slotId } = req.body as { slotId?: number };
  if (!slotId) {
    res.status(400).json({ success: false, message: 'Slot is required.' });
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slotResult = await client.query(
      `SELECT id, therapist_username, start_time FROM therapist_slots
       WHERE id = $1 AND status = 'open' AND start_time > now() FOR UPDATE`,
      [slotId]
    );
    if (slotResult.rows.length === 0) {
      await client.query('ROLLBACK');
      res.status(400).json({ success: false, message: 'That slot is no longer available.' });
      return;
    }
    const slot = slotResult.rows[0];
    await client.query(`UPDATE therapist_slots SET status = 'booked' WHERE id = $1`, [slot.id]);
    await client.query(
      `INSERT INTO bookings (slot_id, user_username, therapist_username)
       VALUES ($1, $2, $3)`,
      [slot.id, currentUser.username, slot.therapist_username]
    );
    await client.query('COMMIT');
    res.json({ success: true, message: 'Session booked.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ success: false, message: 'Could not complete booking.' });
  } finally {
    client.release();
  }
});

router.get('/my-bookings', requireRole('user'), async (req: Request, res: Response) => {
  const currentUser = (req as AuthedRequest).currentUser;
  const result = await pool.query(
    `SELECT b.id, b.status, ts.start_time, ts.end_time,
            u.username AS therapist_username, u.display_name AS therapist_display_name
     FROM bookings b
     JOIN therapist_slots ts ON ts.id = b.slot_id
     JOIN users u ON u.username = b.therapist_username
     WHERE b.user_username = $1 AND b.status = 'confirmed'
     ORDER BY ts.start_time ASC`,
    [currentUser.username]
  );
  res.json({ success: true, bookings: result.rows });
});

export default router;