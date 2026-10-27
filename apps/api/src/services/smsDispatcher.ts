// SMS dispatcher — spec sec.9.
// BullMQ queue 'sms:send' + in-process worker. Twilio via direct HTTPS POST
// (no SDK, no AG-017 churn). Graceful no-op when Twilio env vars are missing.

import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { broadcast } from '../ws/broadcast';

interface SmsJob {
  store_id:   string;
  order_id:   string;
  to:         string;          // E.164 phone (+1...)
  body:       string;
  template?:  string;
}

// BullMQ 5.x forbids ':' in queue names (Redis key prefix collision).
const QUEUE_NAME = 'sms-send';

// BullMQ requires a dedicated ioredis connection with these flags.
const connection = process.env.NODE_ENV === 'test'
  ? null
  : new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

let queue: Queue<SmsJob> | null = null;
let worker: Worker<SmsJob> | null = null;

function getQueue(): Queue<SmsJob> | null {
  if (process.env.NODE_ENV === 'test') return null;
  if (!queue && connection) {
    queue = new Queue<SmsJob>(QUEUE_NAME, { connection });
  }
  return queue;
}

// Enqueue. Call sites should validate notify.sms_enabled and have a customer_phone
// before invoking — this only handles delivery.
export async function enqueueSms(job: SmsJob): Promise<void> {
  const q = getQueue();
  if (!q) return;                           // test env / no Redis -> drop
  if (!job.to) return;                      // no phone -> no-op
  await q.add(job.template ?? 'generic', job, {
    attempts: 3,
    backoff:  { type: 'exponential', delay: 2_000 },
    removeOnComplete: 100,
    removeOnFail: 500,
  });
}

// Twilio direct call — never throws, never blocks.
async function sendViaTwilio(job: SmsJob): Promise<{ sid?: string; error?: string }> {
  const sid   = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from  = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    console.log(`[sms] Twilio not configured — would have sent to ${job.to}: ${job.body.slice(0, 60)}`);
    return { error: 'TWILIO_NOT_CONFIGURED' };
  }
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ From: from, To: job.to, Body: job.body });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { error: `TWILIO_${res.status}: ${txt.slice(0, 200)}` };
    }
    const body = (await res.json().catch(() => ({}))) as { sid?: string };
    return { sid: body.sid };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export function startSmsWorker(): void {
  if (process.env.NODE_ENV === 'test' || !connection) return;
  if (worker) return;
  worker = new Worker<SmsJob>(
    QUEUE_NAME,
    async (job: Job<SmsJob>) => {
      const result = await sendViaTwilio(job.data);
      if (result.error) throw new Error(result.error);
      broadcast(job.data.store_id, 'notification:sms_sent', {
        order_id: job.data.order_id,
        to: job.data.to,
        sid: result.sid,
      });
      return result;
    },
    { connection: connection!, concurrency: 4 },
  );
  worker.on('failed', (job, err) => {
    console.warn(`[sms] failed job ${job?.id} -> ${err.message}`);
  });
}

// Exported for tests / shutdown hooks.
export async function __shutdown(): Promise<void> {
  await worker?.close();
  await queue?.close();
  connection?.disconnect();
}
