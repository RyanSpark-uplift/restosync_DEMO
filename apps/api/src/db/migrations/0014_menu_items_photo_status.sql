-- Sprint 2 S2.1 — menu_items.photo_status (AM01-005 / AG-022 BullMQ transcode lifecycle)
-- 사진 업로드를 메인 API thread에서 분리. 라우트는 raw 업로드 + enqueue만 수행하고
-- worker가 sharp WebP 트랜스코딩 후 image_url + photo_status='ready' 로 commit한다.
--
-- 상태 흐름:
--   NULL          : 사진 없음 (legacy / 신규 생성 시 photo 없음)
--   'pending'     : raw R2 업로드 완료, BullMQ 큐 대기
--   'processing'  : worker가 픽업해서 transcode 진행 중
--   'ready'       : image_url 갱신 완료 (TV 노출 가능)
--   'failed'      : 재시도 한도 초과 — 운영팀이 audit_log로 원인 추적
--
-- AM01-012 / AG-013: drift 차단 — CHECK 제약을 enums.ts 정본과 동기화.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS photo_status         text,
  ADD COLUMN IF NOT EXISTS photo_transcoded_at  timestamp,
  ADD COLUMN IF NOT EXISTS photo_size_bytes     integer,
  ADD COLUMN IF NOT EXISTS photo_job_id         varchar(60);

ALTER TABLE menu_items
  ADD CONSTRAINT menu_items_photo_status_check
  CHECK (photo_status IS NULL
         OR photo_status IN ('pending','processing','ready','failed'));

-- Worker pickup용 partial idx — 대기/처리 중인 job만 빠르게 스캔 (장애 복구·재시도 추적).
CREATE INDEX IF NOT EXISTS menu_items_photo_pending_idx
  ON menu_items (store_id, photo_status)
  WHERE photo_status IN ('pending','processing') AND deleted_at IS NULL;
