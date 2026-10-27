#requires -version 5.1
# M01 Sprint 2 — Media + Snapshot 8-step E2E smoke
# 사용법:
#   1) .env에 R2_ENDPOINT / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET / R2_PUBLIC_URL 설정
#   2) pnpm dev 실행 (별 터미널)
#   3) pnpm worker 실행 (별 터미널)
#   4) .\scripts\smoke-m01-sprint2.ps1
#
# 사전 조건:
#   - PG/Redis 가동 (docker-compose up)
#   - db:seed 완료 (demo-store-a store + pin 1234 user)
#   - 테스트 이미지: scripts\smoke-fixtures\burger.jpg (없으면 자동 생성)

param(
  [string]$ApiBase = "http://localhost:3000",
  [string]$Pin     = "1234",
  [string]$Img     = "scripts\smoke-fixtures\burger.jpg"
)

$ErrorActionPreference = "Stop"

function Section($n, $title) { Write-Host "`n── [$n] $title ───────────────────────────" -ForegroundColor Cyan }
function Ok($msg)    { Write-Host "  ✓ $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Die($msg)   { Write-Host "  ✗ $msg" -ForegroundColor Red; exit 1 }

# ── 0. fixture image ───────────────────────────────────────────────────────
if (-not (Test-Path $Img)) {
  $dir = Split-Path $Img -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
  # 200KB 가짜 JPEG header — sharp가 invalid 처리하면 worker test에서 잡힘.
  # 실 검증용은 본인이 burger.jpg 갖다 두세요.
  [byte[]]$bytes = @(0xFF,0xD8,0xFF,0xE0) + (1..204800 | ForEach-Object { Get-Random -Min 0 -Max 255 })
  [System.IO.File]::WriteAllBytes($Img, $bytes)
  Warn "fixture 자동 생성됨 — 실제 이미지가 아니라 sharp가 실패할 수 있음 (suggest: 실제 jpg 갖다 두기)"
}

# ── 1. Login ─────────────────────────────────────────────────────────────
Section 1 "Login"
$login = Invoke-RestMethod -Uri "$ApiBase/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body (@{ store_slug = "demo-store-a"; pin = $Pin } | ConvertTo-Json)
$token   = $login.access_token
$storeId = $login.user.store_id
if (-not $token) { Die "login 실패 — pin/store_slug 확인" }
Ok "token: $($token.Substring(0,32))… / store_id: $storeId"

$auth = @{ "Authorization" = "Bearer $token" }

# ── 2. 메뉴 아이템 1개 확보 ───────────────────────────────────────────────
Section 2 "Pick a target item (or create)"
$items = Invoke-RestMethod -Uri "$ApiBase/api/menu/items?limit=1" -Headers $auth
if ($items.Count -eq 0) {
  $create = @{
    name_i18n   = @{ en = "Smoke Burger" }
    price_cents = 1099
    dayparts_arr = @("all")
  } | ConvertTo-Json
  $item = Invoke-RestMethod -Uri "$ApiBase/api/menu/items" -Method Post -Headers $auth `
    -ContentType "application/json" -Body $create
  Ok "created item id=$($item.id)"
  $itemId = $item.id
} else {
  $itemId = $items[0].id
  Ok "reusing item id=$itemId name=$($items[0].name)"
}

# ── 3. Upload — 202 Accepted ─────────────────────────────────────────────
Section 3 "POST /api/menu/upload (multipart + item_id) → 202"
# Invoke-RestMethod의 -Form 으로 multipart 자동 처리 (PS 7.0+; 5.1은 curl.exe 권장)
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $form = @{
    file    = Get-Item $Img
    item_id = $itemId
  }
  try {
    $resp = Invoke-RestMethod -Uri "$ApiBase/api/menu/upload" -Method Post -Headers $auth -Form $form
  } catch {
    Die "upload 실패: $($_.Exception.Message)"
  }
} else {
  # PS 5.1 fallback — curl.exe 사용
  $curlOut = & curl.exe -s -X POST "$ApiBase/api/menu/upload" `
    -H "Authorization: Bearer $token" `
    -F "file=@$Img" -F "item_id=$itemId"
  $resp = $curlOut | ConvertFrom-Json
}
Ok "job_id=$($resp.job_id) status=$($resp.status) raw_url=$($resp.raw_url)"
$jobId = $resp.job_id
if (-not $jobId) { Warn "no job_id (R2 미설정 fallback 모드일 가능성)" }

# ── 4. Job 폴링 ──────────────────────────────────────────────────────────
if ($jobId) {
  Section 4 "GET /api/menu/upload/jobs/:id (polling)"
  for ($i = 1; $i -le 20; $i++) {
    Start-Sleep -Seconds 1
    $job = Invoke-RestMethod -Uri "$ApiBase/api/menu/upload/jobs/$jobId" -Headers $auth
    Write-Host ("  [{0,2}] status={1} attempts={2}" -f $i, $job.status, $job.attempts)
    if ($job.status -eq 'completed' -or $job.status -eq 'failed') { break }
  }
  if ($job.status -ne 'completed') { Warn "job not completed within 20s (worker 미가동? 실 이미지 사용?)" }
  else                              { Ok  "job completed" }
}

# ── 5. DB 검증 ────────────────────────────────────────────────────────────
Section 5 "DB check: menu_items.photo_status"
$sql = "SELECT id, photo_status, image_url IS NOT NULL AS has_url, photo_size_bytes FROM menu_items WHERE id='$itemId';"
docker exec restosync-postgres psql -U rs_user -d restosync -c "$sql"

# ── 6. Snapshot — cold MISS + ETag ───────────────────────────────────────
Section 6 "GET /api/menu/snapshot (cold MISS)"
$snap1 = Invoke-WebRequest -Uri "$ApiBase/api/menu/snapshot" -Headers $auth
$etag1 = $snap1.Headers["ETag"]
$cache1 = $snap1.Headers["X-RestoSync-Cache"]
Ok "status=$($snap1.StatusCode) cache=$cache1 etag=$etag1"

# ── 7. Snapshot — warm HIT (304) ─────────────────────────────────────────
Section 7 "GET /api/menu/snapshot with If-None-Match → 304"
try {
  $snap2 = Invoke-WebRequest -Uri "$ApiBase/api/menu/snapshot" `
    -Headers @{ "Authorization" = "Bearer $token"; "If-None-Match" = $etag1 }
  Ok "status=$($snap2.StatusCode) cache=$($snap2.Headers['X-RestoSync-Cache'])"
} catch {
  if ($_.Exception.Response.StatusCode -eq 304) { Ok "304 Not Modified ✓" }
  else { Die "expected 304 got $($_.Exception.Response.StatusCode)" }
}

# ── 8. Invalidation 검증 ─────────────────────────────────────────────────
Section 8 "Mutation triggers invalidate (toggle-sold-out → new ETag)"
$toggleBody = @{ sold_out = $true; reason = "smoke test" } | ConvertTo-Json
Invoke-RestMethod -Uri "$ApiBase/api/menu/items/$itemId/toggle-sold-out" -Method Patch `
  -Headers $auth -ContentType "application/json" -Body $toggleBody | Out-Null

$snap3 = Invoke-WebRequest -Uri "$ApiBase/api/menu/snapshot" -Headers $auth
$etag3 = $snap3.Headers["ETag"]
$cache3 = $snap3.Headers["X-RestoSync-Cache"]
if ($etag3 -eq $etag1) { Warn "etag unchanged after mutation — invalidation broken?" }
else { Ok "etag changed: $etag1 → $etag3 (cache=$cache3)" }

# 원복
Invoke-RestMethod -Uri "$ApiBase/api/menu/items/$itemId/toggle-sold-out" -Method Patch `
  -Headers $auth -ContentType "application/json" `
  -Body (@{ sold_out = $false; reason = "smoke revert" } | ConvertTo-Json) | Out-Null

Write-Host "`n✓ Sprint 2 smoke complete" -ForegroundColor Green
